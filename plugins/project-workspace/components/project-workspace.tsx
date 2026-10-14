import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  experimental_useSidebarThreads, useBbNavigate, useSdk,
  type PluginSidebarProject, type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./ui/icon";
import { WindowedSessions } from "./windowed-sessions";
import { ProjectRow } from "./project-row";
import { RailCollapse } from "./rail-collapse";
import { WorkspaceAgents, useWorkspaceAgents, type BotComposeRequest } from "./workspace-agents";
import { AgentWorkspace } from "./agent-workspace";
import type { AgentMemoryDraft } from "./agent-memory";
import { RailNavigation } from "./workspace-navigation";
import { WorkspaceExplorer } from "./workspace-explorer";
import { absolutePath, errorMessage, projectThreads, projectAttention, sessionItems, clampProjectWidth, PROJECT_RAIL_WIDTH_KEY, projectColor, type Lifecycle } from "../lib/workspace-model";

const ACTIVE = { experimental_lifecycles: ["active"] as const };
const BOTH = { experimental_lifecycles: ["active", "archived"] as const };
export const HIDDEN_PROJECTS_KEY = "project-workspace.hidden-projects.v1";
export const PROJECTS_COLLAPSED_KEY = "project-workspace.projects-collapsed.v1";

export function ProjectWorkspace(props: PluginThreadListProps) {
  const [lifecycle, setLifecycle] = useState<Lifecycle>("active");
  const state = experimental_useSidebarThreads(lifecycle === "active" ? ACTIVE : BOTH);
  const sdk = useSdk(), navigate = useBbNavigate();
  const agents = useWorkspaceAgents();
  const [chosenAgent, setChosenAgent] = useState<string | null>(null);
  const [botComposeRequest, setBotComposeRequest] = useState<BotComposeRequest | null>(null);
  const botComposeToken = useRef(0);
  const selectedAgent = agents.profiles.find(profile => profile.id === chosenAgent);
  const memoryDrafts = useRef(new Map<string, AgentMemoryDraft>());
  function agentRemoved(id: string) {
    for (const key of memoryDrafts.current.keys()) if (key.startsWith(`${id}/`)) memoryDrafts.current.delete(key);
    if (chosenAgent === id) { setChosenAgent(null); setProjectPicker(false); }
    setBotComposeRequest(current => current?.agentId === id ? null : current);
  }
  const [catalog, setCatalog] = useState<Pick<PluginSidebarProject, "id" | "name" | "isPersonal">[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [addingProject, setAddingProject] = useState(false), [creatingProject, setCreatingProject] = useState(false);
  const projectsContentId = useId();
  const [projectsCollapsed, setProjectsCollapsed] = useState(() => { try { return localStorage.getItem(PROJECTS_COLLAPSED_KEY) === "true"; } catch { return false; } });
  const [projectsInstant, setProjectsInstant] = useState(false);
  const [newProjectName, setNewProjectName] = useState(""), [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectHost, setNewProjectHost] = useState(""), [hosts, setHosts] = useState<{ id: string; name: string }[]>([]);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null), [hostRetry, setHostRetry] = useState(0);
  const [loadingHosts, setLoadingHosts] = useState(false);
  useEffect(() => {
    if (!addingProject) return;
    const controller = new AbortController(); setLoadingHosts(true); setProjectCreateError(null);
    sdk.hosts.list({ signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setHosts(value.map(host => ({ id: host.id, name: host.name })));
      setNewProjectHost(previous => value.some(host => host.id === previous) ? previous : value[0]?.id ?? "");
    }, cause => { if (!controller.signal.aborted) setProjectCreateError(errorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHosts(false); });
    return () => controller.abort();
  }, [addingProject, sdk, hostRetry]);
  // The live sidebar cache is authoritative for updates; the full project list
  // supplements projects with no loaded sessions instead of manufacturing rows.
  const projectIds = state.projects.map(p => p.id).join(",");
  useEffect(() => {
    const controller = new AbortController();
    sdk.projects.list({ includePersonal: true, signal: controller.signal }).then(projects => {
      if (controller.signal.aborted) return;
      setCatalog(projects.map(p => ({ id: p.id, name: p.name, isPersonal: p.kind === "personal" })));
      setCatalogError(null);
    }, cause => { if (!controller.signal.aborted) setCatalogError(errorMessage(cause)); });
    return () => controller.abort();
  }, [sdk, projectIds, retry]);
  const projects = useMemo(() => {
    const live = new Map(catalog.map(p => [p.id, p]));
    state.projects.forEach(p => live.set(p.id, p));
    return [...live.values()].sort((a, b) => {
      const left = projectAttention(state.threads, a.id), right = projectAttention(state.threads, b.id);
      return left.priority - right.priority || right.latestAttentionAt - left.latestAttentionAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }, [state.projects, state.threads, catalog]);
  const [hiddenProjects, setHiddenProjects] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(HIDDEN_PROJECTS_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
  });
  const [projectVisibilityError, setProjectVisibilityError] = useState<string | null>(null);
  const visibilityNeedsFocus = useRef(false);
  const visibleProjects = projects.filter(p => !hiddenProjects.includes(p.id));
  function setProjectHidden(id: string, hidden: boolean) {
    const next = hidden ? [...hiddenProjects, id] : hiddenProjects.filter(value => value !== id);
    try { localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify(next)); visibilityNeedsFocus.current = true; setHiddenProjects(next); setProjectVisibilityError(null); }
    catch (cause) { setProjectVisibilityError(errorMessage(cause)); }
  }
  const [chosenProject, setChosenProject] = useState<string | null>(props.activeProjectId);
  useEffect(() => { if (props.activeProjectId) setChosenProject(props.activeProjectId); }, [props.activeProjectId]);
  const project = visibleProjects.find(p => p.id === chosenProject) ?? visibleProjects.find(p => p.id === props.activeProjectId) ?? visibleProjects[0];
  const [tab, setTab] = useState<"sessions" | "explorer">("sessions"), [query, setQuery] = useState("");
  const [projectPicker, setProjectPicker] = useState(false), [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const pickerNeedsFocus = useRef(false), chooseProjectButton = useRef<HTMLButtonElement>(null);
  const filtered = useMemo(() => projectThreads(state.threads, project?.id ?? null, query, lifecycle), [state.threads, project?.id, query, lifecycle]);
  const allProjectThreads = useMemo(() => projectThreads(state.threads, project?.id ?? null, "", "all"), [state.threads, project?.id]);
  const attentionByProject = useMemo(() => new Map(projects.map(p => [p.id, projectAttention(state.threads, p.id)])), [projects, state.threads]);
  const items = useMemo(() => sessionItems(filtered, state.sections, new Set()), [filtered, state.sections]);
  function selectProject(id: string) {
    pickerNeedsFocus.current = projectPicker;
    setChosenAgent(null); setChosenProject(id); setQuery(""); setProjectPicker(false);
  }
  async function createProject() {
    if (creatingProject || loadingHosts || !newProjectName.trim() || !newProjectHost || !absolutePath(newProjectPath.trim())) return;
    setCreatingProject(true); setProjectCreateError(null);
    try {
      const created = await sdk.projects.create({ name: newProjectName.trim(), source: { type: "local_path", hostId: newProjectHost, path: newProjectPath.trim() } });
      setCatalog(previous => [...previous.filter(p => p.id !== created.id), { id: created.id, name: created.name, isPersonal: created.kind === "personal" }]);
      selectProject(created.id); setAddingProject(false); setNewProjectName(""); setNewProjectPath(""); setRetry(value => value + 1);
    } catch (cause) { setProjectCreateError(errorMessage(cause)); }
    finally { setCreatingProject(false); }
  }
  // A viewed conversation must acknowledge new replies even when its row is
  // outside the virtual window or another project's list is selected.
  const activeThread = state.threads.find(thread => thread.id === props.activeThreadId);
  const [activeReadError, setActiveReadError] = useState<string | null>(null), acknowledged = useRef<string | null>(null);
  const currentRead = useRef({ thread: activeThread, inFlight: false }); currentRead.current.thread = activeThread;
  const acknowledgeCurrent = useRef<() => void>(() => {});
  useEffect(() => {
    let mounted = true;
    function acknowledge() {
      const thread = currentRead.current.thread;
      if (!thread?.isUnread || document.visibilityState === "hidden" || !document.hasFocus() || currentRead.current.inFlight) return;
      const stamp = `${thread.id}/${thread.latestAttentionAt}`;
      if (acknowledged.current === stamp) return;
      acknowledged.current = stamp; currentRead.current.inFlight = true;
      void sdk.threads.markRead({ threadId: thread.id }).then(() => { if (mounted) setActiveReadError(null); }, cause => {
        if (mounted) { acknowledged.current = null; setActiveReadError(errorMessage(cause)); }
      }).finally(() => {
        currentRead.current.inFlight = false;
        // If another reply arrived while this acknowledgement was in flight,
        // acknowledge that visible reply separately instead of losing the update.
        if (mounted && acknowledged.current && currentRead.current.thread?.isUnread &&
          `${currentRead.current.thread.id}/${currentRead.current.thread.latestAttentionAt}` !== acknowledged.current) acknowledge();
      });
    }
    acknowledgeCurrent.current = acknowledge;
    acknowledge(); window.addEventListener("focus", acknowledge); document.addEventListener("visibilitychange", acknowledge);
    return () => { mounted = false; acknowledgeCurrent.current = () => {}; window.removeEventListener("focus", acknowledge); document.removeEventListener("visibilitychange", acknowledge); };
  }, [sdk]);
  useEffect(() => { acknowledgeCurrent.current(); }, [activeThread?.id, activeThread?.isUnread, activeThread?.latestAttentionAt]);
  function toggleSection(id: string) { setCollapsed(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  const [width, setWidth] = useState<number | null>(null), resizing = useRef<{ x: number; width: number } | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visibilityNeedsFocus.current) return;
    visibilityNeedsFocus.current = false;
    const frame = requestAnimationFrame(() => {
      (shell.current?.querySelector<HTMLButtonElement>('.pw-project-row[aria-pressed="true"]') ??
        shell.current?.querySelector<HTMLButtonElement>(".pw-hidden-projects"))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [hiddenProjects]);
  const [railWidth, setRailWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(PROJECT_RAIL_WIDTH_KEY)); return saved > 0 ? saved : 200; } catch { return 200; }
  });
  const [containerWidth, setContainerWidth] = useState(480);
  const railResizing = useRef<{ x: number; width: number } | null>(null);
  const actualRailWidth = clampProjectWidth(railWidth, containerWidth);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const node = shell.current; if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { const measured = node.getBoundingClientRect().width; if (measured > 0) setContainerWidth(measured); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  function resizeRail(value: number) {
    const next = clampProjectWidth(value, shell.current?.getBoundingClientRect().width || containerWidth);
    setRailWidth(next); try { localStorage.setItem(PROJECT_RAIL_WIDTH_KEY, String(next)); } catch { /* Client storage may be disabled. */ }
  }

  useEffect(() => {
    if (!pickerNeedsFocus.current) return;
    pickerNeedsFocus.current = false;
    if (projectPicker) {
      (shell.current?.querySelector<HTMLButtonElement>('.pw-project-list .pw-project-row[aria-pressed="true"]') ??
        shell.current?.querySelector<HTMLButtonElement>(".pw-project-list .pw-project-row"))?.focus();
    } else chooseProjectButton.current?.focus();
  }, [projectPicker]);
  useEffect(() => {
    const root = shell.current?.closest<HTMLElement>('[data-testid="app-layout-root"]');
    if (!root || width === null) return;
    root.style.setProperty("--project-workspace-width", `${width}px`);
    return () => { root.style.removeProperty("--project-workspace-width"); };
  }, [width]);
  useEffect(() => {
    const root = shell.current?.closest<HTMLElement>('[data-testid="app-layout-root"]');
    if (!root) return;
    root.style.setProperty("--project-workspace-rail-width", `${actualRailWidth}px`);
    return () => { root.style.removeProperty("--project-workspace-rail-width"); };
  }, [actualRailWidth]);
  useEffect(() => {
    const root = shell.current?.closest<HTMLElement>('[data-testid="app-layout-root"]');
    const footer = shell.current?.closest('[data-testid="app-sidebar-body"]')?.querySelector<HTMLElement>('[data-sidebar="footer"]');
    if (!root || !footer) return;
    // Reserve footer space in the project rail only, including native disclosures.
    const measure = () => root.style.setProperty("--project-workspace-footer-height", `${footer.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(footer);
    return () => { observer?.disconnect(); root.style.removeProperty("--project-workspace-footer-height"); };
  }, []);
  return <div ref={shell} style={{ gridTemplateColumns: `${actualRailWidth}px minmax(0, 1fr)` }} className="pw-shell" data-project-workspace-sidebar="" data-picker={projectPicker || undefined} data-compact={props.isCompactViewport || undefined}>
    <div className="pw-projects" aria-label="Projects" onKeyDown={event => {
      if (projectPicker && event.key === "Escape") {
        event.preventDefault(); pickerNeedsFocus.current = true; setProjectPicker(false);
      }
    }}>
      <RailNavigation />
      <div className="pw-rail-scroll" role="region" aria-label="Bots and projects" tabIndex={0}>
      <WorkspaceAgents onRemoved={agentRemoved} onNewChat={(id, opener) => { setChosenAgent(id); setProjectPicker(false); setBotComposeRequest({ agentId: id, opener, token: ++botComposeToken.current }); }} state={agents} threads={state.threads} selectedId={chosenAgent} onSelect={id => { setChosenAgent(id); setProjectPicker(false); }} projects={projects} projectId={project?.id} environmentId={state.threads.find(thread => thread.projectId === project?.id && thread.id === props.activeThreadId)?.environment?.id ?? null} onNavigate={props.onNavigate} />
      <section className="pw-rail-section" data-instant={projectsInstant || undefined} aria-label="Project list">
      <div className="pw-project-heading"><button className="pw-bots-toggle pw-rail-toggle" aria-expanded={!projectsCollapsed} aria-controls={projectsContentId} onClick={event => {
        setProjectsInstant(event.detail === 0);
        const next = !projectsCollapsed; setProjectsCollapsed(next);
        try { localStorage.setItem(PROJECTS_COLLAPSED_KEY, String(next)); } catch { /* The section still works without client storage. */ }
      }}><Icon name="ChevronRight" className="pw-small-icon pw-section-chevron" /><span>Projects</span></button><button className="pw-icon-button pw-project-heading-button" aria-label="Add project" aria-expanded={addingProject} onClick={() => setAddingProject(value => !value)} disabled={creatingProject}><Icon name="Plus" className="pw-icon" /></button></div>
      {addingProject && <form className="pw-project-create" aria-label="Add project" onSubmit={event => { event.preventDefault(); void createProject(); }}>
        <label>Project name<input autoFocus aria-label="Project name" value={newProjectName} disabled={creatingProject} onChange={event => setNewProjectName(event.target.value)} required /></label>
        <label>Machine<select aria-label="Project machine" value={newProjectHost} disabled={loadingHosts || creatingProject} onChange={event => setNewProjectHost(event.target.value)} required>{hosts.map(host => <option value={host.id} key={host.id}>{host.name}</option>)}</select></label>
        <label>Project folder<input aria-label="Project folder" placeholder="/absolute/path/to/project" value={newProjectPath} disabled={creatingProject} onChange={event => setNewProjectPath(event.target.value)} required /></label>
        {loadingHosts && <p role="status">Loading machines…</p>}
        {!loadingHosts && !hosts.length && <p>No machines available. <button type="button" className="pw-control" onClick={() => setHostRetry(value => value + 1)}>Retry machines</button></p>}
        {projectCreateError && <p role="alert">{projectCreateError}</p>}
        <div><button className="pw-control" type="submit" disabled={creatingProject || loadingHosts || !newProjectName.trim() || !newProjectHost || !absolutePath(newProjectPath.trim())}>{creatingProject ? "Adding…" : "Add project"}</button><button type="button" className="pw-control" disabled={creatingProject} onClick={() => setAddingProject(false)}>Cancel</button></div>
      </form>}
      <RailCollapse id={projectsContentId} collapsed={projectsCollapsed}>
      <div className="pw-project-list">
        {visibleProjects.map(p => <ProjectRow key={p.id} id={p.id} name={p.name} active={!chosenAgent && project?.id === p.id}
          onSelect={() => selectProject(p.id)} onHide={() => setProjectHidden(p.id, true)} onNavigate={props.onNavigate}
          settingsHref={state.projects.find(value => value.id === p.id)?.settingsHref}>
          <span className="pw-project-glyph" style={{ color: projectColor(p.id) }}><Icon name={p.isPersonal ? "House" : "FolderGit2"} className="pw-icon" /></span><span className="pw-project-name">{p.name}</span>
          <span className="pw-project-summary">{(["waiting", "working", "queued", "host", "unread", "error"] as const).map(kind => {
            const count = attentionByProject.get(p.id)?.counts[kind] ?? 0;
            const label = `${count} ${({ waiting: "need input", working: "running", queued: "queued", host: "waiting for machine", unread: "unread replies", error: "errors" })[kind]}`;
            return count ? <span key={kind} className="pw-project-status" data-status={kind} aria-label={label} title={label}><span className={kind === "working" ? "pw-status-spinner" : "pw-status-dot"} aria-hidden="true" />{count}</span> : null;
          })}</span>
        </ProjectRow>)}
        {projects.some(p => hiddenProjects.includes(p.id)) && <Menu.Root><Menu.Trigger asChild>
          <button className="pw-hidden-projects pw-control">Hidden projects ({projects.filter(p => hiddenProjects.includes(p.id)).length})</button>
        </Menu.Trigger><Menu.Portal><Menu.Content className="pw-menu" align="start" sideOffset={4}>
          {projects.filter(p => hiddenProjects.includes(p.id)).map(p => <Menu.Item key={p.id} className="pw-menu-item" onSelect={() => setProjectHidden(p.id, false)}>Show {p.name}</Menu.Item>)}
        </Menu.Content></Menu.Portal></Menu.Root>}
        {projectVisibilityError && <p className="pw-message" role="alert">Could not save project visibility: {projectVisibilityError}</p>}
        {catalogError && <p className="pw-message" role="alert">Could not refresh projects. <button className="pw-control" onClick={() => setRetry(n => n + 1)}>Retry projects</button></p>}
        {state.status === "loading" && !projects.length && <p className="pw-message" role="status">Loading projects…</p>}
      </div>
      </RailCollapse>
      </section>
      </div>
    </div>
    <button className="pw-project-resize" role="separator" aria-label="Resize projects panel" aria-orientation="vertical" aria-valuenow={Math.round(actualRailWidth)} aria-valuemin={140} aria-valuemax={Math.min(340, Math.max(140, containerWidth - 220))} style={{ left: actualRailWidth - 3 }}
      onPointerDown={event => { event.preventDefault(); railResizing.current = { x: event.clientX, width: actualRailWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (railResizing.current) resizeRail(railResizing.current.width + event.clientX - railResizing.current.x); }}
      onPointerUp={() => { railResizing.current = null; }} onPointerCancel={() => { railResizing.current = null; }}
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); resizeRail(event.key === "Home" ? 140 : event.key === "End" ? 340 : actualRailWidth + (event.key === "ArrowRight" ? 16 : -16)); } }} />
    {selectedAgent ? <AgentWorkspace onComposeRequestHandled={token => setBotComposeRequest(current => current?.token === token ? null : current)} composeRequest={botComposeRequest} key={selectedAgent.id} profile={selectedAgent} state={agents} threads={state.threads} projects={projects} activeThreadId={props.activeThreadId} initialProjectId={project?.id} environmentId={activeThread?.projectId === project?.id ? activeThread?.environment?.id ?? null : null} threadStatus={state.status} lifecycle={lifecycle} setLifecycle={setLifecycle} drafts={memoryDrafts.current} archive={state.experimental_archived}
      onBack={() => { pickerNeedsFocus.current = true; setProjectPicker(true); }} onRemoved={() => agentRemoved(selectedAgent.id)} onNavigate={props.onNavigate}
      readAcknowledgement={activeReadError ? <p role="alert" className="pw-message">Could not mark the viewed reply read: {activeReadError}<button className="pw-control" onClick={() => { acknowledged.current = null; acknowledgeCurrent.current(); }}>Retry read acknowledgement</button></p> : null}
      renderSessions={(threads, key) => <WindowedSessions key={key} items={sessionItems(threads, state.sections, new Set())} activeThreadId={props.activeThreadId} onNavigate={props.onNavigate} toggleSection={toggleSection} collapsed={collapsed} now={now} />} /> : <section className="pw-workspace" aria-label={project ? `${project.name} workspace` : "Project workspace"}>
      <header className="pw-workspace-header">
        <button ref={chooseProjectButton} className="pw-mobile-back pw-icon-button" aria-label="Choose project" onClick={() => {
          pickerNeedsFocus.current = true; setProjectPicker(true);
        }}><Icon name="ChevronLeft" className="pw-icon" /></button>
        <span className="pw-workspace-title" title={project?.name}>{project?.name ?? "Workspace"}</span>
        <button className="pw-icon-button" aria-label="New session in selected project" disabled={!project} onClick={() => { navigate.toCompose({ projectId: project?.id, focusPrompt: true }); props.onNavigate(); }}><Icon name="Plus" className="pw-icon" /></button>
      </header>
      <div className="pw-tabs" role="tablist" aria-label="Workspace views" onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
          event.preventDefault(); const next = event.key === "Home" ? "sessions" : event.key === "End" ? "explorer" : tab === "sessions" ? "explorer" : "sessions";
          setTab(next); event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next === "sessions" ? 0 : 1]?.focus();
        }
      }}>
        <button role="tab" tabIndex={tab === "sessions" ? 0 : -1} aria-selected={tab === "sessions"} aria-controls="pw-sessions-panel" onClick={() => setTab("sessions")}>Sessions</button>
        <button role="tab" tabIndex={tab === "explorer" ? 0 : -1} aria-selected={tab === "explorer"} aria-controls="pw-explorer-panel" onClick={() => setTab("explorer")}>Explorer</button>
      </div>
      {tab === "sessions" ? <div id="pw-sessions-panel" className="pw-sessions" role="tabpanel" aria-label="Sessions">
        {activeReadError && <p role="alert" className="pw-message">Could not mark the viewed reply read: {activeReadError} <button className="pw-control" onClick={() => { acknowledged.current = null; acknowledgeCurrent.current(); }}>Retry read acknowledgement</button></p>}
        <div className="pw-session-search"><Icon name="Search" className="pw-small-icon" /><input aria-label="Search project sessions" placeholder="Search sessions…" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="Session lifecycle" value={lifecycle} onChange={event => setLifecycle(event.target.value as Lifecycle)}><option value="active">Active</option><option value="all">All</option><option value="archived">Archived</option></select>
        </div>
        {state.status === "loading" ? <p role="status" className="pw-message">Loading sessions…</p> : state.status === "error" ? <p role="alert" className="pw-message">BB could not load sessions. Check your connection or reload BB.</p> :
          filtered.length ? <WindowedSessions key={`${project?.id}/${query}/${lifecycle}`} items={items} activeThreadId={props.activeThreadId} onNavigate={props.onNavigate} toggleSection={toggleSection} collapsed={collapsed} now={now} /> :
            <p className="pw-message">{!project ? "Choose or restore a project to see its sessions." : query ? "No sessions match your search." : lifecycle === "archived" ? "No archived sessions loaded for this project." : "No sessions in this project yet."}</p>}
        {lifecycle !== "active" && state.experimental_archived && <div className="pw-archive-footer">
          {state.experimental_archived.status === "loading" ? <p role="status">Loading archives…</p> : state.experimental_archived.status === "error" || state.experimental_archived.isFetchNextPageError ? <p role="alert">Could not load archived sessions.</p> : null}
          {(state.experimental_archived.hasNextPage || state.experimental_archived.status === "error" || state.experimental_archived.isFetchNextPageError) &&
            <button className="pw-control" disabled={state.experimental_archived.isFetchingNextPage} onClick={() => void state.experimental_archived?.fetchNextPage().catch(() => undefined)}>{state.experimental_archived.isFetchingNextPage ? "Loading…" : state.experimental_archived.isFetchNextPageError || state.experimental_archived.status === "error" ? "Retry archives" : "Load more archived sessions"}</button>}
        </div>}
      </div> : <div id="pw-explorer-panel" className="pw-explorer-panel" role="tabpanel" aria-label="Explorer">{project ? <WorkspaceExplorer key={project.id} projectId={project.id} threads={allProjectThreads} previewThreadId={props.activeThreadId} activeThreadId={allProjectThreads.some(t => t.id === props.activeThreadId) ? props.activeThreadId : null} /> : <p className="pw-message">Choose a project first.</p>}</div>}
    </section>}
    <button className="pw-sidebar-resize" role="separator" aria-label="Resize Workspace sidebar" aria-orientation="vertical" aria-valuenow={width ?? 480} aria-valuemin={360} aria-valuemax={Math.max(360, Math.floor(window.innerWidth * .48))}
      onPointerDown={event => { resizing.current = { x: event.clientX, width: shell.current?.getBoundingClientRect().width ?? 480 }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (resizing.current) setWidth(Math.max(360, Math.min(window.innerWidth * 0.48, resizing.current.width + event.clientX - resizing.current.x))); }}
      onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidth(Math.max(360, Math.min(window.innerWidth * 0.48, (width ?? 480) + (event.key === "ArrowRight" ? 24 : -24)))); } }} />
  </div>;
}
