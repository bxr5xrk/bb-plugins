import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";

export const PROVIDERS = {
  workspace: "project-workspace/workspace",
  default: "thread-list/thread-list",
} as const;
export type WorkspaceMode = keyof typeof PROVIDERS;
export function workspaceModeFromProviders(threadList: string): WorkspaceMode | "custom" {
  for (const mode of ["workspace", "default"] as const) {
    if (threadList === PROVIDERS[mode]) return mode;
  }
  return "custom";
}
export async function applyWorkspaceMode(sdk: PluginBrowserBbSdk, mode: WorkspaceMode) {
  const api = sdk.system.uiPreferences;
  const { preferences } = await api.list();
  const key = "sidebar.threadListProvider";
  const before = preferences[key];
  if (before.value === PROVIDERS[mode]) return;
  await api.set({ key, expectedRevision: before.revision, value: PROVIDERS[mode] });
}
