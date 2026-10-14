import { describe, expect, it } from "vitest";
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";
import { applyWorkspaceMode, workspaceModeFromProviders } from "../lib/workspace-mode";
function fixture(conflict = false) {
  const preferences = { "sidebar.threadListProvider": { value: "thread-list/thread-list", revision: 4 } };
  const calls: unknown[] = [];
  const api = {
    list: async () => ({ preferences: structuredClone(preferences) }),
    set: async (input: { key: keyof typeof preferences; expectedRevision: number; value: string }) => {
      calls.push(input);
      const entry = preferences[input.key];
      if (conflict || entry.revision !== input.expectedRevision) throw new Error("Settings conflict");
      entry.value = input.value; entry.revision += 1;
      return { key: input.key, ...entry };
    },
  };
  const sdk = { system: { uiPreferences: api } } as unknown as PluginBrowserBbSdk;
  return { sdk, calls, preferences };
}
describe("A5 layout settings on BB 0.46", () => {
  it("recognizes modes without the removed navigationProvider preference", () => {
    expect(workspaceModeFromProviders("project-workspace/workspace")).toBe("workspace");
    expect(workspaceModeFromProviders("thread-list/thread-list")).toBe("default");
    expect(workspaceModeFromProviders("other/list")).toBe("custom");
  });
  it("switches and restores using current per-key revisions", async () => {
    const f = fixture(); await applyWorkspaceMode(f.sdk, "workspace");
    await applyWorkspaceMode(f.sdk, "default");
    expect(f.calls).toEqual([
      { key: "sidebar.threadListProvider", value: "project-workspace/workspace", expectedRevision: 4 },
      { key: "sidebar.threadListProvider", value: "thread-list/thread-list", expectedRevision: 5 },
    ]);
    expect(f.preferences["sidebar.threadListProvider"].value).toBe("thread-list/thread-list");
  });
  it("does not write an already selected mode", async () => {
    const f = fixture(); await applyWorkspaceMode(f.sdk, "default");
    expect(f.calls).toEqual([]);
  });
  it("leaves the selection intact on a concurrent preference conflict", async () => {
    const f = fixture(true); await expect(applyWorkspaceMode(f.sdk, "workspace")).rejects.toThrow("Settings conflict");
    expect(f.preferences["sidebar.threadListProvider"].value).toBe("thread-list/thread-list");
  });
});
