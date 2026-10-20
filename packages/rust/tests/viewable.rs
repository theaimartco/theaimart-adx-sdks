//! CONTRACT.md §5 — every viewability-beacon response the backend can give.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use theaimart_adx::{
    viewable_outcome, Adx, AdRequest, HttpResponse, HttpTransport, TransportError, ViewableOutcome,
};

#[test]
fn viewable_outcome_classifies_every_contract_response() {
    use ViewableOutcome::*;
    let cases: &[(u16, &str, ViewableOutcome)] = &[
        (200, r#"{"success":true}"#, Recorded),
        (200, r#"{"success":true,"duplicate":true}"#, Recorded),
        (200, r#"{"success":false,"reason":"impression_not_recorded_yet","retry":true}"#, Retry),
        (0, "", Retry),
        (429, r#"{"error":"rate limit"}"#, Retry),
        (500, "", Retry),
        (503, "oops", Retry),
        (400, "Json deserialize error", Drop),
        (404, "", Drop),
        (200, r#"{"success":false}"#, Drop),
        (200, "", Drop),
        (200, "[true]", Drop),
        (200, r#"{"success":"true"}"#, Drop),
    ];
    for (status, body, want) in cases {
        assert_eq!(viewable_outcome(*status, body.as_bytes()), *want, "{status} {body}");
    }
}

/// Answers every call with one canned response and records the URLs it saw.
struct Canned {
    status: u16,
    body: &'static str,
    fail: bool,
    urls: Rc<RefCell<Vec<String>>>,
}

impl Canned {
    fn new(status: u16, body: &'static str) -> Self {
        Canned { status, body, fail: false, urls: Rc::new(RefCell::new(Vec::new())) }
    }
    fn reply(&self, url: &str) -> Result<HttpResponse, TransportError> {
        self.urls.borrow_mut().push(url.to_string());
        if self.fail {
            return Err(TransportError("reset".into()));
        }
        Ok(HttpResponse { status: self.status, headers: Vec::new(), body: self.body.as_bytes().to_vec() })
    }
}

impl HttpTransport for Canned {
    fn get(&self, url: &str, _: &[(&str, &str)], _: Duration) -> Result<HttpResponse, TransportError> {
        self.reply(url)
    }
    fn post(
        &self,
        url: &str,
        _: &[(&str, &str)],
        _: &[u8],
        _: Duration,
    ) -> Result<HttpResponse, TransportError> {
        self.reply(url)
    }
}

#[test]
fn a_too_early_beacon_is_not_a_success() {
    // The regression: this is a 200, so a status-only check used to call it recorded.
    let body = r#"{"success":false,"reason":"impression_not_recorded_yet","retry":true}"#;
    let adx = Adx::with_transport("pk_x", Canned::new(200, body));
    assert!(!adx.report_viewable("imp1"));
    assert_eq!(adx.report_viewable_outcome("imp1"), ViewableOutcome::Retry);
}

#[test]
fn duplicate_is_recorded_and_errors_classify() {
    let adx = Adx::with_transport("pk_x", Canned::new(200, r#"{"success":true,"duplicate":true}"#));
    assert!(adx.report_viewable("imp1"));
    assert_eq!(adx.report_viewable_outcome(""), ViewableOutcome::Drop);

    let mut failing = Canned::new(0, "");
    failing.fail = true;
    let adx = Adx::with_transport("pk_x", failing);
    assert_eq!(adx.report_viewable_outcome("imp1"), ViewableOutcome::Retry);
}

#[test]
fn gpp_is_sent_fully_encoded() {
    let t = Canned::new(200, r#"{"fill":false}"#);
    let urls = Rc::clone(&t.urls);
    let adx = Adx::with_transport("pk_x", t).base_url("https://h");
    let _ = adx.request_ad(&AdRequest {
        slot_id: Some("6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"),
        gpp: Some("DBABMA~CPXxRfA"),
        gpp_sid: Some("7,8"),
        ..Default::default()
    });
    let urls = urls.borrow();
    assert_eq!(urls.len(), 1);
    assert!(urls[0].contains("&gpp=%44%42%41%42%4D%41%7E%43%50%58%78%52%66%41"), "{}", urls[0]);
    assert!(urls[0].contains("&gpp_sid=%37%2C%38"), "{}", urls[0]);
}
