//! Server-side HTML rendering with attribute-escaping and click-URL scheme allowlisting.

use crate::models::{Ad, AdKind};

const IFRAME_SANDBOX: &str = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/// Whether a click URL may be turned into a navigable link. Only `http`/`https` are allowed —
/// `javascript:`, `data:`, `file:`, `intent:` etc. from a hostile creative are rejected.
pub fn is_safe_http_url(url: &str) -> bool {
    let lower = url.trim_start().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Render an [`Ad`] to an HTML snippet, or `""` if it cannot/should not be rendered. Image
/// creatives become a sponsored `<a><img></a>` (link dropped if the click URL is unsafe); html
/// creatives become a sandboxed `<iframe srcdoc>`.
pub fn render_html(ad: &Ad, css_class: &str) -> String {
    if !ad.filled {
        return String::new();
    }
    let creative = match &ad.creative {
        Some(c) => c,
        None => return String::new(),
    };
    let klass = escape_attr(css_class);

    if ad.kind == AdKind::Html {
        if let Some(html) = &creative.html {
            let srcdoc = escape_attr(html);
            return format!(
                "<iframe class=\"{klass}\" width=\"{w}\" height=\"{h}\" frameborder=\"0\" \
                 scrolling=\"no\" marginwidth=\"0\" marginheight=\"0\" sandbox=\"{sandbox}\" \
                 srcdoc=\"{srcdoc}\"></iframe>",
                klass = klass,
                w = creative.width,
                h = creative.height,
                sandbox = IFRAME_SANDBOX,
                srcdoc = srcdoc,
            );
        }
    }

    let asset = match &creative.asset_url {
        Some(a) if !a.is_empty() => a,
        _ => return String::new(),
    };
    let src = escape_attr(asset);
    let alt = escape_attr(creative.headline.as_deref().unwrap_or("Advertisement"));
    let img = format!(
        "<img src=\"{src}\" alt=\"{alt}\" width=\"{w}\" height=\"{h}\" style=\"border:0;display:block\" />",
        src = src,
        alt = alt,
        w = creative.width,
        h = creative.height,
    );

    match &creative.click_url {
        Some(url) if is_safe_http_url(url) => {
            let href = escape_attr(url);
            format!(
                "<a class=\"{klass}\" href=\"{href}\" target=\"_blank\" rel=\"noopener nofollow sponsored\">{img}</a>",
                klass = klass,
                href = href,
                img = img,
            )
        }
        // Unsafe (non-http) or absent click URL → render the image without a link.
        _ => img,
    }
}
