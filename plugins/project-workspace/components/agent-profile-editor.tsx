import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { experimental_ProviderModelPicker as ProviderModelPicker, useRpc, useSdk, type ExperimentalProviderModelPickerValue } from "@get-bb/plugin-sdk/app";
import type { rpcContract, AgentProfile, AgentFields, AgentSkill, LegacyAgent } from "../lib/agent-contract";
import { errorMessage } from "../lib/workspace-model";
import { AgentAvatar, AGENT_COLORS } from "./agent-avatar";
import { BotDeleteDialog, botHeading } from "./bot-delete-dialog";
import { Icon } from "./ui/icon";

const blank: AgentFields = { name: "", role: "", avatar: "ghost", color: AGENT_COLORS[0], instructions: "", soul: "", sharedRules: "", defaults: {}, basis: null };
type ScopeProject = { id: string; name: string };
export function AgentProfileEditor({ profile, legacy, projects, projectId, environmentId, onClose, onSaved, refresh, returnFocus, onRemoved }: {
  profile: AgentProfile | null; legacy?: LegacyAgent; projects: readonly ScopeProject[]; projectId?: string; environmentId: string | null;
  onClose(): void; onSaved(profile: AgentProfile): void; refresh(): void; returnFocus?: HTMLElement | null; onRemoved(id: string): void;
}) {
  const [deleting, setDeleting] = useState(false);
  const deleteOpener = useRef<HTMLElement | null>(null), deleted = useRef(false), fallback = useRef(botHeading(returnFocus));
  const rpc = useRpc<typeof rpcContract>(), sdk = useSdk();
  const [draft, setDraft] = useState<AgentFields>(() => profile ? { name: profile.name, role: profile.role, avatar: profile.avatar, color: profile.color, instructions: profile.instructions, soul: profile.soul ?? "", sharedRules: profile.sharedRules, defaults: profile.defaults, basis: profile.basis } : { ...blank, name: legacy?.name ?? "", color: legacy?.color ?? blank.color });
  const [revision, setRevision] = useState(profile?.revision ?? 0), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState<AgentProfile | null>(null);
  const [fromSkill, setFromSkill] = useState(false), [scope, setScope] = useState(projectId ?? projects[0]?.id ?? ""), [skillId, setSkillId] = useState(""), [skillQuery, setSkillQuery] = useState("");
  const [skills, setSkills] = useState<AgentSkill[]>([]), [loadingSkills, setLoadingSkills] = useState(false), [skillError, setSkillError] = useState<string | null>(null), [skillRetry, setSkillRetry] = useState(0), [importing, setImporting] = useState(false);
  const [defaultsEnabled, setDefaultsEnabled] = useState(!!draft.defaults.providerId), [execution, setExecution] = useState<ExperimentalProviderModelPickerValue | null>(() => draft.defaults.providerId && draft.defaults.model ? { providerId: draft.defaults.providerId, model: draft.defaults.model, reasoningLevel: draft.defaults.reasoningLevel ?? "medium", ...(draft.defaults.serviceTier ? { serviceTier: draft.defaults.serviceTier } : {}) } : null);
  const [defaultError, setDefaultError] = useState<string | null>(null), [defaultRetry, setDefaultRetry] = useState(0);
  const scopeEnvironmentId = scope === projectId ? environmentId : null;
  const matchesSkill = (skill: AgentSkill, query: string) => [skill.name, skill.description, skill.provider, skill.pluginId, skill.scope, skill.filePath].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const matchingSkills = skills.filter(skill => matchesSkill(skill, skillQuery));
  const selectedSkill = skills.find(skill => skill.id === skillId);
  const importingRef = useRef(false), createdProfile = useRef<AgentProfile | null>(null);
  useEffect(() => {
    if (!fromSkill || !scope) return;
    let cancelled = false; setLoadingSkills(true); setSkillError(null); setSkills([]); setSkillId(""); setSkillQuery("");
    void rpc.call("listAgentSkills", { projectId: scope, environmentId: scopeEnvironmentId }).then(result => {
      if (!cancelled) { setSkills(result.skills); setSkillId(result.skills[0]?.id ?? ""); }
    }, cause => { if (!cancelled) setSkillError(errorMessage(cause)); }).finally(() => { if (!cancelled) setLoadingSkills(false); });
    return () => { cancelled = true; };
  }, [rpc, fromSkill, scope, scopeEnvironmentId, skillRetry]);
  useEffect(() => {
    if (!defaultsEnabled || execution) return;
    const controller = new AbortController(); setDefaultError(null);
    void (async () => {
      const providers = await sdk.providers.list(environmentId ? { environmentId, signal: controller.signal } : { signal: controller.signal });
      const provider = providers.find(item => item.available);
      if (!provider) throw new Error("No available provider. Check the machine's provider setup.");
      const catalog = await sdk.providers.models(environmentId ? { providerId: provider.id, environmentId, signal: controller.signal } : { providerId: provider.id, signal: controller.signal });
      if (controller.signal.aborted) return;
      const model = catalog.models.find(item => item.isDefault) ?? catalog.models[0];
      if (!model) throw new Error(catalog.modelLoadError?.detail ?? "No available model. Check the machine's provider setup.");
      setExecution({ providerId: model.routeProviderId ?? provider.id, model: model.model, reasoningLevel: model.defaultReasoningEffort });
    })().catch(cause => { if (!controller.signal.aborted) setDefaultError(errorMessage(cause)); });
    return () => controller.abort();
  }, [sdk, defaultsEnabled, execution, environmentId, defaultRetry]);
  async function importSkill() {
    if (!scope || !skillId || importingRef.current) return;
    importingRef.current = true; setImporting(true); setSkillError(null);
    try {
      const result = await rpc.call("readAgentSkill", { projectId: scope, environmentId: scopeEnvironmentId, skillId });
      setDraft(previous => ({ ...previous, instructions: result.content, basis: result.basis, name: previous.name || result.basis.name, role: previous.role || result.basis.name }));
    } catch (cause) { setSkillError(errorMessage(cause)); }
    finally { importingRef.current = false; setImporting(false); }
  }
  async function save() {
    if (saving || !draft.name.trim() || !draft.role.trim() || !draft.instructions.trim() || defaultsEnabled && !execution) return;
    setSaving(true); setError(null); setConflict(false);
    try {
      const saved = createdProfile.current ?? await rpc.call("saveSpecialist", { ...draft, defaults: defaultsEnabled && execution ? execution : {}, ...(profile ? { id: profile.id } : {}), expectedRevision: revision });
      if (legacy) {
        createdProfile.current = saved;
        try { await rpc.call("bindAgentThread", { agentId: saved.id, threadId: legacy.threadId }); }
        catch (cause) { setError(`Profile saved, but the saved chat could not be attached: ${errorMessage(cause)}. Attach it from Sessions.`); setLatest(saved); setRevision(saved.revision); refresh(); return; }
      }
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
      if (profile) {
        try { const result = await rpc.call("listSpecialists"); const current = result.profiles.find(item => item.id === profile.id); if (current && current.revision !== revision) { setLatest(current); setConflict(true); } } catch { /* Original failure remains visible. */ }
      }
    } finally { setSaving(false); }
  }
  function adoptLatest() {
    if (!latest) return;
    setRevision(latest.revision); setConflict(false); setError(null);
  }
  return <><Dialog.Root open onOpenChange={open => { if (!open && !saving && !importing) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="pw-preview-overlay" />
    <Dialog.Content className="pw-agent-dialog" onCloseAutoFocus={event => { event.preventDefault(); if (deleted.current) fallback.current?.focus(); else if (returnFocus?.isConnected) returnFocus.focus(); }} onEscapeKeyDown={event => { if (saving || importing) event.preventDefault(); }} onPointerDownOutside={event => { if (saving || importing) event.preventDefault(); }}>
      <header className="pw-preview-heading"><AgentAvatar avatar={draft.avatar} color={draft.color} /><Dialog.Title>{profile ? "Edit bot profile" : legacy ? "Create a bot from saved chat" : "Create bot"}</Dialog.Title><button type="button" className="pw-icon-button" aria-label="Close bot editor" disabled={saving || importing} onClick={onClose}><Icon name="X" className="pw-icon" /></button></header>
      <Dialog.Description className="pw-agent-description">One specialist, many chats. Instructions, SOUL.md personality and shared rules follow this identity across projects.</Dialog.Description>
      <form className="pw-profile-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className="pw-profile-fields" disabled={saving || !!createdProfile.current}>
          <div className="pw-form-pair"><label>Name<input autoFocus value={draft.name} maxLength={80} required onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} disabled={saving} placeholder="Your bot's name" /></label><label>Role<input value={draft.role} maxLength={160} required onChange={event => setDraft(previous => ({ ...previous, role: event.target.value }))} disabled={saving} placeholder="Frontend specialist" /></label></div>
          <div className="pw-avatar-options"><div className="pw-avatar-style"><span className="pw-avatar-style-label">Avatar</span><span className="pw-avatar-style-preview"><AgentAvatar avatar={draft.avatar} color={draft.color} size={32} /><span>Pebble</span></span></div><fieldset className="pw-agent-colors"><legend>Color</legend>{AGENT_COLORS.map(color => <button key={color} type="button" className="pw-color-choice" style={{ background: color }} aria-label={`Color ${color}`} aria-pressed={draft.color === color} disabled={saving} onClick={() => setDraft(previous => ({ ...previous, color }))} />)}</fieldset></div>
          <label className="pw-check"><input type="checkbox" checked={fromSkill} disabled={saving || importing} onChange={event => setFromSkill(event.target.checked)} />Start from an available skill</label>
          {fromSkill && <div className="pw-skill-basis"><label>Skill project<select value={scope} disabled={saving || importing} onChange={event => setScope(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Search skills<input value={skillQuery} disabled={loadingSkills || importing || saving} placeholder="Name, provider, or source…" onChange={event => { const query = event.target.value; setSkillQuery(query); setSkillId(skills.find(skill => matchesSkill(skill, query))?.id ?? ""); }} /></label><label>Available skill<select value={skillId} disabled={loadingSkills || importing || saving} onChange={event => setSkillId(event.target.value)}><option value="">{loadingSkills ? "Loading skills…" : matchingSkills.length ? "Select skill" : skillQuery ? "No matching skills" : "No skills available"}</option>{matchingSkills.map(skill => <option value={skill.id} key={skill.id}>{[skill.name, skill.provider, skill.pluginId, skill.scope].filter(Boolean).join(" · ")}</option>)}</select></label>
            {selectedSkill && <><p className="pw-field-note">{selectedSkill.description}</p><p className="pw-field-note pw-skill-source">{selectedSkill.filePath}</p></>}
            {skillError && <p role="alert" className="pw-form-error">{skillError}<button type="button" className="pw-control" onClick={() => setSkillRetry(value => value + 1)}>Retry skills</button></p>}
            <button type="button" className="pw-control" disabled={!skillId || importing || saving || loadingSkills} onClick={() => void importSkill()}>{importing ? "Reading skill…" : draft.instructions.trim() ? "Replace instructions with skill" : "Use skill instructions"}</button>
          </div>}
          <label>Instructions<textarea value={draft.instructions} rows={9} maxLength={100000} required disabled={saving || importing} onChange={event => setDraft(previous => ({ ...previous, instructions: event.target.value }))} placeholder="What this bot does, how it works, and its boundaries…" /></label>
          {draft.basis && <p className="pw-field-note">Based on {draft.basis.name}. This editable copy does not change the source skill.</p>}
          <label>SOUL.md<textarea value={draft.soul} rows={5} maxLength={20000} disabled={saving || importing} onChange={event => setDraft(previous => ({ ...previous, soul: event.target.value }))} placeholder="Personality, voice, style and values. For example: calm, direct, explain with concrete examples…" /><span className="pw-field-note">Optional personality document. Keep tasks and operational boundaries in Instructions; SOUL.md never overrides them.</span></label>
          <label>Shared rules<textarea value={draft.sharedRules} rows={3} maxLength={20000} disabled={saving} onChange={event => setDraft(previous => ({ ...previous, sharedRules: event.target.value }))} placeholder="Rules you choose to use across all projects…" /></label>
          <label className="pw-check"><input type="checkbox" checked={defaultsEnabled} disabled={saving} onChange={event => setDefaultsEnabled(event.target.checked)} />Use bot's execution defaults</label>
          {defaultsEnabled ? execution ? <ProviderModelPicker value={execution} onChange={setExecution} disabled={saving} routing={environmentId ? { kind: "environment", environmentId } : undefined} /> : defaultError ? <p role="alert" className="pw-form-error">{defaultError}<button type="button" className="pw-control" onClick={() => setDefaultRetry(value => value + 1)}>Retry models</button></p> : <p role="status" className="pw-field-note">Loading available models…</p> : <p className="pw-field-note">New chats use BB's remembered project selections. You can change them in the native composer.</p>}
          {conflict && latest && <div className="pw-conflict" role="alert"><p>Another window saved this profile. Your draft is kept; review the saved version before retrying.</p><details><summary>View saved version</summary><strong>{latest.name} · {latest.role}</strong><pre>{latest.instructions}</pre><strong>SOUL.md</strong><pre>{latest.soul}</pre><pre>{latest.sharedRules}</pre><p>{latest.avatar} · {latest.color}</p><pre>{JSON.stringify(latest.defaults, null, 2)}</pre>{latest.basis && <p>{latest.basis.name} · {latest.basis.filePath}</p>}</details><button type="button" className="pw-control" onClick={adoptLatest}>Keep my draft and use latest revision</button></div>}
          {error && <p className="pw-form-error" role="alert">{error}</p>}
        </fieldset>
        <footer className="pw-dialog-actions">{profile && <button type="button" className="pw-control pw-danger pw-delete-entry" disabled={saving || importing} onClick={event => { deleteOpener.current = event.currentTarget; setDeleting(true); }}>Delete bot…</button>}<button type="button" className="pw-control" disabled={saving || importing} onClick={onClose}>Cancel</button><button type="submit" className="pw-control pw-primary" disabled={saving || importing || conflict || !draft.name.trim() || !draft.role.trim() || !draft.instructions.trim() || defaultsEnabled && !execution}>{saving ? "Saving…" : createdProfile.current ? "Retry attaching saved chat" : profile ? "Save profile" : "Create bot"}</button></footer>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>{deleting && profile && <BotDeleteDialog fallbackFocus={fallback.current} profile={profile} returnFocus={deleteOpener.current} onClose={() => setDeleting(false)} onDeleted={id => { deleted.current = true; onRemoved(id); onClose(); }} />}</>;
}
