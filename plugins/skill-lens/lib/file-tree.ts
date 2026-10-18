export type TreeRow = { path: string; name: string; depth: number; folder: boolean };

export const treeRows = (paths: readonly string[], collapsed: ReadonlySet<string>) => {
  const rows: TreeRow[] = [];
  const folders = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let depth = 0; depth < parts.length; depth++) {
      const current = parts.slice(0, depth + 1).join("/");
      const folder = depth < parts.length - 1;
      if (!folder || !folders.has(current)) rows.push({ path: current, name: parts[depth], depth, folder });
      if (!folder) continue;
      folders.add(current);
      if (collapsed.has(current)) break;
    }
  }
  return rows;
};

export const formatSize = (size: number) =>
  size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
