import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { experimental_SourceCode as SourceCode, useSdk } from '@get-bb/plugin-sdk/app';
import { errorMessage, normalizePath, relativeInside, type ExplorerSource } from '../lib/workspace-model';
import { Icon } from './ui/icon';
import { FileIcon } from './ui/file-icon';
export type FilePreviewRequest = { source: ExplorerSource; path: string; name: string };
// Native chat preview remains preferred. This read-only surface makes Explorer
// usable on the BB home screen too, without creating or selecting a session.
export function WorkspaceFilePreview({ request, onClose }: { request: FilePreviewRequest | null; onClose(): void }) {
  const sdk = useSdk();
  const [content, setContent] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController(); setContent(null); setError(null);
    const relative = relativeInside(request.source.root, request.path);
    if (relative === null) { setError('File is outside the project folder.'); return; }
    void sdk.files.read({ hostId: request.source.hostId, path: request.path,
      rootPath: request.source.root, signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) return;
      if (normalizePath(result.path) !== normalizePath(request.path) || relativeInside(request.source.root, result.path) === null) throw new Error("File resolves outside the selected project path.");
      if (result.contentEncoding !== 'utf8') throw new Error('This is a binary file. Open it with a suitable application.');
      if (result.sizeBytes > 1024 * 1024) throw new Error('This file is too large for the quick preview (1 MB limit).');
      setContent(result.content);
    }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => controller.abort();
  }, [sdk, request, retry]);
  return <Dialog.Root open={!!request} onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="pw-preview-overlay" /><Dialog.Content className="pw-file-preview" aria-describedby="pw-preview-description">
      <header className="pw-preview-heading"><FileIcon name={request?.name ?? ''} /><Dialog.Title>{request?.name}</Dialog.Title><Dialog.Close className="pw-icon-button" aria-label="Close file preview"><Icon name="X" className="pw-icon" /></Dialog.Close></header>
      <Dialog.Description id="pw-preview-description" className="pw-preview-path">{request?.path}</Dialog.Description>
      <div className="pw-preview-content">{error ? <p className="pw-message" role="alert">{error}<button className="pw-control" onClick={() => setRetry(value => value + 1)}>Retry file</button></p> : content === null ? <p className="pw-message" role="status">Loading file…</p> : <SourceCode content={content} path={request?.name ?? ''} overflow="scroll" />}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
