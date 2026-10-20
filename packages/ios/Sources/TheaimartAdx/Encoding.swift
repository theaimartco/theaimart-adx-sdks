import Foundation

/// SQL-filter-safe query encoding (CONTRACT.md §7).
///
/// The backend WAF 403s any raw query containing SQL-ish substrings (`end`, `open`, `cast`,
/// `select`, `@`, …) that occur constantly in real URLs. We percent-encode every byte of each
/// free-text value so no keyword substring survives, while the server still decodes it back.
public enum AdxEncoding {

    /// Verbatim mirror of the backend keyword list (src/middleware/sql_injection.rs).
    public static let sqlInjectionKeywords: [String] = [
        "--", ";--", "/*", "*/", "@@", "@", "char", "nchar", "varchar", "nvarchar",
        "alter", "begin", "cast", "create", "cursor", "declare", "delete", "drop", "end",
        "exec", "execute", "fetch", "insert", "kill", "open", "select", "sys",
        "sysobjects", "syscolumns", "table", "update", "union", "waitfor", "xp_",
        "sp_", "' or '1'='1", "' or 1=1", "1=1", "or 1=1",
    ]

    /// Percent-encode every UTF-8 byte of `value` as uppercase `%XX`.
    public static func percentEncodeAll(_ value: String) -> String {
        var out = ""
        out.reserveCapacity(value.utf8.count * 3)
        for byte in value.utf8 {
            out += String(format: "%%%02X", byte)
        }
        return out
    }

    /// Build a `a=…&b=…` query string, fully byte-encoding every value. Nil values are skipped.
    public static func buildServeQuery(_ params: [(String, String?)]) -> String {
        params.compactMap { name, value in
            value.map { "\(name)=\(percentEncodeAll($0))" }
        }.joined(separator: "&")
    }

    /// Mirror of the backend WAF check; a query from `buildServeQuery` always returns true.
    public static func rawQueryIsWafSafe(_ rawQuery: String) -> Bool {
        let lowered = rawQuery.lowercased()
        return !sqlInjectionKeywords.contains { lowered.contains($0) }
    }
}
