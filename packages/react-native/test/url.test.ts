import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSafeHttpUrl } from '../src/url.ts';

test('isSafeHttpUrl allowlist rejects hostile schemes', () => {
  assert.equal(isSafeHttpUrl('https://x.example/a'), true);
  assert.equal(isSafeHttpUrl('http://x.example'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
  assert.equal(isSafeHttpUrl('intent://evil#Intent;end'), false);
  assert.equal(isSafeHttpUrl('  JavaScript:alert(1)'), false);
});
