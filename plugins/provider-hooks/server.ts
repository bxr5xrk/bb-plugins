import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { getCodexHookKey, isCodexHookEnabled, setCodexHookEnabled } from "./lib/codex-state";
import {
  disableHook,
  getHookEntries,
  restoreHook,
  serializeJson,
  type HookGroup,
  type HookHandler,
  type HookStash,
  type HooksFile,
} from "./lib/hooks-json";

const claudeSettingsPath = join(homedir(), ".claude", "settings.json");
const codexHooksPath = join(homedir(), ".codex", "hooks.json");
const codexConfigPath = join(homedir(), ".codex", "config.toml");
const stashPrefix = "claude:";

const providerSchema = z.enum(["claude", "codex"]);

const hookSchema = z.object({
  id: z.string(),
  event: z.string(),
  matcher: z.string().nullable(),
  type: z.string(),
  command: z.string().nullable(),
  timeout: z.number().nullable(),
  enabled: z.boolean(),
});
export type HookRow = z.infer<typeof hookSchema>;

const sourceSchema = z.object({
  provider: providerSchema,
  label: z.string(),
  path: z.string(),
  hooks: z.array(hookSchema),
  error: z.string().nullable(),
});
export type HookSource = z.infer<typeof sourceSchema>;

const sourcesSchema = z.object({ sources: z.array(sourceSchema) });

export const rpcContract = defineRpcContract({
  listHooks: {
    input: z.null(),
    output: sourcesSchema,
  },
  setHookEnabled: {
    input: z.object({ provider: providerSchema, id: z.string(), enabled: z.boolean() }),
    output: sourcesSchema,
  },
});

const readText = async (path: string) => {
  try {
    const text = await readFile(path, "utf8");
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const writeFileAtomic = async (path: string, content: string) => {
  const targetPath = await realpath(path);
  const { mode } = await stat(targetPath);
  const tempPath = join(dirname(targetPath), `.${randomUUID()}.tmp`);
  await writeFile(tempPath, content, { mode: mode & 0o777 });
  await rename(tempPath, targetPath);
};

const toHookRow = (
  id: string,
  event: string,
  group: HookGroup,
  hook: HookHandler,
  enabled: boolean,
): HookRow => ({
  id,
  event,
  matcher: group.matcher ?? null,
  type: hook.type,
  command: hook.command ?? null,
  timeout: hook.timeout ?? null,
  enabled,
});

const loadSource = async (
  provider: HookSource["provider"],
  label: string,
  path: string,
  listHooks: () => Promise<HookRow[]>,
): Promise<HookSource> => {
  try {
    const hooks = await listHooks();
    return { provider, label, path, hooks, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { provider, label, path, hooks: [], error: message };
  }
};

export default (bb: BbPluginApi) => {
  const listClaudeHooks = async () => {
    const raw = await readText(claudeSettingsPath);
    const settings: HooksFile = raw === null ? {} : JSON.parse(raw);
    const enabledRows = getHookEntries(settings.hooks ?? {}).map((entry) =>
      toHookRow(entry.id, entry.event, entry.group, entry.hook, true),
    );
    const stashKeys = await bb.storage.kv.list(stashPrefix);
    const stashRequests = stashKeys.map((key) => bb.storage.kv.get<HookStash>(key));
    const stashes = await Promise.all(stashRequests);
    const disabledRows = stashKeys.flatMap((key, index) => {
      const stash = stashes[index];
      return stash ? [toHookRow(key, stash.event, stash.group, stash.hook, false)] : [];
    });
    return [...enabledRows, ...disabledRows];
  };

  const listCodexHooks = async () => {
    const raw = await readText(codexHooksPath);
    if (raw === null) {
      return [];
    }
    const hooksFile: HooksFile = JSON.parse(raw);
    const hooksPath = await realpath(codexHooksPath);
    const toml = (await readText(codexConfigPath)) ?? "";
    return getHookEntries(hooksFile.hooks ?? {}).map((entry) => {
      const key = getCodexHookKey(hooksPath, entry.event, entry.groupIndex, entry.hookIndex);
      return toHookRow(key, entry.event, entry.group, entry.hook, isCodexHookEnabled(toml, key));
    });
  };

  const listSources = async () => {
    const claudeRequest = loadSource("claude", "Claude Code", claudeSettingsPath, listClaudeHooks);
    const codexRequest = loadSource("codex", "Codex", codexHooksPath, listCodexHooks);
    const sources = await Promise.all([claudeRequest, codexRequest]);
    return { sources };
  };

  const setClaudeHookEnabled = async (id: string, enabled: boolean) => {
    const raw = await readFile(claudeSettingsPath, "utf8");
    const settings: HooksFile = JSON.parse(raw);
    if (enabled) {
      const stash = await bb.storage.kv.get<HookStash>(id);
      if (!stash) {
        throw new Error("Disabled hook not found; refresh and try again");
      }
      restoreHook(settings, stash);
      await writeFileAtomic(claudeSettingsPath, serializeJson(raw, settings));
      await bb.storage.kv.delete(id);
      return;
    }
    const stash = disableHook(settings, id);
    const stashKey = `${stashPrefix}${randomUUID()}`;
    await bb.storage.kv.set(stashKey, stash);
    try {
      await writeFileAtomic(claudeSettingsPath, serializeJson(raw, settings));
    } catch (error) {
      await bb.storage.kv.delete(stashKey);
      throw error;
    }
  };

  const setCodexEnabled = async (id: string, enabled: boolean) => {
    const hooks = await listCodexHooks();
    if (!hooks.some((hook) => hook.id === id)) {
      throw new Error("Hook changed on disk; refresh and try again");
    }
    const toml = await readFile(codexConfigPath, "utf8");
    const nextToml = setCodexHookEnabled(toml, id, enabled);
    if (nextToml === toml) {
      return;
    }
    await writeFileAtomic(codexConfigPath, nextToml);
  };

  bb.rpc.register(rpcContract, {
    listHooks: () => listSources(),
    setHookEnabled: async ({ provider, id, enabled }) => {
      if (provider === "claude") {
        await setClaudeHookEnabled(id, enabled);
      } else {
        await setCodexEnabled(id, enabled);
      }
      return listSources();
    },
  });
};
