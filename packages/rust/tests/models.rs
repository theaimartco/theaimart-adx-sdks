use theaimart_adx::{Ad, AdKind, AdSource};

#[test]
fn parses_internal_fill_no_source_field() {
    let body = br#"{"fill":true,"imp_id":"imp1","identity_id":"id1",
        "auction":{"type":"second_price","clearing_price_paise":120,"quality_score":0.83},
        "creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp1","headline":"Hi","width":300,"height":250}}"#;
    let ad = Ad::from_response(200, body, None, None);
    assert!(ad.filled);
    assert_eq!(ad.kind, AdKind::Image);
    assert_eq!(ad.source, AdSource::Internal);
    assert_eq!(ad.imp_id.as_deref(), Some("imp1"));
    assert!(ad.is_trackable());
    let c = ad.creative.unwrap();
    assert_eq!(c.asset_url.as_deref(), Some("https://cdn/x.png"));
    assert_eq!(ad.auction.unwrap().clearing_price_paise, Some(120));
}

#[test]
fn parses_openrtb_html_fill() {
    let body = br#"{"fill":true,"source":"openrtb","imp_id":"i","dsp":"DSP","creative":{"html":"<div>ad</div>","width":320,"height":50}}"#;
    let ad = Ad::from_response(200, body, None, None);
    assert_eq!(ad.kind, AdKind::Html);
    assert_eq!(ad.source, AdSource::OpenRtb);
    assert_eq!(ad.dsp.as_deref(), Some("DSP"));
    assert_eq!(ad.creative.unwrap().html.as_deref(), Some("<div>ad</div>"));
}

#[test]
fn parses_house_fill_not_trackable() {
    let body = br#"{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/landing","width":300,"height":250}}"#;
    let ad = Ad::from_response(200, body, None, None);
    assert_eq!(ad.source, AdSource::House);
    assert_eq!(ad.kind, AdKind::Image);
    assert!(ad.imp_id.is_none());
    assert!(!ad.is_trackable());
}

#[test]
fn no_fill_and_error_variants() {
    assert!(!Ad::from_response(200, br#"{"fill":false}"#, None, None).filled);
    assert_eq!(
        Ad::from_response(200, br#"{"fill":false,"reason":"fraud_rejected"}"#, None, None).reason.as_deref(),
        Some("fraud_rejected")
    );
    assert_eq!(
        Ad::from_response(429, br#"{"fill":false}"#, Some(60), None).retry_after_seconds,
        Some(60)
    );
    assert!(!Ad::from_response(400, b"not json", None, None).filled);
    assert!(!Ad::from_response(200, b"", None, None).filled);
}

#[test]
fn creative_dimensions_default() {
    let ad = Ad::from_response(200, br#"{"fill":true,"creative":{"asset_url":"x","click_url":"y"}}"#, None, None);
    let c = ad.creative.unwrap();
    assert_eq!(c.width, 300);
    assert_eq!(c.height, 250);
}
