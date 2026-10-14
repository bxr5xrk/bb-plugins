import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { prepareAgentCreate, completeAgentCreate, readPendingCreate, recoveryKey } from "../lib/agent-create-recovery";
import type { NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import type { AgentProfile, AgentBinding, AgentMemory } from "../lib/agent-contract";
import { project, thread } from "./fixtures";
const app = await loadPluginApp(() => import("../app"));
const profile = (id = "reviewer", overrides: Partial<AgentProfile> = {}): AgentProfile => ({ id, name: "Reviewer", role: "Code specialist", avatar: "owl", color: "#80cbc4", instructions: "Review verified code and explain findings.", soul: "", sharedRules: "Ask before publishing.", defaults: {}, basis: null, revision: 1, hash: "h1", createdAt: 1, updatedAt: 1, ...overrides });
const binding = (threadId: string, agentId = "reviewer", projectId = "alpha", overrides: Partial<AgentBinding> = {}): AgentBinding => ({ threadId, agentId, projectId, createdAt: 1, loadedHash: null, loadedAt: null, coordinationAllowed: false, coordinationWork: null, state: "pending", ...overrides });
const props = { activeThreadId: "alpha-chat", activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" };
function setup(options: RenderSlotOptions = {}) {
  return renderSlot(app.threadLists[0]!, props, { rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) }, sidebarThreads: { status: "ready", projects: [project("alpha"), project("beta")], threads: [thread("alpha-chat", "alpha"), thread("beta-chat", "beta")], sections: [] }, sdk: { projects: { list: async () => [] }, threads: { interactions: { list: async () => [] } } }, ...options });
}
async function choose(slot: ReturnType<typeof setup>, name = "Reviewer") { fireEvent.click(await slot.findByRole("button", { name: `Select bot ${name}` })); }
async function createFields(name = "Scout") {
  const body = within(document.body);
  fireEvent.change(body.getByRole("textbox", { name: "Name" }), { target: { value: name } });
  fireEvent.change(body.getByRole("textbox", { name: "Role" }), { target: { value: "Project researcher" } });
  fireEvent.change(body.getByRole("textbox", { name: "Instructions" }), { target: { value: "Investigate sources and save verified project facts." } });
}
const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
beforeEach(() => {
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: <T,>(name: string, _options: unknown, callback: () => T) => {
    const result = (queues.get(name) ?? Promise.resolve()).catch(() => undefined).then(callback);
    queues.set(name, result); return result;
  } } });
});
afterEach(() => { if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks); else Reflect.deleteProperty(navigator, "locks"); cleanup(); localStorage.removeItem(recoveryKey("reviewer")); localStorage.removeItem("project-workspace.bots-collapsed.v1"); vi.restoreAllMocks(); });
describe("Persistent specialist workflows", () => {
  it("Delete bot in right-click and keyboard menus targets that bot, cancels safely, and preserves another selected bot", async () => {
    let profiles = [profile(), profile("scout", { name: "Scout", revision: 3 })];
    const remove = vi.fn(async fields => { profiles = profiles.filter(item => item.id !== fields.id); return { removed: true }; });
    const user = userEvent.setup({ pointerEventsCheck: 0 }), slot = setup({ rpc: { listSpecialists: async () => ({ profiles, bindings: [], legacy: [] }), removeSpecialist: remove } }); await choose(slot);
    const row = await slot.findByRole("button", { name: "Select bot Scout" }), body = within(document.body); row.focus(); await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.click(await body.findByRole("menuitem", { name: "Delete bot…" })); const confirmation = await body.findByRole("dialog", { name: "Delete bot “Scout”?" });
    expect(within(confirmation).getByText(/SOUL.md, shared rules and project memories/)).toBeTruthy(); expect(within(confirmation).getByText(/All native chats are kept/)).toBeTruthy(); expect(document.activeElement).toBe(within(confirmation).getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(row)); expect(remove).not.toHaveBeenCalled();
    fireEvent.contextMenu(row); await user.click(await body.findByRole("menuitem", { name: "Delete bot…" })); await user.click(document.querySelector(".pw-bot-delete-overlay")!); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull()); expect(remove).not.toHaveBeenCalled();
    fireEvent.contextMenu(row); await user.click(await body.findByRole("menuitem", { name: "Delete bot…" })); await user.click(body.getByRole("button", { name: "Delete bot" }));
    await waitFor(() => expect(slot.queryByRole("button", { name: "Select bot Scout" })).toBeNull()); expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "scout", expectedRevision: 3 }); expect(slot.getByRole("button", { name: "Select bot Reviewer" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(slot.getByRole("button", { name: /^Bots/ }))); expect(slot.inspection.sdkCalls.some(call => call.method === "threads.delete")).toBe(false);
  });
  it("Delete bot in settings preserves authored drafts on cancellation and CAS failure until an explicit reviewed revision is deleted", async () => {
    let profiles = [profile()], current = profiles[0]!;
    const remove = vi.fn(async fields => { if (fields.expectedRevision !== current.revision) throw new Error("Profile changed; reload before deleting"); profiles = []; return { removed: true }; });
    const user = userEvent.setup({ pointerEventsCheck: 0 }), slot = setup({ rpc: { listSpecialists: async () => ({ profiles, bindings: [], legacy: [] }), removeSpecialist: remove } }); await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); await user.click(slot.getByRole("button", { name: "Edit profile" }));
    const body = within(document.body), settings = body.getByRole("dialog", { name: "Edit bot profile" }), editor = within(settings), facts = editor.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement;
    fireEvent.change(facts, { target: { value: "My unsaved instructions" } }); const deleteEntry = editor.getByRole("button", { name: "Delete bot…" }); await user.click(deleteEntry); await user.click(body.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(deleteEntry)); expect(facts.value).toBe("My unsaved instructions"); expect(remove).not.toHaveBeenCalled();
    current = profile("reviewer", { revision: 2, soul: "New saved personality" }); profiles = [current]; await user.click(deleteEntry); await user.click(body.getByRole("button", { name: "Delete bot" }));
    await body.findByText("Profile changed; reload before deleting"); expect(facts.value).toBe("My unsaved instructions"); expect((body.getByRole("button", { name: "Delete bot" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(body.getByText("View updated bot")); expect(body.getByText("New saved personality")).toBeTruthy(); await user.click(body.getByRole("button", { name: "Use reviewed revision" })); expect(remove).toHaveBeenCalledOnce();
    await user.click(body.getByRole("button", { name: "Delete bot" })); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    expect(remove.mock.calls.map(call => call[0])).toEqual([{ id: "reviewer", expectedRevision: 1 }, { id: "reviewer", expectedRevision: 2 }]); expect(slot.getByRole("tab", { name: "Explorer" })).toBeTruthy(); expect(slot.getByText("alpha-chat")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(slot.getByRole("button", { name: /^Bots/ }))); expect(slot.inspection.sdkCalls.some(call => call.method === "threads.delete")).toBe(false);
  });
  it("bot deletion refuses duplicate calls and dismissal while pending, then permits cancellation after failure", async () => {
    let reject!: (cause: Error) => void; const remove = vi.fn((_fields: unknown) => new Promise<{ removed: boolean }>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const user = userEvent.setup({ pointerEventsCheck: 0 }), slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), removeSpecialist: remove } });
    const row = await slot.findByRole("button", { name: "Select bot Reviewer" }); fireEvent.contextMenu(row); const body = within(document.body); await user.click(await body.findByRole("menuitem", { name: "Delete bot…" })); const button = body.getByRole("button", { name: "Delete bot" });
    fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(remove).toHaveBeenCalledOnce()); await user.keyboard("{Escape}"); await user.click(document.querySelector(".pw-bot-delete-overlay")!); expect(body.getByRole("dialog")).toBeTruthy();
    reject(new Error("Storage temporarily unavailable")); await body.findByText("Storage temporarily unavailable"); await user.keyboard("{Escape}"); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull()); await waitFor(() => expect(document.activeElement).toBe(row)); expect(remove).toHaveBeenCalledOnce();
  });
  it("bot context menus open the correct settings without changing project selection and restore keyboard focus", async () => {
    const user = userEvent.setup(), slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile(), profile("scout", { name: "Scout", soul: "Warm, curious and concise." })], bindings: [], legacy: [] }) } });
    const row = await slot.findByRole("button", { name: "Select bot Scout" }); const selectedProject = slot.getByRole("button", { name: "alpha" }); row.focus(); await user.keyboard("{Shift>}{F10}{/Shift}");
    const body = within(document.body); await body.findByRole("menuitem", { name: "Bot settings" });
    expect(selectedProject.getAttribute("aria-pressed")).toBe("true");
    await user.click(body.getByRole("menuitem", { name: "Bot settings" })); await body.findByRole("dialog", { name: "Edit bot profile" });
    expect((body.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Scout"); expect((body.getByRole("textbox", { name: /^SOUL.md/ }) as HTMLTextAreaElement).value).toBe("Warm, curious and concise.");
    await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(row));
    expect(slot.getByRole("button", { name: "alpha" }).getAttribute("aria-pressed")).toBe("true"); expect(slot.inspection.navigateCalls).toEqual([]);
  });
  it("right-click New chat uses the correct bot native composer and never runs on opening", async () => {
    const spawn = vi.fn(), user = userEvent.setup(), slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), spawnAgentThread: spawn } });
    const row = await slot.findByRole("button", { name: "Select bot Reviewer" }); fireEvent.contextMenu(row); const body = within(document.body); await user.click(await body.findByRole("menuitem", { name: "New chat" }));
    await body.findByRole("dialog", { name: "New chat with Reviewer" }); expect(body.getByTestId("bb-new-thread-composer")).toBeTruthy(); expect(spawn).not.toHaveBeenCalled();
    await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(row));
    fireEvent.click(slot.getByRole("button", { name: "alpha" })); await choose(slot); expect(body.queryByRole("dialog")).toBeNull();
  });
  it("Bots collapse persists, removes hidden keyboard targets, and the independent plus still opens settings", async () => {
    const options = { rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }) } };
    const first = setup(options); await first.findByRole("button", { name: "Select bot Reviewer" }); const heading = first.getByRole("button", { name: /^Bots/ });
    fireEvent.click(heading); expect(heading.getAttribute("aria-expanded")).toBe("false"); expect(first.queryByRole("button", { name: "Select bot Reviewer" })).toBeNull();
    fireEvent.click(first.getByRole("button", { name: "Create bot" })); const body = within(document.body); expect(body.getByRole("dialog", { name: "Create bot" })).toBeTruthy(); fireEvent.click(body.getByRole("button", { name: "Cancel" }));
    expect(heading.getAttribute("aria-expanded")).toBe("false"); first.unmount(); const reopened = setup(options); expect(reopened.getByRole("button", { name: /^Bots/ }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reopened.getByRole("button", { name: /^Bots/ })); await reopened.findByRole("button", { name: "Select bot Reviewer" });
  });
  it("bot settings dismiss outside but stay open while saving and preserve failed SOUL.md drafts", async () => {
    let reject!: (cause: Error) => void; const save = vi.fn((_fields: unknown) => new Promise<AgentProfile>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const user = userEvent.setup({ pointerEventsCheck: 0 }), slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), saveSpecialist: save } });
    const create = slot.getByRole("button", { name: "Create bot" }); await user.click(create); const body = within(document.body);
    await user.click(document.querySelector(".pw-preview-overlay")!); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull()); await waitFor(() => expect(document.activeElement).toBe(create));
    await user.click(create); await createFields(); fireEvent.change(body.getByRole("textbox", { name: /^SOUL.md/ }), { target: { value: "Calm voice, concrete examples." } }); await user.click(body.getByRole("button", { name: "Create bot" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce()); await user.click(document.querySelector(".pw-preview-overlay")!); await user.keyboard("{Escape}"); expect(body.getByRole("dialog")).toBeTruthy();
    reject(new Error("Save failed")); await body.findByText("Save failed"); expect((body.getByRole("textbox", { name: /^SOUL.md/ }) as HTMLTextAreaElement).value).toBe("Calm voice, concrete examples.");
    expect(save.mock.calls[0]![0]).toMatchObject({ soul: "Calm voice, concrete examples.", instructions: "Investigate sources and save verified project facts." });
    await user.click(document.querySelector(".pw-preview-overlay")!); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  });
  it("SOUL.md stays separate from imported task instructions and concurrent profile revisions", async () => {
    let current = profile(); const content = "Imported operational boundaries.";
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [current], bindings: [], legacy: [] }), saveSpecialist: async () => { throw new Error("Profile changed"); }, listAgentSkills: async () => ({ skills: [{ id: "skill", name: "Skill", description: null, filePath: "/actual/SKILL.md", scope: "global", pluginId: null, provider: null }] }), readAgentSkill: async () => ({ content, basis: { projectId: "alpha", environmentId: "env-alpha-chat", skillId: "skill", name: "Skill", revision: "1", filePath: "/actual/SKILL.md" } }) } });
    await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); fireEvent.click(slot.getByRole("button", { name: "Edit profile" })); const body = within(document.body);
    fireEvent.change(body.getByRole("textbox", { name: /^SOUL.md/ }), { target: { value: "My deliberate personality." } }); fireEvent.click(body.getByRole("checkbox", { name: "Start from an available skill" })); await body.findByRole("option", { name: "Skill · global" }); fireEvent.click(body.getByRole("button", { name: "Replace instructions with skill" }));
    await waitFor(() => expect((body.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value).toBe(content)); expect((body.getByRole("textbox", { name: /^SOUL.md/ }) as HTMLTextAreaElement).value).toBe("My deliberate personality.");
    current = profile("reviewer", { revision: 2, soul: "Remote personality" }); fireEvent.click(body.getByRole("button", { name: "Save profile" })); await body.findByText(/Another window saved this profile/);
    expect((body.getByRole("textbox", { name: /^SOUL.md/ }) as HTMLTextAreaElement).value).toBe("My deliberate personality."); fireEvent.click(body.getByText("View saved version")); expect(body.getByText("Remote personality")).toBeTruthy();
  });
  it("selects many real chats across projects without running agents and returns to project Explorer", async () => {
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [binding("alpha-chat"), binding("beta-chat", "reviewer", "beta")], legacy: [] }) } });
    await choose(slot);
    expect(slot.getByText("alpha-chat")).toBeTruthy(); expect(slot.getByText("beta-chat")).toBeTruthy();
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.queryByText("Idle")).toBeNull(); expect(slot.queryByText("Codex")).toBeNull();
    fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "beta" } });
    expect(slot.queryByText("alpha-chat")).toBeNull(); expect(slot.getByText("beta-chat")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "alpha" }));
    expect(slot.getByRole("tab", { name: "Explorer" })).toBeTruthy(); expect(slot.queryByRole("tab", { name: "Profile" })).toBeNull();
  });
  it("shows simultaneous truthful attention counts and orders question before working before unread before quiet", async () => {
    const profiles = [profile("quiet", { name: "Quiet" }), profile("finished", { name: "Finished" }), profile("running", { name: "Running" }), profile("attention", { name: "Attention" })];
    const threads = [thread("q", "alpha"), thread("done", "alpha", { isUnread: true }), thread("run", "alpha", { runtimeStatus: "active" }), thread("question", "alpha", { hasPendingInteraction: true }), thread("other-run", "beta", { runtimeStatus: "active" }), thread("other-done", "beta", { isUnread: true })];
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles, bindings: [binding("q", "quiet"), binding("done", "finished"), binding("run", "running"), binding("question", "attention"), binding("other-run", "attention", "beta"), binding("other-done", "attention", "beta")], legacy: [] }) }, sidebarThreads: { status: "ready", projects: [project("alpha"), project("beta")], threads, sections: [] } });
    await slot.findByRole("button", { name: "Select bot Attention" });
    expect(slot.getAllByRole("button", { name: /Select bot/ }).map(button => button.getAttribute("aria-label"))).toEqual(["Select bot Attention", "Select bot Running", "Select bot Finished", "Select bot Quiet"]);
    const row = within(slot.getByRole("button", { name: "Select bot Attention" }));
    expect(row.getByLabelText("1 need input")).toBeTruthy(); expect(row.getByLabelText("1 running")).toBeTruthy(); expect(row.getByLabelText("1 unread replies")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Select bot Quiet" }).querySelector(".pw-status-dot")).toBeNull();
  });
  it("failed creation keeps authored draft and cancel creates no chat", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Storage temporarily unavailable")).mockImplementation(async fields => profile("scout", { ...fields, name: fields.name }));
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }), saveSpecialist: save } });
    fireEvent.click(slot.getByRole("button", { name: "Create bot" })); await createFields();
    const body = within(document.body); fireEvent.click(body.getByRole("button", { name: "Create bot" }));
    await body.findByText("Storage temporarily unavailable"); expect(body.getByRole("textbox", { name: "Name" }).getAttribute("value")).toBe("Scout");
    fireEvent.click(body.getByRole("button", { name: "Cancel" })); expect(body.queryByRole("dialog")).toBeNull();
    expect(slot.inspection.navigateCalls).toEqual([]); expect(save).toHaveBeenCalledOnce();
  });
  it("imports actual skill full content in its real project environment scope without changing source", async () => {
    const content = "Verified skill instructions.\n" + "Detailed guidance.\n".repeat(600);
    const read = vi.fn(async () => ({ content, basis: { projectId: "alpha", environmentId: "env-alpha-chat", skillId: "installed-research", name: "Research", revision: "sha-real", filePath: "/real/Research/SKILL.md" } }));
    const list = vi.fn(async () => ({ skills: [{ id: "installed-research", name: "Research", description: "Trace actual evidence", filePath: "/real/Research/SKILL.md", scope: "global", pluginId: null, provider: "codex" }, { id: "other-provider-research", name: "Research", description: "Another provider source", filePath: "/other/Research/SKILL.md", scope: "global", pluginId: null, provider: "claude" }] }));
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }), listAgentSkills: list, readAgentSkill: read } });
    fireEvent.click(slot.getByRole("button", { name: "Create bot" })); const body = within(document.body);
    fireEvent.click(body.getByRole("checkbox", { name: "Start from an available skill" }));
    await body.findByRole("option", { name: "Research · codex · global" }); expect(body.getByRole("option", { name: "Research · claude · global" })).toBeTruthy(); fireEvent.change(body.getByRole("textbox", { name: "Search skills" }), { target: { value: "codex" } }); expect(body.queryByRole("option", { name: "Research · claude · global" })).toBeNull(); expect(body.getByText("/real/Research/SKILL.md")).toBeTruthy(); fireEvent.click(body.getByRole("button", { name: "Use skill instructions" }));
    await waitFor(() => expect((body.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value).toBe(content));
    expect(list).toHaveBeenCalledWith({ projectId: "alpha", environmentId: "env-alpha-chat" }); expect(read).toHaveBeenCalledWith({ projectId: "alpha", environmentId: "env-alpha-chat", skillId: "installed-research" });
    expect(slot.inspection.sdkCalls.some(call => call.method.includes("write"))).toBe(false);
  });
  it("skill and model loading failures retain the manual draft and expose scoped retry", async () => {
    const skills = vi.fn().mockRejectedValueOnce(new Error("Skill machine offline")).mockResolvedValue({ skills: [] });
    const providers = vi.fn().mockRejectedValueOnce(new Error("Catalog machine offline")).mockResolvedValue([]);
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }), listAgentSkills: skills }, sdk: { projects: { list: async () => [] }, providers: { list: providers } } });
    fireEvent.click(slot.getByRole("button", { name: "Create bot" })); await createFields(); const body = within(document.body);
    fireEvent.click(body.getByRole("checkbox", { name: "Start from an available skill" })); await body.findByText("Skill machine offline"); fireEvent.click(body.getByRole("button", { name: "Retry skills" })); await waitFor(() => expect(skills).toHaveBeenCalledTimes(2));
    fireEvent.click(body.getByRole("checkbox", { name: "Use bot's execution defaults" })); await body.findByText("Catalog machine offline"); fireEvent.click(body.getByRole("button", { name: "Retry models" })); await waitFor(() => expect(providers).toHaveBeenCalledTimes(2));
    expect(providers.mock.calls[0]![0]).toMatchObject({ environmentId: "env-alpha-chat" }); expect((body.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value).toBe("Investigate sources and save verified project facts.");
    fireEvent.click(body.getByRole("checkbox", { name: "Use bot's execution defaults" })); expect((body.getByRole("button", { name: "Create bot" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("realtime learned facts refresh readonly memory and preserve dirty draft against newer revisions", async () => {
    let memory: AgentMemory = { agentId: "reviewer", projectId: "alpha", content: "Initial fact", revision: 1, source: "agent", updatedAt: 1 };
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), getAgentMemory: async () => memory } }); await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Memory" })); fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "alpha" } }); await slot.findByRole("textbox", { name: "Project facts" });
    memory = { ...memory, content: "Learned fact", revision: 2 }; await slot.emitRealtime("agents-changed", null); await waitFor(() => expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("Learned fact"));
    fireEvent.change(slot.getByRole("textbox", { name: "Project facts" }), { target: { value: "Authored draft" } }); memory = { ...memory, content: "Another learned fact", revision: 3 }; await slot.emitRealtime("agents-changed", null); await slot.findByText("Project memory changed elsewhere. Your draft is kept."); expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("Authored draft");
  });
  it("own memory realtime before save completion does not become a false conflict", async () => {
    let memory: AgentMemory = { agentId: "reviewer", projectId: "alpha", content: "Original fact", revision: 1, source: "user", updatedAt: 1 };
    let complete!: (value: AgentMemory) => void; const response = new Promise<AgentMemory>(resolve => { complete = resolve; });
    const save = vi.fn(async fields => { memory = { ...memory, content: fields.content, revision: 2 }; return response; });
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), getAgentMemory: async () => memory, saveAgentMemory: save } }); await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Memory" })); fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "alpha" } });
    await slot.findByRole("textbox", { name: "Project facts" }); fireEvent.change(slot.getByRole("textbox", { name: "Project facts" }), { target: { value: "My saved fact" } }); fireEvent.click(slot.getByRole("button", { name: "Save memory" })); await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await slot.emitRealtime("agents-changed", null); expect(slot.queryByText("Project memory changed elsewhere. Your draft is kept.")).toBeNull(); complete(memory);
    await slot.findByText("Project memory saved."); await waitFor(() => expect((slot.getByRole("button", { name: "Save memory" }) as HTMLButtonElement).disabled).toBe(true)); expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("My saved fact"); expect(slot.queryByText("Project memory changed elsewhere. Your draft is kept.")).toBeNull();
    fireEvent.click(slot.getByRole("tab", { name: "Sessions" })); fireEvent.click(slot.getByRole("tab", { name: "Memory" })); await slot.findByRole("textbox", { name: "Project facts" }); expect((slot.getByRole("button", { name: "Save memory" }) as HTMLButtonElement).disabled).toBe(true); expect(slot.queryByText("Project memory changed elsewhere. Your draft is kept.")).toBeNull();
  });
  it("profile conflict retains full draft and requires explicit latest revision before overwriting", async () => {
    let latest = profile(); const save = vi.fn(async fields => { if (fields.expectedRevision === 1) { latest = profile("reviewer", { revision: 2, instructions: "Other window", defaults: { providerId: "actual-provider", model: "actual-model", reasoningLevel: "high" } }); throw new Error("Profile changed in another window"); } return profile("reviewer", { ...fields, revision: 3 }); });
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [latest], bindings: [], legacy: [] }), saveSpecialist: save } }); await choose(slot);
    fireEvent.click(slot.getByRole("tab", { name: "Profile" })); fireEvent.click(slot.getByRole("button", { name: "Edit profile" }));
    const body = within(document.body); fireEvent.change(body.getByRole("textbox", { name: "Instructions" }), { target: { value: "My full retained draft" } }); fireEvent.click(body.getByRole("button", { name: "Save profile" }));
    await body.findByText("Another window saved this profile. Your draft is kept; review the saved version before retrying.");
    expect((body.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value).toBe("My full retained draft"); expect((body.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(body.getByText("View saved version")); expect(body.getByText(/actual-model/)).toBeTruthy();
    fireEvent.click(body.getByRole("button", { name: "Keep my draft and use latest revision" })); fireEvent.click(body.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[1]![0]).toMatchObject({ id: "reviewer", expectedRevision: 2, instructions: "My full retained draft" });
  });
  it("legacy creation retries only attachment after profile persisted, without duplicating profiles", async () => {
    const saved = profile("scout", { name: "Scout" }), save = vi.fn(async () => saved), bind = vi.fn().mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValue(binding("alpha-chat", "scout"));
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [{ threadId: "alpha-chat", name: "Saved", color: "#80cbc4" }] }), saveSpecialist: save, bindAgentThread: bind } });
    fireEvent.click(await slot.findByText(/Saved chats/)); fireEvent.click(slot.getByRole("button", { name: "Create profile from Saved" })); await createFields(); const body = within(document.body);
    fireEvent.click(body.getByRole("button", { name: "Create bot" })); await body.findByText(/Profile saved, but/); fireEvent.click(body.getByRole("button", { name: "Retry attaching saved chat" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull()); expect(save).toHaveBeenCalledOnce(); expect(bind).toHaveBeenCalledTimes(2); expect(bind.mock.calls[1]![0]).toEqual({ agentId: "scout", threadId: "alpha-chat" });
  });
  it("project memory stays separate and unsaved draft survives tabs, project selection and a remote conflict", async () => {
    let alpha: AgentMemory = { agentId: "reviewer", projectId: "alpha", content: "Alpha fact", revision: 1, source: "agent", updatedAt: 1 };
    const get = vi.fn(async ({ projectId }) => projectId === "alpha" ? alpha : { ...alpha, projectId, content: "Beta fact" });
    const save = vi.fn(async fields => { if (fields.expectedRevision !== alpha.revision) throw new Error("Memory changed"); return { ...alpha, content: fields.content, revision: 3, source: "user" as const }; });
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), getAgentMemory: get, saveAgentMemory: save } }); await choose(slot);
    fireEvent.click(slot.getByRole("tab", { name: "Memory" })); fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "alpha" } });
    const facts = await slot.findByRole("textbox", { name: "Project facts" }); fireEvent.change(facts, { target: { value: "My authored alpha fact" } });
    fireEvent.click(slot.getByRole("tab", { name: "Sessions" })); fireEvent.click(slot.getByRole("tab", { name: "Memory" })); await waitFor(() => expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("My authored alpha fact"));
    fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "beta" } }); await waitFor(() => expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("Beta fact"));
    alpha = { ...alpha, content: "New remote alpha fact", revision: 2 }; fireEvent.change(slot.getByRole("combobox", { name: "Bot project filter" }), { target: { value: "alpha" } });
    await slot.findByText("Project memory changed elsewhere. Your draft is kept."); expect((slot.getByRole("textbox", { name: "Project facts" }) as HTMLTextAreaElement).value).toBe("My authored alpha fact");
    fireEvent.click(slot.getByRole("button", { name: "Keep my draft" })); fireEvent.click(slot.getByRole("button", { name: "Save memory" }));
    await slot.findByText("Project memory saved."); expect(save).toHaveBeenCalledWith({ agentId: "reviewer", projectId: "alpha", expectedRevision: 2, content: "My authored alpha fact" });
  });
  it("coordination requires a current bound chat and explicit work-specific authorization", async () => {
    let current = binding("alpha-chat"); const grant = vi.fn(async ({ allowed, work }) => { current = { ...current, coordinationAllowed: allowed, coordinationWork: work }; return current; });
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [current], legacy: [] }), setAgentCoordination: grant } }); await choose(slot);
    fireEvent.click(slot.getByRole("tab", { name: "Profile" })); expect(grant).not.toHaveBeenCalled();
    expect((slot.getByRole("button", { name: "Allow coordination for this work" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(slot.getByRole("textbox", { name: "Authorized work" }), { target: { value: "Review this UI" } }); fireEvent.click(slot.getByRole("button", { name: "Allow coordination for this work" }));
    await slot.findByRole("button", { name: "Revoke coordination permission" }); expect(grant).toHaveBeenCalledWith({ threadId: "alpha-chat", allowed: true, work: "Review this UI" }); expect(slot.inspection.navigateCalls).toEqual([]);
  });
  it("removing a profile clearly names memory deletion, keeps native chats and restores project selection", async () => {
    let profiles = [profile()]; const remove = vi.fn(async () => { profiles = []; return { removed: true }; });
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles, bindings: [], legacy: [] }), removeSpecialist: remove } }); await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); fireEvent.click(slot.getByRole("button", { name: "Remove bot…" }));
    const body = within(document.body); expect(body.getByText(/SOUL.md, shared rules and project memories/)).toBeTruthy(); fireEvent.click(body.getByRole("button", { name: "Delete bot" }));
    await waitFor(() => expect(slot.getByRole("button", { name: "alpha" }).getAttribute("aria-pressed")).toBe("true")); expect(slot.getByText("alpha-chat")).toBeTruthy(); expect(slot.getByRole("tab", { name: "Explorer" })).toBeTruthy(); expect(slot.inspection.sdkCalls.some(call => call.method === "threads.delete")).toBe(false);
  });
  it("selected beta never seeds skill discovery with the active alpha environment", async () => {
    const skills = vi.fn(async () => ({ skills: [] }));
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), listAgentSkills: skills } }); fireEvent.click(slot.getByRole("button", { name: "beta" })); await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); fireEvent.click(slot.getByRole("button", { name: "Edit profile" })); fireEvent.click(within(document.body).getByRole("checkbox", { name: "Start from an available skill" }));
    await waitFor(() => expect(skills).toHaveBeenCalledWith({ projectId: "beta", environmentId: null }));
  });
  it("keyboard create, edit and native-composer cancellation restores their actual opener", async () => {
    const user = userEvent.setup(), slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }) } });
    const create = slot.getByRole("button", { name: "Create bot" }); create.focus(); await user.keyboard("{Enter}"); const body = within(document.body); await waitFor(() => expect(document.activeElement).toBe(body.getByRole("textbox", { name: "Name" })));
    await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(create)); await user.click(create); await user.click(body.getByRole("button", { name: "Cancel" })); await waitFor(() => expect(document.activeElement).toBe(create));
    await choose(slot); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); const edit = slot.getByRole("button", { name: "Edit profile" }); await user.click(edit); await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(edit));
    const composer = slot.getByRole("button", { name: "New chat with Reviewer" }); await user.click(composer); await user.keyboard("{Escape}"); await waitFor(() => expect(document.activeElement).toBe(composer));
  });
  it("loading and failed native thread states never claim there are no chats", async () => {
    for (const status of ["loading", "error"] as const) {
      const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }) }, sidebarThreads: { status, threads: [], projects: [project("alpha")], sections: [] } }); await choose(slot);
      expect(slot.queryByText("No chats here yet.")).toBeNull(); expect(slot.queryByRole("button", { name: "Start a chat" })).toBeNull();
      if (status === "loading") expect(slot.getByText("Loading bot sessions…")).toBeTruthy(); else expect(slot.getByRole("button", { name: "Reload BB" })).toBeTruthy(); slot.unmount();
    }
  });
  it("uncertain creation keeps its exact request and token through failed recovery, close and sidebar remount", async () => {
    const request: NewThreadRequest = { projectId: "alpha", providerId: "actual", model: "chosen", reasoningLevel: "high", permissionMode: "auto", executionInputSources: { model: "explicit" }, environment: { type: "project-default" }, input: [{ type: "text", text: "Original task", mentions: [] }, { type: "localFile", path: "/work/file.ts", name: "file.ts" }] };
    const pending = await prepareAgentCreate("reviewer", request); // Durable before any server dispatch.
    const spawn = vi.fn().mockRejectedValueOnce(new Error("Create result uncertain")).mockResolvedValue({ threadId: "existing-chat" });
    const options = { rpc: { listSpecialists: async () => ({ profiles: [profile()], bindings: [], legacy: [] }), spawnAgentThread: spawn } };
    const first = setup(options); await choose(first); fireEvent.click(first.getByRole("button", { name: "New chat with Reviewer" })); const body = within(document.body); fireEvent.click(body.getByRole("button", { name: "Recover previous creation" })); await body.findByText("Create result uncertain");
    expect(readPendingCreate("reviewer")?.requestId).toBe(pending.requestId); await expect(prepareAgentCreate("reviewer", { ...request, input: [{ type: "text", text: "Edited task", mentions: [] }] })).rejects.toThrow("Your edited draft was not submitted"); expect(spawn).toHaveBeenCalledOnce();
    fireEvent.click(body.getByRole("button", { name: "Close bot composer" })); first.unmount();
    const reopened = setup(options); await choose(reopened); fireEvent.click(reopened.getByRole("button", { name: "New chat with Reviewer" })); fireEvent.click(body.getByRole("button", { name: "Recover previous creation" })); await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    expect(spawn).toHaveBeenCalledTimes(2); expect(spawn.mock.calls.map(call => call[0])).toEqual([{ agentId: "reviewer", requestId: pending.requestId, request }, { agentId: "reviewer", requestId: pending.requestId, request }]); expect(readPendingCreate("reviewer")).toBeNull(); expect(reopened.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "existing-chat" });
  });
  it("failed or corrupted durable recovery storage refuses a new task", async () => {
    const request: NewThreadRequest = { projectId: "alpha", providerId: "actual", model: "chosen", reasoningLevel: "high", permissionMode: "auto", executionInputSources: {}, environment: { type: "project-default" }, input: [{ type: "text", text: "Task", mentions: [] }] };
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); }); await expect(prepareAgentCreate("reviewer", request)).rejects.toThrow("No new task was submitted"); write.mockRestore();
    localStorage.setItem(recoveryKey("reviewer"), "corrupt"); await expect(prepareAgentCreate("reviewer", request)).rejects.toThrow("No new task was submitted");
  });
  it("cross-window preparation reuses one token and an older completion never clears a newer operation", async () => {
    const request: NewThreadRequest = { projectId: "alpha", providerId: "actual", model: "chosen", reasoningLevel: "high", permissionMode: "auto", executionInputSources: {}, environment: { type: "project-default" }, input: [{ type: "text", text: "Task", mentions: [] }] };
    const [left, right] = await Promise.all([prepareAgentCreate("reviewer", request), prepareAgentCreate("reviewer", { ...request, environment: request.environment })]); expect(left.requestId).toBe(right.requestId);
    await completeAgentCreate(left); const newer = await prepareAgentCreate("reviewer", { ...request, input: [{ type: "text", text: "New work", mentions: [] }] }); await completeAgentCreate(right); expect(readPendingCreate("reviewer")?.requestId).toBe(newer.requestId);
    Reflect.deleteProperty(navigator, "locks"); await expect(prepareAgentCreate("reviewer", request)).rejects.toThrow("requires browser locking support");
  });
  it("native composer forwards selections and each new work gets a distinct idempotency key", async () => {
    const spawn = vi.fn(async (_value: unknown) => ({ threadId: "new-chat" }));
    const slot = setup({ rpc: { listSpecialists: async () => ({ profiles: [profile("reviewer", { defaults: { providerId: "actual", model: "chosen", reasoningLevel: "high" } })], bindings: [], legacy: [] }), spawnAgentThread: spawn } }); await choose(slot);
    fireEvent.click(slot.getByRole("button", { name: "New chat with Reviewer" })); const body = within(document.body);
    expect(body.getByTestId("bb-new-thread-composer").getAttribute("data-default-model")).toBe("chosen"); fireEvent.change(body.getByTestId("bb-new-thread-composer-input"), { target: { value: "Same task" } }); fireEvent.click(body.getByTestId("bb-new-thread-composer-submit"));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull()); fireEvent.click(slot.getByRole("button", { name: "Start a chat" })); fireEvent.change(body.getByTestId("bb-new-thread-composer-input"), { target: { value: "Same task" } }); fireEvent.click(body.getByTestId("bb-new-thread-composer-submit"));
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2)); expect((spawn.mock.calls[0]![0] as { requestId: string }).requestId).not.toBe((spawn.mock.calls[1]![0] as { requestId: string }).requestId); expect(spawn.mock.calls[0]![0]).toMatchObject({ agentId: "reviewer", request: { projectId: "alpha", providerId: "actual", model: "chosen", reasoningLevel: "high", input: [{ type: "text", text: "Same task" }] } });
  });
});
