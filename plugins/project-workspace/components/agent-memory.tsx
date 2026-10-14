import { useEffect, useRef, useState } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { rpcContract, AgentMemory, AgentProfile } from "../lib/agent-contract";
import { errorMessage } from "../lib/workspace-model";

export type AgentMemoryDraft = { memory: AgentMemory; draft: string };
export function AgentMemoryEditor({ profile, projectId, projectName, onEditProfile, drafts }: { profile: AgentProfile; projectId: string | null; projectName: string; onEditProfile(trigger: HTMLButtonElement): void; drafts: Map<string, AgentMemoryDraft> }) {
  const rpc = useRpc<typeof rpcContract>();
  const key = `${profile.id}/${projectId}`;
  const [memory, setMemory] = useState<AgentMemory | null>(null), [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  const savingNow = useRef(false), refreshAfterSave = useRef(false), lastSavedRevision = useRef<number | null>(null);
  useRealtime("agents-changed", () => {
    if (savingNow.current) refreshAfterSave.current = true;
    else setRetry(value => value + 1);
  });
  const [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0), [conflict, setConflict] = useState<AgentMemory | null>(null);
  useEffect(() => {
    if (!projectId) return;
    if (savingNow.current) { refreshAfterSave.current = true; return; }
    let cancelled = false; setLoading(true); setError(null); setMemory(null);
    void rpc.call("getAgentMemory", { agentId: profile.id, projectId }).then(result => {
      if (cancelled) return;
      if (savingNow.current) { refreshAfterSave.current = true; return; }
      const cached = drafts.get(key);
      setSaved(!cached && lastSavedRevision.current === result.revision);
      setMemory(cached?.memory ?? result); setDraft(cached?.draft ?? result.content); setDirty(!!cached); setConflict(cached && cached.memory.revision !== result.revision ? result : null);
    }, cause => { if (!cancelled) setError(errorMessage(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rpc, profile.id, projectId, retry, drafts, key]);
  async function save() {
    if (!projectId || !memory || savingNow.current) return;
    savingNow.current = true; setSaving(true); setError(null); setSaved(false);
    try {
      const result = await rpc.call("saveAgentMemory", { agentId: profile.id, projectId, expectedRevision: memory.revision, content: draft });
      // The successful CAS result commits this authored draft. Realtime from
      // that same write must not compare it against its pre-save revision.
      drafts.delete(key); lastSavedRevision.current = result.revision; setMemory(result); setDraft(result.content); setDirty(false); setConflict(null); setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
      try { const latest = await rpc.call("getAgentMemory", { agentId: profile.id, projectId }); if (latest.revision !== memory.revision) setConflict(latest); } catch { /* Keep the authored draft and original failure. */ }
    } finally {
      savingNow.current = false; setSaving(false);
      if (refreshAfterSave.current) { refreshAfterSave.current = false; setRetry(value => value + 1); }
    }
  }
  return <div className="pw-agent-detail-scroll pw-memory-view">
    <section className="pw-agent-detail-section"><div className="pw-detail-heading"><h3>Shared rules</h3><button className="pw-control" onClick={event => onEditProfile(event.currentTarget)}>Edit</button></div><p className="pw-field-note">Across projects. Only changed by your instruction.</p><pre className="pw-memory-rules">{profile.sharedRules || "No shared rules added."}</pre></section>
    <section className="pw-agent-detail-section"><h3>{projectId ? `${projectName} memory` : "Project memory"}</h3><p className="pw-field-note">Verified project facts stay in this project. The bot can add them during work.</p>
      {!projectId ? <p className="pw-field-note">Choose one project above to view its memory.</p> : loading ? <p role="status" className="pw-field-note">Loading project memory…</p> : memory ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>Project facts<textarea aria-label="Project facts" value={draft} rows={12} maxLength={40000} disabled={saving} placeholder="No verified facts saved yet." onChange={event => { setDraft(event.target.value); setDirty(true); setSaved(false); drafts.set(key, { memory, draft: event.target.value }); }} /></label>
        {memory.updatedAt && <p className="pw-field-note">Last updated by {memory.source === "agent" ? "bot" : "you"} · {new Date(memory.updatedAt).toLocaleString()}</p>}
        {conflict && <div className="pw-conflict" role="alert"><p>Project memory changed elsewhere. Your draft is kept.</p><details><summary>View saved facts</summary><pre>{conflict.content || "No facts."}</pre></details><div className="pw-inline-actions"><button type="button" className="pw-control" onClick={() => { drafts.set(key, { memory: conflict, draft }); setMemory(conflict); setConflict(null); setError(null); }}>Keep my draft</button><button type="button" className="pw-control" onClick={() => { drafts.delete(key); setMemory(conflict); setDraft(conflict.content); setDirty(false); setConflict(null); setError(null); }}>Use saved facts</button></div></div>}
        {error && <p role="alert" className="pw-form-error">{error}</p>}
        <div className="pw-inline-actions"><button className="pw-control pw-primary" type="submit" disabled={saving || !dirty || !!conflict}>{saving ? "Saving…" : "Save memory"}</button><button className="pw-control" type="button" disabled={saving || !dirty} onClick={() => { drafts.delete(key); setDraft(memory.content); setDirty(false); setError(null); setConflict(null); }}>Cancel changes</button></div>
        {saved && <p role="status" className="pw-field-note">Project memory saved.</p>}
      </form> : error ? <p role="alert" className="pw-form-error">{error}<button className="pw-control" onClick={() => setRetry(value => value + 1)}>Retry memory</button></p> : null}
    </section>
  </div>;
}
