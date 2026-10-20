// CONTRACT.md §5 (beacon outcomes) and §3 (identity persistence). Pure, so they are unit-tested
// like the other contract functions.

import 'dart:convert';

/// What a `POST /serve/viewable` response means for the view it reported.
enum ViewableOutcome {
  /// The server recorded the view (or already had it — `duplicate: true`).
  recorded,

  /// Not counted, but resending is safe: too early, rate-limited, 5xx or no response.
  retry,

  /// Permanent failure (e.g. `400`); resending would not help.
  drop,
}

/// Wait before each resend of a beacon answered [ViewableOutcome.retry]: attempts land at
/// roughly t = 0, 1, 3 and 7 s. The backend flushes impressions every 500 ms by default, so this
/// covers a slow flush several times over without keeping a dead beacon alive.
const List<int> viewableRetryDelaysSeconds = [1, 2, 4];

/// Classify a viewability-beacon response. [status] 0 means no response (transport error).
///
/// The backend writes impressions through an async buffer, so a beacon can arrive before the row
/// exists. It then answers `200 {"success": false, "retry": true}` and releases its dedup key —
/// the view was *not* counted. Reading only the status code turns that into a silent success,
/// which is how early beacons used to be lost for good.
ViewableOutcome viewableOutcome(int status, String? body) {
  if (status == 0 || status == 429 || status >= 500)
    return ViewableOutcome.retry;
  if (status < 200 || status >= 300) return ViewableOutcome.drop;
  Object? decoded;
  try {
    decoded = body == null || body.isEmpty ? null : jsonDecode(body);
  } on FormatException {
    decoded = null;
  }
  if (decoded is! Map) return ViewableOutcome.drop;
  // `== true` on purpose: a JSON string "true" is not a success.
  if (decoded['success'] == true) return ViewableOutcome.recorded;
  if (decoded['retry'] == true) return ViewableOutcome.retry;
  return ViewableOutcome.drop;
}

/// Send a measured view, resending it on [viewableRetryDelaysSeconds] while the answer is
/// [ViewableOutcome.retry] and [retryable] is true. Only an internal impression is retryable: an
/// OpenRTB win never gets a row the beacon could mark, so its answer is `retry` forever.
Future<ViewableOutcome> deliverWithRetry({
  required bool retryable,
  required Future<ViewableOutcome> Function() send,
  Future<void> Function(Duration delay) sleep = Future<void>.delayed,
}) async {
  var outcome = await send();
  for (final seconds in viewableRetryDelaysSeconds) {
    if (outcome != ViewableOutcome.retry || !retryable) break;
    await sleep(Duration(seconds: seconds));
    outcome = await send();
  }
  return outcome;
}

final RegExp _identityAlphabet = RegExp(r'^[A-Za-z0-9._\-+/=]{1,256}$');

/// Whether a server-sent `_an_id` value is safe to persist and replay in a `Cookie` header.
///
/// The value is `<uuid>.<base64 signature>` (or a bare legacy UUID), so anything outside the
/// UUID/base64 alphabets — a `;`, whitespace, a control character — is refused rather than
/// stored: a poisoned value would otherwise be resent on every request.
bool isStorableIdentity(String? value) =>
    value != null && _identityAlphabet.hasMatch(value);

/// Where a banner keeps the server's `_an_id` identity between requests (CONTRACT.md §3).
///
/// `package:http` has no cookie jar, so without a store every ad request is a brand-new user to
/// the server: frequency caps never hold and a new identity row is written per request. The
/// default, [AdxIdentityStore.memory], keeps it for the life of the process. To keep it across
/// launches, implement this over your own storage (e.g. `shared_preferences`) and pass it to
/// `BannerAd(identityStore: …)`.
abstract class AdxIdentityStore {
  const AdxIdentityStore();

  /// The process-wide in-memory store every banner shares by default.
  static final AdxIdentityStore memory = _MemoryIdentityStore();

  Future<String?> load();
  Future<void> save(String value);
}

class _MemoryIdentityStore extends AdxIdentityStore {
  String? _value;

  @override
  Future<String?> load() async => _value;

  @override
  Future<void> save(String value) async => _value = value;
}
