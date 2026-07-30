export function computeReconnectDelayMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const delay = initialDelayMs * 2 ** attempt;
  return Math.min(delay, maxDelayMs);
}
