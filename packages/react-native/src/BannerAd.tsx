/**
 * <BannerAd> — a React Native banner component. Renders image creatives with <Image>/<Pressable>
 * (click via Linking) and html/openrtb creatives via react-native-webview (optional peer dep,
 * sandboxed to http/https).
 *
 * Implements CONTRACT.md §9 in full:
 *  - §9a continuous fill — `refreshSeconds` keeps the slot alive, with exponential backoff when
 *    a cycle does not render, so a slot never goes permanently dark after one no-fill;
 *  - §9b visibility gating — the loop suspends while the app is backgrounded or the slot is
 *    scrolled off screen;
 *  - §9c the viewability beacon is armed **only** from a creative that actually drew. An image
 *    that fails to load, or an OpenRTB fill with no WebView installed, is not an impression.
 *
 * Requires `react` and `react-native` (peer deps). `react-native-webview` is only needed if you
 * expect html/openrtb creatives.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** The one host-view method the banner uses (§9b viewability). */
interface MeasurableView {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  View,
  type ColorValue,
  type ViewStyle,
} from 'react-native';

import { AdxClient } from './client.ts';
import { VERSION } from './constants.ts';
import { type Ad, AdSource } from './models.ts';
import { RenderPlan, renderPlan } from './render.ts';
import { nextDelaySeconds } from './schedule.ts';
import { isSafeHttpUrl } from './url.ts';

/** Build a platform-aware, fraud-safe UA (contains `android`/`iphone` for device detection). */
export function platformUserAgent(): string {
  const os = Platform.OS;
  const ver = String(Platform.Version ?? '');
  if (os === 'ios') return `theaimart-adx-reactnative/${VERSION} (iPhone; iOS ${ver})`;
  if (os === 'android') return `theaimart-adx-reactnative/${VERSION} (Android ${ver})`;
  return `theaimart-adx-reactnative/${VERSION} (${os} ${ver})`;
}

// Optional WebView — required lazily so the dependency is only needed for html creatives.
function getWebView(): React.ComponentType<{
  source: { html: string };
  style?: ViewStyle;
  originWhitelist?: string[];
}> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webview');
    return (mod.WebView ?? mod.default) as never;
  } catch {
    return null;
  }
}

const VIEWABILITY_RATIO = 0.5;
const VIEWABILITY_MS = 1000;
const POLL_MS = 250;

/**
 * §4e — a third-party DSP creative may only navigate to http/https. `['*']` would also permit
 * `file:`, `content:` and custom app schemes from inside a semi-trusted creative.
 */
const HTML_ORIGIN_WHITELIST = ['http://*', 'https://*'];

type RenderState = 'pending' | 'ok' | 'failed';

export interface BannerAppearance {
  /** Outer corner radius in density-independent pixels. Default: 12. */
  borderRadius?: number;
  /** Surface visible while an image is decoding. Default: #F3F5F7. */
  backgroundColor?: ColorValue;
  /** Soft native elevation. Default: true. */
  elevated?: boolean;
  /** Image fade duration; the OS reduced-motion setting always wins. Default: 180ms. */
  transitionMs?: number;
}

export interface BannerAdProps {
  apiKey: string;
  slotId?: string;
  slotName?: string;
  baseUrl?: string;
  /** Reuse a pre-built client instead of constructing one from apiKey. */
  client?: AdxClient;
  pageUrl?: string;
  keywords?: string[];
  usPrivacy?: string;
  euconsentV2?: string;
  /** IAB GPP string and applicable section ids (`'7'` = US national) — CONTRACT.md §3. */
  gpp?: string;
  gppSid?: string;
  style?: ViewStyle;
  appearance?: BannerAppearance;
  /**
   * Continuous fill (CONTRACT.md §9): seconds between refreshes, clamped up to 30. Omit/0 for a
   * single shot. When set, a no-fill or an undrawable creative is retried with exponential
   * backoff (30s → 300s) rather than leaving the slot dark.
   */
  refreshSeconds?: number;
  onLoad?: (ad: Ad) => void;
  onError?: (err: Error) => void;
}

export function BannerAd(props: BannerAdProps): React.ReactElement | null {
  const [ad, setAd] = useState<Ad | null>(null);
  const [renderState, setRenderState] = useState<RenderState>('pending');
  const [cycle, setCycle] = useState(0);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);

  // Structural, not `useRef<View>`: `View` is a class component up to RN 0.7x and a function
  // component (ref = a host element) after, and only `measureInWindow` is needed from either.
  const containerRef = useRef<MeasurableView>(null);
  const beaconFired = useRef(false);
  const visibleSince = useRef<number | null>(null);
  const failures = useRef(0);
  const dueAt = useRef<number | null>(null);
  const settledCycle = useRef(-1);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  const refreshSeconds = props.refreshSeconds ?? 0;
  const webView = useMemo(() => getWebView(), []);

  const client = useMemo(
    () =>
      props.client ??
      new AdxClient({ apiKey: props.apiKey, baseUrl: props.baseUrl, userAgent: platformUserAgent() }),
    [props.client, props.apiKey, props.baseUrl],
  );

  // §9b — a backgrounded app must not keep requesting ads nobody can see.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // One request per cycle. Image creatives stay `pending` until <Image> reports load/error.
  useEffect(() => {
    let cancelled = false;
    beaconFired.current = false;
    visibleSince.current = null;
    imageOpacity.setValue(0);
    setRenderState('pending');

    client
      .requestAd({
        slotId: props.slotId,
        slotName: props.slotName,
        pageUrl: props.pageUrl,
        pageKeywords: props.keywords && props.keywords.length ? props.keywords.join(',') : undefined,
        usPrivacy: props.usPrivacy,
        euconsentV2: props.euconsentV2,
        gpp: props.gpp,
        gppSid: props.gppSid,
      })
      .then((result) => {
        if (cancelled) return;
        setAd(result);
        const plan = renderPlan(result, webView !== null);
        if (plan === RenderPlan.Image) return; // settled by onLoad / onError below
        if (plan === RenderPlan.Html) {
          setRenderState('ok');
          return;
        }
        setRenderState('failed');
        props.onError?.(
          new Error(
            result.filled ? 'creative could not be rendered' : (result.reason ?? 'no fill'),
          ),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setAd(null);
        setRenderState('failed');
        props.onError?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, props.slotId, props.slotName, cycle, webView, imageOpacity]);

  // Report a load only once the creative is actually on screen (§9c).
  useEffect(() => {
    if (renderState === 'ok' && ad) props.onLoad?.(ad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderState, ad]);

  // §9a — once a cycle settles, decide when (or whether) to ask again.
  useEffect(() => {
    if (renderState === 'pending') return;
    if (settledCycle.current === cycle) return;
    settledCycle.current = cycle;

    const rendered = renderState === 'ok';
    failures.current = rendered ? 0 : failures.current + 1;
    const delay = nextDelaySeconds(
      rendered,
      failures.current,
      ad?.retryAfterSeconds ?? null,
      refreshSeconds,
    );
    dueAt.current = delay === null ? null : Date.now() + delay * 1000;
  }, [renderState, ad, refreshSeconds, cycle]);

  const maybeAdvance = useCallback(
    (onScreen: boolean) => {
      if (dueAt.current === null) return;
      if (!isAppActive) return;
      // A drawn ad that is scrolled away waits; a slot showing nothing must still recover.
      if (renderState === 'ok' && !onScreen) return;
      if (Date.now() < dueAt.current) return;
      dueAt.current = null;
      setCycle((c) => c + 1);
    },
    [renderState, isAppActive],
  );

  // One adaptive driver for viewability and refresh. It sleeps until the refresh deadline and
  // stops completely after a single-shot beacon, instead of measuring layout forever at 4 Hz.
  useEffect(() => {
    if (!isAppActive) return;
    const armed = renderState === 'ok' && !!ad?.isTrackable && !!ad.impId;
    const impId = ad?.impId ?? null;
    // §5 — only an internal impression has a row the beacon can be retried against.
    const retryable = ad?.source === AdSource.Internal;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const nextPollDelay = (): number | null => {
      if (armed && !beaconFired.current) return POLL_MS;
      const due = dueAt.current;
      if (due === null) return null;
      return Math.max(POLL_MS, due - Date.now());
    };

    const schedule = (): void => {
      if (stopped || timer !== null) return;
      const delay = nextPollDelay();
      if (delay === null) return;
      timer = setTimeout(sample, delay);
    };

    const sample = (): void => {
      timer = null;
      if (stopped) return;

      const node = containerRef.current;
      if (!node) {
        maybeAdvance(true);
        schedule();
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (stopped) return;
        let ratio = 0;
        if (width > 0 && height > 0) {
          const screen = Dimensions.get('window');
          const visibleW = Math.max(0, Math.min(x + width, screen.width) - Math.max(x, 0));
          const visibleH = Math.max(0, Math.min(y + height, screen.height) - Math.max(y, 0));
          ratio = (visibleW * visibleH) / (width * height);
        }

        if (armed && impId && !beaconFired.current) {
          const now = Date.now();
          if (ratio >= VIEWABILITY_RATIO) {
            if (visibleSince.current === null) visibleSince.current = now;
            else if (now - visibleSince.current >= VIEWABILITY_MS) {
              beaconFired.current = true;
              // Deliberately outlives this effect: a measured view arriving late is still that
              // view, so neither a refresh nor an unmount cancels its delivery.
              client.deliverViewable(impId, retryable).catch(() => undefined);
            }
          } else {
            visibleSince.current = null;
          }
        }

        maybeAdvance(ratio > 0);
        schedule();
      });
    };

    schedule();

    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [ad, renderState, client, maybeAdvance, isAppActive]);

  const plan = renderPlan(ad, webView !== null);
  if (plan === RenderPlan.None || !ad?.creative) return null;
  const c = ad.creative;
  const clickable = !!c.clickUrl && isSafeHttpUrl(c.clickUrl);
  const radiusValue = props.appearance?.borderRadius ?? 12;
  const borderRadius = Number.isFinite(radiusValue)
    ? Math.min(48, Math.max(0, radiusValue))
    : 12;
  const durationValue = props.appearance?.transitionMs ?? 180;
  const transitionMs = reduceMotion
    ? 0
    : Number.isFinite(durationValue)
      ? Math.min(1_000, Math.max(0, durationValue))
      : 180;
  const frameStyle: ViewStyle = {
    width: '100%',
    maxWidth: c.width,
    aspectRatio: c.width / Math.max(1, c.height),
    alignSelf: 'center',
    borderRadius,
    ...(props.appearance?.elevated === false
      ? {}
      : {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.14,
          shadowRadius: 14,
          elevation: 5,
        }),
  };
  const surfaceStyle: ViewStyle = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius,
    backgroundColor: props.appearance?.backgroundColor ?? '#F3F5F7',
  };

  if (plan === RenderPlan.Html) {
    const WebViewComponent = webView as NonNullable<typeof webView>;
    return (
      <View ref={containerRef as never} collapsable={false} style={[frameStyle, props.style]}>
        <View style={surfaceStyle}>
          <WebViewComponent
            source={{ html: c.html as string }}
            originWhitelist={HTML_ORIGIN_WHITELIST}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View ref={containerRef as never} collapsable={false} style={[frameStyle, props.style]}>
      <Pressable
        style={({ pressed }) => [surfaceStyle, { opacity: pressed && clickable ? 0.94 : 1 }]}
        onPress={clickable ? () => void Linking.openURL(c.clickUrl as string) : undefined}
        android_ripple={clickable ? { color: 'rgba(15, 23, 42, 0.10)' } : undefined}
        accessibilityRole={clickable ? 'link' : 'image'}
        accessibilityLabel={c.headline ?? 'Advertisement'}
        accessibilityHint={clickable ? 'Opens the advertiser link' : undefined}
      >
        <Animated.Image
          source={{ uri: c.assetUrl as string }}
          style={{ width: '100%', height: '100%', opacity: imageOpacity }}
          resizeMode="contain"
          // §9c: only a creative that actually decoded arms the beacon; a 404 backs off instead.
          onLoad={() => {
            Animated.timing(imageOpacity, {
              toValue: 1,
              duration: transitionMs,
              useNativeDriver: true,
            }).start();
            setRenderState('ok');
          }}
          onError={() => {
            imageOpacity.setValue(0);
            setRenderState('failed');
          }}
        />
      </Pressable>
    </View>
  );
}
