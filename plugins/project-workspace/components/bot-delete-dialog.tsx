import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { AgentProfile, rpcContract } from "../lib/agent-contract";
import { errorMessage } from "../lib/workspace-model";

export function botHeading(opener: HTMLElement | null | undefined) {
  return opener?.closest(".pw-shell")?.querySelector<HTMLButtonElement>(".pw-bots-toggle") ?? null;
}
/** One confirmation for every deletion entry point; native chats are never deleted. */
export function BotDeleteDialog({ profile, returnFocus, fallbackFocus, onClose, onDeleted }: {
  profile: AgentProfile; returnFocus: HTMLElement | null; fallbackFocus?: HTMLElement | null; onClose(): void; onDeleted(id: string): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [target, setTarget] = useState(profile), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [latest, setLatest] = useState<AgentProfile | null>(null);
  const requestRunning = useRef(false), deleted = useRef(false), cancel = useRef<HTMLButtonElement>(null), fallback = useRef(fallbackFocus ?? botHeading(returnFocus));
  async function remove() {
    if (requestRunning.current || latest) return;
    requestRunning.current = true; setBusy(true); setError(null);
    try {
      await rpc.call("removeSpecialist", { id: target.id, expectedRevision: target.revision });
      deleted.current = true; onDeleted(target.id); onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      try {
        const result = await rpc.call("listSpecialists"), current = result.profiles.find(item => item.id === target.id);
        if (current && current.revision !== target.revision) setLatest(current);
      } catch { /* Keep the original deletion failure; no retry is automatic. */ }
    } finally { requestRunning.current = false; setBusy(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !requestRunning.current) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="pw-preview-overlay pw-bot-delete-overlay" />
    <Dialog.Content className="pw-agent-dialog pw-bot-delete-dialog" aria-busy={busy} onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); (deleted.current ? fallback.current : returnFocus?.isConnected ? returnFocus : fallback.current)?.focus(); }} onEscapeKeyDown={event => { if (requestRunning.current) event.preventDefault(); }} onPointerDownOutside={event => { if (requestRunning.current) event.preventDefault(); }}>
      <header className="pw-preview-heading"><Dialog.Title className="pw-bot-delete-title">Delete bot “{target.name}”?</Dialog.Title></header>
      <div className="pw-bot-delete-body"><Dialog.Description>Delete this bot's profile, SOUL.md, shared rules and project memories. This cannot be undone. All native chats are kept; they continue without this bot profile.</Dialog.Description>
        {latest && <div className="pw-conflict" role="alert"><p>This bot changed since you opened the confirmation. Review the saved profile before deleting.</p><details><summary>View updated bot</summary><strong>{latest.name} · {latest.role}</strong><pre>{latest.instructions}</pre><strong>SOUL.md</strong><pre>{latest.soul}</pre><strong>Shared rules</strong><pre>{latest.sharedRules}</pre></details><button type="button" className="pw-control" disabled={busy} onClick={() => { setTarget(latest); setLatest(null); setError(null); }}>Use reviewed revision</button></div>}
        {error && <p className="pw-form-error" role="alert">{error}</p>}
      </div>
      <footer className="pw-dialog-actions"><button ref={cancel} type="button" className="pw-control" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="pw-control pw-danger" disabled={busy || !!latest} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete bot"}</button></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
