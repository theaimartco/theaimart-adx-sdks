//! Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts.
//!
//! Tests that touch the process-wide guard each use their own api key, because the test harness
//! runs them in parallel threads that share it.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use theaimart_adx::guard::*;
use theaimart_adx::{AdRequest, Adx, HttpResponse, HttpTransport, TransportError, ViewableOutcome};

const SLOT: &str = "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a";

#[test]
fn publishable_key() {
    for ok in ["pk_x", "pk_0123456789abcdef0123456789abcdef", "pk_virgo_live-1"] {
        assert!(is_publishable_key(ok), "{ok}");
    }
    let long = format!("pk_{}", "a".repeat(98));
    for bad in ["", "pk_", "sk_live_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x", "pk_a b", "pk_a\n", "PK_x", &long] {
        assert!(!is_publishable_key(bad), "{bad:?}");
    }
}

#[test]
fn base_url() {
    assert_eq!(normalize_base_url("https://api.adx.theaimart.co/").as_deref(), Some("https://api.adx.theaimart.co"));
    assert_eq!(normalize_base_url("  https://h:8443/prefix// ").as_deref(), Some("https://h:8443/prefix"));
    for local in [
        "http://localhost:8080", "http://127.0.0.1:9", "http://10.0.2.2:8080", "http://192.168.1.5",
        "http://172.20.0.1", "http://[::1]:80", "http://dev.localhost",
    ] {
        assert_eq!(normalize_base_url(local).as_deref(), Some(local), "{local}");
    }
    for bad in [
        "http://api.adx.theaimart.co", "http://10.evil.com", "http://172.32.0.1",
        "https://user:pw@api.adx.theaimart.co", "https://api.adx.theaimart.co@evil.com",
        "https://h/?x=1", "https://h/#f", "https://h\\@evil.com", "https://h /x", "ftp://h",
        "javascript:alert(1)", "https://",
    ] {
        assert_eq!(normalize_base_url(bad), None, "{bad}");
    }
}

#[test]
fn imp_id_and_identity() {
    assert!(is_safe_imp_id("1751600000000_550e8400-e29b-41d4-a716-446655440000"));
    let long = "a".repeat(129);
    for bad in ["", "a b", "x\"}", "a\r\nb", &long] {
        assert!(!is_safe_imp_id(bad), "{bad:?}");
    }
    assert!(is_safe_identity_cookie("550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=="));
    let long = "a".repeat(513);
    for bad in ["", "a;b", "a b", "ok\r\nSet-Cookie: x", "a,b", &long] {
        assert!(!is_safe_identity_cookie(bad), "{bad:?}");
    }
}

#[test]
fn page_url() {
    let cases: &[(&str, Option<&str>)] = &[
        ("https://site.com/a/b?q=shoes#access_token=abc", Some("https://site.com/a/b?q=shoes")),
        ("https://user:pw@site.com/x", Some("https://site.com/x")),
        ("https://site.com/cb?code=abc&state=xyz&page=2", Some("https://site.com/cb?page=2")),
        (
            "https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl",
            Some("https://site.com/?utm_source=nl"),
        ),
        ("https://site.com/?u=alice@example.com&v=bob%40example.com&w=1", Some("https://site.com/?w=1")),
        ("https://site.com/@handle/post?ref=home", Some("https://site.com/@handle/post?ref=home")),
        ("https://site.com/x?password=hunter2", Some("https://site.com/x")),
        ("https://site.com/x?&&a=1&&", Some("https://site.com/x?a=1")),
        ("app://screen/home", Some("app://screen/home")),
        ("/settings/profile?email=a@b.c", Some("/settings/profile")),
        ("  \u{0}https://site.com/\r\n  ", Some("https://site.com/")),
        ("https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm", Some("https://site.com/reset/*/confirm")),
        ("https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln", Some("https://site.com/m/*")),
        (
            "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026",
            Some("https://site.com/blog/how-to-build-a-rest-api-in-rust-2026"),
        ),
        (
            "https://site.com/p/550e8400-e29b-41d4-a716-446655440000",
            Some("https://site.com/p/550e8400-e29b-41d4-a716-446655440000"),
        ),
        (
            "https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes",
            Some("https://site.com/?q=shoes"),
        ),
        ("https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3", Some("https://site.com/?page=3")),
        ("https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1", Some("https://site.com/?q=1")),
        (
            "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high",
            Some("https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high"),
        ),
        ("https://site.com/x?%E2%82=1&%ZZ=2", Some("https://site.com/x?%E2%82=1&%ZZ=2")),
        ("#only-a-fragment", None),
        ("", None),
    ];
    for (input, want) in cases {
        assert_eq!(sanitize_page_url(input).as_deref(), *want, "{input:?}");
    }
    let long = format!("https://site.com/{}", "é".repeat(5000));
    let out = sanitize_page_url(&long).unwrap();
    assert!(out.len() <= MAX_PAGE_URL_BYTES);
    assert!(out.starts_with("https://site.com/éé"));
}

#[test]
fn looks_like_secret_vectors() {
    for yes in [
        "9f86d081884c7d659a2feaa0c55ad015",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln",
        "Zx81kQ2mT7vB4nR9sW3yL6pA",
        "sess_4f9a8b7c6d5e4f3a2b1c",
    ] {
        assert!(looks_like_secret(yes), "{yes}");
    }
    for no in [
        "how-to-build-a-rest-api-in-rust-2026",
        "550e8400-e29b-41d4-a716-446655440000",
        "nike+air+max+270+review+2026",
        "supercalifragilisticexpialidocious",
        "123456789012345678901234567890",
        "short1a",
        "",
    ] {
        assert!(!looks_like_secret(no), "{no}");
    }
}

#[test]
fn page_url_never_panics_on_odd_escapes() {
    for input in ["https://a/?%", "https://a/?%E", "https://a/?é%=1", "https://a/?%é1=2", "%%%", "https://a/?n%C3%A9=1"] {
        let _ = sanitize_page_url(input);
    }
}

#[test]
fn truncate_utf8_never_splits() {
    let s = "aé😀b";
    for (n, want) in [(1, "a"), (2, "a"), (3, "aé"), (6, "aé"), (7, "aé😀"), (99, "aé😀b")] {
        assert_eq!(truncate_utf8(s, n), want, "{n}");
    }
}

#[test]
fn keywords() {
    assert_eq!(sanitize_keywords(" a,b\u{7},c ").as_deref(), Some("a,b,c"));
    assert_eq!(sanitize_keywords("   "), None);
    assert_eq!(sanitize_keywords(&"k".repeat(5000)).unwrap().len(), MAX_KEYWORDS_BYTES);
}

#[test]
fn privacy_signals_are_never_lost() {
    assert_eq!(sanitize_us_privacy("1YYN").as_deref(), Some("1YYN"));
    assert_eq!(sanitize_us_privacy(" 1-Y-\n").as_deref(), Some("1-Y-"));
    assert!(sanitize_us_privacy(&format!("1YY{}", "x".repeat(100))).unwrap().starts_with("1YY"));
    assert_eq!(sanitize_gpp_sid("7").as_deref(), Some("7"));
    assert_eq!(sanitize_gpp_sid("7_8").as_deref(), Some("7,8"));
    assert_eq!(sanitize_gpp_sid("7;8").as_deref(), Some("7,8"));
    assert_eq!(sanitize_gpp_sid(" 2 , 7 ").as_deref(), Some("2,7"));
    assert_eq!(sanitize_gpp_sid("abc"), None);
    assert!(sanitize_gpp_sid(&"1,".repeat(200)).unwrap().len() <= 128);
    let tcf = "CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA";
    assert_eq!(sanitize_consent(&format!(" {tcf} ")).as_deref(), Some(tcf));
    assert!(sanitize_consent(&"C".repeat(MAX_CONSENT_BYTES)).is_some());
    assert_eq!(sanitize_consent(&"C".repeat(MAX_CONSENT_BYTES + 1)), None);
}

#[test]
fn invalid_slot_is_never_sent() {
    let f = |slot_id: Option<&str>, slot_name: Option<&str>| {
        guard_serve_params("pk_x", &ServeFields { slot_id, slot_name, ..Default::default() })
    };
    assert!(f(None, None).is_none());
    assert!(f(Some("s1"), None).is_none());
    assert!(f(Some(&format!("{SLOT}' or 1=1")), None).is_none());
    assert!(f(None, Some("  ")).is_none());
    assert!(f(None, Some(&"n".repeat(129))).is_none());
    let by_name = f(None, Some(" home-top ")).unwrap();
    assert!(by_name.contains(&("slot_name", Some("home-top".to_string()))));
    let p = guard_serve_params(
        "pk_x",
        &ServeFields {
            slot_id: Some(&format!(" {SLOT} ")),
            slot_name: Some("ignored"),
            page_url: Some("https://s.com/#t"),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        p,
        vec![
            ("api_key", Some("pk_x".to_string())),
            ("slot_id", Some(SLOT.to_string())),
            ("slot_name", None),
            ("page_url", Some("https://s.com/".to_string())),
            ("page_keywords", None),
            ("us_privacy", None),
            ("euconsent_v2", None),
            ("gpp", None),
            ("gpp_sid", None),
        ]
    );
}

#[test]
fn request_budget() {
    let mut g = RequestGuard::new();
    let t0 = 1_000_000;
    for _ in 0..MAX_REQUESTS_PER_MINUTE {
        assert_eq!(g.acquire(t0), None);
    }
    assert_eq!(g.acquire(t0), Some(1));
    assert_eq!(g.acquire(t0 + 1000), None);
    assert_eq!(g.acquire(t0 + 1000), Some(1));
}

#[test]
fn breaker_429() {
    let mut g = RequestGuard::new();
    g.record(429, Some(30), 0);
    assert_eq!(g.acquire(1000), Some(29));
    assert_eq!(g.acquire(30_000), None);
    let mut d = RequestGuard::new();
    d.record(429, None, 0);
    assert_eq!(d.acquire(0), Some(60));
    let mut c = RequestGuard::new();
    c.record(429, Some(86_400), 0);
    assert_eq!(c.acquire(0), Some(600));
    let mut o = RequestGuard::new();
    o.record(503, Some(999), 0);
    assert_eq!(o.acquire(0), None);
}

#[derive(Clone)]
struct Counting {
    calls: Rc<RefCell<usize>>,
    status: u16,
    headers: Vec<(String, String)>,
    body: &'static str,
}

impl Counting {
    fn new(status: u16, headers: &[(&str, &str)], body: &'static str) -> Self {
        Counting {
            calls: Rc::new(RefCell::new(0)),
            status,
            headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            body,
        }
    }
    fn reply(&self) -> Result<HttpResponse, TransportError> {
        *self.calls.borrow_mut() += 1;
        Ok(HttpResponse { status: self.status, headers: self.headers.clone(), body: self.body.as_bytes().to_vec() })
    }
}

impl HttpTransport for Counting {
    fn get(&self, _: &str, _: &[(&str, &str)], _: Duration) -> Result<HttpResponse, TransportError> {
        self.reply()
    }
    fn post(&self, _: &str, _: &[(&str, &str)], _: &[u8], _: Duration) -> Result<HttpResponse, TransportError> {
        self.reply()
    }
}

#[test]
fn unsafe_config_disables_the_client() {
    for (key, base) in [
        ("sk_live_secret", "https://api.adx.theaimart.co"),
        ("eyJhbGciOiJIUzI1NiJ9.e30.sig", "https://api.adx.theaimart.co"),
        ("pk_cfg", "http://api.adx.theaimart.co"),
        ("pk_cfg", "https://api.adx.theaimart.co@evil.com"),
    ] {
        let t = Counting::new(200, &[], "{}");
        let adx = Adx::with_transport(key, t.clone()).base_url(base);
        assert!(adx.config_error().is_some(), "{key} {base}");
        let ad = adx.request_ad(&AdRequest::slot(SLOT));
        assert_eq!(ad.reason.as_deref(), Some("invalid_config"));
        assert_eq!(adx.report_viewable_outcome("imp1"), ViewableOutcome::Drop);
        assert_eq!(*t.calls.borrow(), 0, "{key} {base}");
    }
    let ok = Adx::with_transport(" pk_cfg\n", Counting::new(200, &[], "{}")).base_url("http://localhost:8080");
    assert_eq!(ok.config_error(), None);
}

#[test]
fn invalid_slot_never_reaches_network() {
    let t = Counting::new(200, &[], "{}");
    let adx = Adx::with_transport("pk_slot", t.clone());
    let ad = adx.request_ad(&AdRequest::slot("s1' OR 1=1"));
    assert_eq!(ad.reason.as_deref(), Some("invalid_request"));
    assert_eq!(*t.calls.borrow(), 0);
}

#[test]
fn a_429_is_shared_across_clients() {
    let t = Counting::new(429, &[("Retry-After", "60")], r#"{"fill":false}"#);
    let _ = Adx::with_transport("pk_shared429", t.clone()).request_ad(&AdRequest::slot(SLOT));
    let blocked = Adx::with_transport("pk_shared429", t.clone()).request_ad(&AdRequest::slot(SLOT));
    assert_eq!(*t.calls.borrow(), 1);
    assert_eq!(blocked.reason.as_deref(), Some("rate_limited"));
    assert!(blocked.retry_after_seconds.unwrap_or(0) >= 59);
}

#[test]
fn a_request_loop_is_capped() {
    let t = Counting::new(200, &[], r#"{"fill":false}"#);
    let adx = Adx::with_transport("pk_loop", t.clone());
    for _ in 0..100 {
        let _ = adx.request_ad(&AdRequest::slot(SLOT));
    }
    assert_eq!(*t.calls.borrow(), 60);
}

#[test]
fn forged_imp_id_is_never_echoed() {
    let t = Counting::new(200, &[], r#"{"success":true}"#);
    let adx = Adx::with_transport("pk_imp", t.clone());
    assert_eq!(adx.report_viewable_outcome("x\", \"admin\": true, \"y\": \""), ViewableOutcome::Drop);
    assert_eq!(*t.calls.borrow(), 0);
}
