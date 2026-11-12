// Fantasia fork patch: the pure rules of the split (multi-thread) view. Panes are scoped thread keys.

export const SPLIT_MAX_PANES = 4;
export const SPLIT_MIN_FRACTION = 0.15;

export function evenSizes(count: number): number[] {
  return count <= 0 ? [] : Array.from({ length: count }, () => 1 / count);
}

/** Sizes that match the pane count and sum to 1; anything else becomes even. */
export function normalizeSizes(sizes: readonly number[] | undefined, count: number): number[] {
  if (
    !sizes ||
    sizes.length !== count ||
    sizes.some((size) => !Number.isFinite(size) || size < SPLIT_MIN_FRACTION - 1e-9)
  ) {
    return evenSizes(count);
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return Math.abs(total - 1) < 1e-6 ? [...sizes] : sizes.map((size) => size / total);
}

/**
 * Adds a pane. A key already open keeps its place. When all panes are taken the new one replaces
 * the pane at `replaceIndex` (the one the reader last used).
 */
export function addPane(keys: readonly string[], key: string, replaceIndex: number): string[] {
  if (keys.includes(key)) return [...keys];
  if (keys.length < SPLIT_MAX_PANES) return [...keys, key];
  const at = Math.min(Math.max(replaceIndex, 0), keys.length - 1);
  return keys.map((existing, index) => (index === at ? key : existing));
}

export function removePane(keys: readonly string[], key: string): string[] {
  return keys.filter((existing) => existing !== key);
}

/** Moves the divider after pane `index` by `delta` (a fraction of the whole), never shrinking a pane under the minimum. */
export function resizeDivider(sizes: readonly number[], index: number, delta: number): number[] {
  if (index < 0 || index >= sizes.length - 1) return [...sizes];
  const before = sizes[index]!;
  const after = sizes[index + 1]!;
  const pair = before + after;
  const next = Math.min(Math.max(before + delta, SPLIT_MIN_FRACTION), pair - SPLIT_MIN_FRACTION);
  return sizes.map((size, i) => (i === index ? next : i === index + 1 ? pair - next : size));
}
