import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import { clampProjectWidth, PROJECT_RAIL_WIDTH_KEY, sessionStatus, sessionLocation } from "../lib/workspace-model";
import { project, thread } from "./fixtures";
const app = await loadPluginApp(() => import("../app"));
const props = { activeThreadId: "chat", activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" };
function setup(threads = [thread("chat", "alpha")], options = {}) {
  return renderSlot(app.threadLists[0]!, props, { rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) }, sidebarThreads: { status: "ready", projects: [project("alpha")], threads, sections: [] }, sdk: { projects: { list: async () => [] } }, ...options });
}
afterEach(() => { cleanup(); localStorage.removeItem(PROJECT_RAIL_WIDTH_KEY); });
describe("Visual correction behavior", () => {
  it("waiting interactions override active runtime and goals never masquerade as executing", () => {
    expect(sessionStatus(thread("approval", "alpha", { runtimeStatus: "active", hasPendingInteraction: true }))).toEqual({ kind: "waiting", label: "Needs input" });
    const goal = thread("goal", "alpha", { activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 1 }, indicator: "goal" });
    expect(sessionStatus(goal, { icon: "Zap", label: "Goal", tone: "running" })).toEqual({ kind: "goal", label: "Goal active · idle" });
    expect(sessionStatus({ ...goal, runtimeStatus: "active" })).toEqual({ kind: "working", label: "Working", animated: true });
  });
  it("real queued, error, host wait, background work, unread and idle facts have distinct text", () => {
    expect(sessionStatus(thread("queue", "alpha", { queuedWork: "waiting" })).label).toBe("Queued");
    expect(sessionStatus(thread("failed", "alpha", { queuedWork: "failed" })).kind).toBe("error");
    expect(sessionStatus(thread("host", "alpha", { runtimeStatus: "waiting-for-host" })).label).toBe("Waiting for host");
    expect(sessionStatus(thread("unread", "alpha", { isUnread: true })).label).toBe("Unread reply");
    expect(sessionStatus(thread("idle", "alpha")).label).toBe("Idle");
    expect(sessionStatus(thread("background", "alpha", { activity: { workflows: 0, backgroundAgents: 2, backgroundCommands: 0, planMode: 0, goals: 0 } })).animated).toBe(true);
  });
  it("sessions expose live status without branch/workspace metadata or provider/model labels", () => {
    const slot = setup([thread("chat", "alpha", { runtimeStatus: "active" })]);
    expect(slot.getByText("Working")).toBeTruthy();
    expect(slot.queryByText("alpha/main")).toBeNull();
    expect(slot.container.querySelector(".pw-session-location")).toBeNull();
    expect(slot.queryByText("Codex")).toBeNull();
    expect(slot.queryByText("Machine alpha")).toBeNull();
    expect(slot.container.querySelector(".pw-provider-icon")).toBeNull();
    expect(slot.container.querySelector(".pw-status-spinner")).toBeTruthy();
    expect(sessionLocation(thread("branch", "alpha", { environment: { ...thread("branch", "alpha").environment!, branchName: null } }))).toBe("alpha");
  });
  it("the project rail independently resizes by keyboard, persists, and clamps against sessions", () => {
    const slot = setup();
    const handle = slot.getByRole("separator", { name: "Resize projects panel" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("216");
    expect(localStorage.getItem(PROJECT_RAIL_WIDTH_KEY)).toBe("216");
    expect(slot.getByRole("separator", { name: "Resize Workspace sidebar" }).getAttribute("aria-valuenow")).toBe("480");
    slot.unmount();
    const remounted = setup();
    expect(remounted.getByRole("separator", { name: "Resize projects panel" }).getAttribute("aria-valuenow")).toBe("216");
    fireEvent.keyDown(remounted.getByRole("separator", { name: "Resize projects panel" }), { key: "End" });
    expect(remounted.getByRole("separator", { name: "Resize projects panel" }).getAttribute("aria-valuenow")).toBe("260");
    expect(clampProjectWidth(340, 420)).toBe(200);
  });
  it("legacy saved chats remain accessible and removing their shortcut keeps conversations", async () => {
    let legacy = [{ threadId: "chat", name: "Reviewer", color: "#80cbc4" }];
    const remove = vi.fn(async () => { legacy = []; return { removed: true }; });
    const slot = setup(undefined, { rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy }), removeAgent: remove } });
    fireEvent.click(await slot.findByText(/Saved chats/));
    fireEvent.click(slot.getByRole("button", { name: "Reviewer" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "chat" });
    fireEvent.click(slot.getByRole("button", { name: "Remove saved chat Reviewer" }));
    await waitFor(() => expect(slot.queryByRole("button", { name: "Reviewer" })).toBeNull());
    expect(remove).toHaveBeenCalledWith({ threadId: "chat" });
    expect(slot.inspection.navigateCalls.some(call => call.method === "toCompose")).toBe(false);
  });
  it("delayed legacy removal preserves a shortcut recreated by another client", async () => {
    let legacy = [{ threadId: "chat", name: "Reviewer", color: "#80cbc4" }];
    let complete!: () => void;
    const delayed = new Promise<void>(resolve => { complete = resolve; });
    const remove = vi.fn(async () => { legacy = []; await delayed; return { removed: true }; });
    const slot = setup(undefined, { rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy }), removeAgent: remove } });
    fireEvent.click(await slot.findByText(/Saved chats/));
    fireEvent.click(slot.getByRole("button", { name: "Remove saved chat Reviewer" }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    legacy = [{ threadId: "chat", name: "Recreated", color: "#b5a0e3" }]; complete();
    await slot.findByRole("button", { name: "Recreated" });
  });
  it("agent load failures are visible and retry succeeds", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ profiles: [], bindings: [], legacy: [] });
    const slot = setup(undefined, { rpc: { listSpecialists: list } });
    expect((await slot.findByRole("alert")).textContent).toContain("Offline");
    fireEvent.click(slot.getByRole("button", { name: "Retry bots" }));
    await slot.findByText("Create a specialist from a skill or your own instructions.");
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("lost realtime connection does not surface an agent load failure", async () => {
    const list = vi.fn().mockResolvedValueOnce({ profiles: [], bindings: [], legacy: [] }).mockRejectedValue(new Error("Failed to fetch"));
    const slot = setup(undefined, { rpc: { listSpecialists: list } });
    await slot.findByText("Create a specialist from a skill or your own instructions.");
    await slot.setRealtimeConnectionState("reconnecting");
    await waitFor(() => expect(slot.queryByRole("alert")).toBeNull());
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("navigation activates native BB controls without removed SDK hooks", () => {
    const host = document.createElement("nav");
    host.setAttribute("aria-label", "Primary navigation");
    host.innerHTML = '<span data-nav-rail-item="__bb__/search-threads"><button>Native search</button></span>';
    document.body.append(host);
    const activate = vi.fn(); host.querySelector("button")!.addEventListener("click", activate);
    try {
      const slot = setup();
      expect(slot.queryByRole("button", { name: "New thread" })).toBeNull();
      fireEvent.click(slot.getByRole("button", { name: "Search threads" }));
      expect(activate).toHaveBeenCalledOnce();
      fireEvent.click(slot.getByRole("button", { name: "Skills" }));
      expect(slot.getByRole("alert").textContent).toContain("Skills is unavailable");
    } finally { host.remove(); }
  });
});
