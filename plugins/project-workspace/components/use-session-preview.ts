import { useEffect, useState } from "react";
import { useRealtimeConnectionState, useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { sessionPreview } from "../lib/session-preview";

export function useSessionPreview(thread: PluginSidebarThread, enabled: boolean) {
  const sdk = useSdk(), connection = useRealtimeConnectionState();
  const [value, setValue] = useState<{ id: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || connection !== "connected") return;
    let controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      controller.abort();
      const request = new AbortController(); controller = request;
      try {
        const result = await sdk.threads.output({ threadId: thread.id, signal: request.signal });
        if (!request.signal.aborted) setValue({ id: thread.id, text: sessionPreview(result.output) });
      } catch {
        // A preview failure must not prevent opening or managing the session.
        if (!request.signal.aborted) setValue(previous => previous?.id === thread.id ? previous : { id: thread.id, text: null });
      }
    }
    void load();
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = sdk.subscribe({ event: "thread:changed", threadId: thread.id, callback: event => {
        const types = event.metadata?.eventTypes;
        const changed = event.changes.some(change => ["history-rewritten", "history-compacted", "status-changed"].includes(change)) ||
          event.changes.includes("events-appended") && (!types || types.some(type => type === "item/completed" || type === "turn/completed"));
        if (!changed) return;
        clearTimeout(refresh); refresh = setTimeout(() => { void load(); }, 150);
      } });
    } catch {
      // Sidebar activity and reconnection still refresh a preview if a host
      // cannot attach the optional live subscription.
    }
    return () => { clearTimeout(refresh); controller.abort(); unsubscribe?.(); };
  }, [sdk, thread.id, thread.latestAttentionAt, thread.runtimeStatus, connection, enabled]);
  return value?.id === thread.id ? value.text : null;
}
