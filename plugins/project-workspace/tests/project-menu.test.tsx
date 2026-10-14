import { afterEach, expect, it, vi } from "vitest";
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import { HIDDEN_PROJECTS_KEY, PROJECTS_COLLAPSED_KEY } from "../components/project-workspace";
import { project, thread } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
const setup = () => renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "",
}, {
  rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) },
  sidebarThreads: { status: "ready", projects: [project("alpha"), project("beta")], threads: [thread("chat", "alpha")], sections: [] },
  sdk: { projects: { list: async () => [] }, hosts: { list: async () => [] } },
});
afterEach(() => { cleanup(); localStorage.removeItem(HIDDEN_PROJECTS_KEY); localStorage.removeItem(PROJECTS_COLLAPSED_KEY); vi.restoreAllMocks(); });

it("collapses projects independently, persists the state and keeps adding a project reachable", async () => {
  const user = userEvent.setup(), slot = setup();
  const heading = slot.getByRole("button", { name: "Projects" });
  const bots = slot.getByRole("button", { name: /^Bots/ });
  await user.click(heading);
  expect(heading.getAttribute("aria-expanded")).toBe("false");
  expect(bots.getAttribute("aria-expanded")).toBe("true");
  expect(slot.queryByRole("button", { name: "alpha" })).toBeNull();
  const content = document.getElementById(heading.getAttribute("aria-controls")!)!;
  expect(content.hasAttribute("inert")).toBe(true);
  expect(slot.getByRole("tab", { name: "Sessions" }).getAttribute("aria-selected")).toBe("true");
  await user.click(slot.getByRole("button", { name: "Add project" }));
  expect(slot.getByRole("textbox", { name: "Project name" })).toBeTruthy();
  await user.click(slot.getByRole("button", { name: "Cancel" }));
  slot.unmount();
  const reopened = setup(), restored = reopened.getByRole("button", { name: "Projects" });
  expect(restored.getAttribute("aria-expanded")).toBe("false");
  restored.focus(); await user.keyboard("{Enter}");
  expect(restored.closest(".pw-rail-section")?.hasAttribute("data-instant")).toBe(true);
  expect(reopened.getByRole("button", { name: "alpha" }).getAttribute("aria-pressed")).toBe("true");
});

it("still toggles projects when client storage is unavailable", async () => {
  const user = userEvent.setup(), slot = setup();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  const heading = slot.getByRole("button", { name: "Projects" });
  await user.click(heading); expect(heading.getAttribute("aria-expanded")).toBe("false");
  await user.click(heading); expect(slot.getByRole("button", { name: "alpha" })).toBeTruthy();
});

it("right-click opens project actions without selecting or navigating and targets the requested project", async () => {
  const user = userEvent.setup(), slot = setup();
  const selected = slot.getByRole("button", { name: "alpha" });
  await user.pointer({ keys: "[MouseRight]", target: slot.getByRole("button", { name: "beta" }) });
  expect(selected.getAttribute("aria-pressed")).toBe("true");
  const menu = within(document.body).getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Project settings" }).getAttribute("href")).toBe("/settings/projects/beta");
  await user.click(within(menu).getByRole("menuitem", { name: "New session" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toCompose", options: { projectId: "beta", focusPrompt: true } });
});

it("hides the selected project persistently, selects a visible project, and restores without deleting data", async () => {
  const user = userEvent.setup(), slot = setup();
  await user.pointer({ keys: "[MouseRight]", target: slot.getByRole("button", { name: "alpha" }) });
  await user.click(within(document.body).getByRole("menuitem", { name: "Hide from list" }));
  expect(slot.queryByRole("button", { name: "alpha" })).toBeNull();
  expect(slot.getByRole("button", { name: "beta" }).getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(slot.getByRole("button", { name: "beta" })));
  expect(JSON.parse(localStorage.getItem(HIDDEN_PROJECTS_KEY)!)).toEqual(["alpha"]);
  expect(slot.inspection.sdkCalls.some(call => call.method === "projects.delete")).toBe(false);
  slot.unmount();
  const reopened = setup();
  expect(reopened.queryByRole("button", { name: "alpha" })).toBeNull();
  await user.click(reopened.getByRole("button", { name: "Hidden projects (1)" }));
  await user.click(within(document.body).getByRole("menuitem", { name: "Show alpha" }));
  expect(reopened.getByRole("button", { name: "alpha" })).toBeTruthy();
  expect(reopened.queryByRole("button", { name: "Hidden projects (1)" })).toBeNull();
});

it("supports keyboard menu/Escape, and retains the project if saving visibility fails", async () => {
  const user = userEvent.setup(), slot = setup(), row = slot.getByRole("button", { name: "alpha" });
  row.focus(); await user.keyboard("{Shift>}{F10}{/Shift}");
  expect(within(document.body).getByRole("menu")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(row);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await user.pointer({ keys: "[MouseRight]", target: row });
  await user.click(within(document.body).getByRole("menuitem", { name: "Hide from list" }));
  expect(slot.getByRole("alert").textContent).toContain("Storage unavailable");
  expect(slot.getByRole("button", { name: "alpha" })).toBeTruthy();
});

it("keeps restoration reachable when all projects are hidden and tolerates invalid saved state", async () => {
  localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify(["alpha", "beta"]));
  const slot = setup();
  expect(slot.getByText("Choose or restore a project to see its sessions.")).toBeTruthy();
  expect(slot.getByRole("button", { name: "Hidden projects (2)" })).toBeTruthy();
  slot.unmount(); localStorage.setItem(HIDDEN_PROJECTS_KEY, "broken");
  expect(setup().getByRole("button", { name: "alpha" })).toBeTruthy();
});
