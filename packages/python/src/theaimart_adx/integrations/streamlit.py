"""Streamlit integration — a banner rendered in the visitor's browser.

    import streamlit as st
    from theaimart_adx.integrations.streamlit import banner

    st.title("My app")
    banner(api_key="pk_...", slot_id="8b1f-uuid", refresh_seconds=60)

Streamlit is the one Python surface where the *browser* draws the ad, so this adapter ships the
same CONTRACT.md §9 logic as the Web SDK inside the component: full-byte percent encoding, the
4-way union parse, a sandboxed iframe for OpenRTB markup, an ``IntersectionObserver``
viewability beacon at ≥50% for ≥1s (resent on the §5 schedule when the server answers
``retry``), and continuous fill with 30s→300s backoff.

**Browser CORS.** The component calls the ad server from the visitor's browser, so it only
fills where the ad server allows the page's origin (CONTRACT.md §1). Until the serve API sends a
public CORS policy, a Streamlit app on its own domain gets no fill.

**Two things to know about Streamlit's rerun model.**

1. The generated HTML is deterministic: identical arguments produce an identical string, so
   Streamlit reuses the same iframe across reruns and the fill loop keeps running. Change an
   argument on every rerun (a timestamp, a random id) and the component remounts, which requests
   a fresh ad each time — that will hit the per-key rate limit.
2. The ad request happens from the visitor's browser, so it is that visitor's device and IP that
   are measured — which is what you want. Your Streamlit server never sees the ad call.
"""

from __future__ import annotations

import json
from typing import Any, List, Optional

from ..constants import DEFAULT_BASE_URL, MAX_RETRY_SECONDS, MIN_REFRESH_SECONDS
from ..guard import guard_serve_params, is_publishable_key, normalize_base_url
from ..viewable import VIEWABLE_RETRY_DELAYS_SECONDS

__all__ = ["banner", "banner_html"]

_TEMPLATE = """
<div id="adx-slot" role="region" aria-label="Advertisement"
     style="width:100%;max-width:100%;margin:0 auto;padding:0;line-height:0;overflow:hidden;contain:layout paint;border-radius:12px;background:#F3F5F7;box-shadow:0 10px 30px rgba(15,23,42,.10),0 2px 8px rgba(15,23,42,.06);"></div>
<script id="adx-config" type="application/json">__ADX_CONFIG__</script>
<script>
(function () {
  "use strict";
  var CFG = JSON.parse(document.getElementById("adx-config").textContent);
  var slot = document.getElementById("adx-slot");
  var MIN_REFRESH = CFG.minRefresh, MAX_RETRY = CFG.maxRetry;
  var VIEW_RATIO = 0.5, VIEW_MS = 1000, IMG_TIMEOUT_MS = 10000, VIEW_RETRY_S = CFG.viewRetry;

  /* CONTRACT.md 7 - percent-encode every byte so no keyword can survive in the raw query. */
  function pctAll(value) {
    var utf8 = unescape(encodeURIComponent(String(value))), out = "";
    for (var i = 0; i < utf8.length; i++) {
      out += "%" + ("0" + utf8.charCodeAt(i).toString(16).toUpperCase()).slice(-2);
    }
    return out;
  }
  function query() {
    var parts = [];
    parts.push("api_key=" + encodeURIComponent(CFG.apiKey));
    if (CFG.slotId) parts.push("slot_id=" + encodeURIComponent(CFG.slotId));
    if (CFG.slotName) parts.push("slot_name=" + encodeURIComponent(CFG.slotName));
    var free = [["page_url", CFG.pageUrl], ["page_keywords", CFG.keywords],
                ["us_privacy", CFG.usPrivacy], ["euconsent_v2", CFG.euconsent],
                ["gpp", CFG.gpp], ["gpp_sid", CFG.gppSid]];
    for (var i = 0; i < free.length; i++) {
      if (free[i][1]) parts.push(free[i][0] + "=" + pctAll(free[i][1]));
    }
    return parts.join("&");
  }

  /* CONTRACT.md 4 - the 4-way discriminated union. Absent "source" means internal. */
  function parseAd(status, body, retryAfter) {
    var none = { filled: false, retryAfter: retryAfter, reason: null };
    if (status !== 200 || !body || typeof body !== "object") return none;
    if (body.fill !== true) { none.reason = body.reason || null; return none; }
    var c = body.creative || {};
    return {
      filled: true,
      html: c.html || null,
      assetUrl: c.asset_url || null,
      clickUrl: c.click_url || null,
      headline: c.headline || null,
      width: c.width || 300,
      height: c.height || 250,
      impId: body.imp_id || null,
      /* Only internal impressions get a row the beacon can mark (5). */
      internal: !c.html && body.source !== "house",
      retryAfter: retryAfter,
      reason: null
    };
  }

  function safeHttp(u) {
    if (!u) return false;
    var l = String(u).trim().toLowerCase();
    return l.indexOf("http://") === 0 || l.indexOf("https://") === 0;
  }

  /* CONTRACT.md 9a - identical policy to every other SDK. */
  function nextDelay(rendered, failures, retryAfter, refresh) {
    if (!refresh || refresh <= 0) return null;
    if (rendered) return Math.max(refresh, MIN_REFRESH);
    var n = Math.max(1, failures), exp = Math.min(n - 1, 16);
    var backoff = Math.min(MIN_REFRESH * Math.pow(2, exp), MAX_RETRY);
    return Math.max(backoff, retryAfter > 0 ? retryAfter : 0, refresh);
  }

  /* CONTRACT.md 5 - what a beacon response means. 0 = no response. */
  function viewOutcome(status, body) {
    if (status === 0 || status === 429 || status >= 500) return "retry";
    if (status < 200 || status >= 300) return "drop";
    if (!body || typeof body !== "object" || Array.isArray(body)) return "drop";
    if (body.success === true) return "recorded";
    if (body.retry === true) return "retry";
    return "drop";
  }

  /* A beacon can beat the impression row into the database; the server then answers
     retry:true and has NOT counted the view. fetch (not sendBeacon) so that answer can be
     read; resend on the 5 schedule, internal impressions only. */
  function sendViewable(impId, retryable, attempt) {
    /* CONTRACT.md 12 - only an id the server could have issued is echoed back to it. */
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(impId))) return;
    var url = CFG.baseUrl + "/api/v1/serve/viewable";
    var payload = JSON.stringify({ imp_id: impId });
    if (typeof fetch !== "function") {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      }
      return;
    }
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                 body: payload, keepalive: true, credentials: "include" })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = JSON.parse(text); } catch (e) { body = null; }
          return viewOutcome(res.status, body);
        });
      }, function () { return viewOutcome(0, null); })
      .then(function (outcome) {
        if (outcome !== "retry" || !retryable || attempt >= VIEW_RETRY_S.length) return;
        setTimeout(function () { sendViewable(impId, retryable, attempt + 1); },
                   VIEW_RETRY_S[attempt] * 1000);
      });
  }

  var failures = 0, timer = null, dueAt = null, observer = null, viewTimer = null,
      viewImpId = null, viewRetryable = false, viewInRange = false, requestController = null,
      stopped = false;

  function resetCycle() {
    if (viewTimer) { clearTimeout(viewTimer); viewTimer = null; }
    if (observer) { observer.disconnect(); observer = null; }
    viewImpId = null; viewRetryable = false; viewInRange = false;
  }

  /* CONTRACT.md 9c - armed only by a creative that actually drew. */
  function armViewTimer() {
    if (!viewImpId || !viewInRange || viewTimer !== null ||
        document.visibilityState === "hidden") return;
    var impId = viewImpId, retryable = viewRetryable;
    viewTimer = setTimeout(function () {
      viewTimer = null;
      if (document.visibilityState === "hidden" || !viewInRange || viewImpId !== impId) return;
      if (observer) { observer.disconnect(); observer = null; }
      viewImpId = null; viewInRange = false;
      sendViewable(impId, retryable, 0);
    }, VIEW_MS);
  }

  function track(impId, internal) {
    if (!impId || typeof IntersectionObserver === "undefined") return;
    viewImpId = impId;
    viewRetryable = internal === true;
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        viewInRange = entries[i].intersectionRatio >= VIEW_RATIO;
        if (viewInRange) armViewTimer();
        else if (viewTimer !== null) { clearTimeout(viewTimer); viewTimer = null; }
      }
    }, { threshold: [0, VIEW_RATIO, 1] });
    observer.observe(slot);
  }

  function draw(ad) {
    slot.textContent = "";
    slot.style.maxWidth = ad.width + "px";
    slot.style.aspectRatio = ad.width + " / " + ad.height;
    slot.setAttribute("aria-busy", "true");
    if (ad.html) {
      var frame = document.createElement("iframe");
      frame.width = String(ad.width); frame.height = String(ad.height);
      frame.frameBorder = "0"; frame.scrolling = "no";
      /* Semi-trusted third-party markup: sandboxed, and never same-origin. */
      frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
      frame.setAttribute("title", ad.headline || "Advertisement");
      frame.style.width = "100%"; frame.style.height = "100%";
      frame.style.border = "0"; frame.style.display = "block";
      frame.style.borderRadius = "inherit";
      frame.srcdoc = ad.html;
      slot.appendChild(frame);
      slot.setAttribute("aria-busy", "false");
      return Promise.resolve(true);
    }
    if (!safeHttp(ad.assetUrl)) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var img = new Image(), settled = false, guard = null;
      function settle(ok) {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        if (ok) img.style.opacity = "1";
        slot.setAttribute("aria-busy", "false");
        resolve(ok);
      }
      img.addEventListener("load", function () { settle(true); });
      /* A creative that 404s leaves an empty box - never an impression. */
      img.addEventListener("error", function () { settle(false); });
      guard = setTimeout(function () { settle(false); }, IMG_TIMEOUT_MS);
      img.alt = ad.headline || "Advertisement";
      img.width = ad.width; img.height = ad.height;
      img.style.border = "0"; img.style.display = "block";
      img.style.width = "100%"; img.style.height = "100%";
      img.style.objectFit = "contain"; img.style.opacity = "0";
      img.style.transition = "opacity 160ms ease-out";
      img.style.borderRadius = "inherit";
      img.decoding = "async";
      if (safeHttp(ad.clickUrl)) {
        var a = document.createElement("a");
        a.href = ad.clickUrl; a.target = "_blank";
        a.rel = "noopener nofollow sponsored";
        a.style.display = "block"; a.style.width = "100%"; a.style.height = "100%";
        a.style.borderRadius = "inherit";
        a.appendChild(img);
        slot.appendChild(a);
      } else { slot.appendChild(img); }
      img.src = ad.assetUrl;
      if (img.complete && img.naturalWidth > 0) settle(true);
    });
  }

  function schedule(rendered, retryAfter) {
    failures = rendered ? 0 : failures + 1;
    var delay = nextDelay(rendered, failures, retryAfter || 0, CFG.refreshSeconds);
    dueAt = delay === null ? null : Date.now() + delay * 1000;
    armTimer();
  }

  function armTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (stopped || dueAt === null || document.visibilityState === "hidden") return;
    timer = setTimeout(function () {
      timer = null; dueAt = null; request();
    }, Math.max(0, dueAt - Date.now()));
  }

  function request() {
    if (stopped) return;
    resetCycle();
    /* 9b - do not request for a hidden tab; visibilitychange resumes without polling. */
    if (document.visibilityState === "hidden") {
      dueAt = dueAt === null ? Date.now() : dueAt;
      return;
    }
    requestController = typeof AbortController === "undefined" ? null : new AbortController();
    fetch(CFG.baseUrl + "/api/v1/serve/ad?" + query(), {
      credentials: "include", redirect: "error", signal: requestController ? requestController.signal : undefined
    })
      .then(function (res) {
        var ra = parseInt(res.headers.get("retry-after") || "", 10);
        return res.text().then(function (text) {
          var body = null;
          try { body = JSON.parse(text); } catch (e) { body = null; }
          return parseAd(res.status, body, isNaN(ra) ? 0 : ra);
        });
      })
      .catch(function () { return { filled: false, retryAfter: 0 }; })
      .then(function (ad) {
        if (!ad.filled) { slot.textContent = ""; schedule(false, ad.retryAfter); return; }
        return draw(ad).then(function (rendered) {
          if (rendered && ad.impId) track(ad.impId, ad.internal);
          if (!rendered) slot.textContent = "";
          schedule(rendered, ad.retryAfter);
        });
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (viewTimer) { clearTimeout(viewTimer); viewTimer = null; }
    } else {
      armViewTimer(); armTimer();
    }
  });

  window.addEventListener("pagehide", function () {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (requestController) requestController.abort();
    resetCycle();
  });
  request();
})();
</script>
"""


def banner_html(
    *,
    api_key: str,
    slot_id: Optional[str] = None,
    slot_name: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
    refresh_seconds: int = 0,
    page_url: Optional[str] = None,
    keywords: Optional[List[str]] = None,
    us_privacy: Optional[str] = None,
    euconsent_v2: Optional[str] = None,
    gpp: Optional[str] = None,
    gpp_sid: Optional[str] = None,
) -> str:
    """Build the component HTML. Deterministic: same arguments, same string.

    Exposed separately so you can embed it yourself (``st.components.v1.html``, a custom
    component, or any other framework that renders raw HTML).
    """
    if not api_key:
        raise ValueError("banner() requires an api_key")
    if not slot_id and not slot_name:
        raise ValueError("banner() requires either slot_id or slot_name")
    # CONTRACT.md §12 — the page only ever receives values the guard has already cleaned, so the
    # in-browser code cannot send anything the Python client would refuse to.
    api_key = api_key.strip()
    if not is_publishable_key(api_key):
        raise ValueError("api_key must be a publishable site key (pk_...)")
    safe_base = normalize_base_url(base_url)
    if safe_base is None:
        raise ValueError(
            "base_url must be https:// (plain http only for localhost or a private network)"
        )
    params = guard_serve_params(
        api_key,
        slot_id=slot_id,
        slot_name=slot_name,
        page_url=page_url,
        page_keywords=",".join(keywords) if keywords else None,
        us_privacy=us_privacy,
        euconsent_v2=euconsent_v2,
        gpp=gpp,
        gpp_sid=gpp_sid,
    )
    if params is None:
        raise ValueError("slot_id must be a UUID (or slot_name a non-empty name of ≤128 bytes)")
    p = dict(params)

    config = {
        "apiKey": api_key,
        "slotId": p["slot_id"],
        "slotName": p["slot_name"],
        "baseUrl": safe_base,
        "refreshSeconds": int(refresh_seconds),
        "pageUrl": p["page_url"],
        "keywords": p["page_keywords"],
        "usPrivacy": p["us_privacy"],
        "euconsent": p["euconsent_v2"],
        "gpp": p["gpp"],
        "gppSid": p["gpp_sid"],
        "minRefresh": MIN_REFRESH_SECONDS,
        "maxRetry": MAX_RETRY_SECONDS,
        "viewRetry": list(VIEWABLE_RETRY_DELAYS_SECONDS),
    }
    # `</` is escaped so a value can never close the <script> block that carries it.
    payload = json.dumps(config, sort_keys=True).replace("</", "<\\/")
    return _TEMPLATE.replace("__ADX_CONFIG__", payload)


def banner(
    *,
    api_key: str,
    slot_id: Optional[str] = None,
    slot_name: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
    refresh_seconds: int = 0,
    page_url: Optional[str] = None,
    keywords: Optional[List[str]] = None,
    us_privacy: Optional[str] = None,
    euconsent_v2: Optional[str] = None,
    gpp: Optional[str] = None,
    gpp_sid: Optional[str] = None,
    width: int = 300,
    height: int = 250,
) -> Any:
    """Render a banner into the current Streamlit app.

    ``width``/``height`` size the component's iframe; the creative's own dimensions come from the
    slot configuration on the server, so keep these at least as large as the slot.
    """
    try:
        import streamlit.components.v1 as components  # noqa: PLC0415 - optional dependency
    except ImportError as exc:  # pragma: no cover - depends on the user's environment
        raise ImportError(
            "Streamlit is not installed. Install it with: pip install 'theaimart-adx[streamlit]'"
        ) from exc

    html = banner_html(
        api_key=api_key,
        slot_id=slot_id,
        slot_name=slot_name,
        base_url=base_url,
        refresh_seconds=refresh_seconds,
        page_url=page_url,
        keywords=keywords,
        us_privacy=us_privacy,
        euconsent_v2=euconsent_v2,
        gpp=gpp,
        gpp_sid=gpp_sid,
    )
    return components.html(html, width=width, height=height)
