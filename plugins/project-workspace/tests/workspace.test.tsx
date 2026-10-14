import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPluginApp, mountPluginContentScripts, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import { renderSlot } from "./render-slot";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { project, thread, catalogProject } from "./fixtures";
import { explorerSource, normalizePath, relativeInside } from "../lib/workspace-model";
import { openWorkspacePreview, registerNativePreview } from "../lib/native-preview";

const app = await loadPluginApp(() => import("../app"));
const registration = app.threadLists[0]!;
const props = { activeThreadId: "alpha-chat", activeProjectId: "alpha", isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" };
function setup(options: RenderSlotOptions = {}) {
  return renderSlot(registration, props, { rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) }, sidebarThreads: { status: "ready", projects: [project("alpha"), project("beta")],
    threads: [thread("alpha-chat", "alpha"), thread("beta-chat", "beta")], sections: [] },
    sdk: { projects: { list: async () => [catalogProject("alpha"), catalogProject("beta"), catalogProject("empty")] } }, ...options });
}
afterEach(() => { cleanup(); document.querySelectorAll('[data-testid="app-layout-root"]').forEach(n => n.remove()); });

describe("Workspace acceptance", () => {
  it("A1 filters adjacent sessions by project and includes empty projects from the real catalog", async () => {
    const slot = setup();
    await slot.findByRole("button", { name: "empty" });
    expect(slot.getByText("alpha-chat")).toBeTruthy();
    expect(slot.queryByText("beta-chat")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "beta" }));
    expect(slot.queryByText("alpha-chat")).toBeNull();
    expect(slot.getByText("beta-chat")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "empty" }));
    expect(slot.getByText("No sessions in this project yet.")).toBeTruthy();
    expect(slot.inspection.navigateCalls).toHaveLength(0); // Switching projects does not replace native chat.
  });

  it("A2 searches within the project, shows sections, preserves shortcuts and host-owned new/open/delete actions", async () => {
    const user = userEvent.setup();
    const requestDelete = vi.fn(async () => {});
    const slot = setup({ threadActions: () => [{ key: "bb--core/delete", pluginId: "bb--core", group: "danger", action: { label: "Delete…", icon: "Trash2", run: requestDelete } }], sidebarThreads: { projects: [project("alpha")], threads: [
      thread("alpha-chat", "alpha", { sectionId: "ideas" }), thread("another", "alpha"), thread("alpha-hidden", "alpha", { isHidden: true }),
    ], sections: [{ id: "ideas", name: "Ideas", createdAt: 1, updatedAt: 1 }] } });
    await slot.findByText("alpha-chat");
    expect(slot.getByRole("button", { name: /Sessions/ })).toBeTruthy();
    expect(slot.getByRole("button", { name: /Ideas/ })).toBeTruthy();
    expect(slot.queryByText("alpha-hidden")).toBeNull();
    const link = slot.getByText("alpha-chat").closest("a")!;
    expect(link.getAttribute("data-sidebar-thread-id")).toBe("alpha-chat");
    expect(link.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    fireEvent.change(slot.getByRole("textbox", { name: "Search project sessions" }), { target: { value: "another" } });
    expect(slot.queryByText("alpha-chat")).toBeNull();
    expect(slot.getByText("another")).toBeTruthy();
    fireEvent.click(slot.getByText("another"));
    expect(slot.inspection.navigateCalls.some(call => call.method === "toThread")).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: "New session in selected project" }));
    expect(slot.inspection.navigateCalls.some(call => call.method === "toCompose")).toBe(true);
    await user.pointer({ keys: "[MouseRight]", target: slot.getByText("another") });
    await user.click(await within(document.body).findByRole("menuitem", { name: "Delete…" }));
    expect(requestDelete).toHaveBeenCalledOnce();
    expect(slot.inspection.sdkCalls.some(call => call.method === "threads.delete")).toBe(false);
  });

  it("A2 exposes archive page loading instead of pretending all archives are loaded", async () => {
    const fetchNextPage = vi.fn(async () => {});
    const slot = setup({ sidebarThreads: { projects: [project("alpha")], threads: [thread("archived-chat", "alpha", { isArchived: true })],
      experimental_archived: { status: "ready", hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage } } });
    fireEvent.change(slot.getByRole("combobox", { name: "Session lifecycle" }), { target: { value: "archived" } });
    expect(slot.getByText("archived-chat")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Load more archived sessions" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("A2 offers recovery when the first archived page fails without a next page", async () => {
    const fetchNextPage = vi.fn(async () => {});
    const slot = setup({ sidebarThreads: { projects: [project("alpha")], threads: [],
      experimental_archived: { status: "error", hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage } } });
    fireEvent.change(slot.getByRole("combobox", { name: "Session lifecycle" }), { target: { value: "archived" } });
    expect(slot.getByRole("alert").textContent).toContain("Could not load archived sessions.");
    fireEvent.click(slot.getByRole("button", { name: "Retry archives" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("A3 lazy folders use explicit host and workspace-relative preview, with error and retry", async () => {
    const header = renderSlot(app.threadHeaderActions[0]!, { threadId: "alpha-chat", projectId: "alpha", isCompactViewport: false }, { openFilePreview: () => true });
    let failed = false;
    const directory = vi.fn(async ({ path }: { path?: string }) => {
      if (path === "/work/alpha/src") {
        if (!failed) { failed = true; throw new Error("Machine offline"); }
        return { directory: path, parent: "/work/alpha", entries: [{ name: "index.ts", kind: "file" as const, path: `${path}/index.ts` }] };
      }
      return { directory: path!, parent: "/work", entries: [
        { name: "src", kind: "directory" as const, path: "/work/alpha/src" },
        { name: "escape", kind: "file" as const, path: "/work/alpha/../secret" },
      ] };
    });
    const slot = setup({ sdk: { projects: { list: async () => [], get: async ({ projectId }) => ({ ...catalogProject(projectId), sources: [{ id: `src-${projectId}`, projectId, hostId: `host-${projectId}`, path: `/work/${projectId}`, isDefault: true, type: "local_path", createdAt: 1, updatedAt: 1 }] }) }, hosts: { directory } } });
    fireEvent.click(slot.getByRole("tab", { name: "Explorer" }));
    const folder = await slot.findByRole("button", { name: "src" });
    expect(directory).toHaveBeenCalledTimes(1);
    expect(slot.queryByText("escape")).toBeNull();
    fireEvent.click(folder);
    await slot.findByText("Machine offline");
    fireEvent.click(slot.getByRole("button", { name: "Retry folder" }));
    fireEvent.click(await slot.findByText("index.ts"));
    expect(header.inspection.navigateCalls).toContainEqual({ method: "experimental_openFilePreview", options: {
      target: { kind: "host", hostId: "host-alpha", path: "/work/alpha/src/index.ts" }, location: null,
    } });
    expect(slot.inspection.sdkCalls.filter(call => call.method === "hosts.directory").every(call => (call.args[0] as { hostId: string }).hostId === "host-alpha")).toBe(true);
  });

  it("A3 routes previews through the active native surface and disposes only its own opener", async () => {
    const options = { target: { kind: "host" as const, hostId: "host-alpha", path: "/work/alpha/a.ts" }, location: null };
    expect(openWorkspacePreview(null, options)).toBe(false);
    const old = registerNativePreview("alpha-chat", () => true);
    const current = registerNativePreview("alpha-chat", () => false);
    old();
    expect(openWorkspacePreview("alpha-chat", options)).toBe(false);
    const header = renderSlot(app.threadHeaderActions[0]!, { threadId: "beta-chat", projectId: "beta", isCompactViewport: false }, { openFilePreview: () => true });
    await waitFor(() => expect(openWorkspacePreview("beta-chat", options)).toBe(true));
    expect(header.inspection.navigateCalls).toContainEqual({ method: "experimental_openFilePreview", options });
    header.unmount(); current();
    expect(openWorkspacePreview("beta-chat", options)).toBe(false);
    expect(openWorkspacePreview("alpha-chat", options)).toBe(false);
  });

  it("A3 shows read-only code without an open native session surface", async () => {
    const slot = setup({ sdk: { hosts: { directory: async () => ({
      directory: "/work/alpha", parent: "/work", entries: [{ name: "a.ts", path: "/work/alpha/a.ts", kind: "file" }],
    }) }, projects: { list: async () => [], get: async () => ({ ...catalogProject("alpha"), sources: [{ id: "source", projectId: "alpha", hostId: "host-alpha", path: "/work/alpha", isDefault: true, type: "local_path", createdAt: 1, updatedAt: 1 }] }) }, files: { read: async () => ({ path: "/work/alpha/a.ts", sha256: "hash", content: "const ready = true;", contentEncoding: "utf8", mimeType: "text/plain", sizeBytes: 19 }) } } });
    fireEvent.click(slot.getByRole("tab", { name: "Explorer" }));
    fireEvent.click(await slot.findByText("a.ts"));
    await slot.findByRole("dialog");
    await within(document.body).findByText("const ready = true;");
    expect(slot.inspection.navigateCalls).toHaveLength(0);
  });

  it("A3 switching project cancels in-flight requests and never retains the previous Explorer source", async () => {
    let resolve!: (value: { directory: string; parent: null; entries: { name: string; kind: "file"; path: string }[] }) => void;
    let signal: AbortSignal | undefined;
    const slot = setup({ sdk: { projects: { list: async () => [], get: async ({ projectId }) => ({ ...catalogProject(projectId), sources: [{ id: `src-${projectId}`, projectId, hostId: `host-${projectId}`, path: `/work/${projectId}`, isDefault: true, type: "local_path", createdAt: 1, updatedAt: 1 }] }) }, hosts: { directory: async args => {
      if (args.path === "/work/alpha") { signal = args.signal; return await new Promise(done => { resolve = done; }); }
      return { directory: args.path!, parent: null, entries: [{ name: "beta.ts", kind: "file", path: "/work/beta/beta.ts" }] };
    } } } });
    fireEvent.click(slot.getByRole("tab", { name: "Explorer" }));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(slot.getByRole("button", { name: "beta" }));
    expect(signal?.aborted).toBe(true);
    expect(slot.queryByRole("combobox", { name: "Explorer session workspace" })).toBeNull();
    expect(slot.queryByText(/Machine alpha/)).toBeNull();
    await act(async () => { resolve({ directory: "/work/alpha", parent: null, entries: [{ name: "stale.ts", kind: "file", path: "/work/alpha/stale.ts" }] }); });
    expect(slot.queryByText("stale.ts")).toBeNull();
    expect(await slot.findByText("beta.ts")).toBeTruthy();
  });

  it("A3 cannot infer a different machine when explicit host or workspace path is unavailable", () => {
    expect(explorerSource(thread("no-host", "alpha", { host: null }), "alpha")).toBeNull();
    expect(explorerSource(thread("wrong-project", "beta"), "alpha")).toBeNull();
    expect(relativeInside("/work/alpha", "/work/alphabet/secret")).toBeNull();
    expect(relativeInside("/work/alpha", "/work/alpha/../secret")).toBeNull();
    expect(relativeInside("/work/alpha", "/work/alpha/src/a.ts")).toBe("src/a.ts");
    expect(normalizePath("C:\\")).toBe("C:/");
    expect(relativeInside("C:\\", "C:\\src\\a.ts")).toBe("src/a.ts");
    expect(relativeInside("C:\\", "D:\\secret")).toBeNull();
  });

  it("A4 uses only public SDK and never registers a chat replacement, file writes, provider or private imports", async () => {
    const scan = experimental_scanPublicSdkOnly(process.cwd(), { allow: [/^@get-bb\/plugin-sdk\/testing(?:\/app)?$/, /^react(?:\/.*)?$/, /^@radix-ui\//, /^@testing-library\//, /^vitest(?:\/.*)?$/, /^zod$/, /^bot-avatars$/] });
    expect(scan.violations).toEqual([]); expect(scan.privateDependencies).toEqual([]);
    expect(app.navPanels).toHaveLength(0); expect(app.fileOpeners).toHaveLength(0); expect(app.composerCustomizations).toHaveLength(0);
  });

  it("A5 injected shell style forwards native resize and fully disposes without editing native width", async () => {
    const root = document.createElement("div"); root.dataset.testid = "app-layout-root";
    const panel = document.createElement("div"); panel.dataset.sidebar = "panel";
    panel.style.setProperty("--sidebar-width", "290px"); root.append(panel);
    const marker = document.createElement("div"); marker.dataset.projectWorkspaceSidebar = ""; root.append(marker); document.body.append(root);
    const scripts = await mountPluginContentScripts(app, { pluginId: "project-workspace", generation: 1 });
    expect(document.querySelectorAll("[data-project-workspace-style]")).toHaveLength(1);
    panel.style.setProperty("--sidebar-width", "420px");
    await waitFor(() => expect(root.style.getPropertyValue("--project-workspace-width")).toBe("420px"));
    await scripts.lifecycle.dispose();
    expect(document.querySelector("[data-project-workspace-style]")).toBeNull();
    expect(root.style.getPropertyValue("--project-workspace-width")).toBe("");
    expect(panel.style.getPropertyValue("--sidebar-width")).toBe("420px");
  });

  it("A6 compact clients have a keyboard-accessible project picker and selected-project new session", async () => {
    const slot = renderSlot(registration, { ...props, isCompactViewport: true }, { sidebarThreads: { projects: [project("alpha"), project("beta")], threads: [thread("alpha-chat", "alpha")], sections: [] }, sdk: { projects: { list: async () => [], get: async ({ projectId }) => ({ ...catalogProject(projectId), sources: [{ id: `src-${projectId}`, projectId, hostId: `host-${projectId}`, path: `/work/${projectId}`, isDefault: true, type: "local_path", createdAt: 1, updatedAt: 1 }] }) } } });
    fireEvent.click(slot.getByRole("button", { name: "Choose project" }));
    expect(slot.container.querySelector("[data-project-workspace-sidebar]")?.hasAttribute("data-picker")).toBe(true);
    expect(document.activeElement).toBe(slot.getByRole("button", { name: "alpha" }));
    fireEvent.click(slot.getByRole("button", { name: "beta" }));
    expect(slot.container.querySelector("[data-project-workspace-sidebar]")?.hasAttribute("data-picker")).toBe(false);
    expect(document.activeElement).toBe(slot.getByRole("button", { name: "Choose project" }));
    fireEvent.click(slot.getByRole("button", { name: "New session in selected project" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toCompose", options: { projectId: "beta", focusPrompt: true } });
  });
});
