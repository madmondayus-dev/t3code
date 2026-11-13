// Fantasia fork patch: which threads the split (multi-thread) view shows, remembered across restarts.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import {
  SPLIT_DEFAULT_ROW_SPLIT,
  type SplitLayout,
  addPane,
  clampRowSplit,
  evenSizes,
  migrateSplitViewState,
  normalizeRowSizes,
  normalizeSizes,
  removePane,
  resizeDivider,
} from "./splitView.logic";

interface SplitViewState {
  readonly active: boolean;
  /** Scoped thread keys, left to right. */
  readonly keys: readonly string[];
  /** Fractions of the width, one per pane. */
  readonly sizes: readonly number[];
  /** Side by side, or (3-4 panes) two rows. */
  readonly layout: SplitLayout;
  /** The grid's top row share of the height. */
  readonly rowSplit: number;
  /** The grid's column fractions, per row. */
  readonly rowSizes: readonly (readonly number[])[];
  /** The pane the reader last used; a new thread replaces it when every pane is taken. */
  readonly focusedKey: string | null;
  /** A shell command a pane asked for; the thread opened full size runs it in its own terminal, then clears this. */
  readonly pendingShell: { readonly threadKey: string; readonly command: string } | null;
  readonly queueShell: (threadKey: string, command: string) => void;
  readonly takePendingShell: (threadKey: string) => string | null;
  readonly open: (key: string, alsoKey?: string | null) => void;
  readonly close: () => void;
  readonly remove: (key: string) => void;
  readonly focus: (key: string) => void;
  readonly resize: (index: number, delta: number, minFraction?: number) => void;
  readonly resizeInRow: (row: number, index: number, delta: number, minFraction?: number) => void;
  readonly resizeRows: (delta: number, minFraction?: number) => void;
  readonly setLayout: (layout: SplitLayout) => void;
  readonly resetSizes: () => void;
}

export const useSplitViewStore = create<SplitViewState>()(
  persist(
    (set, get) => ({
      pendingShell: null,
      queueShell: (threadKey, command) => set({ pendingShell: { threadKey, command } }),
      takePendingShell: (threadKey) => {
        const pending = get().pendingShell;
        if (!pending || pending.threadKey !== threadKey) return null;
        set({ pendingShell: null });
        return pending.command;
      },
      active: false,
      keys: [],
      sizes: [],
      layout: "columns",
      rowSplit: SPLIT_DEFAULT_ROW_SPLIT,
      rowSizes: [[], []],
      focusedKey: null,
      open: (key, alsoKey) =>
        set((state) => {
          const base = state.active ? state.keys : alsoKey && alsoKey !== key ? [alsoKey] : [];
          const at = state.focusedKey
            ? state.keys.indexOf(state.focusedKey)
            : state.keys.length - 1;
          const keys = addPane(base, key, at);
          const sizes = keys.length === state.keys.length ? state.sizes : evenSizes(keys.length);
          const rowSizes =
            keys.length === state.keys.length
              ? state.rowSizes
              : normalizeRowSizes(undefined, keys.length);
          return {
            active: true,
            keys,
            sizes: normalizeSizes(sizes, keys.length),
            rowSizes: normalizeRowSizes(rowSizes, keys.length),
            focusedKey: key,
          };
        }),
      close: () => set({ active: false }),
      remove: (key) =>
        set((state) => {
          const keys = removePane(state.keys, key);
          return {
            keys,
            sizes: evenSizes(keys.length),
            rowSizes: normalizeRowSizes(undefined, keys.length),
            active: keys.length > 0 && state.active,
            focusedKey: state.focusedKey === key ? (keys[0] ?? null) : state.focusedKey,
          };
        }),
      focus: (key) => set((state) => (state.focusedKey === key ? state : { focusedKey: key })),
      resize: (index, delta, minFraction) =>
        set((state) => ({
          sizes: resizeDivider(
            normalizeSizes(state.sizes, state.keys.length),
            index,
            delta,
            minFraction,
          ),
        })),
      resizeInRow: (row, index, delta, minFraction) =>
        set((state) => {
          const rowSizes = normalizeRowSizes(state.rowSizes, state.keys.length);
          if (row !== 0 && row !== 1) return state;
          rowSizes[row] = resizeDivider(rowSizes[row], index, delta, minFraction);
          return { rowSizes };
        }),
      resizeRows: (delta, minFraction) =>
        set((state) => ({ rowSplit: clampRowSplit(state.rowSplit + delta, minFraction) })),
      setLayout: (layout) => set((state) => (state.layout === layout ? state : { layout })),
      resetSizes: () =>
        set((state) => ({
          sizes: evenSizes(state.keys.length),
          rowSizes: normalizeRowSizes(undefined, state.keys.length),
          rowSplit: SPLIT_DEFAULT_ROW_SPLIT,
        })),
    }),
    {
      name: "t3code:split-view:v1",
      // v2 adds the grid layout (layout, rowSplit, rowSizes); v1 state migrates to columns.
      version: 2,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        active: state.active,
        keys: state.keys,
        sizes: state.sizes,
        layout: state.layout,
        rowSplit: state.rowSplit,
        rowSizes: state.rowSizes,
        focusedKey: state.focusedKey,
      }),
      migrate: (persisted) => migrateSplitViewState(persisted),
    },
  ),
);
