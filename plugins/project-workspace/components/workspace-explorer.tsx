import { useEffect, useMemo, useState } from "react";
import { experimental_FileLink as FileLink, useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { absolutePath, errorMessage, explorerSource, normalizePath, relativeInside, type ExplorerSource } from "../lib/workspace-model";
import { Icon } from "./ui/icon";
import { FileIcon } from "./ui/file-icon";
import { projectExplorerSources } from "../lib/explorer-model";
import { WorkspaceFilePreview, type FilePreviewRequest } from "./workspace-file-preview";
import { openWorkspacePreview } from "../lib/native-preview";

type Entry = { kind: "file" | "directory"; name: string; path: string };
function Directory({ source, path, previewThreadId, onPreview, depth = 0 }: { source: ExplorerSource; path: string; previewThreadId: string | null; onPreview(request: FilePreviewRequest): void; depth?: number }) {
  const sdk = useSdk();
  const [entries, setEntries] = useState<Entry[] | null>(null), [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(300);
  const [retry, setRetry] = useState(0), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const controller = new AbortController();
    setEntries(null); setError(null);
    sdk.hosts.directory({ hostId: source.hostId, path, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      // The host can resolve symlinks. Refuse listings whose resolved directory
      // escapes the selected root or does not match the requested folder.
      if (normalizePath(result.directory) !== normalizePath(path)) throw new Error("Folder resolves outside the selected workspace path.");
      const valid = result.entries.filter(entry => {
        const relative = relativeInside(path, entry.path);
        return relative !== null && relative !== "" && !relative.includes("/") && relativeInside(source.root, entry.path) !== null;
      });
      setEntries(valid.sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name)));
    }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => controller.abort();
  }, [sdk, source.hostId, source.root, path, retry]);
  if (error) return <div className="pw-message" role="alert">{error}<button className="pw-control" onClick={() => setRetry(n => n + 1)}>Retry folder</button></div>;
  if (entries === null) return <p className="pw-message" role="status">Loading files…</p>;
  if (!entries.length) return <p className="pw-message">{depth ? "Empty folder" : "This workspace has no files."}</p>;
  return <div className="pw-file-list" role="group">
    {entries.slice(0, limit).map(entry => {
      const relative = relativeInside(source.root, entry.path)!;
      const open = expanded.has(entry.path);
      return <div key={entry.path}>
        {entry.kind === "directory" ? <button className="pw-file-row" style={{ paddingInlineStart: 10 + depth * 14 }}
          aria-expanded={open} onClick={() => setExpanded(previous => {
            const next = new Set(previous); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next;
          })}><Icon name={open ? "ChevronDown" : "ChevronRight"} className="pw-small-icon" /><FileIcon name={entry.name} folder open={open} /><span>{entry.name}</span></button> :
          <FileLink className="pw-file-row" style={{ paddingInlineStart: 26 + depth * 14 }} onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            event.preventDefault();
            const target = source.environmentId ? { kind: "workspace" as const, environmentId: source.environmentId, path: relative } :
              { kind: "host" as const, hostId: source.hostId, path: entry.path };
            if (!openWorkspacePreview(previewThreadId, { target, location: null }))
              onPreview({ source, path: entry.path, name: entry.name });
          }}
            target={source.environmentId ? { kind: "workspace", environmentId: source.environmentId, path: relative } : { kind: "host", hostId: source.hostId, path: entry.path }}>
            <FileIcon name={entry.name} /><span>{entry.name}</span>
          </FileLink>}
        {entry.kind === "directory" && open && <Directory source={source} path={entry.path} previewThreadId={previewThreadId} onPreview={onPreview} depth={depth + 1} />}
      </div>;
    })}
    {entries.length > limit && <button className="pw-control" onClick={() => setLimit(n => n + 300)}>Show more ({limit} of {entries.length})</button>}
  </div>;
}

export function WorkspaceExplorer({ projectId, threads, activeThreadId, previewThreadId }: {
  projectId: string; threads: readonly PluginSidebarThread[]; activeThreadId: string | null; previewThreadId: string | null;
}) {
  const sdk = useSdk();
  const [preview, setPreview] = useState<FilePreviewRequest | null>(null);
  const [sources, setSources] = useState<ExplorerSource[]>([]), [chosen, setChosen] = useState("");
  const [personal, setPersonal] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  // Thread workspaces are useful fallbacks for Personal. Ordinary projects use
  // their real default source, including projects that have never had a session.
  const candidates = useMemo(() => {
    const result: ExplorerSource[] = [];
    const ordered = [...threads].sort((a, b) => Number(b.id === activeThreadId) - Number(a.id === activeThreadId) || b.latestAttentionAt - a.latestAttentionAt);
    for (const thread of ordered) {
      const source = explorerSource(thread, projectId);
      if (source && !result.some(other => other.hostId === source.hostId && other.root === source.root)) result.push(source);
    }
    return result;
  }, [threads, activeThreadId, projectId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setSources([]); setChosen(""); setError(null); setPersonal(false); setPreview(null);
    void (async () => {
      const project = await sdk.projects.get({ projectId, signal: controller.signal });
      if (controller.signal.aborted) return;
      setPersonal(project.kind === "personal");
      const roots = projectExplorerSources(projectId, project.sources);
      if (roots.length) { setSources(roots); return; }
      // Personal has no project-level root. Pick a real ready environment;
      // browsing does not create, navigate to or require selecting a session.
      if (project.kind === "personal") {
        const environments = await sdk.environments.list({ projectId, status: "ready", limit: 100, signal: controller.signal });
        if (controller.signal.aborted) return;
        const roots = environments.filter(e => e.projectId === projectId && e.status === "ready" && e.lifecycle.phase === "active" && e.hostId && e.path && absolutePath(e.path))
          .sort((a, b) => b.updatedAt - a.updatedAt).map(e => ({ threadId: e.id, projectId, hostId: e.hostId, environmentId: e.id, root: normalizePath(e.path!), label: e.name ?? e.path! }));
        setSources(roots);
      }
    })().catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sdk, projectId, retry]);
  const available = sources.length ? sources : personal ? candidates : [];
  // Prefer the currently open Personal environment when it is part of the
  // catalog, otherwise default source/latest available environment.
  const preferred = available.find(source => source.environmentId && source.environmentId === candidates[0]?.environmentId) ?? available[0];
  const source = available.find(source => source.threadId === chosen) ?? preferred;
  return <div className="pw-explorer">
    <WorkspaceFilePreview request={preview} onClose={() => setPreview(null)} />
    {available.length > 1 && <label className="pw-source-label">Workspace
      <select aria-label="Explorer workspace" value={source?.threadId ?? ""} onChange={event => setChosen(event.target.value)}>
        {available.map(source => <option key={source.threadId} value={source.threadId}>{source.root} · {source.hostId}</option>)}
      </select>
    </label>}
    {loading ? <p className="pw-message" role="status">Loading project workspace…</p> : source ? <>
      <div className="pw-explorer-root" title={`${source.root} · ${source.hostId}`}><FileIcon name="root" folder open /><span>{source.root.split("/").filter(Boolean).at(-1) ?? source.root}</span><button className="pw-icon-button" aria-label="Refresh Explorer" onClick={() => setRetry(n => n + 1)}><Icon name="RefreshCw" className="pw-small-icon" /></button></div>
      <div className="pw-explorer-scroll"><Directory key={`${source.projectId}/${source.hostId}/${source.root}/${retry}`} source={source} path={source.root} previewThreadId={previewThreadId} onPreview={setPreview} /></div>
    </> : error ? <p className="pw-message" role="alert">Could not load project workspace: {error}<button className="pw-control" onClick={() => setRetry(n => n + 1)}>Retry workspace</button></p> : <p className="pw-message">No project folder is available. Add a folder in the project settings.</p>}
  </div>;
}
