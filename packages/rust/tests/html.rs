use theaimart_adx::{is_safe_http_url, render_html, Ad, AdKind, AdSource, Creative};

fn image_ad(click: Option<&str>) -> Ad {
    Ad {
        filled: true,
        kind: AdKind::Image,
        source: AdSource::Internal,
        http_status: 200,
        imp_id: Some("i".into()),
        identity_id: None,
        dsp: None,
        reason: None,
        creative: Some(Creative {
            asset_url: Some("https://cdn/x.png".into()),
            click_url: click.map(String::from),
            headline: Some("Hi".into()),
            ..Default::default()
        }),
        auction: None,
        retry_after_seconds: None,
        set_identity_cookie: None,
    }
}

#[test]
fn safe_url_allowlist() {
    assert!(is_safe_http_url("https://x.example/a"));
    assert!(is_safe_http_url("http://x.example/a"));
    assert!(!is_safe_http_url("javascript:alert(1)"));
    assert!(!is_safe_http_url("file:///etc/passwd"));
    assert!(!is_safe_http_url("intent://evil#Intent;end"));
    assert!(!is_safe_http_url("data:text/html,<script>"));
}

#[test]
fn image_https_click_renders_link() {
    let html = render_html(&image_ad(Some("https://api.adx.theaimart.co/api/v1/serve/click?id=i")), "cls");
    assert!(html.contains("<a "));
    assert!(html.contains("href=\"https://api.adx.theaimart.co/api/v1/serve/click?id=i\""));
    assert!(html.contains("rel=\"noopener nofollow sponsored\""));
    assert!(html.contains("<img"));
}

#[test]
fn hostile_javascript_click_is_dropped() {
    let html = render_html(&image_ad(Some("javascript:alert(document.cookie)")), "cls");
    assert!(!html.contains("<a "), "hostile click URL must not become a link");
    assert!(!html.to_lowercase().contains("javascript:"));
    assert!(html.contains("<img"), "image should still render, just without a link");
}

#[test]
fn html_creative_is_sandboxed_and_escaped() {
    let mut ad = image_ad(None);
    ad.kind = AdKind::Html;
    ad.source = AdSource::OpenRtb;
    ad.creative = Some(Creative {
        html: Some("<b>hi</b><script>x</script>".into()),
        width: 320,
        height: 50,
        ..Default::default()
    });
    let html = render_html(&ad, "cls");
    assert!(html.contains("<iframe"));
    assert!(html.contains("sandbox=\"allow-scripts allow-popups allow-popups-to-escape-sandbox\""));
    // The markup is escaped into srcdoc, not injected as live child nodes.
    assert!(html.contains("&lt;script&gt;"));
    assert!(!html.contains("<script>"));
}

#[test]
fn no_fill_renders_empty() {
    assert_eq!(render_html(&Ad::no_fill(200, None, None, None), "cls"), "");
}
