import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alphaComparator, countDescComparator, priorityAscComparator, sortListBy } from './list-sort.js';

function el(dataset) {
  return { dataset };
}

test('alphaComparator sorts by localeCompare ascending', () => {
  const items = [el({ title: 'Zebra' }), el({ title: 'Apple' }), el({ title: 'Mango' })];
  items.sort(alphaComparator('title'));
  assert.deepEqual(items.map((i) => i.dataset.title), ['Apple', 'Mango', 'Zebra']);
});

test('countDescComparator sorts numerically descending', () => {
  const items = [el({ taskCount: '2' }), el({ taskCount: '10' }), el({ taskCount: '1' })];
  items.sort(countDescComparator('taskCount'));
  assert.deepEqual(items.map((i) => i.dataset.taskCount), ['10', '2', '1']);
});

test('priorityAscComparator sorts ascending, treating the no-priority sentinel (99) as last', () => {
  const items = [el({ topPriority: '99' }), el({ topPriority: '2' }), el({ topPriority: '1' })];
  items.sort(priorityAscComparator('topPriority'));
  assert.deepEqual(items.map((i) => i.dataset.topPriority), ['1', '2', '99']);
});

test('sortListBy reorders a list container children per the chosen comparator', () => {
  const c = el({ title: 'C' });
  const a = el({ title: 'A' });
  const b = el({ title: 'B' });
  const appended = [];
  const list = {
    children: [c, a, b],
    appendChild(node) {
      appended.push(node);
    },
  };
  sortListBy(list, 'alpha', { alpha: alphaComparator('title') });
  assert.deepEqual(appended.map((i) => i.dataset.title), ['A', 'B', 'C']);
});

test('sortListBy no-ops for an unknown sort mode', () => {
  const list = {
    children: [el({ title: 'A' })],
    appendChild() {
      throw new Error('should not reorder for unknown mode');
    },
  };
  sortListBy(list, 'unknown', { alpha: alphaComparator('title') });
});
