import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useBbNavigate, useRpc, useRealtime, useRealtimeConnectionState, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import * as Menu from "@radix-ui/react-context-menu";
import type { rpcContract, AgentProfile, AgentBinding, LegacyAgent } from "../lib/agent-contract";
import { errorMessage, projectAttention, sessionPriority } from "../lib/workspace-model";
import { AgentAvatar } from "./agent-avatar";
import { BotDeleteDialog } from "./bot-delete-dialog";
import { AgentProfileEditor } from "./agent-profile-editor";
import { Icon } from "./ui/icon";
import { RailCollapse } from "./rail-collapse";

export function useWorkspaceAgents() {
  const rpc = useRpc<typeof rpcContract>(), connection = useRealtimeConnectionState();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]), [bindings, setBindings] = useState<AgentBinding[]>([]), [legacy, setLegacy] = useState<LegacyAgent[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [version, setVersion] = useState(0);
  useRealtime("agents-changed", () => setVersion(value => value + 1));
  const refresh = () => setVersion(value => value + 1);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError(null);
    void rpc.call("listSpecialists").then(result => {
      if (cancelled) return;
      setProfiles(result.profiles); setBindings(result.bindings); setLegacy(result.legacy);
    }, cause => { if (!cancelled) setError(errorMessage(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rpc, connection, version]);
  return { profiles, bindings, legacy, loading, error, refresh };
}
export type WorkspaceAgentsState = ReturnType<typeof useWorkspaceAgents>;
export function specialistThreads(threads: readonly PluginSidebarThread[], bindings: readonly AgentBinding[], agentId: string) {
  const ids = new Set(bindings.filter(binding => binding.agentId === agentId).map(binding => binding.threadId));
  return threads.filter(thread => ids.has(thread.id) && !thread.isHidden).sort((a, b) => sessionPriority(a) - sessionPriority(b) || Number(b.isPinned) - Number(a.isPinned) ||
    (a.isPinned && b.isPinned ? (a.pinSortKey ?? "~").localeCompare(b.pinSortKey ?? "~") : 0) || b.latestAttentionAt - a.latestAttentionAt || a.id.localeCompare(b.id));
}
function attention(threads: readonly PluginSidebarThread[]) {
  const projects = [...new Set(threads.map(thread => thread.projectId))];
  const results = projects.map(projectId => projectAttention(threads, projectId));
  const counts = { waiting: 0, working: 0, queued: 0, host: 0, unread: 0, error: 0 };
  results.forEach(result => { for (const kind of Object.keys(counts) as (keyof typeof counts)[]) counts[kind] += result.counts[kind]; });
  return { counts, priority: Math.min(3, ...results.map(result => result.priority)), latest: Math.max(0, ...results.map(result => result.latestAttentionAt)) };
}
export function AgentAttention({ threads }: { threads: readonly PluginSidebarThread[] }) {
  const { counts } = attention(threads);
  return <span className="pw-project-summary pw-agent-summary">{(["waiting", "working", "queued", "host", "unread", "error"] as const).map(kind => {
    const count = counts[kind], label = `${count} ${({ waiting: "need input", working: "running", queued: "queued", host: "waiting for machine", unread: "unread replies", error: "errors" })[kind]}`;
    return count ? <span key={kind} className="pw-project-status" data-status={kind} aria-label={label} title={label}><span className={kind === "working" ? "pw-status-spinner" : "pw-status-dot"} aria-hidden="true" />{count}</span> : null;
  })}</span>;
}
export const BOTS_COLLAPSED_KEY = "project-workspace.bots-collapsed.v1";
export type BotComposeRequest = { agentId: string; token: number; opener: HTMLElement | null };
function BotRow({ profile, threads, selected, onSelect, onEdit, onNewChat, onDelete, collapsed }: {
  profile: AgentProfile; threads: readonly PluginSidebarThread[]; selected: boolean; collapsed: boolean; onSelect(): void;
  onEdit(opener: HTMLElement | null): void; onNewChat(opener: HTMLElement | null): void; onDelete(opener: HTMLElement | null): void;
}) {
  const row = useRef<HTMLButtonElement>(null), openingDialog = useRef(false);
  const { counts } = attention(threads);
  return <Menu.Root><Menu.Trigger asChild><button ref={row} className="pw-project-row pw-specialist-row" aria-label={`Select bot ${profile.name}`} aria-pressed={selected} title={`${profile.name} · ${profile.role}`} aria-haspopup="menu" aria-keyshortcuts="Shift+F10" onClick={onSelect} onKeyDown={event => {
    if (!(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
    event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom }));
  }}><AgentAvatar avatar={profile.avatar} color={profile.color} size={32} seedKey={profile.id} motion={collapsed ? "still" : counts.waiting ? "waiting" : counts.working ? "working" : "calm"} /><span className="pw-agent-identity"><span className="pw-agent-name">{profile.name}</span><span className="pw-agent-role">{profile.role}</span></span><AgentAttention threads={threads} /></button></Menu.Trigger><Menu.Portal><Menu.Content className="pw-menu" onCloseAutoFocus={event => { if (openingDialog.current) { event.preventDefault(); openingDialog.current = false; } }}>
    <Menu.Item className="pw-menu-item" onSelect={() => { openingDialog.current = true; onEdit(row.current); }}>Bot settings</Menu.Item>
    <Menu.Item className="pw-menu-item" onSelect={() => { openingDialog.current = true; onNewChat(row.current); }}>New chat</Menu.Item>
    <Menu.Separator className="pw-menu-separator" /><Menu.Item className="pw-menu-item pw-danger" onSelect={() => { openingDialog.current = true; onDelete(row.current); }}>Delete bot…</Menu.Item>
  </Menu.Content></Menu.Portal></Menu.Root>;
}
export function WorkspaceAgents({ state, threads, selectedId, onSelect, projects, projectId, environmentId, onNavigate, onNewChat, onRemoved }: {
  state: WorkspaceAgentsState; threads: readonly PluginSidebarThread[]; selectedId: string | null; onSelect(id: string): void;
  projects: readonly { id: string; name: string }[]; projectId?: string; environmentId: string | null; onNavigate(): void; onNewChat(id: string, opener: HTMLElement | null): void; onRemoved(id: string): void;
}) {
  const rpc = useRpc<typeof rpcContract>(), navigate = useBbNavigate();
  const [editor, setEditor] = useState<{ legacy?: LegacyAgent; profile?: AgentProfile } | null>(null), [legacyError, setLegacyError] = useState<string | null>(null), [removing, setRemoving] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<{ profile: AgentProfile; opener: HTMLElement | null } | null>(null);
  function removed(id: string) { setEditor(null); setDeletion(null); state.refresh(); onRemoved(id); }
  const editorOpener = useRef<HTMLElement | null>(null), contentId = useId();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(BOTS_COLLAPSED_KEY) === "true"; } catch { return false; } });
  const [instant, setInstant] = useState(false);
  function toggleBots() { setCollapsed(previous => { const next = !previous; try { localStorage.setItem(BOTS_COLLAPSED_KEY, String(next)); } catch { /* The section still works without client storage. */ } return next; }); }
  const ordered = useMemo(() => state.profiles.map(profile => ({ profile, threads: specialistThreads(threads, state.bindings, profile.id) })).sort((a, b) => {
    const left = attention(a.threads), right = attention(b.threads);
    return left.priority - right.priority || right.latest - left.latest || a.profile.name.localeCompare(b.profile.name);
  }), [state.profiles, state.bindings, threads]);
  async function removeLegacy(threadId: string) {
    setRemoving(threadId); setLegacyError(null);
    try { await rpc.call("removeAgent", { threadId }); state.refresh(); } catch (cause) { setLegacyError(errorMessage(cause)); } finally { setRemoving(null); }
  }
  return <section className="pw-agents pw-rail-section" data-instant={instant || undefined} aria-label="Bots">
    <div className="pw-project-heading pw-agent-heading"><button className="pw-bots-toggle pw-rail-toggle" aria-expanded={!collapsed} aria-controls={contentId} onClick={event => { setInstant(event.detail === 0); toggleBots(); }}><Icon name="ChevronRight" className="pw-small-icon pw-section-chevron" /><span>Bots</span>{!!state.profiles.length && <span className="pw-bots-count">{state.profiles.length}</span>}</button><button className="pw-icon-button" aria-label="Create bot" onClick={event => { editorOpener.current = event.currentTarget; setEditor({}); }}><Icon name="Plus" className="pw-small-icon" /></button></div>
    <RailCollapse id={contentId} collapsed={collapsed}>
    {ordered.map(({ profile, threads: agentThreads }) => <BotRow collapsed={collapsed} key={profile.id} profile={profile} threads={agentThreads} selected={selectedId === profile.id} onSelect={() => onSelect(profile.id)} onEdit={opener => { editorOpener.current = opener; setEditor({ profile }); }} onNewChat={opener => onNewChat(profile.id, opener)} onDelete={opener => setDeletion({ profile, opener })} />)}
    {state.loading && !state.profiles.length && <p className="pw-agent-empty" role="status">Loading bots…</p>}
    {!state.loading && !state.error && !state.profiles.length && <p className="pw-agent-empty">Create a specialist from a skill or your own instructions.</p>}
    {state.error && <p className="pw-agent-error" role="alert">{state.error}<button className="pw-control" onClick={state.refresh}>Retry bots</button></p>}
    {!!state.legacy.length && <details className="pw-legacy-agents"><summary>Saved chats <span>{state.legacy.length}</span></summary>{state.legacy.map(agent => <div className="pw-legacy-row" key={agent.threadId}><button className="pw-legacy-open" onClick={() => { navigate.toThread(agent.threadId); onNavigate(); }} title={agent.name}><Icon name="MessageCircle" className="pw-small-icon" /><span>{agent.name}</span></button><button className="pw-icon-button" aria-label={`Create profile from ${agent.name}`} title="Create reusable profile" onClick={event => { editorOpener.current = event.currentTarget; setEditor({ legacy: agent }); }}><Icon name="Plus" className="pw-small-icon" /></button><button className="pw-icon-button" aria-label={`Remove saved chat ${agent.name}`} title="Remove shortcut; keep chat" disabled={!!removing} onClick={() => void removeLegacy(agent.threadId)}><Icon name="X" className="pw-small-icon" /></button></div>)}{legacyError && <p role="alert" className="pw-agent-error">{legacyError}</p>}</details>}
    </RailCollapse>
    {editor && <AgentProfileEditor onRemoved={removed} returnFocus={editorOpener.current} profile={editor.profile ?? null} legacy={editor.legacy} projects={projects} projectId={projectId} environmentId={environmentId} refresh={state.refresh} onClose={() => setEditor(null)} onSaved={profile => { setEditor(null); state.refresh(); if (!editor.profile) onSelect(profile.id); }} />}
    {deletion && <BotDeleteDialog profile={deletion.profile} returnFocus={deletion.opener} onClose={() => setDeletion(null)} onDeleted={removed} />}
  </section>;
}
