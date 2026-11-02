// Fantasia fork patch. Inside Fantasia's tab the client stays in browser mode
// (no window.desktopBridge), so its session stays in an HttpOnly cookie.
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
