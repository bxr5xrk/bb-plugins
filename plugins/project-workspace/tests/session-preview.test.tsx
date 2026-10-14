import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import { SessionRow } from "../components/session-row";
import { ProjectWorkspace } from "../components/project-workspace";
import { sessionPreview } from "../lib/session-preview";
import { project, thread } from "./fixtures";
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";

const app = await loadPluginApp(() => import("../app"));
const props = { activeThreadId: "chat", activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" };
function setup(output: (args: { threadId: string; signal?: AbortSignal }) => Promise<{ output: string | null }>, threads = [thread("chat", "alpha")], subscribe?: PluginBrowserBbSdk["subscribe"]) {
  return renderSlot(app.threadLists[0]!, props, {
    rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) },
    sidebarThreads: { status: "ready", projects: [project("alpha")], threads, sections: [] },
    sdk: { projects: { list: async () => [] }, threads: { output }, ...(subscribe ? { subscribe } : {}) },
  });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Session reply preview", () => {
  it("formats a bounded plain-text excerpt without losing identifiers or splitting Unicode", () => {
    expect(sessionPreview("# **Готово**\n\n- Дивись [app_file.ts](https://example.test/file).\n::inline-vis{file=\"demo.html\"}")).toBe("Готово Дивись app_file.ts.");
    expect(sessionPreview(null)).toBeNull();
    expect(sessionPreview(" \n ")).toBeNull();
    expect(sessionPreview("😀".repeat(200))).toBe("😀".repeat(180) + "…");
  });
  it("reads the actual final reply, places age beside title and keeps untrusted text inert", async () => {
    const output = vi.fn(async () => ({ output: "**Готово.** <img src=x onerror=alert(1)>" }));
    const slot = setup(output, [thread("chat", "alpha", { runtimeStatus: "active" })]);
    const preview = await slot.findByText("Готово. <img src=x onerror=alert(1)>");
    expect(preview.className).toBe("pw-session-preview");
    expect(preview.querySelector("img")).toBeNull();
    expect(slot.container.querySelector(".pw-session-headline time")).toBeTruthy();
    expect(slot.container.querySelector(".pw-session-bottom time")).toBeNull();
    expect(slot.container.querySelector(".pw-status-spinner")).toBeTruthy();
    expect(output).toHaveBeenCalledWith(expect.objectContaining({ threadId: "chat", signal: expect.any(AbortSignal) }));
  });
  it("refreshes on new activity, keeps the last known preview on failure and retries after reconnect", async () => {
    const output = vi.fn().mockResolvedValueOnce({ output: "Перша відповідь" }).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ output: "Нова відповідь" });
    const chat = thread("chat", "alpha"), slot = setup(output, [chat]);
    await slot.findByText("Перша відповідь");
    chat.latestAttentionAt = 2;
    slot.rerender(<ProjectWorkspace {...props} />);
    await waitFor(() => expect(output).toHaveBeenCalledTimes(2));
    expect(slot.getByText("Перша відповідь")).toBeTruthy();
    await slot.setRealtimeConnectionState("reconnecting");
    expect(output).toHaveBeenCalledTimes(2);
    await slot.setRealtimeConnectionState("connected");
    await slot.findByText("Нова відповідь");
    expect(slot.queryByText("Offline")).toBeNull();
    fireEvent.click(slot.getByRole("link"));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "chat", options: { split: false } });
  });
  it("aborts outdated requests and does not leak one thread's reply into another", async () => {
    let finishOld!: (result: { output: string }) => void;
    let oldSignal: AbortSignal | undefined;
    const old = new Promise<{ output: string }>(resolve => { finishOld = resolve; });
    const output = vi.fn(async ({ threadId, signal }) => {
      if (threadId === "chat") { oldSignal = signal; return old; }
      return { output: "Інший чат" };
    });
    const slot = setup(output);
    slot.rerender(<SessionRow thread={thread("other", "alpha")} active={false} onNavigate={props.onNavigate} now={3} />);
    await slot.findByText("Інший чат");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { finishOld({ output: "Застаріла відповідь" }); });
    expect(slot.queryByText("Застаріла відповідь")).toBeNull();
    slot.unmount();
  });
  it("leaves empty replies blank and pauses preview reads for closed sections", async () => {
    const output = vi.fn(async () => ({ output: null })), slot = setup(output);
    await waitFor(() => expect(output).toHaveBeenCalledTimes(1));
    expect(slot.container.querySelector(".pw-session-preview")?.textContent).toBe("");
    fireEvent.click(slot.getByRole("button", { name: "Sessions 1" }), { detail: 1 });
    expect(slot.queryByRole("link")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Sessions 1" }), { detail: 1 });
    await waitFor(() => expect(output).toHaveBeenCalledTimes(2));
    expect(slot.getByRole("link")).toBeTruthy();
  });
  it("updates completed replies through realtime, coalesces completions and ignores token deltas", async () => {
    let callback: Extract<Parameters<PluginBrowserBbSdk["subscribe"]>[0], { event: "thread:changed" }>["callback"] | undefined;
    const unsubscribe = vi.fn();
    const subscribe: PluginBrowserBbSdk["subscribe"] = vi.fn(args => {
      if (args.event === "thread:changed") callback = args.callback;
      return unsubscribe;
    });
    const output = vi.fn().mockResolvedValueOnce({ output: "Перша" }).mockResolvedValue({ output: "Остання" });
    const slot = setup(output, undefined, subscribe);
    await slot.findByText("Перша");
    const event = (type: "item/agentMessage/delta" | "item/completed" | "turn/completed") => ({ type: "changed" as const, entity: "thread" as const, id: "chat", changes: ["events-appended" as const], metadata: { eventTypes: [type] } });
    await act(async () => { callback!(event("item/agentMessage/delta")); });
    expect(output).toHaveBeenCalledTimes(1);
    await act(async () => { callback!(event("item/completed")); callback!(event("turn/completed")); });
    await slot.findByText("Остання");
    expect(output).toHaveBeenCalledTimes(2);
    slot.unmount(); expect(unsubscribe).toHaveBeenCalled();
  });
});
