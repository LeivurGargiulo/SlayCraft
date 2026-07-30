export function alphaComparator(attr) {
  return (a, b) => a.dataset[attr].localeCompare(b.dataset[attr]);
}

export function countDescComparator(attr) {
  return (a, b) => Number(b.dataset[attr]) - Number(a.dataset[attr]);
}

export function priorityAscComparator(attr) {
  return (a, b) => Number(a.dataset[attr]) - Number(b.dataset[attr]);
}

export function sortListBy(list, mode, comparators) {
  const comparator = comparators[mode];
  if (!comparator) return;
  const items = [...list.children];
  items.sort(comparator);
  items.forEach((li) => list.appendChild(li));
}
