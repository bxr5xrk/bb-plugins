import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { experimental_NewThreadComposer as NewThreadComposer, useBbNavigate, useRpc, type PluginSidebarThread, type PluginSidebarThreadsState } from "@get-bb/plugin-sdk/app";
import type { rpcContract, AgentBinding, AgentProfile } from "../lib/agent-contract";
import { readPendingCreate, prepareAgentCreate, completeAgentCreate, type PendingAgentCreate } from "../lib/agent-create-recovery";
import { errorMessage, type Lifecycle } from "../lib/workspace-model";
import { AgentAvatar } from "./agent-avatar";
import { AgentAttention, specialistThreads, type WorkspaceAgentsState, type BotComposeRequest } from "./workspace-agents";
import { AgentProfileEditor } from "./agent-profile-editor";
import { AgentMemoryEditor, AgentMemoryDraft } from "./agent-memory";
import { BotDeleteDialog } from "./bot-delete-dialog";
import { Icon } from "./ui/icon";

type Project = { id: string; name: string };
function Coordination({ binding, refresh }: { binding: AgentBinding | undefined; refresh(): void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [work, setWork] = useState(binding?.coordinationWork ?? ""), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  async function change(allowed: boolean) {
    if (!binding || saving || allowed && !work.trim()) return;
    setSaving(true); setError(null);
    try { await rpc.call("setAgentCoordination", { threadId: binding.threadId, allowed, work: allowed ? work.trim() : null }); refresh(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
  }
  return <section className="pw-agent-detail-section"><h3>Coordination for current work</h3>{binding ? <>
    <p className="pw-field-note">Allow this chat to delegate or message other bots for the work you specify. Permission clears when this work finishes. New child chats require their own permission.</p>
    <label>Authorized work<input value={work} maxLength={300} disabled={saving || binding.coordinationAllowed} onChange={event => setWork(event.target.value)} placeholder="Review this project's UI" /></label>
    <button className="pw-control" disabled={saving || !binding.coordinationAllowed && !work.trim()} onClick={() => void change(!binding.coordinationAllowed)}>{saving ? "Saving…" : binding.coordinationAllowed ? "Revoke coordination permission" : "Allow coordination for this work"}</button>
    <p className="pw-field-note" role="status">{binding.coordinationAllowed ? `Allowed: ${binding.coordinationWork}` : "Coordination requires your permission."}</p>
    {error && <p className="pw-form-error" role="alert">{error}</p>}
  </> : <p className="pw-field-note">Open one of this bot's chats to authorize coordination for its current work.</p>}</section>;
}
export function AgentWorkspace({ profile, state, threads, projects, activeThreadId, initialProjectId, environmentId, onBack, onRemoved, onNavigate, renderSessions, lifecycle, setLifecycle, drafts, readAcknowledgement, archive, threadStatus, composeRequest, onComposeRequestHandled }: {
  composeRequest?: BotComposeRequest | null; onComposeRequestHandled(token: number): void; profile: AgentProfile; state: WorkspaceAgentsState; threads: readonly PluginSidebarThread[]; projects: readonly Project[];
  activeThreadId: string | null; initialProjectId?: string; environmentId: string | null; onBack(): void; onRemoved(): void; onNavigate(): void;
  renderSessions(threads: PluginSidebarThread[], key: string): ReactNode; lifecycle: Lifecycle; setLifecycle(value: Lifecycle): void; drafts: Map<string, AgentMemoryDraft>; readAcknowledgement: ReactNode; archive: PluginSidebarThreadsState["experimental_archived"]; threadStatus: PluginSidebarThreadsState["status"];
}) {
  const rpc = useRpc<typeof rpcContract>(), navigate = useBbNavigate();
  const [tab, setTab] = useState<"sessions" | "profile" | "memory">("sessions"), [projectId, setProjectId] = useState<string>(""), [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false), [composing, setComposing] = useState(false), [confirmRemove, setConfirmRemove] = useState(false), [error, setError] = useState<string | null>(null);
  const [composeSeed, setComposeSeed] = useState(() => ({ projectId: initialProjectId, defaults: { ...profile.defaults } }));
  const [composeError, setComposeError] = useState<string | null>(null), [sending, setSending] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<PendingAgentCreate | null>(null);
  const deleteOpener = useRef<HTMLElement | null>(null);
  const sendingNow = useRef(false), composeOpener = useRef<HTMLElement | null>(null), editorOpener = useRef<HTMLElement | null>(null);
  const agentThreads = specialistThreads(threads, state.bindings, profile.id), needle = query.toLocaleLowerCase().trim();
  const filtered = agentThreads.filter(thread => (!projectId || thread.projectId === projectId) && (lifecycle === "all" || thread.isArchived === (lifecycle === "archived")) && (!needle || thread.displayTitle.toLocaleLowerCase().includes(needle)));
  const binding = state.bindings.find(item => item.threadId === activeThreadId && item.agentId === profile.id);
  const activeProject = projects.find(project => project.id === projectId);
  const selectedEnvironment = projectId && projectId !== initialProjectId ? null : environmentId;
  function openComposer(event: { currentTarget: HTMLElement | null }) {
    composeOpener.current = event.currentTarget; setComposeSeed({ projectId: projectId || initialProjectId, defaults: { ...profile.defaults } }); setComposeError(null);
    try { setPendingCreate(readPendingCreate(profile.id)); } catch (cause) { setComposeError(errorMessage(cause)); }
    setComposing(true);
  }
  const handledCompose = useRef<number | null>(null);
  useEffect(() => {
    if (!composeRequest || composeRequest.agentId !== profile.id || handledCompose.current === composeRequest.token) return;
    handledCompose.current = composeRequest.token;
    openComposer({ currentTarget: composeRequest.opener }); onComposeRequestHandled(composeRequest.token);
  }, [composeRequest]);
  function openEditor(trigger: HTMLElement | null) { editorOpener.current = trigger; setEditing(true); }
  async function submitOperation(operation: PendingAgentCreate) {
    const created = await rpc.call("spawnAgentThread", { agentId: operation.agentId, requestId: operation.requestId, request: operation.request });
    await completeAgentCreate(operation); setPendingCreate(null); state.refresh(); setComposing(false); navigate.toThread(created.threadId); onNavigate();
  }
  async function recoverCreation() {
    if (sendingNow.current) return;
    sendingNow.current = true; setSending(true); setComposeError(null);
    try { const operation = readPendingCreate(profile.id); if (!operation) throw new Error("No previous creation is available to recover."); await submitOperation(operation); }
    catch (cause) { setComposeError(errorMessage(cause)); } finally { sendingNow.current = false; setSending(false); }
  }
  const tabs = ["sessions", "profile", "memory"] as const;
  return <section className="pw-workspace pw-specialist-workspace" aria-label={`${profile.name} bot workspace`}>
    <header className="pw-workspace-header"><button className="pw-mobile-back pw-icon-button" aria-label="Choose project or bot" onClick={onBack}><Icon name="ChevronLeft" className="pw-icon" /></button><AgentAvatar avatar={profile.avatar} color={profile.color} size={20} /><span className="pw-workspace-title" title={`${profile.name} · ${profile.role}`}>{profile.name}</span><button className="pw-icon-button" aria-label={`New chat with ${profile.name}`} onClick={openComposer}><Icon name="Plus" className="pw-icon" /></button></header>
    <div className="pw-tabs" role="tablist" aria-label="Bot views" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const index = tabs.indexOf(tab), next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      setTab(tabs[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>{tabs.map(view => <button role="tab" key={view} tabIndex={tab === view ? 0 : -1} aria-selected={tab === view} aria-controls={`pw-agent-${view}-panel`} onClick={() => setTab(view)}>{view === "sessions" ? "Sessions" : view === "profile" ? "Profile" : "Memory"}</button>)}</div>
    {tab !== "profile" && <label className="pw-agent-project-filter">Project<select aria-label="Bot project filter" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
    {tab === "sessions" ? <div id="pw-agent-sessions-panel" role="tabpanel" aria-label="Bot sessions" className="pw-sessions">{readAcknowledgement}<div className="pw-session-search"><Icon name="Search" className="pw-small-icon" /><input aria-label="Search bot sessions" placeholder="Search sessions…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Bot session lifecycle" value={lifecycle} onChange={event => setLifecycle(event.target.value as Lifecycle)}><option value="active">Active</option><option value="all">All</option><option value="archived">Archived</option></select></div>
      {state.error && <p role="alert" className="pw-message">{state.error}<button className="pw-control" onClick={state.refresh}>Retry bots</button></p>}
      {threadStatus === "loading" || state.loading && !agentThreads.length ? <p role="status" className="pw-message">Loading bot sessions…</p> : threadStatus === "error" ? <p role="alert" className="pw-message">BB could not load sessions. Your chats may still exist.<button className="pw-control" onClick={() => window.location.reload()}>Reload BB</button></p> : state.error ? null : filtered.length ? renderSessions(filtered, `${profile.id}/${projectId}/${query}/${lifecycle}`) : <p className="pw-message">{needle ? "No sessions match your search." : "No chats here yet."}<button className="pw-control" onClick={openComposer}>Start a chat</button></p>}
      {lifecycle !== "active" && archive && <div className="pw-archive-footer">{archive.status === "loading" ? <p role="status">Loading archives…</p> : archive.status === "error" || archive.isFetchNextPageError ? <p role="alert">Could not load archived sessions.</p> : null}{(archive.hasNextPage || archive.status === "error" || archive.isFetchNextPageError) && <button className="pw-control" disabled={archive.isFetchingNextPage} onClick={() => void archive.fetchNextPage().catch(() => undefined)}>{archive.isFetchingNextPage ? "Loading…" : archive.isFetchNextPageError || archive.status === "error" ? "Retry archives" : "Load more archived sessions"}</button>}</div>}
      {!!state.legacy.length && <details className="pw-attach-chat"><summary>Attach a saved chat</summary><p className="pw-field-note">Attaching changes this chat's profile for its next session. It does not send a message.</p>{state.legacy.filter(legacy => !state.bindings.some(item => item.threadId === legacy.threadId)).map(legacy => <button key={legacy.threadId} className="pw-control" onClick={async () => { setError(null); try { await rpc.call("bindAgentThread", { agentId: profile.id, threadId: legacy.threadId }); state.refresh(); } catch (cause) { setError(errorMessage(cause)); } }}>Attach {legacy.name}</button>)}{error && <p role="alert" className="pw-form-error">{error}</p>}</details>}
    </div> : tab === "profile" ? <div className="pw-agent-detail-scroll" role="tabpanel" id="pw-agent-profile-panel" aria-label="Bot profile"><section className="pw-agent-detail-section"><div className="pw-profile-identity"><AgentAvatar avatar={profile.avatar} color={profile.color} size={36} /><div><h3>{profile.name}</h3><p>{profile.role}</p></div></div><AgentAttention threads={agentThreads} /><button className="pw-control" onClick={event => openEditor(event.currentTarget)}>Edit profile</button><p className="pw-field-note">{profile.basis ? `Based on ${profile.basis.name}` : "Custom profile"} · {agentThreads.length} chats</p><details><summary>Instructions</summary><pre className="pw-memory-rules">{profile.instructions}</pre></details><details><summary>SOUL.md</summary>{profile.soul ? <pre className="pw-memory-rules">{profile.soul}</pre> : <p className="pw-field-note">No personality yet. Add voice, style and values in bot settings.</p>}</details><p className="pw-field-note">Mention a profile with @ and choose its Bots suggestion. A mention shares context; start New chat to run this bot.</p></section>
      <section className="pw-agent-detail-section"><h3>Profile in current chat</h3><p className="pw-application-state" data-state={binding?.state ?? "none"}>{binding ? binding.state === "applied" ? "Current profile read by the bot" : binding.state === "outdated" ? "Profile changed since last read" : "Profile not yet read by the bot" : "Open a bot chat to view its profile state."}</p>{binding && <p className="pw-field-note">Editing the profile keeps active work running. Changes become available in the next session or when the bot reads its profile again.</p>}</section>
      <Coordination key={binding?.threadId ?? "none"} binding={binding} refresh={state.refresh} />
      <section className="pw-agent-detail-section"><button className="pw-control pw-danger" onClick={event => { deleteOpener.current = event.currentTarget; setConfirmRemove(true); }}>Remove bot…</button></section>
    </div> : <div className="pw-memory-panel" role="tabpanel" id="pw-agent-memory-panel" aria-label="Bot memory"><AgentMemoryEditor key={`${profile.id}/${projectId}`} profile={profile} projectId={projectId || null} projectName={activeProject?.name ?? projectId} onEditProfile={openEditor} drafts={drafts} /></div>}
    {editing && <AgentProfileEditor onRemoved={() => { setEditing(false); state.refresh(); onRemoved(); }} returnFocus={editorOpener.current} profile={profile} projects={projects} projectId={projectId || initialProjectId} environmentId={selectedEnvironment} refresh={state.refresh} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.refresh(); }} />}
    {confirmRemove && <BotDeleteDialog profile={profile} returnFocus={deleteOpener.current} onClose={() => setConfirmRemove(false)} onDeleted={() => { state.refresh(); onRemoved(); }} />}
    <Dialog.Root open={composing} onOpenChange={open => { if (!sending) setComposing(open); }}><Dialog.Portal><Dialog.Overlay className="pw-preview-overlay" /><Dialog.Content className="pw-agent-dialog pw-agent-compose-dialog" onCloseAutoFocus={event => { event.preventDefault(); if (composeOpener.current?.isConnected) composeOpener.current.focus(); }} onEscapeKeyDown={event => { if (sending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}><header className="pw-preview-heading"><AgentAvatar avatar={profile.avatar} color={profile.color} /><Dialog.Title>New chat with {profile.name}</Dialog.Title><button className="pw-icon-button" aria-label="Close bot composer" disabled={sending} onClick={() => setComposing(false)}><Icon name="X" className="pw-icon" /></button></header><Dialog.Description className="pw-agent-description">{profile.role}. Choose a project and machine below; project memory is applied to that project only.</Dialog.Description>{composeError && <p className="pw-form-error" role="alert">{composeError}</p>}{pendingCreate && <div className="pw-agent-description"><p role="status">The previous creation has no confirmed result. It may already be running. Recovery checks that same creation; it does not start a replacement.</p><button className="pw-control" disabled={sending} onClick={() => void recoverCreation()}>{sending ? "Recovering…" : "Recover previous creation"}</button></div>}<div className="pw-agent-native-composer"><NewThreadComposer draftKey={`project-workspace.agent.${profile.id}`} defaultProjectId={composeSeed.projectId} defaultProviderId={composeSeed.defaults.providerId} defaultModel={composeSeed.defaults.model} defaultReasoningLevel={composeSeed.defaults.reasoningLevel} defaultServiceTier={composeSeed.defaults.serviceTier} focusRequest={1} layout="contained" placeholder={`Give ${profile.name} a task…`} onSubmit={async request => {
      if (sendingNow.current) throw new Error("A creation request is already in progress.");
      sendingNow.current = true; setSending(true); setComposeError(null);
      try {
        const operation = await prepareAgentCreate(profile.id, request); setPendingCreate(operation); await submitOperation(operation);
      } catch (cause) {
        setComposeError(errorMessage(cause));
        try { setPendingCreate(readPendingCreate(profile.id)); } catch { /* The original storage failure stays visible. */ }
        throw cause;
      } finally { sendingNow.current = false; setSending(false); }
    }} /></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
