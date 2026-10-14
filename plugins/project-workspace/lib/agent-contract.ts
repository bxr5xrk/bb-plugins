import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { SESSION_CARDS } from "./session-cards";

export const agentColors = ["#80cbc4", "#b5a0e3", "#e8b77b", "#a4bfdf", "#b0cc89", "#d59bbd"] as const;
export const agentAvatars = ["ghost", "crab", "owl", "robot", "cat", "spark"] as const;
export const entityId = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const color = z.enum(agentColors);
export const reasoning = z.enum(["none", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode"]);
export const skillScopeSchema = z.object({ projectId: entityId, environmentId: entityId.nullable() }).strict();
export const skillSchema = z.object({ id: z.string().min(1).max(2000), name: z.string(), description: z.string().nullable(), filePath: z.string(), scope: z.string(), pluginId: z.string().nullable(), provider: z.string().nullable() }).strict();
export const skillBasisSchema = z.object({ ...skillScopeSchema.shape, skillId: z.string().min(1).max(2000), name: z.string().max(200), revision: z.string().max(200), filePath: z.string().max(4000) }).strict();
export const agentDefaultsSchema = z.object({ providerId: z.string().min(1).max(200).optional(), model: z.string().min(1).max(300).optional(), reasoningLevel: reasoning.optional(), serviceTier: z.string().min(1).max(100).optional() }).strict();
export const agentFieldsSchema = z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(160), avatar: z.enum(agentAvatars), color, instructions: z.string().trim().min(1).max(100000), soul: z.string().max(20000).default(""), sharedRules: z.string().max(20000), defaults: agentDefaultsSchema, basis: skillBasisSchema.nullable() }).strict();
export const agentProfileSchema = agentFieldsSchema.extend({ id: entityId, revision: z.number().int().positive(), hash: z.string(), createdAt: z.number(), updatedAt: z.number() });
export const agentBindingSchema = z.object({ threadId: entityId, agentId: entityId, projectId: entityId, createdAt: z.number(), loadedHash: z.string().nullable(), loadedAt: z.number().nullable(), coordinationAllowed: z.boolean(), coordinationWork: z.string().nullable(), state: z.enum(["pending", "applied", "outdated"]) }).strict();
export const legacyAgentSchema = z.object({ threadId: entityId, name: z.string().trim().min(1).max(80), color }).strict();
export const projectMemorySchema = z.object({ agentId: entityId, projectId: entityId, revision: z.number().int().nonnegative(), content: z.string().max(40000), updatedAt: z.number().nullable(), source: z.enum(["user", "agent"]).nullable() }).strict();

// Mirrors the public native composer request. BB validates the provider's own
// options and attachment resources; the plugin forwards them without rewriting.
const branch = z.discriminatedUnion("kind", [z.object({ kind: z.literal("existing"), name: z.string() }).strict(), z.object({ kind: z.literal("new"), baseBranch: z.string() }).strict()]);
const environment = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reuse"), environmentId: entityId }).strict(),
  z.object({ type: z.literal("project-default") }).strict(),
  z.object({ type: z.literal("host"), hostId: entityId.optional(), workspace: z.discriminatedUnion("type", [z.object({ type: z.literal("personal") }).strict(), z.object({ type: z.literal("unmanaged"), path: z.string().nullable(), branch: branch.optional() }).strict(), z.object({ type: z.literal("managed-worktree"), baseBranch: z.discriminatedUnion("kind", [z.object({ kind: z.literal("default") }).strict(), z.object({ kind: z.literal("named"), name: z.string() }).strict()]) }).strict()]) }).strict(),
  z.object({ type: z.literal("provider"), environmentProviderId: z.string().min(1), inputs: z.json().nullable(), machine: z.discriminatedUnion("type", [z.object({ type: z.literal("existing"), hostId: entityId }).strict(), z.object({ type: z.literal("new"), machineProviderId: z.string().min(1), inputs: z.json().nullable() }).strict()]).optional() }).strict(),
]);
const visibility = z.literal("agent-only").optional();
const promptInput = z.discriminatedUnion("type", [z.object({ type: z.literal("text"), text: z.string().max(500000), mentions: z.array(z.json()).optional(), visibility }).strict(), z.object({ type: z.literal("image"), url: z.string(), visibility }).strict(), z.object({ type: z.literal("localImage"), path: z.string(), visibility }).strict(), z.object({ type: z.literal("localFile"), path: z.string(), name: z.string().optional(), mimeType: z.string().optional(), sizeBytes: z.number().optional(), visibility }).strict()]);
const source = z.enum(["explicit", "client-preference"]);
export const nativeRequestSchema = z.object({ projectId: entityId, providerId: z.string().min(1), model: z.string().min(1), reasoningLevel: reasoning, permissionMode: z.enum(["accept-edits", "auto", "full"]), serviceTier: z.string().optional(), executionInputSources: z.object({ providerId: source.optional(), model: source.optional(), reasoningLevel: source.optional(), permissionMode: source.optional(), serviceTier: source.optional() }).strict(), environment, input: z.array(promptInput).min(1).max(100), sendAt: z.number().optional() }).strict();

export const rpcContract = defineRpcContract({
  listAgents: { input: z.null(), output: z.object({ agents: z.array(legacyAgentSchema) }).strict() },
  saveAgent: { input: legacyAgentSchema, output: legacyAgentSchema },
  removeAgent: { input: z.object({ threadId: entityId }).strict(), output: z.object({ removed: z.boolean() }).strict() },
  listSpecialists: { input: z.null(), output: z.object({ profiles: z.array(agentProfileSchema), bindings: z.array(agentBindingSchema), legacy: z.array(legacyAgentSchema) }).strict() },
  saveSpecialist: { input: agentFieldsSchema.extend({ id: entityId.optional(), expectedRevision: z.number().int().nonnegative() }), output: agentProfileSchema },
  removeSpecialist: { input: z.object({ id: entityId, expectedRevision: z.number().int().positive() }).strict(), output: z.object({ removed: z.boolean() }).strict() },
  listAgentSkills: { input: skillScopeSchema, output: z.object({ skills: z.array(skillSchema) }).strict() },
  readAgentSkill: { input: skillScopeSchema.extend({ skillId: z.string().min(1).max(2000) }), output: z.object({ content: z.string(), basis: skillBasisSchema }).strict() },
  getAgentMemory: { input: z.object({ agentId: entityId, projectId: entityId }).strict(), output: projectMemorySchema },
  saveAgentMemory: { input: z.object({ agentId: entityId, projectId: entityId, expectedRevision: z.number().int().nonnegative(), content: z.string().max(40000) }).strict(), output: projectMemorySchema },
  spawnAgentThread: { input: z.object({ agentId: entityId, requestId: entityId, request: nativeRequestSchema, coordinationWork: z.string().trim().min(1).max(300).nullable().optional() }).strict(), output: z.object({ threadId: entityId }).strict() },
  bindAgentThread: { input: z.object({ agentId: entityId, threadId: entityId }).strict(), output: agentBindingSchema },
  setAgentCoordination: { input: z.object({ threadId: entityId, allowed: z.boolean(), work: z.string().trim().min(1).max(300).nullable() }).strict(), output: agentBindingSchema },
  setSessionCards: { input: z.object({ sessionCards: z.enum(SESSION_CARDS) }).strict(), output: z.object({ sessionCards: z.enum(SESSION_CARDS) }).strict() },
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type AgentFields = z.infer<typeof agentFieldsSchema>;
export type AgentBinding = z.infer<typeof agentBindingSchema>;
export type AgentMemory = z.infer<typeof projectMemorySchema>;
export type AgentSkill = z.infer<typeof skillSchema>;
export type AgentSkillBasis = z.infer<typeof skillBasisSchema>;
export type LegacyAgent = z.infer<typeof legacyAgentSchema>;
