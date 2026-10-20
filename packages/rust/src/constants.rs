//! Wire-contract constants. See CONTRACT.md — the single source of truth.

/// SDK version (from Cargo).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Production ad server. Override via [`crate::Adx::base_url`].
pub const DEFAULT_BASE_URL: &str = "https://api.adx.theaimart.co";

pub const SERVE_AD_PATH: &str = "/api/v1/serve/ad";
pub const VIEWABLE_PATH: &str = "/api/v1/serve/viewable";
pub const CLICK_PATH: &str = "/api/v1/serve/click";

/// Auto-refresh floor (CONTRACT.md §9).
pub const MIN_REFRESH_SECONDS: u32 = 30;

/// X-Adx-Sdk observability header value (does not affect fraud scoring).
pub const SDK_IDENTIFIER: &str = concat!("theaimart-adx-rust/", env!("CARGO_PKG_VERSION"));

/// Fraud-safe default User-Agent (CONTRACT.md §6): off every backend bot substring.
pub fn default_user_agent() -> String {
    format!("theaimart-adx-rust/{}", VERSION)
}
