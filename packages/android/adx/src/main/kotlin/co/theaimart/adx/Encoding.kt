package co.theaimart.adx

/**
 * SQL-filter-safe query encoding (CONTRACT.md §7).
 *
 * The backend WAF 403s any raw query containing SQL-ish substrings (`end`, `open`, `cast`,
 * `select`, `@`, …) that occur constantly in real URLs. We percent-encode every byte of each
 * free-text value so no keyword substring survives, while the server still decodes it back.
 */
public object Encoding {

    /** Verbatim mirror of the backend keyword list (src/middleware/sql_injection.rs). */
    @JvmField
    public val SQL_INJECTION_KEYWORDS: List<String> = listOf(
        "--", ";--", "/*", "*/", "@@", "@", "char", "nchar", "varchar", "nvarchar",
        "alter", "begin", "cast", "create", "cursor", "declare", "delete", "drop", "end",
        "exec", "execute", "fetch", "insert", "kill", "open", "select", "sys",
        "sysobjects", "syscolumns", "table", "update", "union", "waitfor", "xp_",
        "sp_", "' or '1'='1", "' or 1=1", "1=1", "or 1=1",
    )

    private const val HEX = "0123456789ABCDEF"

    /** Percent-encode every UTF-8 byte of [value] as uppercase `%XX`. */
    public fun percentEncodeAll(value: String): String {
        val bytes = value.toByteArray(Charsets.UTF_8)
        val sb = StringBuilder(bytes.size * 3)
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            sb.append('%').append(HEX[v ushr 4]).append(HEX[v and 0x0F])
        }
        return sb.toString()
    }

    /** Build a `a=…&b=…` query string, fully byte-encoding every value. Null values are skipped. */
    public fun buildServeQuery(params: List<Pair<String, String?>>): String =
        params.mapNotNull { (name, value) -> value?.let { "$name=${percentEncodeAll(it)}" } }
            .joinToString("&")

    /** Mirror of the backend WAF check; a query from [buildServeQuery] always returns true. */
    public fun rawQueryIsWafSafe(rawQuery: String): Boolean {
        val lowered = rawQuery.lowercase()
        return SQL_INJECTION_KEYWORDS.none { lowered.contains(it) }
    }
}
