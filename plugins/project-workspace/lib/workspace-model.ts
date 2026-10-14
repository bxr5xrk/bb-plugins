import type { PluginSidebarThread, PluginSidebarSection, PluginSidebarThreadRowStatus } from "@get-bb/plugin-sdk/app";

export type Lifecycle = "active" | "archived" | "all";
export function projectThreads(threads: readonly PluginSidebarThread[], projectId: string | null,
  query = "", lifecycle: Lifecycle = "active") {
  const needle = query.trim().toLocaleLowerCase();
  return threads.filter(t => t.projectId === projectId && !t.isHidden &&
    (lifecycle === "all" || t.isArchived === (lifecycle === "archived")) &&
    (!needle || [t.displayTitle, t.providerId, t.environment?.branchName, t.host?.name]
      .some(value => value?.toLocaleLowerCase().includes(needle))))
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) ||
      (a.isPinned && b.isPinned ? (a.pinSortKey ?? "~").localeCompare(b.pinSortKey ?? "~") : 0) ||
      sessionPriority(a) - sessionPriority(b) ||
      b.latestAttentionAt - a.latestAttentionAt || a.id.localeCompare(b.id));
}

export const SESSION_ROW_HEIGHT = 80;
export type SessionItem = { kind: "section"; id: string; title: string; count: number; height: 36 } |
  { kind: "thread"; id: string; thread: PluginSidebarThread; height: typeof SESSION_ROW_HEIGHT };
export function sessionItems(threads: readonly PluginSidebarThread[], sections: readonly PluginSidebarSection[],
  collapsed: ReadonlySet<string>): SessionItem[] {
  const sectionIds = new Set(sections.map(section => section.id));
  const groups = [
    { id: "__pinned", title: "Pinned", threads: threads.filter(thread => thread.isPinned) },
    ...sections.map(section => ({ id: section.id, title: section.name,
      threads: threads.filter(thread => !thread.isPinned && thread.sectionId === section.id) })),
    { id: "__threads", title: "Sessions", threads: threads.filter(thread => !thread.isPinned &&
      (!thread.sectionId || !sectionIds.has(thread.sectionId))) },
  ];
  return groups.flatMap(({ id, title, threads }): SessionItem[] => threads.length ? [
    { kind: "section", id, title, count: threads.length, height: 36 },
    ...(collapsed.has(id) ? [] : threads.map((thread): SessionItem => ({ kind: "thread", id: thread.id, thread, height: SESSION_ROW_HEIGHT }))),
  ] : []);
}

export type ExplorerSource = { threadId: string; projectId: string; hostId: string;
  environmentId: string | null; root: string; label: string };
// No implicit primary-host fallback. An explicitly selected session is required.
export function explorerSource(thread: PluginSidebarThread | undefined, projectId: string | null): ExplorerSource | null {
  const root = thread?.environment?.path;
  if (!thread || thread.projectId !== projectId || !thread.host?.id || !root || !absolutePath(root)) return null;
  return { threadId: thread.id, projectId: thread.projectId, hostId: thread.host.id,
    environmentId: thread.environment?.id ?? null, root: normalizePath(root),
    label: `${thread.host.name}${thread.environment?.branchName || thread.environment?.name ?
      ` · ${thread.environment.branchName ?? thread.environment.name}` : ""}` };
}

export function normalizePath(value: string) {
  const path = value.replace(/\\/g, "/");
  return /^[a-zA-Z]:\/$/.test(path) ? path : path.replace(/\/+$/, "") || "/";
}
export function absolutePath(value: string) { return /^(\/|[a-zA-Z]:[\\/])/.test(value) && !value.includes("\0"); }
export function relativeInside(root: string, path: string): string | null {
  const base = normalizePath(root), target = normalizePath(path);
  if (!absolutePath(target) || target.split("/").some(p => p === "." || p === "..")) return null;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return target.startsWith(prefix) ? target.slice(prefix.length) : null;
}
export function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }


export type SessionStatus = { kind: "working" | "waiting" | "queued" | "error" | "idle" | "unread" | "goal" | "draft" | "success"; label: string; animated?: boolean };
// Execution is separate from durable goal/plan state. A goal alone never spins.
export function sessionStatus(thread: PluginSidebarThread, row: PluginSidebarThreadRowStatus | null = null, hasDraft = false): SessionStatus {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return { kind: "waiting", label: "Needs input" };
  if (thread.runtimeStatus === "error" || thread.queuedWork === "failed" || thread.indicator === "queued-failed" || thread.indicator === "unread-error" || row?.tone === "error") return { kind: "error", label: thread.queuedWork === "failed" || thread.indicator === "queued-failed" ? "Send failed" : row?.label ?? "Error" };
  if (thread.runtimeStatus === "waiting-for-host") return { kind: "waiting", label: "Waiting for host" };
  if (["active", "starting", "stopping", "provisioning"].includes(thread.runtimeStatus)) return { kind: "working", label: ({ active: "Working", starting: "Starting", stopping: "Stopping", provisioning: "Preparing workspace" } as Record<string, string>)[thread.runtimeStatus]!, animated: true };
  if (row?.tone === "running" && !thread.activity.goals && thread.indicator !== "goal") return { kind: "working", label: row.label, animated: true };
  if (thread.activity.backgroundAgents > 0 || thread.activity.backgroundCommands > 0 || thread.activity.workflows > 0) return { kind: "working", label: "Background work", animated: true };
  if (thread.queuedWork === "waiting" || thread.runtimeStatus === "pending" || thread.indicator === "queued-waiting") return { kind: "queued", label: "Queued" };
  if (thread.isArchived) return { kind: "idle", label: "Archived" };
  if (thread.isUnread) return { kind: "unread", label: "Unread reply" };
  if (thread.activity.goals > 0 || thread.indicator === "goal") return { kind: "goal", label: "Goal active · idle" };
  if (hasDraft || thread.indicator === "draft") return { kind: "draft", label: "Draft" };
  if (row?.tone === "success") return { kind: "success", label: row.label };
  return { kind: "idle", label: row?.label ?? "Idle" };
}
export function sessionPriority(thread: PluginSidebarThread) {
  if (thread.isArchived) return 3;
  const status = sessionStatus(thread);
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return 0;
  if (status.kind === "working" || status.kind === "waiting" || status.kind === "queued") return 1;
  if (status.kind === "unread" || status.kind === "error") return 2;
  return 3;
}
export function projectAttention(threads: readonly PluginSidebarThread[], projectId: string) {
  const counts = { waiting: 0, working: 0, queued: 0, host: 0, unread: 0, error: 0 };
  let priority = 3, latestAttentionAt = 0;
  for (const thread of threads) {
    if (thread.projectId !== projectId || thread.isHidden || thread.isArchived) continue;
    priority = Math.min(priority, sessionPriority(thread));
    latestAttentionAt = Math.max(latestAttentionAt, thread.latestAttentionAt);
    const kind = sessionStatus(thread).kind;
    if (kind === "waiting" && !thread.hasPendingInteraction && thread.indicator !== "waiting-for-input") counts.host++;
    else if (kind === "waiting" || kind === "working" || kind === "queued" || kind === "unread" || kind === "error") counts[kind]++;
  }
  return { counts, priority, latestAttentionAt };
}
export function sessionLocation(thread: PluginSidebarThread) {
  const root = thread.environment?.path?.replace(/\\/g, "/").replace(/\/+$/, "");
  const basename = root?.split("/").at(-1);
  const folder = basename?.startsWith("thr_") ? null : basename;
  const branch = thread.environment?.branchName;
  return branch ? `${folder ? `${folder}/` : ""}${branch}` : folder ?? thread.environment?.name ?? (basename?.startsWith("thr_") ? "Personal workspace" : "No workspace");
}
export function sessionAge(timestamp: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
export const PROJECT_RAIL_WIDTH_KEY = "project-workspace.project-rail-width.v1";
export function clampProjectWidth(value: number, containerWidth: number) {
  const maximum = Math.min(340, Math.max(140, containerWidth - 220));
  return Math.min(maximum, Math.max(140, Number.isFinite(value) ? value : 200));
}
export function projectColor(id: string) {
  let hash = 0; for (const letter of id) hash = ((hash * 31) + letter.charCodeAt(0)) >>> 0;
  return ["#80cbc4", "#b5a0e3", "#e8b77b", "#a4bfdf", "#b0cc89", "#d59bbd"][hash % 6]!;
}
