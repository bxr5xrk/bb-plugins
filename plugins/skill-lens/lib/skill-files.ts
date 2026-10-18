import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";

const skippedDirs = new Set([".git", "node_modules", ".venv", "__pycache__"]);
export const maxFiles = 2000;
export const maxBytes = 1024 * 1024;

export type SkillFile = { path: string; size: number };

export const listSkillFiles = async (root: string) => {
  const files: SkillFile[] = [];
  const walk = async (dir: string, prefix: string): Promise<boolean> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (skippedDirs.has(entry.name)) continue;
      const path = join(dir, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = await stat(path);
      if (info.isDirectory()) {
        if (!(await walk(path, relative))) return false;
      } else if (info.isFile()) {
        if (files.length >= maxFiles) return false;
        files.push({ path: relative, size: info.size });
      }
    }
    return true;
  };
  const complete = await walk(root, "");
  return { files, truncated: !complete };
};

export const resolveInside = (root: string, relative: string) => {
  const path = normalize(relative);
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) return null;
  return join(root, path);
};

export const readSkillFile = async (root: string, relative: string) => {
  const path = resolveInside(root, relative);
  if (path === null) throw new Error("Path is outside the skill folder.");
  const { size } = await stat(path);
  if (size > maxBytes) return { size, binary: false, content: null };
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8000).includes(0)) return { size, binary: true, content: null };
  return { size, binary: false, content: buffer.toString("utf8") };
};
