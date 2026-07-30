import assert from 'node:assert';
import { parseProyectoInput, parseProyectoPatch } from '../src/lib/proyectos.ts';

const valid = parseProyectoInput({ title: 'Proyecto de Prueba', coordinates: ['Spawn: 0, 0, 0'] });
assert.ok(valid);
assert.strictEqual(valid.title, 'Proyecto de Prueba');
assert.deepStrictEqual(valid.coordinates, ['Spawn: 0, 0, 0']);

assert.strictEqual(parseProyectoInput({ title: '', coordinates: [] }), null);
assert.strictEqual(parseProyectoInput({ title: 'X', coordinates: 'not-an-array' }), null);
assert.strictEqual(parseProyectoInput({ title: 'X', coordinates: [1, 2] }), null);

const patch = parseProyectoPatch({ title: 'Nuevo título' });
assert.deepStrictEqual(patch, { title: 'Nuevo título' });
assert.strictEqual(parseProyectoPatch({ title: '' }), null);
assert.deepStrictEqual(parseProyectoPatch({}), {});

console.log('ok: proyectos lib checks passed');
