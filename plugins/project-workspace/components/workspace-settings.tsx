import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { applyWorkspaceMode, workspaceModeFromProviders, type WorkspaceMode } from "../lib/workspace-mode";
import { errorMessage } from "../lib/workspace-model";

export function WorkspaceSettings() {
  const sdk = useSdk();
  const [mode, setMode] = useState<WorkspaceMode | "custom" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    sdk.system.uiPreferences.list({ signal: controller.signal }).then(({ preferences }) => {
      if (controller.signal.aborted) return;
      setMode(workspaceModeFromProviders(preferences["sidebar.threadListProvider"].value));
      setError(null);
    }, cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => controller.abort();
  }, [sdk, retry]);
  async function change(next: WorkspaceMode) {
    if (pending) return;
    setPending(true); setError(null);
    try { await applyWorkspaceMode(sdk, next); setMode(next); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <div className="pw-settings">
    <p>Projects on the left. Their Sessions and Explorer beside them. Your existing BB chat and tools stay in place.</p>
    <div className="pw-mode-buttons">
      <button className="pw-control" disabled={pending || mode === null} aria-pressed={mode === "workspace"} onClick={() => void change("workspace")}>Workspace</button>
      <button className="pw-control" disabled={pending || mode === null} aria-pressed={mode === "default"} onClick={() => void change("default")}>Default BB</button>
    </div>
    <p className="pw-muted" role="status">{pending ? "Updating layout…" : mode === null ? "Loading layout…" : `Current: ${mode === "workspace" ? "Workspace" : mode === "default" ? "Default BB" : "custom sidebar"}`}</p>
    {error && <p role="alert">{error} <button className="pw-control" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
  </div>;
}
