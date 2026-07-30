export function nextIndex(current: number, length: number, delta: number): number {
  return (current + delta + length) % length;
}
