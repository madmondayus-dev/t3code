import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { GlobalVoiceInputIndicator } from "../components/chat/GlobalVoiceInputIndicator";
import { isAppModalPage } from "../components/sidebar/mainAppLocation";
import { SplitThreadView } from "../components/SplitThreadView";
import { ThreadRouteView } from "../components/ThreadRouteView";
import { useSplitViewStore } from "../splitViewStore";
import { SidebarInset } from "../components/ui/sidebar";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useShownThreadRouteTarget } from "../hooks/useShownThreadRouteTarget";

function ChatRouteLayout() {
  // Render both routes here so draft promotion keeps the same ChatView mounted.
  const { shownTarget, modalOpen } = useShownThreadRouteTarget();
  const threadTarget = shownTarget;
  // Fantasia fork patch: while the split view is on, opening a thread from the sidebar adds it as a pane.
  const splitActive = useSplitViewStore((state) => state.active && state.keys.length > 0);
  const routeKey = threadTarget?.kind === "server" ? scopedThreadKey(threadTarget.threadRef) : null;
  const seenRouteKey = useRef(routeKey);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- adds a thread the reader just opened to the split view's panes
  useEffect(() => {
    if (routeKey === seenRouteKey.current) return;
    seenRouteKey.current = routeKey;
    if (routeKey !== null && !modalOpen && useSplitViewStore.getState().active) {
      useSplitViewStore.getState().open(routeKey);
    }
  }, [modalOpen, routeKey]);
  if (splitActive && (shownTarget?.kind === "server" || modalOpen)) {
    return (
      <>
        <SplitThreadView background={modalOpen} />
        {modalOpen ? <Outlet /> : null}
      </>
    );
  }

  return (
    <>
      {shownTarget?.kind === "server" && !modalOpen ? (
        <ThreadLinkPrompt threadRef={shownTarget.threadRef} />
      ) : null}
      {shownTarget ? (
        <ThreadRouteView target={shownTarget} background={modalOpen} />
      ) : modalOpen ? (
        <SidebarInset className="h-dvh" />
      ) : (
        <Outlet />
      )}
      {modalOpen ? <Outlet /> : null}
      <GlobalVoiceInputIndicator hidden={modalOpen} />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    return { appModalPage: isAppModalPage(location.pathname) };
  },
  component: ChatRouteLayout,
  // Every match carries the whole location's params, so this layout sees the thread route's too.
  onEnter: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onStay: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onLeave: () => retainThreadFindForRoute({ modalPage: false, threadRef: null }),
});

function retainThreadFindForRouteMatch(
  modalPage: boolean,
  params: Partial<Record<"environmentId" | "threadId", string>>,
) {
  const target = resolveThreadRouteTarget(params);
  retainThreadFindForRoute({
    modalPage,
    threadRef: target?.kind === "server" ? target.threadRef : null,
  });
}
