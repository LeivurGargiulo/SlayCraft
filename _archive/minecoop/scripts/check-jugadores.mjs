import assert from 'node:assert';
import { parseJugadorInput, parseJugadorPatch } from '../src/lib/jugadores.ts';

const valid = parseJugadorInput({ username: 'TestPlayer', actividad: 'activo' });
assert.ok(valid);
assert.strictEqual(valid.username, 'TestPlayer');
assert.strictEqual(valid.actividad, 'activo');

assert.strictEqual(parseJugadorInput({ username: '', actividad: 'activo' }), null);
assert.strictEqual(parseJugadorInput({ username: 'X', actividad: 'invalido' }), null);
assert.strictEqual(parseJugadorInput({ username: 'X' }), null);

const patch = parseJugadorPatch({ actividad: 'inactivo' });
assert.deepStrictEqual(patch, { actividad: 'inactivo' });
assert.strictEqual(parseJugadorPatch({ actividad: 'invalido' }), null);
assert.deepStrictEqual(parseJugadorPatch({}), {});

console.log('ok: jugadores lib checks passed');
