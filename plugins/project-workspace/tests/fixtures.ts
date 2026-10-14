import type { PluginSidebarThread, PluginSidebarProject } from "@get-bb/plugin-sdk/app";
export function project(id: string, name = id): PluginSidebarProject {
  return { id, name, isPersonal: id === "personal", href: `/projects/${id}`, settingsHref: `/settings/projects/${id}` };
}
export function thread(id: string, projectId: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id, projectId, title: id, titleFallback: null, displayTitle: id, parentThreadId: null,
    lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null, originKind: null, originPluginId: null,
    providerId: "codex", status: "idle", runtimeStatus: "idle", queuedWork: "none", hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: null, isUnread: false, isPinned: false, pinnedAt: null, pinSortKey: null,
    isArchived: false, archivedAt: null, href: `/projects/${projectId}/threads/${id}`, isHidden: false,
    environment: { id: `env-${id}`, name: null, branchName: "main", path: `/work/${projectId}`,
      isWorktree: false, providerId: null, workspaceDisplayKind: null },
    host: { id: `host-${projectId}`, name: `Machine ${projectId}` }, createdAt: 1, updatedAt: 1,
    lastReadAt: null, latestAttentionAt: 1, ...overrides,
  };
}
export function catalogProject(id: string) {
  return { id, name: id, kind: "standard" as const, createdAt: 1, updatedAt: 1, sources: [], gitRemoteUrl: null };
}
