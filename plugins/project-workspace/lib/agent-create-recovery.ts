import { z } from "zod";
import type { NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { entityId, nativeRequestSchema } from "./agent-contract";

const operationSchema = z.object({ version: z.literal(1), agentId: entityId, requestId: entityId, request: nativeRequestSchema }).strict();
export type PendingAgentCreate = { version: 1; agentId: string; requestId: string; request: NewThreadRequest };
export const recoveryKey = (agentId: string) => `project-workspace.agent.${agentId}.pending-create.v1`;
const fingerprint = (request: NewThreadRequest) => JSON.stringify(request, (_key, value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  return value;
});
const storageError = () => new Error("Creation recovery storage is unavailable or invalid. No new task was submitted.");
export function readPendingCreate(agentId: string): PendingAgentCreate | null {
  try {
    const raw = localStorage.getItem(recoveryKey(agentId));
    if (raw === null) return null;
    const operation = operationSchema.parse(JSON.parse(raw));
    if (operation.agentId !== agentId) throw storageError();
    return operation as PendingAgentCreate;
  } catch { throw storageError(); }
}
function persist(operation: PendingAgentCreate) {
  try {
    const raw = JSON.stringify(operation);
    localStorage.setItem(recoveryKey(operation.agentId), raw);
    if (localStorage.getItem(recoveryKey(operation.agentId)) !== raw) throw storageError();
  } catch { throw storageError(); }
}
async function locked<T>(agentId: string, action: () => T): Promise<T> {
  if (!navigator.locks?.request) throw new Error("Creation recovery requires browser locking support. No new task was submitted.");
  return navigator.locks.request(recoveryKey(agentId), { mode: "exclusive" }, action);
}
/** Durable before dispatch: an uncertain result never creates a replacement ID. */
export async function prepareAgentCreate(agentId: string, request: NewThreadRequest): Promise<PendingAgentCreate> {
  return locked(agentId, () => {
  const normalized = nativeRequestSchema.parse(request) as NewThreadRequest;
  const existing = readPendingCreate(agentId);
  if (existing) {
    if (fingerprint(existing.request) !== fingerprint(normalized)) throw new Error("The previous creation has no confirmed result. Your edited draft was not submitted. Recover the previous creation first; it may already be running.");
    return existing;
  }
  const operation: PendingAgentCreate = { version: 1, agentId, requestId: crypto.randomUUID(), request: normalized };
  persist(operation); return operation;
  });
}
/** Only call after the server positively identifies the created chat. */
export async function completeAgentCreate(operation: PendingAgentCreate) {
  return locked(operation.agentId, () => {
  try {
    const current = readPendingCreate(operation.agentId);
    if (current && current.requestId !== operation.requestId) return;
    localStorage.removeItem(recoveryKey(operation.agentId));
    if (localStorage.getItem(recoveryKey(operation.agentId)) !== null) throw storageError();
  } catch { throw new Error("The chat was created, but its recovery record could not be cleared. Recover the same creation before starting another task."); }
  });
}
