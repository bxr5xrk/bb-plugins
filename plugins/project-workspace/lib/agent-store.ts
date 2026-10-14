import { createHash, randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { agentProfileSchema, type AgentBinding, type AgentFields, type AgentMemory, type AgentProfile } from "./agent-contract";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type BindingRow = { thread_id: string; agent_id: string; project_id: string; created_at: number; loaded_hash: string | null; loaded_at: number | null; work: string | null };
export type Operation = { key: string; kind: string; agent_id: string; project_id: string; fingerprint: string; token: string; thread_id: string | null; state: string; work: string | null; result: string | null };

export function createAgentStore(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    "CREATE TABLE specialists (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL)",
    "CREATE TABLE specialist_threads (thread_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES specialists(id), project_id TEXT NOT NULL, created_at INTEGER NOT NULL, loaded_hash TEXT, loaded_at INTEGER, work TEXT)",
    "CREATE INDEX specialist_threads_agent ON specialist_threads(agent_id, project_id)",
    "CREATE TABLE specialist_memory (agent_id TEXT NOT NULL REFERENCES specialists(id), project_id TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL, updated_at INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY(agent_id, project_id))",
    "CREATE TABLE specialist_operations (key TEXT PRIMARY KEY, kind TEXT NOT NULL, agent_id TEXT NOT NULL, project_id TEXT NOT NULL, fingerprint TEXT NOT NULL, token TEXT NOT NULL UNIQUE, thread_id TEXT, state TEXT NOT NULL, work TEXT, result TEXT)",
    "CREATE TABLE specialist_learning (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, project_id TEXT NOT NULL, thread_id TEXT NOT NULL, fact TEXT NOT NULL, evidence TEXT NOT NULL, created_at INTEGER NOT NULL)",
    "CREATE TABLE specialist_reads (thread_id TEXT PRIMARY KEY, hash TEXT NOT NULL, next_offset INTEGER NOT NULL, runtime_sequence INTEGER NOT NULL)",
    "ALTER TABLE specialist_threads ADD COLUMN grant_revision INTEGER NOT NULL DEFAULT 0",
  ]);
  function profile(id: string): AgentProfile {
    const row = db.prepare("SELECT document FROM specialists WHERE id=?").get(id) as { document: string } | undefined;
    if (!row) throw new Error("Specialist not found.");
    return agentProfileSchema.parse(JSON.parse(row.document));
  }
  function profiles(): AgentProfile[] {
    return (db.prepare("SELECT document FROM specialists ORDER BY id").all() as { document: string }[]).map(row => agentProfileSchema.parse(JSON.parse(row.document)));
  }
  function save(fields: AgentFields, id: string | undefined, expectedRevision: number): AgentProfile {
    return db.transaction(() => {
      const previous = id ? profile(id) : null;
      if ((previous?.revision ?? 0) !== expectedRevision) throw new Error("Profile changed in another window. Reload before saving; your draft is preserved.");
      if (!previous && profiles().length >= 1000) throw new Error("Specialist limit reached.");
      const now = Date.now();
      const next: AgentProfile = { ...fields, id: id ?? randomUUID(), revision: expectedRevision + 1, hash: digest(fields), createdAt: previous?.createdAt ?? now, updatedAt: now };
      if (previous) {
        if (db.prepare("UPDATE specialists SET revision=?,document=? WHERE id=? AND revision=?").run(next.revision, JSON.stringify(next), next.id, expectedRevision).changes !== 1) throw new Error("Profile changed in another window.");
      } else db.prepare("INSERT INTO specialists(id,revision,document) VALUES (?,?,?)").run(next.id, next.revision, JSON.stringify(next));
      return next;
    })();
  }
  function memory(agentId: string, projectId: string): AgentMemory {
    profile(agentId);
    const row = db.prepare("SELECT revision,content,updated_at,source FROM specialist_memory WHERE agent_id=? AND project_id=?").get(agentId, projectId) as { revision: number; content: string; updated_at: number; source: "user" | "agent" } | undefined;
    return { agentId, projectId, revision: row?.revision ?? 0, content: row?.content ?? "", updatedAt: row?.updated_at ?? null, source: row?.source ?? null };
  }
  function saveMemory(agentId: string, projectId: string, expectedRevision: number, content: string, source: "user" | "agent"): AgentMemory {
    return db.transaction(() => {
      const current = memory(agentId, projectId);
      if (current.revision !== expectedRevision) throw new Error("Memory changed in another window. Reload before saving; your draft is preserved.");
      const now = Date.now();
      db.prepare("INSERT INTO specialist_memory(agent_id,project_id,revision,content,updated_at,source) VALUES(?,?,?,?,?,?) ON CONFLICT(agent_id,project_id) DO UPDATE SET revision=excluded.revision,content=excluded.content,updated_at=excluded.updated_at,source=excluded.source").run(agentId, projectId, expectedRevision + 1, content, now, source);
      return memory(agentId, projectId);
    })();
  }
  // Changing the serialized runtime document must invalidate persisted partial
  // reads, even when an older profile's new optional document is still empty.
  function runtimeHash(agentId: string, projectId: string) { const current = profile(agentId); return digest({ documentVersion: 2, profile: current.hash, profileRevision: current.revision, memory: memory(agentId, projectId).revision }); }
  function binding(threadId: string): AgentBinding | null {
    const row = db.prepare("SELECT * FROM specialist_threads WHERE thread_id=?").get(threadId) as BindingRow | undefined;
    if (!row) return null;
    return { threadId: row.thread_id, agentId: row.agent_id, projectId: row.project_id, createdAt: row.created_at, loadedHash: row.loaded_hash, loadedAt: row.loaded_at, coordinationAllowed: !!row.work, coordinationWork: row.work, state: row.loaded_hash === null ? "pending" : row.loaded_hash === runtimeHash(row.agent_id, row.project_id) ? "applied" : "outdated" };
  }
  function bind(threadId: string, agentId: string, projectId: string, work: string | null = null): AgentBinding {
    profile(agentId);
    const current = binding(threadId);
    if (current && (current.agentId !== agentId || current.projectId !== projectId)) throw new Error("This chat is already assigned to another specialist. Create a new chat instead.");
    if (!current) db.prepare("INSERT INTO specialist_threads(thread_id,agent_id,project_id,created_at,work) VALUES(?,?,?,?,?)").run(threadId, agentId, projectId, Date.now(), work);
    return binding(threadId)!;
  }
  function begin(key: string, kind: string, agentId: string, projectId: string, fingerprint: string, work: string | null): Operation {
    const existing = operation(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.kind !== kind || existing.agent_id !== agentId || existing.project_id !== projectId) throw new Error("Request token is already used by different work.");
      return existing;
    }
    db.prepare("INSERT INTO specialist_operations(key,kind,agent_id,project_id,fingerprint,token,state,work) VALUES(?,?,?,?,?,?,?,?)").run(key, kind, agentId, projectId, fingerprint, randomUUID(), "new", work);
    return operation(key)!;
  }
  function operation(key: string) { return db.prepare("SELECT * FROM specialist_operations WHERE key=?").get(key) as Operation | undefined; }
  function claim(token: string, threadId: string, projectId: string): AgentBinding | null {
    return db.transaction(() => {
      const op = db.prepare("SELECT * FROM specialist_operations WHERE token=?").get(token) as Operation | undefined;
      if (!op || op.kind !== "spawn" || op.project_id !== projectId || (op.thread_id && op.thread_id !== threadId)) return null;
      const result = bind(threadId, op.agent_id, projectId, op.work);
      db.prepare("UPDATE specialist_operations SET thread_id=?,state='done',result=? WHERE key=?").run(threadId, JSON.stringify({ threadId }), op.key);
      return result;
    })();
  }
  return {
    db, profile, profiles, save, memory, saveMemory, runtimeHash, binding, bind, operation, begin, claim,
    bindings: () => (db.prepare("SELECT thread_id FROM specialist_threads ORDER BY created_at DESC").all() as { thread_id: string }[]).map(row => binding(row.thread_id)!),
    setWork(threadId: string, work: string | null) { if (!binding(threadId)) throw new Error("Chat has no specialist."); db.prepare("UPDATE specialist_threads SET work=?,grant_revision=grant_revision+1 WHERE thread_id=?").run(work, threadId); return binding(threadId)!; },
    grantRevision(threadId: string) { return (db.prepare("SELECT grant_revision FROM specialist_threads WHERE thread_id=?").get(threadId) as { grant_revision: number } | undefined)?.grant_revision; },
    clearWorkIfRevision(threadId: string, revision: number) { return db.prepare("UPDATE specialist_threads SET work=NULL,grant_revision=grant_revision+1 WHERE thread_id=? AND grant_revision=? AND work IS NOT NULL").run(threadId, revision).changes === 1; },
    markLoaded(threadId: string, hash: string) { db.prepare("UPDATE specialist_threads SET loaded_hash=?,loaded_at=? WHERE thread_id=?").run(hash, Date.now(), threadId); },
    clearLoaded(threadId: string) { db.prepare("UPDATE specialist_threads SET loaded_hash=NULL,loaded_at=NULL WHERE thread_id=?").run(threadId); db.prepare("DELETE FROM specialist_reads WHERE thread_id=?").run(threadId); },
    unbind(threadId: string) { db.transaction(() => { db.prepare("DELETE FROM specialist_reads WHERE thread_id=?").run(threadId); db.prepare("DELETE FROM specialist_threads WHERE thread_id=?").run(threadId); })(); },
    readProgress(threadId: string) { return db.prepare("SELECT hash,next_offset,runtime_sequence FROM specialist_reads WHERE thread_id=?").get(threadId) as { hash: string; next_offset: number; runtime_sequence: number } | undefined; },
    saveProgress(threadId: string, hash: string, offset: number, runtimeSequence: number) { db.prepare("INSERT INTO specialist_reads(thread_id,hash,next_offset,runtime_sequence) VALUES(?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET hash=excluded.hash,next_offset=excluded.next_offset,runtime_sequence=excluded.runtime_sequence").run(threadId, hash, offset, runtimeSequence); },
    markOperation(key: string, state: string, result: unknown = null) { db.prepare("UPDATE specialist_operations SET state=?,result=? WHERE key=?").run(state, result === null ? null : JSON.stringify(result), key); },
    learn(agentId: string, projectId: string, threadId: string, expectedRevision: number, fact: string, evidence: string) {
      return db.transaction(() => {
        const existing = memory(agentId, projectId);
        const line = `- ${fact}\n  Evidence: ${evidence}`;
        const content = existing.content ? `${existing.content}\n\n${line}` : line;
        if (content.length > 40000) throw new Error("Project memory is full. Review it before adding facts.");
        const result = saveMemory(agentId, projectId, expectedRevision, content, "agent");
        db.prepare("INSERT INTO specialist_learning(id,agent_id,project_id,thread_id,fact,evidence,created_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(), agentId, projectId, threadId, fact, evidence, Date.now());
        return result;
      })();
    },
    remove(id: string, expectedRevision: number) {
      db.transaction(() => {
        if (profile(id).revision !== expectedRevision) throw new Error("Profile changed in another window. Reload before removing.");
        db.prepare("DELETE FROM specialist_reads WHERE thread_id IN (SELECT thread_id FROM specialist_threads WHERE agent_id=?)").run(id);
        db.prepare("DELETE FROM specialist_threads WHERE agent_id=?").run(id);
        db.prepare("DELETE FROM specialist_memory WHERE agent_id=?").run(id);
        db.prepare("DELETE FROM specialist_learning WHERE agent_id=?").run(id);
        db.prepare("DELETE FROM specialist_operations WHERE agent_id=?").run(id);
        db.prepare("DELETE FROM specialists WHERE id=? AND revision=?").run(id, expectedRevision);
      })();
    },
  };
}
