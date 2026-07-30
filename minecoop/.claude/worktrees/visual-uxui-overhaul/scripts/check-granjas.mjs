import assert from 'node:assert';
import { parseGranjaInput, parseGranjaPatch } from '../src/lib/granjas.ts';

const valid = parseGranjaInput({ title: 'Granja de Prueba', coordinates: ['Granja: 0, 0, 0'] });
assert.ok(valid);
assert.strictEqual(valid.title, 'Granja de Prueba');
assert.deepStrictEqual(valid.coordinates, ['Granja: 0, 0, 0']);

assert.strictEqual(parseGranjaInput({ title: '', coordinates: [] }), null);
assert.strictEqual(parseGranjaInput({ title: 'X', coordinates: 'not-an-array' }), null);
assert.strictEqual(parseGranjaInput({ title: 'X', coordinates: [1, 2] }), null);

const patch = parseGranjaPatch({ title: 'Nuevo título' });
assert.deepStrictEqual(patch, { title: 'Nuevo título' });
assert.strictEqual(parseGranjaPatch({ title: '' }), null);
assert.deepStrictEqual(parseGranjaPatch({}), {});

console.log('ok: granjas lib checks passed');
