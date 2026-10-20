//! High-level client for the theaimart Ad Network (server-side, blocking).

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::constants::{
    default_user_agent, CLICK_PATH, DEFAULT_BASE_URL, SDK_IDENTIFIER, SERVE_AD_PATH, VIEWABLE_PATH,
};
use crate::encoding::{build_serve_query, percent_encode_all};
use crate::guard::{
    guard_serve_params, is_publishable_key, is_safe_identity_cookie, is_safe_imp_id,
    normalize_base_url, request_guard_for, safe_header_value, RequestGuard, ServeFields,
    REASON_INVALID_CONFIG, REASON_INVALID_REQUEST, REASON_RATE_LIMITED,
};
use crate::models::Ad;
use crate::transport::HttpTransport;
use crate::viewable::{viewable_outcome, ViewableOutcome};

/// Ad request parameters. Exactly one of `slot_id` (preferred) / `slot_name` is required.
#[derive(Debug, Clone, Default)]
pub struct AdRequest<'a> {
    pub slot_id: Option<&'a str>,
    pub slot_name: Option<&'a str>,
    pub page_url: Option<&'a str>,
    pub page_keywords: Option<&'a str>,
    pub us_privacy: Option<&'a str>,
    pub euconsent_v2: Option<&'a str>,
    /// IAB GPP string. Passed through; the backend does not parse it yet.
    pub gpp: Option<&'a str>,
    /// IAB GPP applicable section ids, e.g. `"7"` or `"7,8"`. Any US section (7–12) makes the
    /// request contextual-only, like a CCPA opt-out (CONTRACT.md §3).
    pub gpp_sid: Option<&'a str>,
    /// Previously stored `_an_id` value, for stable identity / frequency capping.
    pub identity_cookie: Option<&'a str>,
}

impl<'a> AdRequest<'a> {
    /// Convenience constructor for the common case of requesting by slot id.
    pub fn slot(slot_id: &'a str) -> Self {
        AdRequest {
            slot_id: Some(slot_id),
            ..Default::default()
        }
    }
}

/// Client for a single publisher `api_key`, generic over the HTTP transport.
pub struct Adx<T: HttpTransport> {
    api_key: String,
    base_url: String,
    user_agent: String,
    timeout: Duration,
    transport: T,
    config_error: Option<&'static str>,
    guard: Arc<Mutex<RequestGuard>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(feature = "ureq")]
impl Adx<crate::transport::UreqTransport> {
    /// Construct a client using the default blocking `ureq` transport.
    pub fn new(api_key: impl Into<String>) -> Self {
        Adx::with_transport(api_key, crate::transport::UreqTransport::new())
    }
}

impl<T: HttpTransport> Adx<T> {
    /// Construct a client with a custom transport (`reqwest`, a mock, …).
    ///
    /// `api_key` must be the publishable site key (`pk_…`). Anything else — an account token, a
    /// secret — leaves the client disabled: it never touches the network, every request is an
    /// un-filled [`Ad`] with reason `invalid_config`, and [`Adx::config_error`] says why.
    pub fn with_transport(api_key: impl Into<String>, transport: T) -> Self {
        let api_key = api_key.into().trim().to_string();
        let base_url = DEFAULT_BASE_URL.to_string();
        let mut adx = Adx {
            guard: request_guard_for(&base_url, &api_key),
            api_key,
            base_url,
            user_agent: default_user_agent(),
            timeout: Duration::from_secs(10),
            transport,
            config_error: None,
        };
        adx.validate();
        adx
    }

    /// Override the base URL. Chainable. Must be `https://` (plain `http` only for localhost or a
    /// private network) with no credentials, query or fragment — otherwise the client is
    /// disabled (see [`Adx::config_error`]).
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        let url = url.into();
        self.base_url = normalize_base_url(&url).unwrap_or(url);
        self.validate();
        self
    }

    /// Why this client refuses to send anything, or `None` when it is correctly configured.
    pub fn config_error(&self) -> Option<&'static str> {
        self.config_error
    }

    fn validate(&mut self) {
        self.config_error = if !is_publishable_key(&self.api_key) {
            Some("api_key must be a publishable site key (pk_…); never put a secret in an SDK")
        } else if normalize_base_url(&self.base_url).as_deref() != Some(self.base_url.as_str()) {
            Some("base_url must be https:// (http only for a local host), with no credentials, query or fragment")
        } else {
            None
        };
        self.guard = request_guard_for(&self.base_url, &self.api_key);
    }

    /// Override the User-Agent. Chainable. Must avoid backend bot substrings (CONTRACT.md §6).
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = safe_header_value(&ua.into());
        self
    }

    /// Override the per-request timeout. Chainable.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Request an ad decision. Fail-closed: a missing slot, any transport error, or a non-200
    /// response yields an un-filled [`Ad`] — this never panics or returns an `Err`.
    pub fn request_ad(&self, request: &AdRequest) -> Ad {
        if self.config_error.is_some() {
            return Ad::no_fill(0, Some(REASON_INVALID_CONFIG.to_string()), None, None);
        }
        // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server.
        let fields = ServeFields {
            slot_id: request.slot_id,
            slot_name: request.slot_name,
            page_url: request.page_url,
            page_keywords: request.page_keywords,
            us_privacy: request.us_privacy,
            euconsent_v2: request.euconsent_v2,
            gpp: request.gpp,
            gpp_sid: request.gpp_sid,
        };
        let Some(params) = guard_serve_params(&self.api_key, &fields) else {
            return Ad::no_fill(0, Some(REASON_INVALID_REQUEST.to_string()), None, None);
        };
        let wait = self.guard.lock().unwrap_or_else(|e| e.into_inner()).acquire(now_ms());
        if let Some(wait) = wait {
            return Ad::no_fill(0, Some(REASON_RATE_LIMITED.to_string()), Some(wait), None);
        }

        let borrowed: Vec<(&str, Option<&str>)> =
            params.iter().map(|(k, v)| (*k, v.as_deref())).collect();
        let url = format!("{}{}?{}", self.base_url, SERVE_AD_PATH, build_serve_query(&borrowed));

        let cookie_header = request
            .identity_cookie
            .filter(|c| is_safe_identity_cookie(c))
            .map(|c| format!("_an_id={c}"));
        let mut headers: Vec<(&str, &str)> = vec![
            ("User-Agent", self.user_agent.as_str()),
            ("Accept", "application/json"),
            ("X-Adx-Sdk", SDK_IDENTIFIER),
        ];
        if let Some(cookie) = cookie_header.as_deref() {
            headers.push(("Cookie", cookie));
        }

        match self.transport.get(&url, &headers, self.timeout) {
            Ok(resp) => {
                let retry_after = resp.header("retry-after").and_then(|v| v.trim().parse().ok());
                self.guard
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .record(resp.status, retry_after, now_ms());
                let cookie = extract_identity_cookie(resp.header("set-cookie"));
                Ad::from_response(resp.status, &resp.body, retry_after, cookie)
            }
            Err(_) => Ad::no_fill(0, None, None, None),
        }
    }

    /// Fire the viewability beacon — only once the ad has been measured ≥50% on-screen for ≥1s,
    /// never merely because it was served. Returns `true` only when the server recorded the
    /// view; no-ops (`false`) for an empty `imp_id` (e.g. house ads, which are not trackable).
    ///
    /// Use [`Adx::report_viewable_outcome`] to tell a retryable failure from a permanent one.
    pub fn report_viewable(&self, imp_id: &str) -> bool {
        self.report_viewable_outcome(imp_id) == ViewableOutcome::Recorded
    }

    /// Like [`Adx::report_viewable`], but returns the [`ViewableOutcome`]. On
    /// [`ViewableOutcome::Retry`] — the beacon beat the impression into the database, or the call
    /// failed transiently — the view was not counted and resending the same `imp_id` later is
    /// safe (CONTRACT.md §5). This never sleeps or retries by itself. `Drop` for an empty `imp_id`.
    pub fn report_viewable_outcome(&self, imp_id: &str) -> ViewableOutcome {
        // Only an id the server could have issued is echoed back to it.
        if self.config_error.is_some() || !is_safe_imp_id(imp_id) {
            return ViewableOutcome::Drop;
        }
        // Built by the JSON serialiser, not by string formatting. `imp_id` is server-generated
        // today, so the hand-rolled escaper this replaces was adequate in practice — but it
        // escaped only `\` and `"`, and a control character inside a JSON string is invalid
        // JSON, so it would have emitted an unparseable body the moment that assumption changed.
        let body = serde_json::json!({ "imp_id": imp_id }).to_string();
        let headers: Vec<(&str, &str)> = vec![
            ("Content-Type", "application/json"),
            ("User-Agent", self.user_agent.as_str()),
            ("X-Adx-Sdk", SDK_IDENTIFIER),
        ];
        let url = format!("{}{}", self.base_url, VIEWABLE_PATH);
        match self
            .transport
            .post(&url, &headers, body.as_bytes(), self.timeout)
        {
            Ok(resp) => viewable_outcome(resp.status, &resp.body),
            Err(_) => viewable_outcome(0, &[]),
        }
    }

    /// Build a click-tracker URL. Rarely needed — prefer `ad.creative.click_url`.
    pub fn click_url(&self, imp_id: &str) -> String {
        format!("{}{}?id={}", self.base_url, CLICK_PATH, percent_encode_all(imp_id))
    }
}

pub(crate) fn extract_identity_cookie(set_cookie: Option<&str>) -> Option<String> {
    let raw = set_cookie?;
    for segment in raw.split(';') {
        let trimmed = segment.trim();
        if let Some(value) = trimmed.strip_prefix("_an_id=") {
            // Only a value in the server's own alphabet is ever stored or replayed.
            return is_safe_identity_cookie(value).then(|| value.to_string());
        }
    }
    None
}
