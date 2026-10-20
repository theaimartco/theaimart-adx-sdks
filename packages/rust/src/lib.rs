//! # theaimart-adx
//!
//! Official [theaimart Ad Network](https://adx.theaimart.co) SDK for Rust. Server-side ad
//! serving, tracking, and rendering. Implements the wire contract (see `CONTRACT.md`).
//!
//! ```no_run
//! # #[cfg(feature = "ureq")] {
//! use theaimart_adx::{Adx, AdRequest};
//!
//! let adx = Adx::new("pk_your_publisher_key");
//! let ad = adx.request_ad(&AdRequest {
//!     slot_id: Some("8b1f-uuid"),
//!     page_url: Some("https://yoursite.com/some/page"),
//!     ..Default::default()
//! });
//! if ad.filled {
//!     let html = theaimart_adx::render_html(&ad, "theaimart-adx");
//!     let _ = html; // inject into your page
//! }
//!
//! // Later — ONLY once your frontend has measured the ad ≥50% on-screen for ≥1s
//! // (CONTRACT.md §9c). Reporting a view just because the HTML was sent is fraudulent.
//! # let imp_id = "";
//! adx.report_viewable(imp_id);
//! # }
//! ```
//!
//! Server-side serving is attributed to **your server's IP** (the backend ignores
//! `X-Forwarded-For` values a client writes), so every user of one server shares one per-IP
//! rate limit and geo sees the server's location. It suits low-volume pages; see CONTRACT.md §6.
//!
//! ## Production hardening
//! - **SQL-filter-safe encoding** of free-text params so real URLs never trip the backend WAF.
//! - **Fraud-safe User-Agent** (`theaimart-adx-rust/<ver>`) off the backend bot blocklist.
//! - **Fail-closed**: any error/non-200 → an un-filled [`Ad`]; requests never panic or `Err`.
//! - [`render_html`] escapes attributes and only links `http(s)` click URLs.
//!
//! The HTTP transport is pluggable ([`HttpTransport`]); the default [`UreqTransport`] is behind
//! the `ureq` feature (enabled by default).

#![forbid(unsafe_code)]

pub mod constants;
pub mod encoding;
pub mod guard;
pub mod models;
pub mod transport;

mod client;
mod html;
mod viewable;

pub use client::{AdRequest, Adx};
pub use constants::{DEFAULT_BASE_URL, MIN_REFRESH_SECONDS, VERSION};
pub use encoding::{
    build_serve_query, percent_encode_all, raw_query_is_waf_safe, SQL_INJECTION_KEYWORDS,
};
pub use html::{is_safe_http_url, render_html};
pub use models::{Ad, AdKind, AdSource, Auction, Creative};
pub use transport::{HttpResponse, HttpTransport, TransportError};
pub use viewable::{viewable_outcome, ViewableOutcome};

#[cfg(feature = "ureq")]
pub use transport::UreqTransport;
