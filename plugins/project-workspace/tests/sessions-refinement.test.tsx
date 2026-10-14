import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import { ProjectWorkspace } from "../components/project-workspace";
import { projectAttention, projectThreads, sessionItems } from "../lib/workspace-model";
import { catalogProject, project, thread } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
const props = { activeThreadId: null, activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" };
function setup(threads = [thread("quiet", "alpha")], overrides = {}) {
  return renderSlot(app.threadLists[0]!, props, {
    rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) },
    sidebarThreads: { status: "ready", projects: [project("alpha"), project("beta"), project("gamma")], threads, sections: [] },
    sdk: { projects: { list: async () => [] } }, ...overrides,
  });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function finishHeightTransition(content: HTMLElement) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "height" });
  fireEvent(content, event);
}
describe("Session attention refinement", () => {
  it("keeps pinned sessions above working chats, then groups remaining sessions with attention priority", () => {
    const rows = [thread("read-pin", "alpha", { isPinned: true, latestAttentionAt: 999 }),
      thread("unread", "alpha", { isUnread: true, sectionId: "old" }),
      thread("working", "alpha", { runtimeStatus: "active", latestAttentionAt: 5 }),
      thread("question", "alpha", { hasPendingInteraction: true, runtimeStatus: "active", latestAttentionAt: 1 })];
    const sorted = projectThreads(rows, "alpha");
    expect(sorted.map(t => t.id)).toEqual(["read-pin", "question", "working", "unread"]);
    const items = sessionItems(sorted, [{ id: "old", name: "Old section", createdAt: 0, updatedAt: 0 }], new Set());
    expect(items.filter(item => item.kind === "thread").map(item => item.id)).toEqual(["read-pin", "unread", "question", "working"]);
    expect(items.filter(item => item.kind === "section").map(item => [item.title, item.count])).toEqual([["Pinned", 1], ["Old section", 1], ["Sessions", 2]]);
  });
  it("quiet read rows contain no idle label, gray icon or workspace/branch metadata", () => {
    const slot = setup();
    const row = slot.getByText("quiet").closest(".pw-session")!;
    expect(row.querySelector(".pw-session-status")).toBeNull();
    expect(row.querySelector(".pw-session-location")).toBeNull();
    expect(slot.queryByText("Idle")).toBeNull();
    expect(row.querySelector("time")).toBeTruthy();
  });
  it("collapses Pinned independently and returns an unpinned chat to its original section without duplicates", () => {
    const sections = [{ id: "ideas", name: "Ideas", createdAt: 0, updatedAt: 0 }];
    const rows = [thread("pin", "alpha", { isPinned: true, sectionId: "ideas" }),
      thread("idea", "alpha", { sectionId: "ideas" }), thread("unknown", "alpha", { sectionId: "removed" })];
    const collapsed = sessionItems(rows, sections, new Set(["__pinned"]));
    expect(collapsed.filter(item => item.kind === "thread").map(item => item.id)).toEqual(["idea", "unknown"]);
    expect(collapsed[0]).toMatchObject({ title: "Pinned", count: 1 });
    const unpinned = sessionItems(rows.map(row => ({ ...row, isPinned: false })), sections, new Set());
    expect(unpinned.map(item => item.id)).toEqual(["ideas", "pin", "idea", "__threads", "unknown"]);
    expect(sessionItems([], sections, new Set())).toEqual([]);
  });
  it("keeps rows mounted for collapse/reversal while hiding closed sections from interaction", () => {
    const slot = setup([thread("pin", "alpha", { isPinned: true }), thread("working", "alpha", { runtimeStatus: "active" })]);
    const pinned = slot.getByRole("button", { name: "Pinned 1" });
    const sessions = slot.getByRole("button", { name: "Sessions 1" });
    const content = document.getElementById(pinned.getAttribute("aria-controls")!)!;
    const link = slot.getByRole("link", { name: /pin/ });
    pinned.focus(); fireEvent.click(pinned, { detail: 1 });
    expect(pinned.getAttribute("aria-expanded")).toBe("false");
    expect(content.style.height).toBe("0px");
    expect(content.hasAttribute("inert")).toBe(true);
    expect(content.getAttribute("aria-hidden")).toBe("true");
    expect(content.contains(link)).toBe(true);
    expect(slot.queryByRole("link", { name: /pin/ })).toBeNull();
    expect(sessions.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(pinned, { detail: 1 });
    expect(slot.getByRole("link", { name: /pin/ })).toBe(link);
    expect(content.style.height).toBe("80px");
    expect(content.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(pinned);
    fireEvent.click(sessions, { detail: 1 });
    expect(slot.queryByRole("link", { name: /working/ })).toBeNull();
    expect(slot.getByRole("link", { name: /pin/ })).toBe(link);
    fireEvent.click(sessions, { detail: 1 });
    expect(slot.container.querySelector(".pw-status-spinner")).toBeTruthy();
  });
  it("retains session windowing in long collapsible sections and restores scroll-window rows", () => {
    const slot = setup(Array.from({ length: 2000 }, (_, index) => thread(`chat-${index}`, "alpha", { latestAttentionAt: 2000 - index })));
    expect(slot.getAllByRole("link").length).toBeLessThan(30);
    const scroller = slot.container.querySelector<HTMLDivElement>(".pw-sessions-scroll")!;
    scroller.scrollTop = 80000; fireEvent.scroll(scroller);
    expect(slot.getByRole("link", { name: /chat-1000 / })).toBeTruthy();
    expect(slot.queryByRole("link", { name: /chat-0 / })).toBeNull();
    const section = slot.getByRole("button", { name: "Sessions 2000" });
    fireEvent.click(section, { detail: 1 });
    expect(slot.queryAllByRole("link")).toHaveLength(0);
    expect(slot.container.querySelectorAll(".pw-session").length).toBeLessThan(30);
    scroller.scrollTop = 0; fireEvent.scroll(scroller);
    fireEvent.click(section, { detail: 1 });
    expect(slot.getByRole("link", { name: /chat-0 / })).toBeTruthy();
    expect(slot.getAllByRole("link").length).toBeLessThan(60);
    finishHeightTransition(document.getElementById(section.getAttribute("aria-controls")!)!);
    expect(slot.getAllByRole("link").length).toBeLessThan(30);
  });
  it("updates window offsets and section heights for compact layouts and restores the original spacing", async () => {
    const slot = setup(Array.from({ length: 2000 }, (_, index) => thread(`chat-${index}`, "alpha", { latestAttentionAt: 2000 - index })));
    const root = document.documentElement;
    const scroller = slot.container.querySelector<HTMLDivElement>(".pw-sessions-scroll")!;
    const section = slot.getByRole("button", { name: "Sessions 2000" });
    if (section.getAttribute("aria-expanded") === "false") fireEvent.click(section);
    const content = document.getElementById(section.getAttribute("aria-controls")!)!;
    try {
      for (const [mode, height] of [["two-lines", 64], ["one-line", 40]] as const) {
        await act(async () => { root.setAttribute("data-bb-session-card-layout", mode); });
        expect(content.style.height).toBe(`${2000 * height}px`);
        expect(slot.container.querySelector<HTMLElement>(".pw-window-row")!.style.height).toBe(`${height}px`);
        scroller.scrollTop = 1000 * height; fireEvent.scroll(scroller);
        expect(slot.getByRole("link", { name: /chat-1000 / })).toBeTruthy();
        expect(slot.queryByRole("link", { name: /chat-0 / })).toBeNull();
        expect(slot.getAllByRole("link").length).toBeLessThan(60);
      }
      await act(async () => { root.removeAttribute("data-bb-session-card-layout"); });
      expect(content.style.height).toBe("160000px");
      expect(slot.container.querySelector<HTMLElement>(".pw-window-row")!.style.height).toBe("80px");
    } finally {
      root.removeAttribute("data-bb-session-card-layout");
    }
  });
  it("keeps the following section populated while a tall Pinned section expands above it", () => {
    const slot = setup([
      ...Array.from({ length: 20 }, (_, index) => thread(`pin-${index}`, "alpha", { isPinned: true })),
      ...Array.from({ length: 20 }, (_, index) => thread(`session-${index}`, "alpha")),
    ]);
    const pinned = slot.getByRole("button", { name: "Pinned 20" });
    const content = document.getElementById(pinned.getAttribute("aria-controls")!)!;
    fireEvent.click(pinned, { detail: 1 }); finishHeightTransition(content);
    const nextRow = slot.getByRole("link", { name: /session-0 / });
    fireEvent.click(pinned, { detail: 1 });
    // The final offset is beyond overscan, but this row is still physically
    // visible at the beginning of the height transition.
    expect(slot.getByRole("link", { name: /session-0 / })).toBe(nextRow);
    expect(slot.container.querySelectorAll(".pw-session").length).toBeLessThan(50);
    finishHeightTransition(content);
    expect(slot.queryByRole("link", { name: /session-0 / })).toBeNull();
    expect(slot.container.querySelectorAll(".pw-session").length).toBeLessThan(30);
  });
  it("right click opens the session actions without navigation or ellipsis, and pins via BB", async () => {
    const user = userEvent.setup(), slot = setup();
    expect(slot.queryByRole("button", { name: "Actions for quiet" })).toBeNull();
    await user.pointer({ keys: "[MouseRight]", target: slot.getByText("quiet") });
    const menu = within(document.body).getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Open session", "Open in split", "Pin", "Mark unread", "Rename", "Archive", "Delete…"]);
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    await user.click(within(menu).getByRole("menuitem", { name: "Pin" }));
    expect(slot.inspection.sdkCalls).toContainEqual({ method: "threads.pin", args: [{ threadId: "quiet" }] });
  });
  it("opens via Shift+F10, dismisses with Escape and preserves action failure feedback", async () => {
    const user = userEvent.setup(), slot = setup([thread("quiet", "alpha", { isArchived: true })], {
      sdk: { projects: { list: async () => [] }, threads: { unarchive: async () => { throw new Error("Unarchive failed"); } } },
    });
    fireEvent.change(slot.getByRole("combobox", { name: "Session lifecycle" }), { target: { value: "archived" } });
    const link = slot.getByText("quiet").closest("a")!;
    link.focus(); await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(within(document.body).getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(within(document.body).queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(link);
    await user.pointer({ keys: "[MouseRight]", target: link });
    await user.click(within(document.body).getByRole("menuitem", { name: "Unarchive" }));
    expect(await slot.findByRole("alert")).toHaveProperty("textContent", "Unarchive failed");
  });
  it("opening an unread session explicitly acknowledges it through BB instead of locally hiding the label", () => {
    const slot = setup([thread("reply", "alpha", { isUnread: true })]);
    fireEvent.click(slot.getByText("reply"));
    expect(slot.inspection.sdkCalls).toContainEqual({ method: "threads.markRead", args: [{ threadId: "reply" }] });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "reply", options: { split: false } });
  });
  it("acknowledges a reply arriving during read acknowledgement and preserves later unread updates after leaving", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const reply = thread("reply", "alpha", { isUnread: true, latestAttentionAt: 1 });
    const slot = setup([reply]);
    slot.rerender(<ProjectWorkspace {...props} activeThreadId="reply" />);
    expect(slot.inspection.sdkCalls.filter(call => call.method === "threads.markRead")).toHaveLength(1);
    // Update before the first action's promise settles, as a completion event
    // arriving concurrently with opening an earlier reply would do.
    reply.latestAttentionAt = 2; slot.rerender(<ProjectWorkspace {...props} activeThreadId="reply" />);
    await waitFor(() => expect(slot.inspection.sdkCalls.filter(call => call.method === "threads.markRead")).toHaveLength(2));
    slot.rerender(<ProjectWorkspace {...props} />);
    await act(async () => { reply.latestAttentionAt = 3; slot.rerender(<ProjectWorkspace {...props} />); });
    expect(slot.inspection.sdkCalls.filter(call => call.method === "threads.markRead")).toHaveLength(2);
    expect(slot.getByText("Unread reply")).toBeTruthy();
  });
  it("orders projects by attention and exposes simultaneous running/input/completed counts", () => {
    const rows = [thread("quiet", "alpha", { latestAttentionAt: 999 }),
      thread("run", "beta", { runtimeStatus: "active" }), thread("question", "gamma", { hasPendingInteraction: true }),
      thread("reply", "gamma", { isUnread: true }), thread("run-gamma", "gamma", { runtimeStatus: "active" }),
      thread("queued", "gamma", { queuedWork: "waiting" }), thread("hidden", "gamma", { isHidden: true, runtimeStatus: "active" })];
    const slot = setup(rows);
    const buttons = Array.from(slot.container.querySelectorAll(".pw-project-list .pw-project-row"));
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["gamma", "beta", "alpha"]);
    const gamma = slot.getByRole("button", { name: "gamma" });
    expect(within(gamma).getByLabelText("1 need input")).toBeTruthy();
    expect(within(gamma).getByLabelText("1 running").querySelector(".pw-status-spinner")).toBeTruthy();
    expect(within(gamma).getByLabelText("1 queued").querySelector(".pw-status-spinner")).toBeNull();
    expect(within(gamma).getByLabelText("1 unread replies")).toBeTruthy();
    expect(projectAttention(rows, "gamma").counts).toEqual({ waiting: 1, working: 1, queued: 1, host: 0, unread: 1, error: 0 });
  });
  it("machine wait does not ask the user for input, and unfocused chats retain unread", async () => {
    const slot = setup([thread("host", "alpha", { runtimeStatus: "waiting-for-host" }), thread("reply", "alpha", { isUnread: true })]);
    expect(within(slot.getByRole("button", { name: "alpha" })).getByLabelText("1 waiting for machine")).toBeTruthy();
    expect(slot.queryByLabelText("1 need input")).toBeNull();
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    slot.rerender(<ProjectWorkspace {...props} activeThreadId="reply" />);
    await act(async () => {});
    expect(slot.inspection.sdkCalls.filter(call => call.method === "threads.markRead")).toHaveLength(0);
    focus.mockReturnValue(true); fireEvent.focus(window);
    await waitFor(() => expect(slot.inspection.sdkCalls.filter(call => call.method === "threads.markRead")).toHaveLength(1));
  });
  it("creates a project with the explicit machine and folder, retains fields on failure and selects the successful project", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("Folder unavailable")).mockResolvedValue(catalogProject("new-project"));
    const slot = setup(undefined, { sdk: { hosts: { list: async () => [{ id: "remote", name: "Remote machine" }] }, projects: { list: async () => [catalogProject("new-project")], create } } });
    fireEvent.click(slot.getByRole("button", { name: "Add project" }));
    const form = slot.getByRole("form", { name: "Add project" });
    await waitFor(() => expect((within(form).getByRole("combobox", { name: "Project machine" }) as HTMLSelectElement).value).toBe("remote"));
    fireEvent.change(within(form).getByLabelText("Project name"), { target: { value: "My project" } });
    fireEvent.change(within(form).getByLabelText("Project folder"), { target: { value: "/work/repo" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add project" }));
    await slot.findByText("Folder unavailable");
    expect((within(form).getByLabelText("Project folder") as HTMLInputElement).value).toBe("/work/repo");
    expect(create).toHaveBeenCalledWith({ name: "My project", source: { type: "local_path", hostId: "remote", path: "/work/repo" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(slot.getByRole("button", { name: "new-project" }).getAttribute("aria-pressed")).toBe("true"));
    expect(slot.queryByRole("form", { name: "Add project" })).toBeNull();
    expect(slot.inspection.navigateCalls.some(call => call.method === "toCompose")).toBe(false);
  });
});
