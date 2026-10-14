// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse, makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import type { NewThreadRequest } from "@get-bb/plugin-sdk";
import plugin from "../server";
import type { AgentProfile, AgentBinding, AgentMemory } from "../lib/agent-contract";
import { digest } from "../lib/agent-store";
const hosts: ReturnType<typeof createFakePluginHost>[] = [];
const fields = { name: "Reviewer", role: "Code quality", avatar: "owl", color: "#80cbc4", instructions: "Review code carefully and verify observations.", sharedRules: "Use Ukrainian summaries.", defaults: {}, basis: null };
const request = (projectId = "p1"): NewThreadRequest => ({ projectId, providerId: "codex", model: "gpt-6", reasoningLevel: "high", permissionMode: "accept-edits", executionInputSources: { providerId: "explicit", model: "explicit", permissionMode: "explicit" }, environment: { type: "reuse", environmentId: "env1" }, input: [{ type: "text", text: "Review", mentions: [] }] });
function setup() {
  const threads = new Map<string, ReturnType<typeof makeThreadResponse>>();
  const metadata = new Map<string, Record<string, string>>();
  let seq = 0;
  let pending: unknown[] = [];
  const host = createFakePluginHost({ pluginId: "project-workspace", sdk: {
    projects: { get: async ({ projectId }) => ({ id: projectId }) },
    skills: { list: async () => ({ skills: [{ id: "real-skill", name: "Backend", description: "Actual installed skill", filePath: "/skills/backend/SKILL.md", scope: "bb-user", pluginId: null, provider: null }] }), getContent: async () => ({ content: "# Backend\nInspect callers and test data integrity.", revision: "source-v1" }) },
    threads: {
      get: async ({ threadId }) => { if (threadId === "missing") throw new Error("Thread not found"); return threads.get(threadId) ?? makeThreadResponse({ id: threadId, projectId: "p1", environmentId: "env1" }); },
      getPluginMetadata: async ({ threadId }) => metadata.get(threadId) ?? {},
      updatePluginMetadata: async ({ threadId, set }) => { const next = { ...metadata.get(threadId), ...set }; metadata.set(threadId, next as Record<string, string>); return next; },
      list: async (args) => [...threads.values()].filter(item => item.projectId === args?.projectId),
      spawn: async args => { const thread = makeThreadResponse({ id: `spawn-${threads.size + 1}`, projectId: args.projectId, originPluginId: "project-workspace", environmentId: "env1" }); threads.set(thread.id, thread); metadata.set(thread.id, args.pluginMetadata as Record<string, string>); return thread; },
      send: async () => ({ ok: true, delivery: "sent" }),
      defaultExecutionOptions: async () => ({ model: "gpt-6", reasoningLevel: "high", permissionMode: "accept-edits", serviceTier: "default", source: "client/turn/start" }),
      events: { list: async () => seq ? [{ seq }] : [] },
      interactions: { list: async () => pending },
    },
  } });
  hosts.push(host); plugin(host.bb);
  return { ...host, threads, metadata, setSeq: (value: number) => { seq = value; }, setPending: (value: unknown[]) => { pending = value; } };
}
async function create(host: ReturnType<typeof setup>, overrides = {}) { return await host.harness.behavior.callRpc("saveSpecialist", { ...fields, ...overrides, expectedRevision: 0 }) as AgentProfile; }
async function bind(host: ReturnType<typeof setup>, agentId: string, threadId = "first") { return await host.harness.behavior.callRpc("bindAgentThread", { agentId, threadId }) as AgentBinding; }
async function roster(host: ReturnType<typeof setup>) { return await host.harness.behavior.callRpc("listSpecialists") as { profiles: AgentProfile[]; bindings: AgentBinding[]; legacy: unknown[] }; }
const context = { threadId: "first", projectId: "p1" };
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose())); });

describe("Persistent specialist profiles and real SQLite integrity", () => {
  it("loads pre-SOUL profiles without losing instructions or continuing an old runtime document", async () => {
    const host = setup(); const profile = await create(host, { instructions: "Original instructions. ".repeat(1000) }); await bind(host, profile.id);
    const oldDocument: Partial<AgentProfile> = { ...profile }; delete oldDocument.soul;
    const oldHash = digest({ profile: profile.hash, profileRevision: profile.revision, memory: 0 });
    const db = host.bb.storage.database();
    db.prepare("UPDATE specialists SET document=? WHERE id=?").run(JSON.stringify(oldDocument), profile.id);
    db.prepare("UPDATE specialist_threads SET loaded_hash=? WHERE thread_id='first'").run(oldHash);
    db.prepare("INSERT INTO specialist_reads(thread_id,hash,next_offset,runtime_sequence) VALUES('first',?,12000,0)").run(oldHash);
    const reloaded = await host.harness.lifecycle.reload(plugin); hosts.push(reloaded);
    const data = await reloaded.harness.behavior.callRpc("listSpecialists") as { profiles: AgentProfile[]; bindings: AgentBinding[] };
    expect(data.profiles[0]).toMatchObject({ id: profile.id, revision: 1, instructions: profile.instructions, soul: "" });
    expect(data.bindings[0]?.state).toBe("outdated");
    await expect(reloaded.harness.behavior.callAgentTool("workspace_agent_read", { offset: 12000, hash: oldHash }, context)).rejects.toThrow("Restart reading");
    const fresh = JSON.parse(await reloaded.harness.behavior.callAgentTool("workspace_agent_read", {}, context) as string);
    expect(fresh.hash).not.toBe(oldHash);
  });
  it("persists separate full SOUL.md, enforces bounds and invalidates reads on personality edits", async () => {
    const host = setup(); const soul = "Warm, direct Ukrainian voice; concrete examples. ".repeat(300);
    const profile = await create(host, { soul }); await bind(host, profile.id);
    let chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context) as string); let content = chunk.content;
    const hash = chunk.hash;
    while (chunk.nextOffset !== null) { chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", { offset: chunk.nextOffset, hash }, context) as string); content += chunk.content; }
    expect(JSON.parse(content)).toMatchObject({ instructions: fields.instructions, soul: { fileName: "SOUL.md", content: soul } });
    expect((await roster(host)).bindings[0]?.state).toBe("applied");
    const changed = await host.harness.behavior.callRpc("saveSpecialist", { ...fields, id: profile.id, expectedRevision: 1, soul: "Concise, calm and candid." }) as AgentProfile;
    expect(changed.hash).not.toBe(profile.hash); expect(changed.instructions).toBe(profile.instructions);
    expect((await roster(host)).bindings[0]?.state).toBe("outdated");
    await expect(host.harness.behavior.callRpc("saveSpecialist", { ...fields, id: profile.id, expectedRevision: 1, soul: "Stale draft" })).rejects.toThrow("another window");
    await expect(host.harness.behavior.callRpc("saveSpecialist", { ...fields, expectedRevision: 0, soul: "x".repeat(20001) })).rejects.toMatchObject({ code: "invalid_input" });
    const reloaded = await host.harness.lifecycle.reload(plugin); hosts.push(reloaded);
    expect((await reloaded.harness.behavior.callRpc("listSpecialists") as { profiles: AgentProfile[] }).profiles[0]?.soul).toBe("Concise, calm and candid.");
    expect(host.harness.inspection.sdk.callsTo("files.write")).toEqual([]);
  });
  it("persists immutable identity across rename and reload and preserves all chat bindings", async () => {
    const host = setup(); const profile = await create(host);
    await bind(host, profile.id, "first"); await bind(host, profile.id, "second");
    await host.harness.behavior.callRpc("saveSpecialist", { ...fields, id: profile.id, expectedRevision: 1, name: "Senior reviewer" });
    const reloaded = await host.harness.lifecycle.reload(plugin); hosts.push(reloaded);
    const data = await reloaded.harness.behavior.callRpc("listSpecialists") as { profiles: AgentProfile[]; bindings: AgentBinding[] };
    expect(data.profiles[0]).toMatchObject({ id: profile.id, name: "Senior reviewer", revision: 2 });
    expect(data.bindings.map(item => item.agentId)).toEqual([profile.id, profile.id]);
    expect(reloaded.bb.storage.database().prepare("SELECT COUNT(*) AS n FROM specialists").get()).toEqual({ n: 1 });
  });
  it("enforces concurrent revision updates in SQLite and leaves the losing draft without clobbering", async () => {
    const host = setup(); const profile = await create(host);
    const result = await Promise.allSettled(["One", "Two"].map(name => host.harness.behavior.callRpc("saveSpecialist", { ...fields, id: profile.id, expectedRevision: 1, name })));
    expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(item => item.status === "rejected")).toHaveLength(1);
    expect((await roster(host)).profiles[0]?.revision).toBe(2);
    await expect(host.harness.behavior.callRpc("saveSpecialist", { ...fields, expectedRevision: 0, name: "" })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("preserves legacy shortcuts without inventing instructions, running or deleting chats", async () => {
    const host = setup(); await host.harness.behavior.callRpc("saveAgent", { threadId: "first", name: "Old named chat", color: "#80cbc4" });
    expect((await roster(host)).legacy).toHaveLength(1); expect((await roster(host)).profiles).toEqual([]);
    const profile = await create(host); await bind(host, profile.id);
    await host.harness.behavior.callRpc("removeSpecialist", { id: profile.id, expectedRevision: 1 });
    expect((await roster(host)).legacy).toHaveLength(1); expect((await roster(host)).bindings).toEqual([]);
    expect(host.harness.inspection.sdk.callsTo("threads.delete")).toEqual([]);
    expect(host.harness.inspection.sdk.callsTo("threads.spawn")).toEqual([]);
  });
  it("imports full actual skill content and source revision without modifying the source", async () => {
    const host = setup(); const scope = { projectId: "p1", environmentId: null };
    const data = await host.harness.behavior.callRpc("readAgentSkill", { ...scope, skillId: "real-skill" }) as { content: string; basis: unknown };
    const profile = await create(host, { instructions: data.content, basis: data.basis });
    expect(profile.instructions).toContain("test data integrity"); expect(profile.basis).toMatchObject({ revision: "source-v1", filePath: "/skills/backend/SKILL.md" });
    await expect(host.harness.behavior.callRpc("readAgentSkill", { ...scope, skillId: "fake-skill" })).rejects.toThrow("unavailable");
    expect(host.harness.inspection.sdk.callsTo("skills.update")).toEqual([]);
  });
  it("reads a catalog-listed symlink skill only on the authoritative environment machine", async () => {
    const host = setup();
    host.harness.inspection.sdk.stub("skills.getContent", async () => { throw new Error('HTTP502: Root path "/skills/backend" must not be a symlink.'); });
    host.harness.inspection.sdk.stub("environments.get", async () => ({ projectId: "p1", hostId: "remote-host" }));
    host.harness.inspection.sdk.stub("files.read", async () => ({ content: "# Full source\nUse actual evidence.", contentEncoding: "utf8", sizeBytes: 35, sha256: "verified-source-sha" }));
    const imported = await host.harness.behavior.callRpc("readAgentSkill", { projectId: "p1", environmentId: "remote-env", skillId: "real-skill" }) as { content: string; basis: { revision: string } };
    expect(imported.content).toContain("actual evidence"); expect(imported.basis.revision).toBe("verified-source-sha");
    expect(host.harness.inspection.sdk.callsTo("files.read")[0]?.[0]).toEqual({ hostId: "remote-host", path: "/skills/backend/SKILL.md" });
    expect(host.harness.inspection.sdk.callsTo("system.config")).toEqual([]);
    await expect(host.harness.behavior.callRpc("readAgentSkill", { projectId: "p1", environmentId: "remote-env", skillId: "real-skill", path: "/etc/passwd", hostId: "other-machine" })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("uses documented primary-host null scope and rejects mismatched hosts or unrelated failures", async () => {
    const host = setup();
    host.harness.inspection.sdk.stub("skills.getContent", async () => { throw new Error("Root path '/skills/backend' must not be a symlink"); });
    host.harness.inspection.sdk.stub("system.config", async () => ({ primaryHostId: "actual-primary" }));
    host.harness.inspection.sdk.stub("files.read", async () => ({ content: "# Skill", contentEncoding: "utf8", sizeBytes: 7, sha256: "source-revision" }));
    await host.harness.behavior.callRpc("readAgentSkill", { projectId: "p1", environmentId: null, skillId: "real-skill" });
    expect(host.harness.inspection.sdk.callsTo("files.read")[0]?.[0]).toEqual({ hostId: "actual-primary", path: "/skills/backend/SKILL.md" });
    host.harness.inspection.sdk.stub("environments.get", async () => ({ projectId: "p2", hostId: "other-host" }));
    await expect(host.harness.behavior.callRpc("readAgentSkill", { projectId: "p1", environmentId: "other-env", skillId: "real-skill" })).rejects.toThrow("another project");
    host.harness.inspection.sdk.stub("skills.getContent", async () => { throw new Error("Permission denied"); });
    await expect(host.harness.behavior.callRpc("readAgentSkill", { projectId: "p1", environmentId: null, skillId: "real-skill" })).rejects.toThrow("Permission denied");
    expect(host.harness.inspection.sdk.callsTo("files.read")).toHaveLength(1);
  });
});

describe("Native bot mentions", () => {
  it("registers @ Bots and searches names and roles with stable distinct IDs", async () => {
    const host = setup(); const first = await create(host); const second = await create(host, { role: "Accessibility", instructions: "Private duplicate-name instructions" });
    const provider = host.harness.inspection.registrations.mentionProviders[0]!;
    expect(provider).toMatchObject({ id: "bots", label: "Bots", triggers: ["@"] });
    const search = (query: string) => provider.search({ trigger: "@", query, projectId: null, threadId: null });
    const sameName = await search("reviewer");
    expect(sameName.map(item => item.id).sort()).toEqual([first.id, second.id].sort());
    expect(new Set(sameName.map(item => item.subtitle)).size).toBe(2);
    expect(await search("accessibility")).toMatchObject([{ id: second.id, title: "Reviewer" }]);
    expect(await provider.search({ trigger: "#", query: "", projectId: "p1", threadId: "first" })).toEqual([]);
    expect(await search("x".repeat(257))).toEqual([]);
    expect(await search("no matching bot")).toEqual([]);
  });
  it("resolves current identity at send time without leaking private state or performing actions", async () => {
    const host = setup(); const profile = await create(host, { instructions: "PRIVATE_INSTRUCTIONS", soul: "PRIVATE_SOUL", sharedRules: "PRIVATE_SHARED_RULES" }); await bind(host, profile.id);
    await host.harness.behavior.callRpc("saveAgentMemory", { agentId: profile.id, projectId: "p1", expectedRevision: 0, content: "PRIVATE_PROJECT_MEMORY" });
    const provider = host.harness.inspection.registrations.mentionProviders[0]!;
    await host.harness.behavior.callRpc("saveSpecialist", { ...fields, instructions: "PRIVATE_INSTRUCTIONS", soul: "PRIVATE_SOUL", sharedRules: "PRIVATE_SHARED_RULES", id: profile.id, expectedRevision: 1, name: "Renamed bot" });
    const reference = await provider.resolve(profile.id);
    expect(reference.context).toContain(JSON.stringify({ botId: profile.id, name: "Renamed bot", role: fields.role }));
    for (const secret of ["PRIVATE_INSTRUCTIONS", "PRIVATE_SOUL", "PRIVATE_SHARED_RULES", "PRIVATE_PROJECT_MEMORY"]) expect(reference.context).not.toContain(secret);
    expect(reference.context).toContain("does not start or message"); expect(reference.context).toContain("New chat");
    expect(reference.context).toContain("workspace_agent_delegate"); expect(reference.context).toContain("explicitly enabled coordination");
    expect((await roster(host)).bindings[0]?.coordinationAllowed).toBe(false);
    expect(host.harness.inspection.sdk.callsTo("threads.spawn")).toEqual([]); expect(host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
    expect((await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id: "ordinary" } }))).tools).toEqual([]);
    await host.harness.behavior.callRpc("removeSpecialist", { id: profile.id, expectedRevision: 2 });
    await expect(Promise.resolve().then(() => provider.resolve(profile.id))).rejects.toThrow("not found");
    expect(await provider.search({ trigger: "@", query: "Renamed", projectId: "p1", threadId: "first" })).toEqual([]);
  });
  it("bounds large search results and makes control-character labels harmless", async () => {
    const host = setup(); const profile = await create(host, { name: "Reviewer\n\u001b instruction", role: "Quality\tcontrol" });
    for (let index = 0; index < 35; index++) await create(host, { name: `Bot ${index}` });
    const provider = host.harness.inspection.registrations.mentionProviders[0]!;
    expect(await provider.search({ trigger: "@", query: "", projectId: null, threadId: null })).toHaveLength(30);
    const result = await provider.search({ trigger: "@", query: "reviewer", projectId: null, threadId: null });
    expect(result).toMatchObject([{ id: profile.id, title: "Reviewer instruction" }]);
    expect(result[0]?.subtitle).toContain("Quality control");
  });
});

describe("Initial native dispatch, retries and runtime proof", () => {
  it("has a validated stable binding before first provider configuration and forwards native selections unchanged", async () => {
    const host = setup(); const profile = await create(host); let initial = false;
    host.harness.inspection.sdk.stub("threads.spawn", async (args: unknown) => {
      const value = args as { projectId: string; pluginMetadata: Record<string, string> };
      const thread = makeThreadResponse({ id: "first", projectId: value.projectId, originPluginId: "project-workspace" }); host.threads.set(thread.id, thread); host.metadata.set(thread.id, value.pluginMetadata);
      const resolution = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ pluginMetadata: value.pluginMetadata, thread: { id: thread.id }, project: { id: "p1" }, origin: { pluginId: "project-workspace" } }));
      initial = !!resolution.instructions?.includes(profile.id); expect(resolution.tools.map(tool => tool.name)).toContain("workspace_agent_read");
      return thread;
    });
    const native = { ...request(), sendAt: 123456789, input: [{ type: "localFile", path: "/tmp/review.txt", name: "review.txt", sizeBytes: 34 } as const] };
    const output = await host.harness.behavior.callRpc("spawnAgentThread", { agentId: profile.id, requestId: "first-create", request: native });
    expect(initial).toBe(true); expect(output).toEqual({ threadId: "first" });
    const spawn = host.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0] as Record<string, unknown>;
    expect(spawn).toMatchObject(native); expect(spawn.pluginMetadata).toMatchObject({ specialistId: profile.id });
    expect((await roster(host)).bindings[0]).toMatchObject({ state: "pending", coordinationAllowed: false });
    await host.harness.behavior.callRpc("spawnAgentThread", { agentId: profile.id, requestId: "first-create", request: native });
    expect(host.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("reconciles a lost create response without duplicating native work", async () => {
    const host = setup(); const profile = await create(host);
    host.harness.inspection.sdk.stub("threads.spawn", async (args: unknown) => {
      const value = args as { projectId: string; pluginMetadata: Record<string, string> };
      host.threads.set("lost", makeThreadResponse({ id: "lost", projectId: value.projectId, originPluginId: "project-workspace" })); host.metadata.set("lost", value.pluginMetadata);
      throw new Error("Connection lost after create");
    });
    const input = { agentId: profile.id, requestId: "lost-response", request: request() };
    await expect(host.harness.behavior.callRpc("spawnAgentThread", input)).rejects.toThrow("Connection lost");
    expect(await host.harness.behavior.callRpc("spawnAgentThread", input)).toEqual({ threadId: "lost" });
    expect(host.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("requires complete sequential full-content reads and resets proof after native compaction", async () => {
    const host = setup(); const profile = await create(host, { instructions: "Detailed instructions. ".repeat(2000) }); await bind(host, profile.id);
    let chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", { offset: 0 }, context) as string) as { hash: string; nextOffset: number | null; content: string };
    expect(chunk.content.length).toBe(12000); expect((await roster(host)).bindings[0]?.state).toBe("pending");
    await expect(host.harness.behavior.callAgentTool("workspace_agent_read", { offset: chunk.nextOffset! + 1, hash: chunk.hash }, context)).rejects.toThrow("skipped");
    while (chunk.nextOffset !== null) chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", { offset: chunk.nextOffset, hash: chunk.hash }, context) as string);
    expect((await roster(host)).bindings[0]?.state).toBe("applied");
    host.setSeq(50); await host.harness.behavior.emitThreadEvent("experimental_thread.events", { thread: makeThreadResponse({ id: "first", projectId: "p1" }), sequence: 50 });
    expect((await roster(host)).bindings[0]?.state).toBe("pending");
  });
  it("keeps sequential hashed instruction chunks stable when coordination permission changes between reads", async () => {
    const host = setup(); const profile = await create(host, { instructions: "Verify full content. ".repeat(2000) }); await bind(host, profile.id);
    async function readAll(afterFirst?: () => Promise<void>) {
      let chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context) as string) as { hash: string; nextOffset: number | null; content: string };
      const hash = chunk.hash; let content = chunk.content;
      if (afterFirst) await afterFirst();
      while (chunk.nextOffset !== null) {
        chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", { offset: chunk.nextOffset, hash }, context) as string);
        expect(chunk.hash).toBe(hash); content += chunk.content;
      }
      return { hash, content };
    }
    const baseline = await readAll();
    const changed = await readAll(async () => { await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review this change" }); });
    expect(changed).toEqual(baseline); expect(JSON.parse(changed.content)).not.toHaveProperty("coordination");
    expect((await roster(host)).bindings[0]).toMatchObject({ state: "applied", coordinationAllowed: true });
    const peers = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_peers", {}, context) as string);
    expect(peers).toMatchObject({ allowed: true, work: "Review this change" });
  });
  it("rejects a chunk continuation after identical-field profile save changes its revision", async () => {
    const host = setup(); const instructions = "Full instructions. ".repeat(2000);
    const profile = await create(host, { instructions }); await bind(host, profile.id);
    const first = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context) as string) as { hash: string; nextOffset: number };
    const saved = await host.harness.behavior.callRpc("saveSpecialist", { ...fields, instructions, id: profile.id, expectedRevision: 1 }) as AgentProfile;
    expect(saved.hash).toBe(profile.hash); expect(saved.revision).toBe(2);
    await expect(host.harness.behavior.callAgentTool("workspace_agent_read", { offset: first.nextOffset, hash: first.hash }, context)).rejects.toThrow("Restart reading");
    let chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context) as string);
    expect(chunk.hash).not.toBe(first.hash); let content = chunk.content;
    while (chunk.nextOffset !== null) { chunk = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_read", { offset: chunk.nextOffset, hash: chunk.hash }, context) as string); content += chunk.content; }
    expect(JSON.parse(content).identity.revision).toBe(2);
    expect((await roster(host)).bindings[0]?.state).toBe("applied");
  });
  it("marks a read profile outdated after edited instructions or project facts without stopping native work", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id);
    await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context);
    expect((await roster(host)).bindings[0]?.state).toBe("applied");
    await host.harness.behavior.callRpc("saveSpecialist", { ...fields, id: profile.id, expectedRevision: 1, instructions: "Use the updated verification policy." });
    expect((await roster(host)).bindings[0]?.state).toBe("outdated");
    await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context);
    await host.harness.behavior.callRpc("saveAgentMemory", { agentId: profile.id, projectId: "p1", expectedRevision: 0, content: "Verified new fact" });
    expect((await roster(host)).bindings[0]?.state).toBe("outdated");
    expect(host.harness.inspection.sdk.callsTo("threads.stop")).toEqual([]);
    expect(host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
  });
  it("ignores forged profile/permission metadata and does not expose tools on unrelated chats", async () => {
    const host = setup(); const profile = await create(host);
    const resolution = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ pluginMetadata: { specialistId: profile.id, coordinationAllowed: true, specialistToken: "forged" }, project: { id: "p1" }, origin: { pluginId: "project-workspace" } }));
    expect(resolution.tools).toEqual([]);
    await expect(host.harness.behavior.callAgentTool("workspace_agent_peers", {}, context)).rejects.toThrow("assigned");
  });
  it("inherits stable identity for a native same-project fork but never its current-work permission", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id);
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review this change" });
    await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id: "fork", sourceThreadId: "first" }, project: { id: "p1" }, origin: { kind: "fork", pluginId: "side-chat" } }));
    expect((await roster(host)).bindings.find(item => item.threadId === "fork")).toMatchObject({ agentId: profile.id, coordinationAllowed: false });
    await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id: "other-fork", sourceThreadId: "first" }, project: { id: "p2" }, origin: { kind: "fork", pluginId: "side-chat" } }));
    expect((await roster(host)).bindings.some(item => item.threadId === "other-fork")).toBe(false);
  });
});

describe("Project facts, current-work permission and native coordination", () => {
  it("isolates automatic project facts and concurrent memory edits; leaves shared rules unchanged", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id);
    await host.harness.behavior.callAgentTool("workspace_agent_learn", { expectedRevision: 0, fact: "The app uses SQLite", evidence: "package.json and repository database tests", verified: true }, context);
    const first = await host.harness.behavior.callRpc("getAgentMemory", { agentId: profile.id, projectId: "p1" }) as AgentMemory;
    const other = await host.harness.behavior.callRpc("getAgentMemory", { agentId: profile.id, projectId: "p2" }) as AgentMemory;
    expect(first.content).toContain("SQLite"); expect(other.content).toBe("");
    await expect(host.harness.behavior.callAgentTool("workspace_agent_learn", { expectedRevision: 1, fact: "Cross scope", evidence: "proof", verified: true }, { ...context, projectId: "p2" })).rejects.toThrow("assigned");
    await expect(host.harness.behavior.callRpc("saveAgentMemory", { agentId: profile.id, projectId: "p1", expectedRevision: 0, content: "overwrite" })).rejects.toThrow("changed");
    expect((await roster(host)).profiles[0]?.sharedRules).toBe(fields.sharedRules);
    const table = host.bb.storage.database().prepare("SELECT evidence FROM specialist_learning").all(); expect(table).toHaveLength(1);
  });
  it("requires an explicit grant, queues messages idempotently, and rejects another project's target", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id); await bind(host, profile.id, "second");
    const params = { threadId: "second", text: "Please inspect this finding", idempotencyKey: "message-one" };
    await expect(host.harness.behavior.callAgentTool("workspace_agent_message", params, context)).rejects.toThrow("not authorized");
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Inspect these findings" });
    await host.harness.behavior.callAgentTool("workspace_agent_message", params, context);
    await host.harness.behavior.callAgentTool("workspace_agent_message", params, context);
    expect(host.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(1);
    expect(host.harness.inspection.sdk.callsTo("threads.send")[0]?.[0]).toMatchObject({ mode: "queue-if-active", senderThreadId: "first" });
    host.threads.set("other", makeThreadResponse({ id: "other", projectId: "p2" })); await bind(host, profile.id, "other");
    await expect(host.harness.behavior.callAgentTool("workspace_agent_message", { ...params, threadId: "other", idempotencyKey: "other" }, context)).rejects.toThrow("this project");
  });
  it("delegates with native current execution permissions and a child binding before execution, without inheriting consent", async () => {
    const host = setup(); const parent = await create(host); const child = await create(host, { name: "Engineer", role: "Implementation" }); await bind(host, parent.id);
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review and implement this change" });
    const result = JSON.parse(await host.harness.behavior.callAgentTool("workspace_agent_delegate", { agentId: child.id, prompt: "Implement the reviewed change", idempotencyKey: "child-one" }, context) as string);
    const binding = (await roster(host)).bindings.find(item => item.threadId === result.threadId);
    expect(binding).toMatchObject({ agentId: child.id, projectId: "p1", coordinationAllowed: false });
    expect(host.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({ permissionMode: "accept-edits", environment: { type: "reuse", environmentId: "env1" }, parentThreadId: "first", startedOnBehalfOf: { initiator: "agent", senderThreadId: "first" } });
  });
  it("retains consent for questions or queued work, revokes on completion, and removes deleted bindings without deleting memory/profile", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id); await bind(host, profile.id, "second");
    await host.harness.behavior.callAgentTool("workspace_agent_read", {}, context);
    await host.harness.behavior.callRpc("saveAgentMemory", { agentId: profile.id, projectId: "p1", expectedRevision: 0, content: "Keep this fact" });
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review" });
    host.setPending([{}]); await host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "first" }), lastAssistantText: null });
    expect((await roster(host)).bindings.find(item => item.threadId === "first")?.coordinationAllowed).toBe(true);
    host.setPending([]); host.threads.set("first", makeThreadResponse({ id: "first", projectId: "p1", queuedMessageCount: 1 })); await host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "first", queuedMessageCount: 1 }), lastAssistantText: null });
    expect((await roster(host)).bindings.find(item => item.threadId === "first")?.coordinationAllowed).toBe(true);
    host.threads.set("first", makeThreadResponse({ id: "first", projectId: "p1", status: "idle", runtime: { displayStatus: "idle" } }));
    await host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "first" }), lastAssistantText: "Done" });
    expect((await roster(host)).bindings.find(item => item.threadId === "first")?.coordinationAllowed).toBe(false);
    await host.harness.behavior.emitThreadEvent("thread.deleted", { thread: makeThreadResponse({ id: "first" }) });
    expect((await roster(host)).bindings.map(item => item.threadId)).toEqual(["second"]);
    expect((await roster(host)).profiles).toHaveLength(1);
    expect((await host.harness.behavior.callRpc("getAgentMemory", { agentId: profile.id, projectId: "p1" }) as AgentMemory).content).toBe("Keep this fact");
  });
  it("does not let delayed completion revoke a newer identical-text user grant", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id);
    host.threads.set("first", makeThreadResponse({ id: "first", projectId: "p1", status: "idle", runtime: { displayStatus: "idle" } }));
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review" });
    let finish!: (value: unknown[]) => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    host.harness.inspection.sdk.stub("threads.interactions.list", () => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const event = host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "first", status: "idle" }), lastAssistantText: "Previous work done" });
    await waiting;
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: false, work: null });
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review" });
    finish([]); expect((await event).errors).toEqual([]);
    expect((await roster(host)).bindings[0]).toMatchObject({ coordinationAllowed: true, coordinationWork: "Review" });
    expect(host.bb.storage.database().prepare("SELECT grant_revision FROM specialist_threads WHERE thread_id='first'").get()).toEqual({ grant_revision: 3 });
  });
  it("rechecks current native activity instead of revoking from a stale idle-event snapshot", async () => {
    const host = setup(); const profile = await create(host); await bind(host, profile.id);
    await host.harness.behavior.callRpc("setAgentCoordination", { threadId: "first", allowed: true, work: "Review" });
    let finish!: (value: unknown[]) => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    host.harness.inspection.sdk.stub("threads.interactions.list", () => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const event = host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "first", status: "idle" }), lastAssistantText: "Stale completion" });
    await waiting;
    host.threads.set("first", makeThreadResponse({ id: "first", projectId: "p1", status: "active", runtime: { displayStatus: "active" } }));
    finish([]); expect((await event).errors).toEqual([]);
    expect((await roster(host)).bindings[0]?.coordinationAllowed).toBe(true);
  });
});
