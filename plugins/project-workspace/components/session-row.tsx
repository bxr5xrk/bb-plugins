import { useEffect, useRef, useState } from "react";
import * as Menu from "@radix-ui/react-context-menu";
import {
  ThreadTitle, useBbNavigate,
  experimental_useSidebarThreadSplit, useSidebarThreadDraft, useSidebarThreadRowStatus,
  useSidebarThreadShortcut, useSdk, experimental_useThreadActions, type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./ui/icon";
import { errorMessage, sessionStatus, sessionAge } from "../lib/workspace-model";
import { useSessionPreview } from "./use-session-preview";

export function SessionRow({ thread, active, onNavigate, now, previewEnabled = true }: { thread: PluginSidebarThread; active: boolean; onNavigate(): void; now: number; previewEnabled?: boolean }) {
  const navigate = useBbNavigate(), sdk = useSdk();
  const split = experimental_useSidebarThreadSplit(thread.id);
  const nativeActions = experimental_useThreadActions({ ...thread, environment: thread.environment?.id ? { id: thread.environment.id, path: thread.environment.path } : null }, { keys: ["bb--core/archive", "bb--core/delete"] });
  const archive = nativeActions.find(entry => entry.key === "bb--core/archive")?.action;
  const remove = nativeActions.find(entry => entry.key === "bb--core/delete")?.action;
  const draft = useSidebarThreadDraft(thread.id), rowStatus = useSidebarThreadRowStatus(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const preview = useSessionPreview(thread, previewEnabled);
  const [rename, setRename] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (rename !== null) input.current?.focus(); }, [rename !== null]);
  async function mutate(work: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function saveRename() {
    if (!rename?.trim() || busy) return;
    setBusy(true); setError(null);
    try { await sdk.threads.update({ threadId: thread.id, title: rename.trim() }); setRename(null); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  const status = sessionStatus(thread, rowStatus, draft.hasUnsubmittedDraft);
  function openSession(split = false) {
    navigate.toThread(thread.id, { split });
    // The public open action navigates; read acknowledgement is a separate action.
    if (thread.isUnread) void sdk.threads.markRead({ threadId: thread.id }).catch(cause => setError(errorMessage(cause)));
    onNavigate();
  }
  const [attention, setAttention] = useState<string | null>(null);
  useEffect(() => {
    setAttention(null);
    if (!thread.hasPendingInteraction) return;
    const controller = new AbortController();
    void sdk.threads.interactions.list({ threadId: thread.id, signal: controller.signal }).then(interactions => {
      if (controller.signal.aborted) return;
      const question = interactions.some(item => item.payload.kind === "user_question");
      const approval = interactions.some(item => item.payload.kind === "approval");
      setAttention(question && approval ? "Question + permission" : question ? "Needs an answer" : approval ? "Needs permission" : null);
    }, () => { /* Keep the truthful generic needs-input state if detail is unavailable. */ });
    return () => controller.abort();
  }, [sdk, thread.id, thread.hasPendingInteraction, thread.updatedAt]);
  return <Menu.Root><Menu.Trigger asChild disabled={busy || rename !== null}>
    <div className="pw-session" data-active={active || undefined} data-unread={thread.isUnread || undefined}
      onKeyDown={event => {
        if (busy || rename !== null || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom }));
      }}>
    {rename === null ? <a className="pw-session-link" href={thread.href}
      data-sidebar-thread-shortcut-target="" data-sidebar-thread-id={thread.id}
      aria-current={active ? "page" : undefined} aria-haspopup="menu" aria-keyshortcuts={[shortcut?.ariaKeyshortcuts, "Shift+F10"].filter(Boolean).join(" ")}
      {...split.splitProps} onPointerDown={event => { if (event.button === 0) split.splitProps.onPointerDown?.(event); }} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault(); openSession(event.shiftKey);
      }}>
      <div className="pw-session-headline">
        <div className="pw-session-title"><ThreadTitle threadId={thread.id} />{thread.isPinned && <Icon name="Pin" className="pw-small-icon" />}</div>
        {shortcut ? <kbd>{shortcut.label}</kbd> : <time dateTime={new Date(thread.latestAttentionAt).toISOString()} title={new Date(thread.latestAttentionAt).toLocaleString()}>{sessionAge(thread.latestAttentionAt, now)}</time>}
      </div>
      <div className="pw-session-preview" title={preview ?? undefined}>{preview}</div>
      <div className="pw-session-bottom">
        {!["idle", "goal", "success"].includes(status.kind) && <span className="pw-session-status" data-status={status.kind} title={thread.indicatorLabel ?? rowStatus?.label ?? status.label}>
          <span className={status.animated ? "pw-status-spinner" : "pw-status-dot"} aria-hidden="true" />{status.kind === "waiting" && thread.hasPendingInteraction ? attention ?? status.label : status.label}
        </span>}
      </div>
    </a> : <form className="pw-rename" onSubmit={event => { event.preventDefault(); void saveRename(); }}>
      <input ref={input} aria-label="Session title" value={rename} onChange={event => setRename(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setRename(null); }} />
      <button className="pw-icon-button" type="submit" disabled={busy || !rename.trim()} aria-label="Save session title"><Icon name="Check" className="pw-icon" /></button>
    </form>}
    {error && <div className="pw-row-error" role="alert">{error}</div>}
  </div></Menu.Trigger>
      <Menu.Portal><Menu.Content className="pw-menu">
        <Menu.Item className="pw-menu-item" onSelect={() => openSession()}>Open session</Menu.Item>
        {split.isAvailable && <Menu.Item className="pw-menu-item" onSelect={() => openSession(true)}>Open in split</Menu.Item>}
        <Menu.Item className="pw-menu-item" onSelect={() => void mutate(() => (thread.isPinned ? sdk.threads.unpin : sdk.threads.pin)({ threadId: thread.id }))}>{thread.isPinned ? "Unpin" : "Pin"}</Menu.Item>
        <Menu.Item className="pw-menu-item" onSelect={() => void mutate(() => (thread.isUnread ? sdk.threads.markRead : sdk.threads.markUnread)({ threadId: thread.id }))}>{thread.isUnread ? "Mark read" : "Mark unread"}</Menu.Item>
        <Menu.Item className="pw-menu-item" onSelect={() => setRename(thread.title ?? thread.displayTitle)}>Rename</Menu.Item>
        <Menu.Item className="pw-menu-item" disabled={!thread.isArchived && (!archive || archive.disabled)} onSelect={() => thread.isArchived ? void mutate(() => sdk.threads.unarchive({ threadId: thread.id })) : void archive?.run()}>{thread.isArchived ? "Unarchive" : "Archive"}</Menu.Item>
        <Menu.Separator className="pw-menu-separator" />
        <Menu.Item className="pw-menu-item pw-danger" disabled={!remove || remove.disabled} onSelect={() => void remove?.run()}>Delete…</Menu.Item>
      </Menu.Content></Menu.Portal>
    </Menu.Root>;
}
