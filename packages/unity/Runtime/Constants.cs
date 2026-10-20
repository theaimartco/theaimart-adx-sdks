namespace Theaimart.Adx
{
    // Wire-contract constants. See CONTRACT.md — the single source of truth.
    public static class AdxConstants
    {
        public const string Version = "1.1.0";

        /// <summary>Production ad server. Override via the Adx(baseUrl:) constructor.</summary>
        public const string DefaultBaseUrl = "https://api.adx.theaimart.co";

        public const string ServeAdPath = "/api/v1/serve/ad";
        public const string ViewablePath = "/api/v1/serve/viewable";
        public const string ClickPath = "/api/v1/serve/click";

        public const int DefaultTimeoutSeconds = 10;

        /// <summary>Auto-refresh floor (CONTRACT.md §9). Values below this are clamped up.</summary>
        public const int MinRefreshSeconds = 30;

        /// <summary>Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a).</summary>
        public const int MaxRetrySeconds = 300;

        /// <summary>X-Adx-Sdk observability header value (does not affect fraud scoring).</summary>
        public const string SdkIdentifier = "theaimart-adx-unity/" + Version;
    }
}
