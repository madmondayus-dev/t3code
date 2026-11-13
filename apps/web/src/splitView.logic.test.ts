import { describe, expect, it } from "vite-plus/test";

import {
  SPLIT_MAX_PANES,
  SPLIT_DEFAULT_ROW_SPLIT,
  SPLIT_MIN_FRACTION,
  SPLIT_MIN_PANE_PX,
  addPane,
  clampRowSplit,
  effectiveLayout,
  evenSizes,
  gridRows,
  migrateSplitViewState,
  minFractionFor,
  normalizeRowSizes,
  normalizeSizes,
  removePane,
  resizeDivider,
} from "./splitView.logic";

describe("splitView.logic", () => {
  it("adds panes up to the cap, then replaces the last-used pane", () => {
    let keys: string[] = [];
    for (const key of ["a", "b", "c", "d"]) keys = addPane(keys, key, 0);
    expect(keys).toEqual(["a", "b", "c", "d"]);
    expect(keys.length).toBe(SPLIT_MAX_PANES);
    expect(addPane(keys, "e", 2)).toEqual(["a", "b", "e", "d"]);
    expect(addPane(keys, "b", 0)).toEqual(keys);
  });

  it("removes a pane", () => {
    expect(removePane(["a", "b"], "a")).toEqual(["b"]);
  });

  it("normalizes sizes", () => {
    expect(normalizeSizes(undefined, 2)).toEqual([0.5, 0.5]);
    expect(normalizeSizes([0.5, 0.5, 0], 3)).toEqual(evenSizes(3));
    expect(normalizeSizes([0.3, 0.3], 2)).toEqual([0.5, 0.5]);
    expect(normalizeSizes([0.6, 0.4], 2)).toEqual([0.6, 0.4]);
  });

  it("moves a divider without shrinking a pane below the minimum", () => {
    expect(resizeDivider([0.5, 0.5], 0, 0.1)).toEqual([0.6, 0.4]);
    const [a, b] = resizeDivider([0.5, 0.5], 0, 0.9);
    expect(b).toBeCloseTo(SPLIT_MIN_FRACTION);
    expect(a! + b!).toBeCloseTo(1);
    expect(resizeDivider([0.5, 0.5], 1, 0.1)).toEqual([0.5, 0.5]);
  });

  it("honours a larger minimum fraction when dragging", () => {
    const [a, b] = resizeDivider([0.5, 0.5], 0, 0.4, 0.3);
    expect(a).toBeCloseTo(0.7);
    expect(b).toBeCloseTo(0.3);
    // A minimum above half the pair cannot be met by both panes; they split the pair evenly.
    expect(resizeDivider([0.6, 0.4], 0, 0.1, 0.8)).toEqual([0.5, 0.5]);
  });

  it("derives the minimum pane fraction from pixels", () => {
    expect(minFractionFor(1400, 2)).toBeCloseTo(SPLIT_MIN_PANE_PX / 1400);
    expect(minFractionFor(10_000, 2)).toBe(SPLIT_MIN_FRACTION);
    // Too narrow for the pixel minimum: never more than an even share.
    expect(minFractionFor(600, 4)).toBe(0.25);
    expect(minFractionFor(0, 2)).toBe(SPLIT_MIN_FRACTION);
    expect(minFractionFor(800, 1)).toBe(1);
  });

  it("uses the grid only for three or more panes", () => {
    expect(effectiveLayout("grid", 2)).toBe("columns");
    expect(effectiveLayout("grid", 3)).toBe("grid");
    expect(effectiveLayout("grid", 4)).toBe("grid");
    expect(effectiveLayout("columns", 4)).toBe("columns");
  });

  it("puts two panes on the grid's top row", () => {
    expect(gridRows(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
    expect(gridRows(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("clamps the row split", () => {
    expect(clampRowSplit(0.7)).toBe(0.7);
    expect(clampRowSplit(0.01)).toBe(SPLIT_MIN_FRACTION);
    expect(clampRowSplit(0.99)).toBe(1 - SPLIT_MIN_FRACTION);
    expect(clampRowSplit(0.9, 0.3)).toBe(0.7);
    expect(clampRowSplit(Number.NaN)).toBe(SPLIT_DEFAULT_ROW_SPLIT);
    expect(clampRowSplit("x")).toBe(SPLIT_DEFAULT_ROW_SPLIT);
  });

  it("normalizes per-row sizes to the grid's rows", () => {
    expect(normalizeRowSizes(undefined, 3)).toEqual([[0.5, 0.5], [1]]);
    expect(
      normalizeRowSizes(
        [
          [0.7, 0.3],
          [0.4, 0.6],
        ],
        4,
      ),
    ).toEqual([
      [0.7, 0.3],
      [0.4, 0.6],
    ]);
    expect(
      normalizeRowSizes(
        [
          [0.7, 0.3],
          [0.4, 0.6],
        ],
        3,
      ),
    ).toEqual([[0.7, 0.3], [1]]);
  });

  it("migrates v1 state to columns with even grid sizes", () => {
    expect(
      migrateSplitViewState({
        active: true,
        keys: ["a", "b", "c"],
        sizes: [0.5, 0.25, 0.25],
        focusedKey: "b",
      }),
    ).toEqual({
      active: true,
      keys: ["a", "b", "c"],
      sizes: [0.5, 0.25, 0.25],
      layout: "columns",
      rowSplit: SPLIT_DEFAULT_ROW_SPLIT,
      rowSizes: [[0.5, 0.5], [1]],
      focusedKey: "b",
    });
  });

  it("keeps a valid v2 grid and repairs a broken one", () => {
    const kept = migrateSplitViewState({
      active: true,
      keys: ["a", "b", "c", "d"],
      sizes: [0.25, 0.25, 0.25, 0.25],
      layout: "grid",
      rowSplit: 0.6,
      rowSizes: [
        [0.6, 0.4],
        [0.3, 0.7],
      ],
      focusedKey: "d",
    });
    expect(kept.layout).toBe("grid");
    expect(kept.rowSplit).toBe(0.6);
    expect(kept.rowSizes).toEqual([
      [0.6, 0.4],
      [0.3, 0.7],
    ]);
    const repaired = migrateSplitViewState({
      keys: ["a"],
      layout: "mosaic",
      rowSplit: 5,
      rowSizes: "no",
    });
    expect(repaired.active).toBe(false);
    expect(repaired.layout).toBe("columns");
    expect(repaired.rowSplit).toBe(1 - SPLIT_MIN_FRACTION);
    expect(repaired.rowSizes).toEqual([[1], []]);
    expect(migrateSplitViewState(undefined).keys).toEqual([]);
  });
});
