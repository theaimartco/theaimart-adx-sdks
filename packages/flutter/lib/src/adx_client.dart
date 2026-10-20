import 'dart:convert';

import 'package:http/http.dart' as http;

import 'constants.dart';
import 'encoding.dart';
import 'guard.dart';
import 'models.dart';
import 'viewable.dart';

/// Ad request parameters. Exactly one of [slotId] (preferred) / [slotName] is required.
class AdRequest {
  final String? slotId;
  final String? slotName;
  final String? pageUrl;
  final String? pageKeywords;
  final String? usPrivacy;
  final String? euconsentV2;
  final String? identityCookie;

  /// IAB GPP string. Passed through; the backend does not parse it yet.
  final String? gpp;

  /// IAB GPP applicable section ids, e.g. `'7'` or `'7,8'`. Any US section (7–12) makes the
  /// request contextual-only, like a CCPA opt-out (CONTRACT.md §3).
  final String? gppSid;

  const AdRequest({
    this.slotId,
    this.slotName,
    this.pageUrl,
    this.pageKeywords,
    this.usPrivacy,
    this.euconsentV2,
    this.identityCookie,
    this.gpp,
    this.gppSid,
  });
}

/// Client for the theaimart Ad Network. Uses `package:http` (works on mobile, web, desktop).
///
/// ```dart
/// final adx = AdxClient(apiKey: 'pk_...');
/// final ad = await adx.requestAd(const AdRequest(slotId: '8b1f-uuid'));
/// // Only once the creative is actually drawn AND ≥50% on screen for ≥1s (CONTRACT.md §9c):
/// await adx.deliverViewable(ad.impId, retryable: ad.source == AdSource.internal);
/// ```
///
/// [BannerAd] does all of this — including keeping the `_an_id` identity — for you.
class AdxClient {
  final String apiKey;
  final String baseUrl;
  final Duration timeout;
  final String userAgent;
  final http.Client _http;

  /// Why this client refuses to send anything, or null when it is correctly configured
  /// (CONTRACT.md §12). An app must never crash because of an ad SDK, so an unsafe key or base
  /// URL disables the client instead of throwing: every request is a no-fill with reason
  /// `invalid_config`, and nothing is sent.
  final String? configError;

  final RequestGuard _guard;

  AdxClient._(this.apiKey, this.baseUrl, this.timeout, this.userAgent,
      this._http, this.configError)
      : _guard = requestGuardFor(baseUrl, apiKey);

  factory AdxClient({
    required String apiKey,
    String baseUrl = defaultBaseUrl,
    Duration timeout = defaultTimeout,
    String? userAgent,
    http.Client? httpClient,
  }) {
    assert(apiKey.isNotEmpty, 'apiKey is required');
    final key = apiKey.trim();
    final base = normalizeBaseUrl(baseUrl);
    final String? error;
    if (!isPublishableKey(key)) {
      error =
          'apiKey must be a publishable site key (pk_…); never ship an account token or secret';
    } else if (base == null) {
      error =
          'baseUrl must be https:// (http only for a local host), with no credentials, query or fragment';
    } else {
      error = null;
    }
    assert(error == null, error);
    return AdxClient._(
      key,
      base ?? baseUrl,
      timeout,
      userAgent == null ? sdkIdentifier : safeHeaderValue(userAgent),
      httpClient ?? http.Client(),
      error,
    );
  }

  /// One request with no redirects (following one would replay the `Cookie` to another host)
  /// and a body capped at [maxResponseBytes].
  Future<_Response> _send(String method, Uri uri, Map<String, String> headers,
      {String? body}) async {
    final req = http.Request(method, uri)
      ..followRedirects = false
      ..headers.addAll(headers);
    if (body != null) req.body = body;
    final resp = await _http.send(req).timeout(timeout);
    final bytes = <int>[];
    await for (final chunk in resp.stream.timeout(timeout)) {
      bytes.addAll(chunk);
      if (bytes.length > maxResponseBytes) {
        throw const FormatException('response too large');
      }
    }
    return _Response(resp.statusCode, resp.headers,
        utf8.decode(bytes, allowMalformed: true));
  }

  /// Request an ad decision. Fail-closed: any error/non-200 → no-fill (never throws).
  ///
  /// With [identity], the stored `_an_id` is sent when [AdRequest.identityCookie] is null, and a
  /// new one issued by the server is saved (CONTRACT.md §3). An explicit
  /// [AdRequest.identityCookie] always wins and is never written to the store.
  Future<Ad> requestAd(AdRequest request, {AdxIdentityStore? identity}) async {
    final explicit = request.identityCookie;
    String? stored;
    if (identity != null && explicit == null) {
      try {
        stored = await identity.load();
      } catch (_) {
        stored = null;
      }
      if (!isStorableIdentity(stored)) stored = null;
    }
    final ad = await _requestAd(request, explicit ?? stored);
    final issued = ad.setIdentityCookie;
    if (identity != null &&
        explicit == null &&
        issued != null &&
        issued != stored &&
        isStorableIdentity(issued)) {
      try {
        await identity.save(issued);
      } catch (_) {
        // Persistence is best-effort; the ad itself is unaffected.
      }
    }
    return ad;
  }

  Future<Ad> _requestAd(AdRequest request, String? identityCookie) async {
    if (configError != null) return Ad.noFill(0, reason: reasonInvalidConfig);
    // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server. An
    // invalid request is a local no-fill, never an exception into the host app.
    final params = guardServeParams(
      apiKey,
      slotId: request.slotId,
      slotName: request.slotName,
      pageUrl: request.pageUrl,
      pageKeywords: request.pageKeywords,
      usPrivacy: request.usPrivacy,
      euconsentV2: request.euconsentV2,
      gpp: request.gpp,
      gppSid: request.gppSid,
    );
    if (params == null) return Ad.noFill(0, reason: reasonInvalidRequest);
    final wait = _guard.acquire(DateTime.now().millisecondsSinceEpoch);
    if (wait != null) {
      return Ad.noFill(0, reason: reasonRateLimited, retryAfterSeconds: wait);
    }
    final uri = Uri.parse('$baseUrl$serveAdPath?${buildServeQuery(params)}');
    final headers = <String, String>{
      'User-Agent': userAgent,
      'Accept': 'application/json',
      'X-Adx-Sdk': sdkIdentifier,
    };
    if (isSafeIdentityCookie(identityCookie)) {
      headers['Cookie'] = '_an_id=$identityCookie';
    }
    try {
      final resp = await _send('GET', uri, headers);
      final retryAfter =
          int.tryParse(resp.headers['retry-after']?.trim() ?? '');
      _guard.record(
          resp.status, retryAfter, DateTime.now().millisecondsSinceEpoch);
      final cookie = _extractIdentityCookie(resp.headers['set-cookie']);
      return Ad.fromResponse(resp.status, resp.body,
          retryAfterSeconds: retryAfter, setIdentityCookie: cookie);
    } catch (_) {
      return Ad.noFill(0);
    }
  }

  /// Fire the viewability beacon once. Returns true only when the server recorded the view;
  /// no-ops (false) for a null/empty impId. See [reportViewableOutcome].
  Future<bool> reportViewable(String? impId) async =>
      await reportViewableOutcome(impId) == ViewableOutcome.recorded;

  /// Send the viewability beacon once and classify the answer (CONTRACT.md §5).
  /// [ViewableOutcome.retry] means the view was NOT counted — typically the beacon beat the
  /// impression into the database — and resending the same [impId] is safe.
  Future<ViewableOutcome> reportViewableOutcome(String? impId) async {
    // Only an id the server could have issued is echoed back to it (CONTRACT.md §12).
    if (configError != null || !isSafeImpId(impId)) return ViewableOutcome.drop;
    final uri = Uri.parse('$baseUrl$viewablePath');
    try {
      final resp = await _send(
        'POST',
        uri,
        {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          'X-Adx-Sdk': sdkIdentifier,
        },
        body: jsonEncode({'imp_id': impId}),
      );
      return viewableOutcome(resp.status, resp.body);
    } catch (_) {
      return viewableOutcome(0, null);
    }
  }

  /// Deliver a measured view: send the beacon and, while the server answers `retry`, resend
  /// after 1 s, 2 s and 4 s, then give up (CONTRACT.md §5). Pass `retryable: false` for anything
  /// but an internal impression — an OpenRTB win is sent once.
  Future<ViewableOutcome> deliverViewable(String? impId,
      {required bool retryable}) {
    if (impId == null || impId.isEmpty)
      return Future.value(ViewableOutcome.drop);
    return deliverWithRetry(
        retryable: retryable, send: () => reportViewableOutcome(impId));
  }

  /// Build a click-tracker URL. Rarely needed — prefer `ad.creative.clickUrl`.
  String clickUrl(String impId) =>
      '$baseUrl$clickPath?id=${percentEncodeAll(impId)}';

  /// Release the underlying HTTP client.
  void close() => _http.close();

  static String? _extractIdentityCookie(String? setCookie) {
    if (setCookie == null || setCookie.isEmpty) return null;
    for (final segment in setCookie.split(';')) {
      final trimmed = segment.trim();
      if (trimmed.startsWith('_an_id=')) {
        final value = trimmed.substring('_an_id='.length);
        return isSafeIdentityCookie(value) ? value : null;
      }
    }
    return null;
  }
}

class _Response {
  final int status;
  final Map<String, String> headers;
  final String body;
  const _Response(this.status, this.headers, this.body);
}
