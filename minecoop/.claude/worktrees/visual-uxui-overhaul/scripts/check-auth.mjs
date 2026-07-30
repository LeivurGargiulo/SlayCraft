import assert from 'node:assert';
import { createSessionCookieValue, verifySessionCookieValue } from '../src/lib/auth.ts';

const secret = 'test-secret';
const cookie = createSessionCookieValue('TitoBaiso', secret);
assert.strictEqual(verifySessionCookieValue(cookie, secret), 'TitoBaiso');
assert.strictEqual(verifySessionCookieValue(cookie, 'wrong-secret'), null);
assert.strictEqual(verifySessionCookieValue(cookie + 'x', secret), null);
assert.strictEqual(verifySessionCookieValue('garbage', secret), null);

console.log('ok: auth checks passed');
