// Fantasia fork patch (branch `fantasia`). When this client runs inside
// Fantasia's "T3 Code" tab, Fantasia's preload exposes this narrow host object.
// The client deliberately stays in browser mode (`window.desktopBridge` absent):
// it authenticates with the HttpOnly browser-session cookie, so no bearer token
// ever reaches JavaScript, and it takes upstream's tested web paths everywhere
// the host does not add something.
import type { PickFolderOptions } from "@t3tools/contracts";

export interface FantasiaHost {
  /** Native folder dialog owned by Fantasia's main process. */
  readonly pickFolder: (options?: PickFolderOptions) => Promise<string | null>;
  /** The installed T3 Code app's client settings; null when unreadable. */
  readonly getClientSettings: () => Promise<string | null>;
}

declare global {
  interface Window {
    readonly fantasiaHost?: FantasiaHost;
  }
}

export const fantasiaHost = (): FantasiaHost | undefined =>
  typeof window === "undefined" ? undefined : window.fantasiaHost;
