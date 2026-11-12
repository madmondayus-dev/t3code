// Fantasia fork patch: which threads the split (multi-thread) view shows, remembered across restarts.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import {
  SPLIT_MAX_PANES,
  addPane,
  evenSizes,
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
  readonly resize: (index: number, delta: number) => void;
  readonly resetSizes: () => void;
}

function isKeys(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SPLIT_MAX_PANES &&
    value.every((key) => typeof key === "string")
  );
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
      focusedKey: null,
      open: (key, alsoKey) =>
        set((state) => {
          const base = state.active ? state.keys : alsoKey && alsoKey !== key ? [alsoKey] : [];
          const at = state.focusedKey ? state.keys.indexOf(state.focusedKey) : state.keys.length - 1;
          const keys = addPane(base, key, at);
          const sizes = keys.length === state.keys.length ? state.sizes : evenSizes(keys.length);
          return { active: true, keys, sizes: normalizeSizes(sizes, keys.length), focusedKey: key };
        }),
      close: () => set({ active: false }),
      remove: (key) =>
        set((state) => {
          const keys = removePane(state.keys, key);
          return {
            keys,
            sizes: evenSizes(keys.length),
            active: keys.length > 0 && state.active,
            focusedKey: state.focusedKey === key ? (keys[0] ?? null) : state.focusedKey,
          };
        }),
      focus: (key) => set((state) => (state.focusedKey === key ? state : { focusedKey: key })),
      resize: (index, delta) =>
        set((state) => ({ sizes: resizeDivider(normalizeSizes(state.sizes, state.keys.length), index, delta) })),
      resetSizes: () => set((state) => ({ sizes: evenSizes(state.keys.length) })),
    }),
    {
      name: "t3code:split-view:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        active: state.active,
        keys: state.keys,
        sizes: state.sizes,
        focusedKey: state.focusedKey,
      }),
      migrate: (persisted) => {
        const value = (persisted ?? {}) as Partial<SplitViewState>;
        const keys = isKeys(value.keys) ? value.keys : [];
        return {
          active: value.active === true && keys.length > 0,
          keys,
          sizes: normalizeSizes(Array.isArray(value.sizes) ? value.sizes : undefined, keys.length),
          focusedKey: typeof value.focusedKey === "string" ? value.focusedKey : (keys[0] ?? null),
        };
      },
    },
  ),
);
