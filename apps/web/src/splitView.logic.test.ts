import { describe, expect, it } from "vite-plus/test";

import {
  SPLIT_MAX_PANES,
  SPLIT_MIN_FRACTION,
  addPane,
  evenSizes,
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
});
