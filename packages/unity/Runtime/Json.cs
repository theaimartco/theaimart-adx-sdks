using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Theaimart.Adx
{
    /// <summary>
    /// Minimal, dependency-free JSON parser. Returns Dictionary&lt;string, object&gt; for objects,
    /// List&lt;object&gt; for arrays, string, double (all numbers), bool, or null. Returns null on any
    /// parse error (fail-closed). Unity's JsonUtility can't handle the response's dynamic shape, so
    /// we parse into a dictionary tree instead.
    /// </summary>
    internal static class Json
    {
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            int i = 0;
            try
            {
                object value = ParseValue(json, ref i);
                return value;
            }
            catch
            {
                return null;
            }
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWhitespace(s, ref i);
            char c = s[i];
            switch (c)
            {
                case '{': return ParseObject(s, ref i);
                case '[': return ParseArray(s, ref i);
                case '"': return ParseString(s, ref i);
                case 't': i += 4; return true;
                case 'f': i += 5; return false;
                case 'n': i += 4; return null;
                default: return ParseNumber(s, ref i);
            }
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var dict = new Dictionary<string, object>();
            i++; // consume '{'
            SkipWhitespace(s, ref i);
            if (s[i] == '}') { i++; return dict; }
            while (true)
            {
                SkipWhitespace(s, ref i);
                string key = ParseString(s, ref i);
                SkipWhitespace(s, ref i);
                i++; // consume ':'
                object value = ParseValue(s, ref i);
                dict[key] = value;
                SkipWhitespace(s, ref i);
                char c = s[i++];
                if (c == '}') break; // else ','
            }
            return dict;
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            var list = new List<object>();
            i++; // consume '['
            SkipWhitespace(s, ref i);
            if (s[i] == ']') { i++; return list; }
            while (true)
            {
                list.Add(ParseValue(s, ref i));
                SkipWhitespace(s, ref i);
                char c = s[i++];
                if (c == ']') break; // else ','
            }
            return list;
        }

        private static string ParseString(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++; // opening quote
            while (true)
            {
                char c = s[i++];
                if (c == '"') break;
                if (c == '\\')
                {
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            string hex = s.Substring(i, 4);
                            i += 4;
                            sb.Append((char)int.Parse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            break;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        private static object ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && "0123456789+-.eE".IndexOf(s[i]) >= 0) i++;
            string num = s.Substring(start, i - start);
            return double.Parse(num, CultureInfo.InvariantCulture);
        }
    }
}
