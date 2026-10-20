//! SQL-filter-safe query encoding (CONTRACT.md §7).
//!
//! The backend WAF 403s any raw query containing SQL-ish substrings (`end`, `open`, `cast`,
//! `select`, `@`, …) that occur constantly in real URLs. We percent-encode every byte of each
//! free-text value so no keyword substring survives, while the server still decodes it back.

/// Verbatim mirror of the backend keyword list (src/middleware/sql_injection.rs).
pub const SQL_INJECTION_KEYWORDS: &[&str] = &[
    "--", ";--", "/*", "*/", "@@", "@", "char", "nchar", "varchar", "nvarchar",
    "alter", "begin", "cast", "create", "cursor", "declare", "delete", "drop", "end",
    "exec", "execute", "fetch", "insert", "kill", "open", "select", "sys",
    "sysobjects", "syscolumns", "table", "update", "union", "waitfor", "xp_",
    "sp_", "' or '1'='1", "' or 1=1", "1=1", "or 1=1",
];

const HEX: &[u8; 16] = b"0123456789ABCDEF";

/// Percent-encode every UTF-8 byte of `value` as uppercase `%XX`.
pub fn percent_encode_all(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = String::with_capacity(bytes.len() * 3);
    for &b in bytes {
        out.push('%');
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0F) as usize] as char);
    }
    out
}

/// Build an `a=…&b=…` query string, fully byte-encoding every value. `None` values are skipped.
pub fn build_serve_query(params: &[(&str, Option<&str>)]) -> String {
    params
        .iter()
        .filter_map(|(name, value)| value.map(|v| format!("{}={}", name, percent_encode_all(v))))
        .collect::<Vec<_>>()
        .join("&")
}

/// Mirror of the backend WAF check; a query from [`build_serve_query`] always returns `true`.
pub fn raw_query_is_waf_safe(raw_query: &str) -> bool {
    let lowered = raw_query.to_lowercase();
    !SQL_INJECTION_KEYWORDS.iter().any(|kw| lowered.contains(kw))
}
