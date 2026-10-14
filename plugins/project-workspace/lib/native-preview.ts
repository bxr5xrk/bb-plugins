import type { ExperimentalFileOpenOptions } from "@get-bb/plugin-sdk/app";

type OpenPreview = (options: ExperimentalFileOpenOptions) => boolean;
// Each mounted native thread surface owns its opener. The sidebar itself has
// no preview surface, so it routes an intent to the explicitly active thread.
const openers = new Map<string, OpenPreview>();
export function registerNativePreview(threadId: string, open: OpenPreview) {
  openers.set(threadId, open);
  return () => { if (openers.get(threadId) === open) openers.delete(threadId); };
}
export function openWorkspacePreview(threadId: string | null, options: ExperimentalFileOpenOptions) {
  return threadId !== null && (openers.get(threadId)?.(options) ?? false);
}
