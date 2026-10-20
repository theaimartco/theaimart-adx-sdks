package co.theaimart.adx

// Wire-contract constants. See CONTRACT.md — the single source of truth.

public const val SDK_VERSION: String = "1.1.0"

/** Production ad server. Override via the `Adx(baseUrl = …)` constructor. */
public const val DEFAULT_BASE_URL: String = "https://api.adx.theaimart.co"

public const val SERVE_AD_PATH: String = "/api/v1/serve/ad"
public const val VIEWABLE_PATH: String = "/api/v1/serve/viewable"
public const val CLICK_PATH: String = "/api/v1/serve/click"

public const val DEFAULT_TIMEOUT_MS: Int = 10_000

/** Auto-refresh floor (CONTRACT.md §9). Values below this are clamped up. */
public const val MIN_REFRESH_SECONDS: Int = 30

/** Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a). */
public const val MAX_RETRY_SECONDS: Int = 300

/** X-Adx-Sdk observability header value (does not affect fraud scoring). */
internal const val SDK_IDENTIFIER: String = "theaimart-adx-android/" + SDK_VERSION
