// Fantasia fork patch: 2-4 threads side by side, or (3-4) in two rows. Each pane is an embedded ChatView (the same
// one the side chat uses: it brings its own composer and no window-level shortcuts), so a pane keeps the thread's real
// chat; as a split pane it also keeps its thread details, terminal drawer and panel toggles in the pane header.
import { parseScopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { ColumnsIcon, ExternalLinkIcon, LayoutGridIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { T, useGT } from "gt-react";

import { useDiffPanelStore, type ToolCallDiffTarget } from "../diffPanelStore";
import { useRightPanelStore } from "../rightPanelStore";
import { useSplitViewStore } from "../splitViewStore";
import {
  SPLIT_MAX_PANES,
  SPLIT_MIN_PANE_PX,
  SPLIT_MIN_ROW_PX,
  type SplitRect,
  effectiveLayout,
  minFractionFor,
  splitPlacement,
} from "../splitView.logic";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { cn } from "../lib/utils";
import { useQuietThreadShell, useVisibleThreadShells } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import ChatView from "./ChatView";
import { Button } from "./ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { SidebarInset } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

function SplitPane({
  threadKey,
  focused,
}: {
  readonly threadKey: string;
  readonly focused: boolean;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const ref = parseScopedThreadKey(threadKey);
  const shell = useQuietThreadShell(ref);
  const remove = useSplitViewStore((state) => state.remove);
  const focus = useSplitViewStore((state) => state.focus);
  const close = useSplitViewStore((state) => state.close);
  const openFull = () => {
    if (!ref) return;
    close();
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  // A pane has no diff panel of its own: the thread opens full size with the diff already selected. (Shell commands
  // run in the pane's own terminal drawer; runShellCommand stays as the side-chat contract's fallback.)
  const openToolDiff = (target: ToolCallDiffTarget) => {
    if (!ref) return;
    useDiffPanelStore.getState().selectToolCall(ref, target);
    useRightPanelStore.getState().open(ref, "diff");
    openFull();
  };
  // Fantasia fork patch: a pane has no right panel of its own, so its right-panel toggle opens the thread full size
  // with the panel showing. Thread details and the terminal drawer open inside the pane.
  const openRightPanel = () => {
    if (!ref) return;
    useRightPanelStore.getState().show(ref);
    openFull();
  };
  const [controlsSlot, setControlsSlot] = useState<HTMLSpanElement | null>(null);
  const splitPane = { focused, controlsSlot, openRightPanel };
  const runShellCommand = (command: string) => {
    useSplitViewStore.getState().queueShell(threadKey, command);
    openFull();
  };
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
          {shell?.title ?? gt("Thread")}
        </span>
        <span
          ref={setControlsSlot}
          data-split-pane-controls-slot
          className="flex shrink-0 items-center"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={gt("Open this thread full size")}
                onClick={openFull}
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">
            <T>Open full size</T>
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={gt("Remove from split view")}
                onClick={() => remove(threadKey)}
              >
                <XIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">
            <T>Remove from split view</T>
          </TooltipPopup>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatView
          environmentId={ref.environmentId}
          threadId={ref.threadId}
          routeKind="server"
          embedded={{ openToolDiff, runShellCommand }}
          splitPane={splitPane}
          reserveTitleBarControlInset={false}
        />
      </div>
    </div>
  );
}

// Fantasia fork patch: dividers have an 8px grab area around a 1px line that lights up on hover, keep every pane above
// a minimum size, step with the arrow keys, and reset to even sizes on double-click. They sit over the panes' edges.
function SplitDivider({
  orientation,
  count,
  containerRef,
  onResize,
  label,
  rect,
}: {
  /** "vertical" sits between columns; "horizontal" between rows. */
  readonly orientation: "vertical" | "horizontal";
  /** How many panes share the drag axis. */
  readonly count: number;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly onResize: (delta: number, minFraction: number) => void;
  readonly label: string;
  readonly rect: SplitRect;
}) {
  const gt = useGT();
  const resetSizes = useSplitViewStore((state) => state.resetSizes);
  const vertical = orientation === "vertical";
  const endDrag = useRef<(() => void) | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fantasia fork patch: ends a drag (window listeners, body cursor) if the divider unmounts mid-drag
  useEffect(() => () => endDrag.current?.(), []);
  const extent = () => {
    const box = containerRef.current?.getBoundingClientRect();
    return box ? (vertical ? box.width : box.height) : 0;
  };
  const minFraction = (size: number) =>
    minFractionFor(size, count, vertical ? SPLIT_MIN_PANE_PX : SPLIT_MIN_ROW_PX);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const size = extent();
    if (size <= 0) return;
    event.preventDefault();
    endDrag.current?.();
    const min = minFraction(size);
    let last = vertical ? event.clientX : event.clientY;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = vertical ? "col-resize" : "row-resize";
    const move = (moveEvent: PointerEvent) => {
      const at = vertical ? moveEvent.clientX : moveEvent.clientY;
      onResize((at - last) / size, min);
      last = at;
    };
    const end = () => {
      endDrag.current = null;
      document.body.style.cursor = previousCursor;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
    };
    endDrag.current = end;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
  };
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={gt("{label} (double-click to reset)", { label })}
      tabIndex={0}
      data-split-divider={orientation}
      className={cn(
        "group absolute z-10 touch-none focus-visible:outline-none",
        vertical
          ? "w-2 -translate-x-1/2 cursor-col-resize"
          : "h-2 -translate-y-1/2 cursor-row-resize",
      )}
      style={{
        left: `${rect.left * 100}%`,
        top: `${rect.top * 100}%`,
        ...(vertical ? { height: `${rect.height * 100}%` } : { width: `${rect.width * 100}%` }),
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={resetSizes}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.02;
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const forward = vertical ? "ArrowRight" : "ArrowDown";
        if (event.key !== back && event.key !== forward) return;
        event.preventDefault();
        onResize(event.key === back ? -step : step, minFraction(extent()));
      }}
    >
      <div
        className={cn(
          "pointer-events-none absolute bg-border transition-all group-hover:bg-primary/60 group-focus-visible:bg-primary/60",
          vertical
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:w-[3px] group-focus-visible:w-[3px]"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:h-[3px] group-focus-visible:h-[3px]",
        )}
      />
    </div>
  );
}

function AddThreadMenu({ keys }: { readonly keys: readonly string[] }) {
  const gt = useGT();
  const open = useSplitViewStore((state) => state.open);
  const shells = useVisibleThreadShells();
  const choices = shells
    .filter(
      (shell) =>
        shell.archivedAt === null &&
        !keys.includes(scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id))),
    )
    .toSorted((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 30);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="ghost" size="xs" aria-label={gt("Add a thread to the split view")}>
            <PlusIcon className="size-3.5" />
            <T>Add thread</T>
          </Button>
        }
      />
      <MenuPopup align="end" className="max-h-80 w-72 overflow-y-auto">
        {choices.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <T>No other threads</T>
          </div>
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
  const gt = useGT();
  const keys = useSplitViewStore((state) => state.keys);
  const sizes = useSplitViewStore((state) => state.sizes);
  const layout = useSplitViewStore((state) => state.layout);
  const rowSplit = useSplitViewStore((state) => state.rowSplit);
  const rowSizes = useSplitViewStore((state) => state.rowSizes);
  const focusedKey = useSplitViewStore((state) => state.focusedKey);
  const close = useSplitViewStore((state) => state.close);
  const resize = useSplitViewStore((state) => state.resize);
  const resizeInRow = useSplitViewStore((state) => state.resizeInRow);
  const resizeRows = useSplitViewStore((state) => state.resizeRows);
  const setLayout = useSplitViewStore((state) => state.setLayout);
  const areaRef = useRef<HTMLDivElement>(null);
  const shownLayout = effectiveLayout(layout, keys.length);
  // Removing the last pane turns split view off in the store (splitViewStore.remove).
  // Panes are one flat keyed list placed absolutely, so a layout switch or a removed pane never remounts the others.
  const placement = splitPlacement({ count: keys.length, layout, sizes, rowSizes, rowSplit });
  return (
    <SidebarInset
      className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh"
      inert={background}
    >
      {/* Under a modal page the panes are background threads: no shortcuts or editor chords. */}
      <BackgroundThreadContext value={background}>
        <div
          data-split-view
          data-split-layout={shownLayout}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
            <ColumnsIcon className="size-3.5 text-muted-foreground" />
            <span className="flex-1 text-xs font-medium">
              {gt("Split view · {count} of {max}", { count: keys.length, max: SPLIT_MAX_PANES })}
            </span>
            {keys.length >= 3 ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={
                        shownLayout === "grid"
                          ? gt("Show panes side by side")
                          : gt("Show panes in two rows")
                      }
                      aria-pressed={shownLayout === "grid"}
                      onClick={() => setLayout(shownLayout === "grid" ? "columns" : "grid")}
                    >
                      {shownLayout === "grid" ? (
                        <ColumnsIcon className="size-3.5" />
                      ) : (
                        <LayoutGridIcon className="size-3.5" />
                      )}
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">
                  {shownLayout === "grid" ? gt("Side by side") : gt("Two rows")}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            {keys.length < SPLIT_MAX_PANES ? <AddThreadMenu keys={keys} /> : null}
            <Button variant="ghost" size="xs" onClick={close}>
              <T>Exit split view</T>
            </Button>
          </div>
          <div ref={areaRef} className="relative min-h-0 flex-1 overflow-hidden">
            {keys.map((key, index) => {
              const rect = placement.panes[index];
              if (!rect) return null;
              return (
                <div
                  key={key}
                  className="absolute flex min-h-0 min-w-0"
                  style={{
                    left: `${rect.left * 100}%`,
                    top: `${rect.top * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                >
                  <SplitPane threadKey={key} focused={key === focusedKey} />
                </div>
              );
            })}
            {placement.dividers.map((divider) =>
              divider.kind === "row" ? (
                <SplitDivider
                  key="row"
                  orientation="horizontal"
                  count={2}
                  containerRef={areaRef}
                  label={gt("Resize split view rows")}
                  rect={divider.rect}
                  onResize={resizeRows}
                />
              ) : (
                <SplitDivider
                  key={`column:${divider.row ?? "all"}:${divider.index}`}
                  orientation="vertical"
                  count={divider.count}
                  containerRef={areaRef}
                  label={gt("Resize split view panes")}
                  rect={divider.rect}
                  onResize={(delta, min) => {
                    // A grid row's fractions are of the row; the row spans the whole width, so deltas match.
                    if (divider.row === null) resize(divider.index, delta, min);
                    else resizeInRow(divider.row, divider.index, delta, min);
                  }}
                />
              ),
            )}
          </div>
        </div>
      </BackgroundThreadContext>
    </SidebarInset>
  );
}
