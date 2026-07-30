/** Filenames sort chronologically (`mfo-<epochMs>.sqlite`) — the newest `retainCount` are kept, the rest are stale. */
export function selectStaleBackups(
  fileNames: readonly string[],
  retainCount: number,
): readonly string[] {
  return [...fileNames].sort().slice(0, Math.max(0, fileNames.length - retainCount));
}
