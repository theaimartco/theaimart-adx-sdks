import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'adx_client.dart';
import 'constants.dart';
import 'models.dart';
import 'render.dart';
import 'schedule.dart';
import 'viewable.dart';

/// Build a platform-aware, fraud-safe User-Agent (contains `android`/`iPhone` for device
/// detection; CONTRACT.md §6). RN/Flutter default HTTP UAs would otherwise be no-filled.
String platformUserAgent() {
  if (kIsWeb) return 'theaimart-adx-flutter/$sdkVersion (web)';
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return 'theaimart-adx-flutter/$sdkVersion (Android)';
    case TargetPlatform.iOS:
      return 'theaimart-adx-flutter/$sdkVersion (iPhone; iOS)';
    default:
      return 'theaimart-adx-flutter/$sdkVersion (${defaultTargetPlatform.name})';
  }
}

enum _RenderState { pending, ok, failed }

/// A drop-in banner widget implementing CONTRACT.md §9 in full:
///
///  * **§9a continuous fill** — set [refreshSeconds] and the slot keeps itself filled, backing
///    off exponentially (30s → 300s) whenever a cycle does not render, so one no-fill never
///    leaves the slot permanently dark. Omit it for a single shot.
///  * **§9b visibility gating** — the loop suspends while the app is backgrounded or the widget
///    is scrolled off screen, and resumes (firing at once if overdue) when it comes back.
///  * **§9c** — the viewability beacon is armed **only** by a creative that actually drew. An
///    image that fails to load, a hostile asset URL, or an html/openrtb fill with no
///    [htmlBuilder] supplied is reported through [onAdFailed] and is *not* an impression.
///  * **§5** — a beacon the server answers `retry` (it arrived before the impression row was
///    written) is resent, so a measured view is not lost.
///  * **§3** — the server's `_an_id` identity is kept in [identityStore] and resent, so frequency
///    caps hold. The default lasts for the process; pass a persistent store to survive restarts.
///
/// For html/openrtb creatives supply [htmlBuilder] (e.g. wrapping `webview_flutter`). Without
/// it this surface cannot draw OpenRTB demand, so those fills are refused rather than silently
/// swallowed. That builder owns the sandbox — see its doc and [adNavigation].
class BannerAd extends StatefulWidget {
  final String apiKey;
  final String? slotId;
  final String? slotName;
  final String? baseUrl;
  final AdxClient? client;
  final String? pageUrl;
  final List<String>? keywords;
  final String? usPrivacy;
  final String? euconsentV2;

  /// IAB GPP string and applicable section ids (`'7'` = US national) — CONTRACT.md §3.
  final String? gpp;
  final String? gppSid;

  /// Where the `_an_id` identity is kept between requests. Defaults to
  /// [AdxIdentityStore.memory] (process lifetime). Ignored on the web, where the browser owns
  /// cookies.
  final AdxIdentityStore? identityStore;
  final double borderRadius;
  final Color? surfaceColor;
  final bool elevated;
  final Duration transitionDuration;

  /// Continuous fill interval in seconds (CONTRACT.md §9a); clamped up to 30. 0 = single shot.
  final int refreshSeconds;

  final void Function(Ad ad)? onAdLoaded;
  final void Function(String reason)? onAdFailed;

  /// Draws an html/openrtb creative. Omit it and such fills are refused outright (§9c).
  ///
  /// **The sandbox is yours.** This is the one rendering path the SDK cannot secure for you,
  /// because it never creates the WebView — and `html` is third-party markup from a DSP, so
  /// treat it as hostile. At minimum: load it with no base URL, expose no JavaScript bridge,
  /// and route every navigation it starts through [adNavigation] rather than following it.
  ///
  /// The README has a complete `webview_flutter` renderer that does all of that.
  final Widget Function(
      BuildContext context, String html, int width, int height)? htmlBuilder;

  const BannerAd({
    super.key,
    required this.apiKey,
    this.slotId,
    this.slotName,
    this.baseUrl,
    this.client,
    this.pageUrl,
    this.keywords,
    this.usPrivacy,
    this.euconsentV2,
    this.gpp,
    this.gppSid,
    this.identityStore,
    this.borderRadius = 12,
    this.surfaceColor,
    this.elevated = true,
    this.transitionDuration = const Duration(milliseconds: 180),
    this.refreshSeconds = 0,
    this.onAdLoaded,
    this.onAdFailed,
    this.htmlBuilder,
  });

  @override
  State<BannerAd> createState() => _BannerAdState();
}

class _BannerAdState extends State<BannerAd> with WidgetsBindingObserver {
  static const Duration _pollInterval = Duration(milliseconds: 250);
  static const double _viewabilityRatio = 0.5;
  static const int _viewabilityMs = 1000;

  final GlobalKey _boxKey = GlobalKey();
  late final AdxClient _client;
  bool _ownsClient = false;

  Ad? _ad;
  _RenderState _renderState = _RenderState.pending;
  Timer? _driver;
  DateTime? _visibleSince;
  bool _beaconFired = false;

  /// A measured view still being delivered (§5). It outlives the cycle and the widget, so an
  /// owned HTTP client is only closed once it settles.
  Future<ViewableOutcome>? _beaconDelivery;

  // Continuous fill (§9a/§9b).
  int _failures = 0;
  DateTime? _dueAt;
  bool _appActive = true;
  int _cycle = 0;
  int _settledCycle = -1;

  bool get _canRenderHtml => widget.htmlBuilder != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.client != null) {
      _client = widget.client!;
    } else {
      _client = AdxClient(
          apiKey: widget.apiKey,
          baseUrl: widget.baseUrl ?? defaultBaseUrl,
          userAgent: platformUserAgent());
      _ownsClient = true;
    }
    _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // §9b — a backgrounded app must not keep requesting ads nobody can see.
    _appActive = state == AppLifecycleState.resumed;
    if (_appActive) {
      _scheduleDriver(immediate: true);
    } else {
      _driver?.cancel();
      _driver = null;
      _visibleSince = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _driver?.cancel();
    if (_ownsClient) {
      final pending = _beaconDelivery;
      if (pending == null) {
        _client.close();
      } else {
        pending.whenComplete(_client.close);
      }
    }
    super.dispose();
  }

  Future<void> _load() async {
    final cycle = _cycle;
    _beaconFired = false;
    _visibleSince = null;
    if (mounted) setState(() => _renderState = _RenderState.pending);

    final ad = await _client.requestAd(
        AdRequest(
          slotId: widget.slotId,
          slotName: widget.slotName,
          pageUrl: widget.pageUrl,
          pageKeywords: (widget.keywords != null && widget.keywords!.isNotEmpty)
              ? widget.keywords!.join(',')
              : null,
          usPrivacy: widget.usPrivacy,
          euconsentV2: widget.euconsentV2,
          gpp: widget.gpp,
          gppSid: widget.gppSid,
        ),
        identity:
            kIsWeb ? null : (widget.identityStore ?? AdxIdentityStore.memory));
    if (!mounted || cycle != _cycle) return;

    final plan = renderPlan(ad, _canRenderHtml);
    setState(() {
      _ad = ad;
      // An image is only "rendered" once it actually decodes — settled by the builders below.
      _renderState = plan == RenderPlan.html
          ? _RenderState.ok
          : (plan == RenderPlan.image
              ? _RenderState.pending
              : _RenderState.failed);
    });

    if (plan == RenderPlan.html) {
      widget.onAdLoaded?.call(ad);
      _settle(true);
    } else if (plan == RenderPlan.none) {
      widget.onAdFailed?.call(ad.filled
          ? 'creative could not be rendered'
          : (ad.reason ?? 'no fill'));
      _settle(false);
    }
  }

  /// Called from the image builders during `build`, so the state change is deferred a frame.
  void _markRendered(bool ok) {
    if (!mounted) return;
    final target = ok ? _RenderState.ok : _RenderState.failed;
    if (_renderState == target) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _renderState == target) return;
      setState(() => _renderState = target);
      final ad = _ad;
      if (ok) {
        if (ad != null) widget.onAdLoaded?.call(ad);
      } else {
        widget.onAdFailed?.call('creative could not be rendered');
      }
      _settle(ok);
    });
  }

  /// §9a — once a cycle settles, decide when (or whether) to ask again.
  void _settle(bool rendered) {
    if (_settledCycle == _cycle) return;
    _settledCycle = _cycle;
    _failures = rendered ? 0 : _failures + 1;
    final delay = nextDelaySeconds(
        rendered, _failures, _ad?.retryAfterSeconds, widget.refreshSeconds);
    _dueAt =
        delay == null ? null : DateTime.now().add(Duration(seconds: delay));
    _scheduleDriver();
  }

  /// Arm one timer only while viewability is pending or a refresh is scheduled. Between ads the
  /// timer sleeps until the exact due time, avoiding a permanent four-layout-reads-per-second
  /// cost for every banner on screen.
  void _scheduleDriver({bool immediate = false}) {
    _driver?.cancel();
    _driver = null;
    if (!mounted || !_appActive) return;

    final ad = _ad;
    final tracking = _renderState == _RenderState.ok &&
        ad != null &&
        ad.isTrackable &&
        ad.impId != null &&
        !_beaconFired;

    Duration? delay;
    if (tracking) {
      delay = _pollInterval;
    } else if (_dueAt != null) {
      final remaining = _dueAt!.difference(DateTime.now());
      delay = remaining > Duration.zero ? remaining : _pollInterval;
    }
    if (delay == null) return;
    _driver = Timer(immediate ? Duration.zero : delay, _tick);
  }

  /// A single adaptive driver for both viewability and the refresh clock.
  void _tick() {
    if (!mounted) return;
    final ratio = _visibleFraction();
    final ad = _ad;

    if (_renderState == _RenderState.ok &&
        ad != null &&
        ad.isTrackable &&
        ad.impId != null &&
        !_beaconFired) {
      final now = DateTime.now();
      if (ratio >= _viewabilityRatio) {
        _visibleSince ??= now;
        if (now.difference(_visibleSince!).inMilliseconds >= _viewabilityMs) {
          _beaconFired = true;
          _beaconDelivery = _client.deliverViewable(ad.impId,
              retryable: ad.source == AdSource.internal);
        }
      } else {
        _visibleSince = null;
      }
    }

    _maybeAdvance(ratio > 0);
    _scheduleDriver();
  }

  void _maybeAdvance(bool onScreen) {
    final due = _dueAt;
    if (due == null) return;
    if (!_appActive) return;
    // A drawn ad that is scrolled away waits; a slot showing nothing must still recover.
    if (_renderState == _RenderState.ok && !onScreen) return;
    if (DateTime.now().isBefore(due)) return;
    _dueAt = null;
    _cycle += 1;
    _load();
  }

  double _visibleFraction() {
    final ctx = _boxKey.currentContext;
    if (ctx == null) return 0;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return 0;
    final size = box.size;
    if (size.width == 0 || size.height == 0) return 0;
    final offset = box.localToGlobal(Offset.zero);
    final screen = MediaQuery.of(ctx).size;
    final left = offset.dx;
    final top = offset.dy;
    final visibleW = (offset.dx + size.width).clamp(0.0, screen.width) -
        left.clamp(0.0, screen.width);
    final visibleH = (offset.dy + size.height).clamp(0.0, screen.height) -
        top.clamp(0.0, screen.height);
    if (visibleW <= 0 || visibleH <= 0) return 0;
    return (visibleW * visibleH) / (size.width * size.height);
  }

  Future<void> _openClick(String url) async {
    final uri = Uri.tryParse(url);
    // §4e: only http/https click URLs are opened — javascript:/file:/intent: are rejected.
    if (uri == null || !isSafeHttpUrl(url)) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _responsiveFrame(
      BuildContext context, double width, double height, Widget child) {
    return LayoutBuilder(builder: (context, constraints) {
      final available = constraints.hasBoundedWidth
          ? constraints.maxWidth.clamp(0.0, width).toDouble()
          : width;
      final displayWidth = available > 0 ? available : width;
      final displayHeight = displayWidth * height / width;
      final radius = widget.borderRadius.clamp(0.0, 48.0).toDouble();
      final dark = Theme.of(context).brightness == Brightness.dark;
      final surface = widget.surfaceColor ??
          (dark ? const Color(0xFF1C222B) : const Color(0xFFF3F5F7));
      final border = dark ? const Color(0x14FFFFFF) : const Color(0x0F000000);
      return Align(
        alignment: Alignment.center,
        widthFactor: constraints.hasBoundedWidth ? null : 1,
        child: SizedBox(
          key: _boxKey,
          width: displayWidth,
          height: displayHeight,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: border, width: 0.5),
              boxShadow: widget.elevated
                  ? [
                      BoxShadow(
                        color: dark
                            ? const Color(0x47000000)
                            : const Color(0x1F000000),
                        blurRadius: 28,
                        offset: const Offset(0, 10),
                      ),
                      BoxShadow(
                        color: dark
                            ? const Color(0x2E000000)
                            : const Color(0x0F000000),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: RepaintBoundary(child: child),
            ),
          ),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    final plan = renderPlan(ad, _canRenderHtml);
    if (plan == RenderPlan.none || ad?.creative == null) {
      return const SizedBox.shrink();
    }
    final c = ad!.creative!;
    final width = c.width.toDouble();
    final height = c.height.toDouble();

    if (plan == RenderPlan.html) {
      return _responsiveFrame(context, width, height,
          widget.htmlBuilder!(context, c.html!, c.width, c.height));
    }

    final clickable = c.clickUrl != null && isSafeHttpUrl(c.clickUrl!);
    final pixelRatio = MediaQuery.of(context).devicePixelRatio;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final image = GestureDetector(
      onTap: clickable ? () => _openClick(c.clickUrl!) : null,
      child: Semantics(
        label: c.headline ?? 'Advertisement',
        image: true,
        link: clickable,
        child: AnimatedOpacity(
          opacity: _renderState == _RenderState.ok ? 1 : 0,
          duration: reduceMotion ? Duration.zero : widget.transitionDuration,
          curve: Curves.easeOutCubic,
          child: Image.network(
            c.assetUrl!,
            width: double.infinity,
            height: double.infinity,
            fit: BoxFit.contain,
            gaplessPlayback: true,
            filterQuality: FilterQuality.medium,
            cacheWidth: (width * pixelRatio).round(),
            excludeFromSemantics: true,
            // §9c: the beacon is armed only once a frame actually decoded...
            frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
              if (frame != null || wasSynchronouslyLoaded) _markRendered(true);
              return child;
            },
            // ...and a creative that 404s backs off and refills instead of counting as a view.
            errorBuilder: (context, error, stackTrace) {
              _markRendered(false);
              return SizedBox(width: width, height: height);
            },
          ),
        ),
      ),
    );
    return _responsiveFrame(context, width, height, image);
  }
}
