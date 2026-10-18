import { execFile } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type UsageCounts = Record<string, number>;
export type Usage = { claude: UsageCounts; codex: UsageCounts; cursor: UsageCounts };
export type Locate = (dir: string) => string;

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const skillDirs = (text: string) =>
  [...text.replace(/\\[nrt"]/g, " ").matchAll(/[^\s"'`\\()<>=,;|]*\/SKILL\.md/g)]
    .map(([token]) => token.slice(0, -"/SKILL.md".length))
    .filter((dir) => /^[A-Za-z0-9._-]+$/.test(baseName(dir)));

const run = (file: string, args: string[]) =>
  new Promise<string>((resolve) => {
    execFile(file, args, { maxBuffer: 256 * 1024 * 1024 }, (_error, stdout) => resolve(stdout ?? ""));
  });

const add = (counts: UsageCounts, name: string) => {
  counts[name] = (counts[name] ?? 0) + 1;
};

const countSessions = (sessions: Iterable<Set<string>>) => {
  const counts: UsageCounts = {};
  for (const keys of sessions) {
    const located = new Set([...keys].filter((key) => key.includes("/") || key.startsWith("bb:")).map((key) => baseName(key.replace(/^bb:/, ""))));
    for (const key of keys) if (key.includes("/") || key.startsWith("bb:") || !located.has(key)) add(counts, key);
  }
  return counts;
};

const claudeKey = (skill: string) => (skill.startsWith("bb-global-skills:") ? `bb:${skill.slice("bb-global-skills:".length)}` : skill);

export const countClaude = (lines: readonly string[]) => {
  const counts: UsageCounts = {};
  const ids = new Set<string>();
  const uuids = new Set<string>();
  for (const line of lines) {
    for (const [, id, skill] of line.matchAll(/"type":"tool_use","id":"([^"]+)","name":"Skill","input":\{"skill":"([^"]+)"/g)) {
      if (ids.has(id)) continue;
      ids.add(id);
      add(counts, claudeKey(skill));
    }
    const command = /"content":"<command-message>[^<]*<\/command-message>\\n<command-name>\/([^<]+)<\/command-name>/.exec(line);
    const uuid = /"uuid":"([^"]+)"/.exec(line);
    if (!command || !uuid || uuids.has(uuid[1])) continue;
    uuids.add(uuid[1]);
    add(counts, claudeKey(command[1]));
  }
  return counts;
};

export const countCodex = (sessions: readonly { session: string; lines: readonly string[] }[], locate: Locate) =>
  countSessions(
    sessions.map(({ lines }) => {
      const keys = new Set<string>();
      for (const line of lines) {
        if (/"payload":\{"type":"(function_call|custom_tool_call|local_shell_call)"/.test(line)) {
          for (const dir of skillDirs(line)) keys.add(locate(dir));
        }
        for (const [, name] of line.matchAll(/<skill>\\n<name>([^<]+)<\/name>/g)) keys.add(name);
      }
      return keys;
    }),
  );

export const countCursor = (chats: readonly { chat: string; blobs: readonly string[] }[], locate: Locate) =>
  countSessions(
    chats.map(({ blobs }) => {
      const keys = new Set<string>();
      for (const blob of blobs) {
        let message: { role?: string; content?: unknown };
        try {
          message = JSON.parse(blob);
        } catch {
          continue;
        }
        if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
        for (const part of message.content) {
          if (part?.type !== "tool-call") continue;
          for (const dir of skillDirs(JSON.stringify(part.args ?? {}))) keys.add(locate(dir));
        }
      }
      return keys;
    }),
  );

export const locateSkill = (home: string, resolve: (path: string) => string): Locate => (dir) => {
  const path = dir.startsWith("~/") ? `${home}${dir.slice(1)}` : dir;
  if (!path.startsWith("/")) return baseName(path);
  const copy = /\/\.bb\/runtime\/global-skills\/[^/]+\/skills\/([^/]+)$/.exec(path);
  return copy ? `bb:${copy[1]}` : resolve(path);
};

const linesWith = (buffer: Buffer, needles: readonly string[]) => {
  const starts = new Set<number>();
  const lines: string[] = [];
  for (const needle of needles) {
    for (let at = buffer.indexOf(needle); at >= 0; at = buffer.indexOf(needle, at + 1)) {
      const start = buffer.lastIndexOf(10, at) + 1;
      const end = buffer.indexOf(10, at);
      if (!starts.has(start)) lines.push(buffer.toString("utf8", start, end < 0 ? buffer.length : end));
      starts.add(start);
      at = end < 0 ? buffer.length : end;
    }
  }
  return lines;
};

const scanSessions = async (dir: string, needles: readonly string[]) => {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith(".jsonl"));
  const sessions: { session: string; lines: string[] }[] = [];
  for (let index = 0; index < files.length; index += 16) {
    const batch = files.slice(index, index + 16);
    const buffers = await Promise.all(batch.map((file) => readFile(join(dir, file))));
    batch.forEach((session, position) => sessions.push({ session, lines: linesWith(buffers[position], needles) }));
  }
  return sessions;
};

const claudeUsage = async (dir: string) =>
  countClaude((await scanSessions(dir, ['"name":"Skill","input":{"skill":"', '"content":"<command-message>'])).flatMap(({ lines }) => lines));

const codexUsage = async (dir: string, locate: Locate) => countCodex(await scanSessions(dir, ["SKILL.md", "<skill>\\n<name>"]), locate);

const cursorUsage = async (dir: string, locate: Locate) => {
  if (!existsSync(dir)) return {};
  const stores = readdirSync(dir).flatMap((workspace) =>
    readdirSync(join(dir, workspace)).map((chat) => ({ chat, file: join(dir, workspace, chat, "store.db") })),
  );
  const chats = await Promise.all(
    stores.filter(({ file }) => existsSync(file)).map(async ({ chat, file }) => {
      const output = await run("sqlite3", [
        "-readonly",
        "-json",
        file,
        "select cast(data as text) as data from blobs where instr(cast(data as text), '\"tool-call\"') > 0 and instr(cast(data as text), 'SKILL.md') > 0",
      ]);
      const rows: { data: string }[] = output.trim() ? JSON.parse(output) : [];
      return { chat, blobs: rows.map((row) => row.data) };
    }),
  );
  return countCursor(chats, locate);
};

export const collectUsage = async (): Promise<Usage> => {
  const home = homedir();
  const resolved = new Map<string, string>();
  const locate = locateSkill(home, (path) => {
    if (!resolved.has(path)) {
      try {
        resolved.set(path, realpathSync(path));
      } catch {
        resolved.set(path, path);
      }
    }
    return resolved.get(path) ?? path;
  });
  const [claude, codex, cursor] = await Promise.all([
    claudeUsage(join(home, ".claude/projects")),
    codexUsage(join(home, ".codex/sessions"), locate),
    cursorUsage(join(home, ".cursor/chats"), locate),
  ]);
  return { claude, codex, cursor };
};
