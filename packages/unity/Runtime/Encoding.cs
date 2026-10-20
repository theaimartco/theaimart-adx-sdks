using System.Collections.Generic;
using System.Text;

namespace Theaimart.Adx
{
    /// <summary>
    /// SQL-filter-safe query encoding (CONTRACT.md §7).
    ///
    /// The backend WAF 403s any raw query containing SQL-ish substrings (end, open, cast, select,
    /// @, ...) that occur constantly in real URLs. We percent-encode every byte of each free-text
    /// value so no keyword substring survives, while the server still decodes it back.
    /// </summary>
    public static class AdxEncoding
    {
        /// <summary>Verbatim mirror of the backend keyword list (src/middleware/sql_injection.rs).</summary>
        public static readonly string[] SqlInjectionKeywords =
        {
            "--", ";--", "/*", "*/", "@@", "@", "char", "nchar", "varchar", "nvarchar",
            "alter", "begin", "cast", "create", "cursor", "declare", "delete", "drop", "end",
            "exec", "execute", "fetch", "insert", "kill", "open", "select", "sys",
            "sysobjects", "syscolumns", "table", "update", "union", "waitfor", "xp_",
            "sp_", "' or '1'='1", "' or 1=1", "1=1", "or 1=1",
        };

        private const string Hex = "0123456789ABCDEF";

        /// <summary>Percent-encode every UTF-8 byte of value as uppercase %XX.</summary>
        public static string PercentEncodeAll(string value)
        {
            byte[] bytes = System.Text.Encoding.UTF8.GetBytes(value);
            var sb = new StringBuilder(bytes.Length * 3);
            foreach (byte b in bytes)
            {
                sb.Append('%').Append(Hex[b >> 4]).Append(Hex[b & 0x0F]);
            }
            return sb.ToString();
        }

        /// <summary>Build a "a=…&amp;b=…" query string, fully byte-encoding every value. Null values are skipped.</summary>
        public static string BuildServeQuery(IEnumerable<KeyValuePair<string, string>> parameters)
        {
            var parts = new List<string>();
            foreach (KeyValuePair<string, string> kv in parameters)
            {
                if (kv.Value == null) continue;
                parts.Add(kv.Key + "=" + PercentEncodeAll(kv.Value));
            }
            return string.Join("&", parts);
        }

        /// <summary>Mirror of the backend WAF check; a query from BuildServeQuery always returns true.</summary>
        public static bool RawQueryIsWafSafe(string rawQuery)
        {
            string lowered = rawQuery.ToLowerInvariant();
            foreach (string kw in SqlInjectionKeywords)
            {
                if (lowered.Contains(kw)) return false;
            }
            return true;
        }
    }
}
