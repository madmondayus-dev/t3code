import type { ConfirmDialogOptions, ContextMenuItem, LocalApi } from "@t3tools/contracts";

import { requestConfirmDialog } from "./confirmDialog";
import { dismissContextMenu, showContextMenuFallback } from "./contextMenuFallback";
import { readBrowserClientSettings, writeBrowserClientSettings } from "./clientPersistenceStorage";
import { fantasiaHost } from "./fantasiaHost";
import { ClientSettingsSchema } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);

let cachedApi: LocalApi | undefined;

export function createLocalApi(): LocalApi {
  return {
    dialogs: {
      pickFolder: async (options) => {
        const host = fantasiaHost();
        if (host) return host.pickFolder(options);
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder(options);
      },
      confirm: async (message, options?: ConfirmDialogOptions) => {
        return requestConfirmDialog(message, options) ?? false;
      },
    },
    shell: {
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      },
      openSystemSettings: async (pane) => {
        if (!window.desktopBridge) {
          throw new Error("Unable to open System Settings.");
        }
        const opened = await window.desktopBridge.openSystemSettings(pane);
        if (!opened) {
          throw new Error("Unable to open System Settings.");
        }
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          return window.desktopBridge.showContextMenu(items, position) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position);
      },
      // Unlike native menus, the DOM fallback needs dismissal when underlying state disappears.
      close: async () => {
        if (!window.desktopBridge) {
          dismissContextMenu();
        }
      },
    },
    persistence: {
      getClientSettings: async () => {
        if (window.desktopBridge) {
          return window.desktopBridge.getClientSettings();
        }
        // In Fantasia, start from the installed app's settings so both look the same.
        const shared = await fantasiaHost()?.getClientSettings();
        if (shared) {
          try {
            return decodeClientSettings(JSON.parse(shared));
          } catch {
            // A settings shape this client cannot read falls back to its own copy.
          }
        }
        return readBrowserClientSettings();
      },
      setClientSettings: async (settings) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setClientSettings(settings);
        }
        writeBrowserClientSettings(settings);
      },
    },
  };
}

export function readLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  cachedApi = createLocalApi();
  return cachedApi;
}

export function ensureLocalApi(): LocalApi {
  const api = readLocalApi();
  if (!api) {
    throw new Error("Local API not found");
  }
  return api;
}
