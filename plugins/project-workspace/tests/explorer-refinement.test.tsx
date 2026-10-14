import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import { project, catalogProject } from './fixtures';
import { fileAppearance, projectExplorerSources } from '../lib/explorer-model';
const app = await loadPluginApp(() => import('../app'));
const source = { id: 'src-alpha', projectId: 'alpha', hostId: 'host-alpha', path: '/work/alpha', isDefault: true, createdAt: 1, updatedAt: 1, type: 'local_path' as const };
function setup(overrides = {}) {
  return renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: 'alpha', isCompactViewport: false, onNavigate: vi.fn(), searchQuery: '' }, {
    rpc: { listSpecialists: async () => ({ profiles: [], bindings: [], legacy: [] }) },
    sidebarThreads: { status: 'ready', projects: [project('alpha')], threads: [], sections: [] },
    sdk: { projects: { list: async () => [], get: async () => ({ ...catalogProject('alpha'), sources: [source] }) },
      hosts: { directory: async () => ({ directory: '/work/alpha', parent: '/work', entries: [
        { name: 'src', kind: 'directory', path: '/work/alpha/src' },
        { name: 'App.tsx', kind: 'file', path: '/work/alpha/App.tsx' },
        { name: 'package.json', kind: 'file', path: '/work/alpha/package.json' },
      ] }) } }, ...overrides,
  });
}
afterEach(cleanup);
describe('Project Explorer refinement', () => {
  it('loads project source tree automatically with zero sessions and differentiated file icons', async () => {
    const slot = setup(); fireEvent.click(slot.getByRole('tab', { name: 'Explorer' }));
    await slot.findByText('App.tsx');
    expect(slot.queryByText('Choose a session…')).toBeNull();
    expect(slot.queryByRole('combobox')).toBeNull();
    expect(slot.inspection.sdkCalls.some(call => call.method === 'hosts.directory' && (call.args[0] as { hostId: string; path: string }).hostId === 'host-alpha')).toBe(true);
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.container.querySelector('[data-file-kind="react"]')).toBeTruthy();
    expect(slot.container.querySelector('[data-file-kind="config"]')).toBeTruthy();
  });
  it('offers retry after project lookup failure and then loads the actual source', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValue({ ...catalogProject('alpha'), sources: [source] });
    const directory = vi.fn(async () => ({ directory: '/work/alpha', parent: '/work', entries: [{ name: 'ready.ts', kind: 'file', path: '/work/alpha/ready.ts' }] }));
    const slot = setup({ sdk: { projects: { list: async () => [], get }, hosts: { directory } } });
    fireEvent.click(slot.getByRole('tab', { name: 'Explorer' }));
    expect((await slot.findByRole('alert')).textContent).toContain('Disconnected');
    expect(directory).not.toHaveBeenCalled();
    fireEvent.click(slot.getByRole('button', { name: 'Retry workspace' }));
    await slot.findByText('ready.ts'); expect(get).toHaveBeenCalledTimes(2);
  });
  it('Personal automatically uses a ready real environment without a chat', async () => {
    const directory = vi.fn(async () => ({ directory: '/personal/env', parent: '/personal', entries: [{ name: 'notes.md', kind: 'file', path: '/personal/env/notes.md' }] }));
    const slot = setup({ sdk: { projects: { list: async () => [], get: async () => ({ ...catalogProject('alpha'), kind: 'personal', sources: [] }) },
      environments: { list: async () => [{ id: 'env-real', projectId: 'alpha', status: 'ready', lifecycle: { phase: 'active' }, hostId: 'host-real', path: '/personal/env', updatedAt: 1, name: null }] }, hosts: { directory } } });
    fireEvent.click(slot.getByRole('tab', { name: 'Explorer' })); await slot.findByText('notes.md');
    await waitFor(() => expect(directory).toHaveBeenCalled());
    expect(directory.mock.calls[0]).toBeTruthy();
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
  it('standalone preview binds a nondefault source on the same host and never opens a session', async () => {
    const read = vi.fn(async (args: { path: string }) => ({ path: args.path, sha256: 'hash', content: 'const selectedRoot = true;', contentEncoding: 'utf8' as const, sizeBytes: 26 }));
    const slot = setup({ sdk: { projects: { list: async () => [], get: async () => ({ ...catalogProject('alpha'), sources: [source, { ...source, id: 'other-root', path: '/work/other', isDefault: false }] }) },
      hosts: { directory: async ({ path }: { path: string }) => ({ directory: path, parent: '/work', entries: [{ name: 'a.ts', path: `${path}/a.ts`, kind: 'file' }] }) }, files: { read } } });
    fireEvent.click(slot.getByRole('tab', { name: 'Explorer' }));
    fireEvent.change(await slot.findByRole('combobox', { name: 'Explorer workspace' }), { target: { value: 'other-root' } });
    fireEvent.click(await slot.findByText('a.ts'));
    await within(document.body).findByText('const selectedRoot = true;');
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ hostId: 'host-alpha', path: '/work/other/a.ts', rootPath: '/work/other' }));
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
  it('standalone preview rejects resolved paths outside the root and retries a valid read', async () => {
    const read = vi.fn().mockResolvedValueOnce({ path: '/secret/a.ts', sha256: 'hash', content: 'must not display', contentEncoding: 'utf8', sizeBytes: 16 })
      .mockResolvedValue({ path: '/work/alpha/App.tsx', sha256: 'hash', content: 'safe source', contentEncoding: 'utf8', sizeBytes: 11 });
    const slot = setup({ sdk: { projects: { list: async () => [], get: async () => ({ ...catalogProject('alpha'), sources: [source] }) }, hosts: { directory: async () => ({ directory: '/work/alpha', parent: '/work', entries: [{ name: 'App.tsx', path: '/work/alpha/App.tsx', kind: 'file' }] }) }, files: { read } } });
    fireEvent.click(slot.getByRole('tab', { name: 'Explorer' })); fireEvent.click(await slot.findByText('App.tsx'));
    expect((await within(document.body).findByRole('alert')).textContent).toContain('outside');
    expect(within(document.body).queryByText('must not display')).toBeNull();
    fireEvent.click(within(document.body).getByRole('button', { name: 'Retry file' }));
    await within(document.body).findByText('safe source'); expect(read).toHaveBeenCalledTimes(2);
  });
  it('closing standalone preview cancels its read and discards a late response', async () => {
    let signal: AbortSignal | undefined, resolve!: (value: unknown) => void;
    const slot = setup({ sdk: { projects: { list: async () => [], get: async () => ({ ...catalogProject('alpha'), sources: [source] }) }, hosts: { directory: async () => ({ directory: '/work/alpha', parent: '/work', entries: [{ name: 'a.ts', path: '/work/alpha/a.ts', kind: 'file' }] }) }, files: { read: async (args: { signal?: AbortSignal }) => { signal = args.signal; return await new Promise(done => { resolve = done; }); } } } });
    fireEvent.click(slot.getByRole('tab', { name: 'Explorer' })); fireEvent.click(await slot.findByText('a.ts'));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close file preview' })); expect(signal?.aborted).toBe(true);
    await act(async () => { resolve({ path: '/work/alpha/a.ts', sha256: 'hash', content: 'late result', contentEncoding: 'utf8', sizeBytes: 11 }); });
    expect(within(document.body).queryByText('late result')).toBeNull(); expect(within(document.body).queryByRole('dialog')).toBeNull();
  });
  it('sources require matching project, explicit host and absolute root; default wins', () => {
    const roots = projectExplorerSources('alpha', [ { ...source, id: 'other', isDefault: false }, { ...source, id: 'outside', projectId: 'beta' }, { ...source, id: 'relative', path: 'relative' }, source ]);
    expect(roots.map(root => root.threadId)).toEqual(['src-alpha', 'other']);
    expect(fileAppearance('a.ts').letters).toBe('TS'); expect(fileAppearance('README.md').kind).toBe('text');
  });
});
