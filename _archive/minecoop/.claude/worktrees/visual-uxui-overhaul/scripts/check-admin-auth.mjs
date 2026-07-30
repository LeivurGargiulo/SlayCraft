import assert from 'node:assert';
import { passwordsMatch } from '../src/lib/admin-auth.ts';

assert.ok(passwordsMatch('correct-password', 'correct-password'));
assert.ok(!passwordsMatch('wrong-password', 'correct-password'));
assert.ok(!passwordsMatch('', 'correct-password'));
assert.ok(!passwordsMatch('correct-passwor', 'correct-password'));

console.log('ok: admin-auth checks passed');
