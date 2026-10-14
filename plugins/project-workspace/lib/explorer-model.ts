import { absolutePath, normalizePath, type ExplorerSource } from './workspace-model';

export type ProjectSourceRecord = { id: string; projectId: string; hostId: string; path: string; isDefault: boolean };
export function projectExplorerSources(projectId: string, sources: readonly ProjectSourceRecord[]): ExplorerSource[] {
  return sources.filter(source => source.projectId === projectId && source.hostId && absolutePath(source.path))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id.localeCompare(b.id))
    .map(source => ({ threadId: source.id, projectId, hostId: source.hostId, environmentId: null,
      root: normalizePath(source.path), label: source.path }));
}

export function fileAppearance(name: string) {
  const lower = name.toLowerCase(), extension = lower.split('.').at(-1);
  if (/^(package(-lock)?\.json|tsconfig.*\.json|.*\.(json|jsonc|ya?ml|toml))$/.test(lower)) return { kind: 'config', color: '#d9b76f' };
  if (/^(readme|license|changelog)/.test(lower) || ['md', 'mdx', 'txt', 'rst'].includes(extension ?? '')) return { kind: 'text', color: '#a4bfdf' };
  if (['tsx', 'jsx'].includes(extension ?? '')) return { kind: 'react', color: '#79c5da' };
  if (['ts', 'mts', 'cts'].includes(extension ?? '')) return { kind: 'code', color: '#83baf0', letters: 'TS' };
  if (['js', 'mjs', 'cjs'].includes(extension ?? '')) return { kind: 'code', color: '#dfc56c', letters: 'JS' };
  if (['css', 'scss', 'sass', 'less'].includes(extension ?? '')) return { kind: 'style', color: '#b5a0e3' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'heic'].includes(extension ?? '')) return { kind: 'image', color: '#9dca95' };
  if (['rs', 'py', 'swift', 'go', 'rb', 'java', 'kt', 'c', 'cpp', 'h', 'html', 'vue', 'svelte', 'sh'].includes(extension ?? '')) return { kind: 'code', color: '#dba883' };
  if (lower.startsWith('.git') || ['.env', '.env.local', '.editorconfig', '.prettierrc'].includes(lower)) return { kind: 'config', color: '#b5a0e3' };
  return { kind: 'file', color: 'var(--muted-foreground)' };
}
