// Fantasia fork patch: 2-4 threads side by side. Each pane is an embedded ChatView (the same one the side chat
// uses: it brings its own composer and no window-level shortcuts), so a pane keeps the thread's real chat.
import { parseScopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { ColumnsIcon, ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { useDiffPanelStore, type ToolCallDiffTarget } from "../diffPanelStore";
import { useRightPanelStore } from "../rightPanelStore";
import { useSplitViewStore } from "../splitViewStore";
import { SPLIT_MAX_PANES, normalizeSizes } from "../splitView.logic";
import { useQuietThreadShell, useVisibleThreadShells } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import ChatView from "./ChatView";
import { Button } from "./ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { SidebarInset } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

function SplitPane({ threadKey, focused }: { readonly threadKey: string; readonly focused: boolean }) {
  const navigate = useNavigate();
  const ref = parseScopedThreadKey(threadKey);
  const shell = useQuietThreadShell(ref);
  const remove = useSplitViewStore((state) => state.remove);
  const focus = useSplitViewStore((state) => state.focus);
  const close = useSplitViewStore((state) => state.close);
  const openFull = useCallback(() => {
    if (!ref) return;
    close();
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  }, [close, navigate, ref]);
  // A pane has no diff panel or terminal of its own: the thread opens full size with the diff already selected,
  // or with the command queued for its terminal.
  const openToolDiff = useCallback(
    (target: ToolCallDiffTarget) => {
      if (!ref) return;
      useDiffPanelStore.getState().selectToolCall(ref, target);
      useRightPanelStore.getState().open(ref, "diff");
      openFull();
    },
    [openFull, ref],
  );
  const runShellCommand = useCallback(
    (command: string) => {
      useSplitViewStore.getState().queueShell(threadKey, command);
      openFull();
    },
    [openFull, threadKey],
  );
  if (!ref) return null;
  return (
    <div
      data-side-chat-pane
      data-split-pane
      data-focused={focused ? "true" : "false"}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onFocusCapture={() => focus(threadKey)}
      onPointerDownCapture={() => focus(threadKey)}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
        <span
          className={
            focused
              ? "min-w-0 flex-1 truncate text-xs font-medium"
              : "min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground"
          }
        >
          {shell?.title ?? "Thread"}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label="Open this thread full size" onClick={openFull}>
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Open full size</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove from split view"
                onClick={() => remove(threadKey)}
              >
                <XIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Remove from split view</TooltipPopup>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatView
          environmentId={ref.environmentId}
          threadId={ref.threadId}
          routeKind="server"
          embedded={{ openToolDiff, runShellCommand }}
          reserveTitleBarControlInset={false}
        />
      </div>
    </div>
  );
}

function SplitDivider({ index, containerRef }: { readonly index: number; readonly containerRef: React.RefObject<HTMLDivElement | null> }) {
  const resize = useSplitViewStore((state) => state.resize);
  const resetSizes = useSplitViewStore((state) => state.resetSizes);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();
    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;
    let last = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      resize(index, (moveEvent.clientX - last) / width);
      last = moveEvent.clientX;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split view panes"
      tabIndex={0}
      className="relative z-10 -mx-px w-[3px] shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60 focus-visible:bg-primary/60 focus-visible:outline-none"
      onPointerDown={onPointerDown}
      onDoubleClick={resetSizes}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.02;
        if (event.key === "ArrowLeft") { event.preventDefault(); resize(index, -step); }
        if (event.key === "ArrowRight") { event.preventDefault(); resize(index, step); }
      }}
    />
  );
}

function AddThreadMenu({ keys }: { readonly keys: readonly string[] }) {
  const open = useSplitViewStore((state) => state.open);
  const shells = useVisibleThreadShells();
  const choices = shells
    .filter((shell) => shell.archivedAt === null && !keys.includes(scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id))))
    .toSorted((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 30);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="ghost" size="xs" aria-label="Add a thread to the split view">
            <PlusIcon className="size-3.5" />
            Add thread
          </Button>
        }
      />
      <MenuPopup align="end" className="max-h-80 w-72 overflow-y-auto">
        {choices.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No other threads</div>
        ) : (
          choices.map((shell) => (
            <MenuItem
              key={scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id))}
              onClick={() => open(scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)))}
            >
              <span className="truncate">{shell.title}</span>
            </MenuItem>
          ))
        )}
      </MenuPopup>
    </Menu>
  );
}

export function SplitThreadView({ background = false }: { readonly background?: boolean }) {
  const keys = useSplitViewStore((state) => state.keys);
  const sizes = useSplitViewStore((state) => state.sizes);
  const focusedKey = useSplitViewStore((state) => state.focusedKey);
  const close = useSplitViewStore((state) => state.close);
  const containerRef = useRef<HTMLDivElement>(null);
  const fractions = normalizeSizes(sizes, keys.length);
  // A single pane is just a thread: leave split view rather than show a one-column split.
  useEffect(() => {
    if (keys.length === 0) close();
  }, [close, keys.length]);
  return (
    <SidebarInset
      className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh"
      inert={background}
    >
      <div data-split-view className="flex h-full min-h-0 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <ColumnsIcon className="size-3.5 text-muted-foreground" />
          <span className="flex-1 text-xs font-medium">
            Split view · {keys.length} of {SPLIT_MAX_PANES}
          </span>
          {keys.length < SPLIT_MAX_PANES ? <AddThreadMenu keys={keys} /> : null}
          <Button variant="ghost" size="xs" onClick={close}>
            Exit split view
          </Button>
        </div>
        <div ref={containerRef} className="flex min-h-0 flex-1">
          {keys.map((key, index) => (
            <div key={key} className="flex min-h-0 min-w-0" style={{ flex: `${fractions[index]} 1 0%` }}>
              {index > 0 ? <SplitDivider index={index - 1} containerRef={containerRef} /> : null}
              <SplitPane threadKey={key} focused={key === focusedKey} />
            </div>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}
