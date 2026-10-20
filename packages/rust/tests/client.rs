use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use theaimart_adx::transport::{HttpResponse, HttpTransport, TransportError};
use theaimart_adx::{raw_query_is_waf_safe, AdKind, AdRequest, Adx};

#[derive(Clone)]
struct Call {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<Vec<u8>>,
}

#[derive(Clone)]
struct Recorder {
    calls: Rc<RefCell<Vec<Call>>>,
    status: u16,
    body: Vec<u8>,
    err: bool,
}

impl Recorder {
    fn ok(body: &str) -> Self {
        Recorder {
            calls: Rc::new(RefCell::new(Vec::new())),
            status: 200,
            body: body.as_bytes().to_vec(),
            err: false,
        }
    }
    fn failing() -> Self {
        Recorder { calls: Rc::new(RefCell::new(Vec::new())), status: 0, body: Vec::new(), err: true }
    }
    fn response(&self) -> HttpResponse {
        HttpResponse { status: self.status, headers: Vec::new(), body: self.body.clone() }
    }
    fn record(&self, method: &str, url: &str, headers: &[(&str, &str)], body: Option<Vec<u8>>) {
        self.calls.borrow_mut().push(Call {
            url: url.to_string(),
            method: method.to_string(),
            headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            body,
        });
    }
}

impl HttpTransport for Recorder {
    fn get(&self, url: &str, headers: &[(&str, &str)], _t: Duration) -> Result<HttpResponse, TransportError> {
        if self.err {
            return Err(TransportError("boom".into()));
        }
        self.record("GET", url, headers, None);
        Ok(self.response())
    }
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &[u8], _t: Duration) -> Result<HttpResponse, TransportError> {
        if self.err {
            return Err(TransportError("boom".into()));
        }
        self.record("POST", url, headers, Some(body.to_vec()));
        Ok(self.response())
    }
}

const INTERNAL: &str = r#"{"fill":true,"imp_id":"imp123","creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp123","headline":"Hi","width":300,"height":250}}"#;

fn header<'a>(call: &'a Call, name: &str) -> Option<&'a str> {
    call.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
}

#[test]
fn request_ad_builds_waf_safe_url_and_parses() {
    let rec = Recorder::ok(INTERNAL);
    let adx = Adx::with_transport("pk_test", rec.clone()).base_url("https://h");
    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"),
        page_url: Some("https://x/weekend/@broadcast?a=select"),
        ..Default::default()
    });
    assert!(ad.filled);
    assert_eq!(ad.kind, AdKind::Image);
    assert_eq!(ad.imp_id.as_deref(), Some("imp123"));

    let calls = rec.calls.borrow();
    let call = &calls[0];
    assert_eq!(call.method, "GET");
    let query = call.url.split_once('?').unwrap().1;
    assert!(raw_query_is_waf_safe(query), "not WAF-safe: {}", query);
    assert!(call.url.starts_with("https://h/api/v1/serve/ad?"));
    let ua = header(call, "User-Agent").unwrap();
    assert!(ua.starts_with("theaimart-adx-rust/"));
    assert!(!ua.to_lowercase().contains("bot"));
    assert_eq!(header(call, "X-Adx-Sdk").unwrap(), concat!("theaimart-adx-rust/", env!("CARGO_PKG_VERSION")));
}

#[test]
fn header_injection_in_cookie_is_scrubbed() {
    let rec = Recorder::ok(INTERNAL);
    let adx = Adx::with_transport("pk_x", rec.clone()).base_url("https://h");
    let _ = adx.request_ad(&AdRequest {
        slot_id: Some("6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"),
        identity_cookie: Some("ok\r\nInjected: evil"),
        ..Default::default()
    });
    // A cookie the server could not have issued is not repaired and sent — it is not sent.
    let calls = rec.calls.borrow();
    assert_eq!(calls.len(), 1);
    assert!(header(&calls[0], "Cookie").is_none());
}

#[test]
fn missing_slot_is_no_fill() {
    let rec = Recorder::ok(INTERNAL);
    let adx = Adx::with_transport("pk_x", rec);
    let ad = adx.request_ad(&AdRequest::default());
    assert!(!ad.filled);
    assert_eq!(ad.http_status, 0);
}

#[test]
fn transport_error_fails_closed() {
    let adx = Adx::with_transport("pk_x", Recorder::failing());
    let ad = adx.request_ad(&AdRequest::slot("6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"));
    assert!(!ad.filled);
    assert_eq!(ad.http_status, 0);
}

#[test]
fn report_viewable_posts_correct_body() {
    let rec = Recorder::ok(r#"{"success":true}"#);
    let adx = Adx::with_transport("pk_x", rec.clone()).base_url("https://h");
    assert!(adx.report_viewable("imp1"));
    let calls = rec.calls.borrow();
    assert_eq!(calls[0].method, "POST");
    assert_eq!(calls[0].url, "https://h/api/v1/serve/viewable");
    assert_eq!(calls[0].body.as_deref(), Some(br#"{"imp_id":"imp1"}"#.as_ref()));
}

#[test]
fn report_viewable_empty_is_noop() {
    let rec = Recorder::ok(r#"{"success":true}"#);
    let adx = Adx::with_transport("pk_x", rec.clone());
    assert!(!adx.report_viewable(""));
    assert!(rec.calls.borrow().is_empty());
}

#[test]
fn click_url_encoded() {
    let adx = Adx::with_transport("pk_x", Recorder::ok("{}")).base_url("https://h");
    assert_eq!(adx.click_url("imp 1/2"), "https://h/api/v1/serve/click?id=%69%6D%70%20%31%2F%32");
}
