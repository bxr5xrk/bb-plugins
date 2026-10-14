import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import type { BotAvatarProps } from "bot-avatars";
import type { AgentProfile, AgentBinding } from "../lib/agent-contract";
import { project, thread } from "./fixtures";
import { AgentAvatar } from "../components/agent-avatar";

const seen = vi.hoisted(() => vi.fn());
vi.mock("bot-avatars", async importOriginal => {
  const actual = await importOriginal<typeof import("bot-avatars")>();
  return { ...actual, BotAvatar: (props: BotAvatarProps) => { seen(props); return <span data-testid="canvas-pebble" />; } };
});
let reduce = false;
let motionChanged: () => void;
let intersect: IntersectionObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
  reduce = false; seen.mockClear(); disconnect.mockClear();
  vi.stubGlobal("Path2D", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduce; }, addEventListener: (_kind: string, callback: () => void) => { motionChanged = callback; }, removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { intersect = callback; } observe() {} disconnect() { disconnect(); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem("project-workspace.bots-collapsed.v1"); });
const latest = () => seen.mock.calls.at(-1)![0] as BotAvatarProps;
describe("Selected Pebble mascot", () => {
  it("uses the selected soft material, original color and gentle noninteractive motion for every legacy avatar", () => {
    const ui = render(<AgentAvatar avatar="owl" seedKey="first" color="#b5a0e3" size={32} motion="calm" />);
    expect(latest()).toMatchObject({ type: "pebble", shading: "smooth", face: "mouth", color: "#b5a0e3", size: 32, depth: .7, saturation: 1.05, speed: .75, turn: .42, interactive: false, jumpEvery: 0, jumpSpin: 0, state: "default", paused: false });
    const firstSeed = latest().seed;
    ui.rerender(<AgentAvatar avatar="ghost" seedKey="second" color="#80cbc4" size={32} motion="calm" />);
    expect(latest().type).toBe("pebble"); expect(latest().color).toBe("#80cbc4"); expect(latest().seed).not.toBe(firstSeed);
    const stable = latest().seed; ui.rerender(<AgentAvatar avatar="ghost" seedKey="second" color="#e8b77b" size={32} motion="calm" />); expect(latest().seed).toBe(stable);
  });
  it("pauses dynamically for reduced motion, offscreen content, static settings and attentive questions", () => {
    const ui = render(<AgentAvatar avatar="ghost" color="#80cbc4" motion="working" />);
    expect(latest().paused).toBe(false);
    act(() => { reduce = true; motionChanged(); }); expect(latest().paused).toBe(true); expect(ui.container.firstElementChild?.hasAttribute("data-paused")).toBe(true);
    act(() => { reduce = false; motionChanged(); }); expect(latest().paused).toBe(false);
    act(() => intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(latest().paused).toBe(true);
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(latest().paused).toBe(false);
    ui.rerender(<AgentAvatar avatar="ghost" color="#80cbc4" motion="waiting" />); expect(latest()).toMatchObject({ paused: true, pose: { yaw: -.09, pitch: -.12, roll: -.075 } });
    ui.rerender(<AgentAvatar avatar="ghost" color="#80cbc4" />); expect(latest().paused).toBe(true); expect(latest().pose).toBeUndefined();
    ui.unmount(); expect(disconnect).toHaveBeenCalled();
  });
  it("renders a soft Pebble fallback when Canvas is unavailable instead of a blank identity", () => {
    vi.stubGlobal("Path2D", undefined);
    const ui = render(<AgentAvatar avatar="robot" color="#d59bbd" size={32} />);
    expect(seen).not.toHaveBeenCalled(); expect(ui.container.querySelector("svg.pw-pebble-fallback path")?.getAttribute("d")).toBeTruthy(); expect(ui.container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(ui.container.firstElementChild?.getAttribute("aria-hidden")).toBe("true"); expect(ui.container.firstElementChild?.hasAttribute("data-paused")).toBe(true);
  });
  it("editing the new single Pebble presentation keeps the persisted legacy identity and only saves the chosen color", async () => {
    const app = await loadPluginApp(() => import("../app"));
    const bot: AgentProfile = { id: "existing", name: "Reviewer", role: "Code review", avatar: "owl", color: "#80cbc4", instructions: "Review code.", soul: "Calm personality.", sharedRules: "", defaults: {}, basis: null, revision: 1, hash: "1", createdAt: 1, updatedAt: 1 };
    const save = vi.fn(async fields => ({ ...bot, ...fields, revision: 2 }));
    const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: "alpha", isCompactViewport: false, onNavigate() {}, searchQuery: "" }, {
      rpc: { listSpecialists: async () => ({ profiles: [bot], bindings: [], legacy: [] }), saveSpecialist: save },
      sidebarThreads: { status: "ready", projects: [project("alpha")], sections: [], threads: [] }, sdk: { projects: { list: async () => [] } },
    });
    fireEvent.click(await slot.findByRole("button", { name: "Select bot Reviewer" })); fireEvent.click(slot.getByRole("tab", { name: "Profile" })); fireEvent.click(slot.getByRole("button", { name: "Edit profile" }));
    const dialog = within(document.body).getByRole("dialog"), editor = within(dialog);
    expect(editor.getByText("Pebble")).toBeTruthy(); expect(editor.queryByRole("button", { name: "owl avatar" })).toBeNull(); expect(latest().paused).toBe(true);
    fireEvent.click(editor.getByRole("button", { name: "Color #b5a0e3" })); fireEvent.click(editor.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce()); expect(save.mock.calls[0]![0]).toMatchObject({ id: "existing", expectedRevision: 1, avatar: "owl", color: "#b5a0e3", instructions: "Review code.", soul: "Calm personality." });
  });
  it("gives real questions precedence over working motion and stops hidden collapsed bots", async () => {
    const app = await loadPluginApp(() => import("../app"));
    const bot: AgentProfile = { id: "bot", name: "Reviewer", role: "Code review", avatar: "owl", color: "#80cbc4", instructions: "Review code.", soul: "", sharedRules: "", defaults: {}, basis: null, revision: 1, hash: "1", createdAt: 1, updatedAt: 1 };
    const binding = (threadId: string): AgentBinding => ({ threadId, agentId: "bot", projectId: "alpha", createdAt: 1, loadedHash: null, loadedAt: null, coordinationAllowed: false, coordinationWork: null, state: "pending" });
    const slot = renderSlot(app.threadLists[0]!, { activeThreadId: "work", activeProjectId: "alpha", isCompactViewport: false, onNavigate() {}, searchQuery: "" }, {
      rpc: { listSpecialists: async () => ({ profiles: [bot], bindings: [binding("question"), binding("work")], legacy: [] }) },
      sidebarThreads: { status: "ready", projects: [project("alpha")], sections: [], threads: [thread("question", "alpha", { hasPendingInteraction: true }), thread("work", "alpha", { runtimeStatus: "active" })] },
      sdk: { projects: { list: async () => [] }, threads: { interactions: { list: async () => [] } } },
    });
    const row = await slot.findByRole("button", { name: "Select bot Reviewer" });
    expect(row.querySelector(".pw-agent-avatar")?.getAttribute("data-motion")).toBe("waiting"); expect(latest().size).toBe(32); expect(latest().paused).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: /^Bots/ })); await waitFor(() => expect(row.querySelector(".pw-agent-avatar")?.getAttribute("data-motion")).toBe("still")); expect(latest().paused).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: /^Bots/ })); expect(row.querySelector(".pw-agent-avatar")?.getAttribute("data-motion")).toBe("waiting");
  });
});
