// CONTRACT.md §9a — the continuous-fill scheduling policy.
//
// This is the shared conformance table. Every SDK in the repository ships the same cases;
// if you change one, change them all.

import 'package:flutter_test/flutter_test.dart';
import 'package:theaimart_adx/src/constants.dart';
import 'package:theaimart_adx/src/schedule.dart';

void main() {
  test('refresh disabled is single-shot, whatever happened', () {
    expect(nextDelaySeconds(true, 0, null, 0), isNull);
    expect(nextDelaySeconds(false, 3, null, 0), isNull);
    expect(nextDelaySeconds(false, 1, 60, -5), isNull);
  });

  test('a rendered ad refreshes at the requested interval, floored at 30s', () {
    expect(nextDelaySeconds(true, 0, null, 60), 60);
    expect(nextDelaySeconds(true, 0, null, 30), 30);
    expect(nextDelaySeconds(true, 0, null, 10), minRefreshSeconds);
    expect(nextDelaySeconds(true, 0, null, 1), minRefreshSeconds);
  });

  test('failures back off 30 -> 60 -> 120 -> 240 -> 300 and cap there', () {
    expect(nextDelaySeconds(false, 1, null, 30), 30);
    expect(nextDelaySeconds(false, 2, null, 30), 60);
    expect(nextDelaySeconds(false, 3, null, 30), 120);
    expect(nextDelaySeconds(false, 4, null, 30), 240);
    expect(nextDelaySeconds(false, 5, null, 30), maxRetrySeconds);
    expect(nextDelaySeconds(false, 99, null, 30), maxRetrySeconds);
    // A very long outage must not overflow into a negative or absurd delay.
    expect(nextDelaySeconds(false, 1000000000, null, 30), maxRetrySeconds);
  });

  test('Retry-After can push the delay out but never pull it in', () {
    expect(nextDelaySeconds(false, 1, 90, 30), 90);
    expect(nextDelaySeconds(false, 5, 10, 30), maxRetrySeconds);
    expect(nextDelaySeconds(false, 1, 0, 30), 30);
    expect(nextDelaySeconds(false, 1, null, 30), 30);
  });

  test('a slow requested interval is honoured on failure too', () {
    expect(nextDelaySeconds(false, 1, null, 600), 600);
    expect(nextDelaySeconds(true, 0, null, 600), 600);
  });

  test('the loop always stays inside the per-key rate limit', () {
    final perMinute = 60 / nextDelaySeconds(true, 0, null, 1)!;
    expect(perMinute <= 2, isTrue);
  });
}
