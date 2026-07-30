import assert from 'node:assert';
import { slugify, parseTareaInput, parseTareaPatch } from '../src/lib/tareas.ts';

assert.strictEqual(slugify('Construir Granja de Ghast'), 'construir-granja-de-ghast');
assert.strictEqual(slugify('Árbol Mágico!!'), 'arbol-magico');

const valid = parseTareaInput({ title: 'Test', status: 'pendiente', priority: 2 });
assert.ok(valid);
assert.strictEqual(valid.title, 'Test');

assert.strictEqual(parseTareaInput({ title: '', status: 'pendiente', priority: 2 }), null);
assert.strictEqual(parseTareaInput({ title: 'Test', status: 'invalido', priority: 2 }), null);
assert.strictEqual(parseTareaInput({ title: 'Test', status: 'pendiente', priority: 9 }), null);
assert.strictEqual(
  parseTareaInput({ title: 'Test', status: 'pendiente', priority: 1, subtareas: [{ title: 'x' }] }),
  null
);

const patch = parseTareaPatch({ priority: 3 });
assert.deepStrictEqual(patch, { priority: 3 });
assert.strictEqual(parseTareaPatch({ priority: 99 }), null);
assert.deepStrictEqual(parseTareaPatch({}), {});

console.log('ok: tareas lib checks passed');
