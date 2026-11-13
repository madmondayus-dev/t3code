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
export function resizeDivider(
  sizes: readonly number[],
  index: number,
  delta: number,
  minFraction: number = SPLIT_MIN_FRACTION,
): number[] {
  if (index < 0 || index >= sizes.length - 1) return [...sizes];
  const before = sizes[index]!;
  const after = sizes[index + 1]!;
  const pair = before + after;
  const min = Math.min(Math.max(minFraction, 0), pair / 2);
  const next = Math.min(Math.max(before + delta, min), pair - min);
  return sizes.map((size, i) => (i === index ? next : i === index + 1 ? pair - next : size));
}

/** The narrowest a pane (or the shorter row) may get, in pixels. */
export const SPLIT_MIN_PANE_PX = 280;
export const SPLIT_MIN_ROW_PX = 160;

/**
 * The smallest fraction a pane may take in a run of `count` panes across `extentPx` pixels: at least
 * `minPx` and SPLIT_MIN_FRACTION, but never so much that `count` panes could not fit (then they share evenly).
 */
export function minFractionFor(
  extentPx: number,
  count: number,
  minPx: number = SPLIT_MIN_PANE_PX,
): number {
  if (count <= 1) return 1;
  const fromPx = extentPx > 0 ? minPx / extentPx : SPLIT_MIN_FRACTION;
  return Math.min(Math.max(fromPx, SPLIT_MIN_FRACTION), 1 / count);
}

export type SplitLayout = "columns" | "grid";

function isSplitLayout(value: unknown): value is SplitLayout {
  return value === "columns" || value === "grid";
}

/** A grid needs three or more panes; with fewer it is just columns. */
export function effectiveLayout(layout: SplitLayout, count: number): SplitLayout {
  return layout === "grid" && count >= 3 ? "grid" : "columns";
}

/** The grid's rows: two panes on top, the rest below. */
export function gridRows<T>(keys: readonly T[]): [T[], T[]] {
  return [keys.slice(0, 2), keys.slice(2)];
}

export const SPLIT_DEFAULT_ROW_SPLIT = 0.5;

/** The top row's share of the height, kept so each row stays at least `minFraction` tall. */
export function clampRowSplit(value: unknown, minFraction: number = SPLIT_MIN_FRACTION): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SPLIT_DEFAULT_ROW_SPLIT;
  const min = Math.min(Math.max(minFraction, 0), 0.5);
  return Math.min(Math.max(value, min), 1 - min);
}

/** Per-row column fractions for the grid, each matching its row's pane count. */
export function normalizeRowSizes(
  rowSizes: readonly (readonly number[])[] | undefined,
  count: number,
): [number[], number[]] {
  const [top, bottom] = gridRows(Array.from({ length: count }, (_, index) => index));
  return [normalizeSizes(rowSizes?.[0], top.length), normalizeSizes(rowSizes?.[1], bottom.length)];
}

function isKeys(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SPLIT_MAX_PANES &&
    value.every((key) => typeof key === "string")
  );
}

/** Persisted split view state from any earlier version, made valid for this one. */
export function migrateSplitViewState(persisted: unknown) {
  const value = (persisted ?? {}) as Record<string, unknown>;
  const keys = isKeys(value.keys) ? [...new Set(value.keys)] : [];
  const rowSizes = Array.isArray(value.rowSizes)
    ? value.rowSizes.map((row) => (Array.isArray(row) ? (row as number[]) : []))
    : undefined;
  return {
    active: value.active === true && keys.length > 0,
    keys,
    sizes: normalizeSizes(
      Array.isArray(value.sizes) ? (value.sizes as number[]) : undefined,
      keys.length,
    ),
    layout: isSplitLayout(value.layout) ? value.layout : ("columns" as SplitLayout),
    rowSplit: clampRowSplit(value.rowSplit),
    rowSizes: normalizeRowSizes(rowSizes, keys.length),
    focusedKey:
      typeof value.focusedKey === "string" && keys.includes(value.focusedKey)
        ? value.focusedKey
        : (keys[0] ?? null),
  };
}

/** A box in fractions of the split area (0-1). */
export interface SplitRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A divider: between panes `index` and `index + 1` of `row` (null for columns), or between the grid's rows. */
export type SplitDividerPlacement =
  | {
      readonly kind: "column";
      readonly row: 0 | 1 | null;
      readonly index: number;
      readonly count: number;
      readonly rect: SplitRect;
    }
  | { readonly kind: "row"; readonly rect: SplitRect };

function runRects(fractions: readonly number[], top: number, height: number): SplitRect[] {
  let left = 0;
  return fractions.map((width) => {
    const rect = { left, top, width, height };
    left += width;
    return rect;
  });
}

/**
 * Where each pane (in key order) and each divider sits. Panes are placed rather than nested in rows, so switching
 * layout or removing a pane never remounts the others.
 */
export function splitPlacement(input: {
  readonly count: number;
  readonly layout: SplitLayout;
  readonly sizes: readonly number[];
  readonly rowSizes: readonly (readonly number[])[];
  readonly rowSplit: number;
}): { readonly panes: SplitRect[]; readonly dividers: SplitDividerPlacement[] } {
  const { count } = input;
  const dividersFor = (rects: readonly SplitRect[], row: 0 | 1 | null): SplitDividerPlacement[] =>
    rects.slice(1).map((rect, index) => ({
      kind: "column",
      row,
      index,
      count: rects.length,
      rect: { left: rect.left, top: rect.top, width: 0, height: rect.height },
    }));
  if (effectiveLayout(input.layout, count) === "columns") {
    const panes = runRects(normalizeSizes(input.sizes, count), 0, 1);
    return { panes, dividers: dividersFor(panes, null) };
  }
  const split = clampRowSplit(input.rowSplit);
  const [topSizes, bottomSizes] = normalizeRowSizes(input.rowSizes, count);
  const top = runRects(topSizes, 0, split);
  const bottom = runRects(bottomSizes, split, 1 - split);
  return {
    panes: [...top, ...bottom],
    dividers: [
      ...dividersFor(top, 0),
      { kind: "row", rect: { left: 0, top: split, width: 1, height: 0 } },
      ...dividersFor(bottom, 1),
    ],
  };
}
