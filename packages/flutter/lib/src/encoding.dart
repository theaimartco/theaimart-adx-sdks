import 'dart:convert';

/// SQL-filter-safe query encoding (CONTRACT.md §7).
///
/// The backend WAF 403s any raw query containing SQL-ish substrings (`end`, `open`, `cast`,
/// `select`, `@`, …) that occur constantly in real URLs. We percent-encode every byte of each
/// free-text value so no keyword substring survives, while the server still decodes it back.
//library;

/// Verbatim mirror of the backend keyword list (src/middleware/sql_injection.rs).
const List<String> sqlInjectionKeywords = [
  '--',
  ';--',
  '/*',
  '*/',
  '@@',
  '@',
  'char',
  'nchar',
  'varchar',
  'nvarchar',
  'alter',
  'begin',
  'cast',
  'create',
  'cursor',
  'declare',
  'delete',
  'drop',
  'end',
  'exec',
  'execute',
  'fetch',
  'insert',
  'kill',
  'open',
  'select',
  'sys',
  'sysobjects',
  'syscolumns',
  'table',
  'update',
  'union',
  'waitfor',
  'xp_',
  'sp_',
  "' or '1'='1",
  "' or 1=1",
  '1=1',
  'or 1=1',
];

const String _hex = '0123456789ABCDEF';

/// Percent-encode every UTF-8 byte of [value] as uppercase `%XX`.
String percentEncodeAll(String value) {
  final bytes = utf8.encode(value);
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write('%');
    sb.write(_hex[b >> 4]);
    sb.write(_hex[b & 0x0F]);
  }
  return sb.toString();
}

/// Build a `a=…&b=…` query string, fully byte-encoding every value. Null values are skipped.
String buildServeQuery(List<MapEntry<String, String?>> params) {
  final parts = <String>[];
  for (final entry in params) {
    final value = entry.value;
    if (value == null) continue;
    parts.add('${entry.key}=${percentEncodeAll(value)}');
  }
  return parts.join('&');
}

/// Mirror of the backend WAF check; a query from [buildServeQuery] always returns true.
bool rawQueryIsWafSafe(String rawQuery) {
  final lowered = rawQuery.toLowerCase();
  return !sqlInjectionKeywords.any(lowered.contains);
}
