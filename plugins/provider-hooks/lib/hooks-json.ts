import { createHash } from "node:crypto";

export type HookHandler = {
  type: string;
  command?: string;
  timeout?: number;
  [key: string]: unknown;
};

export type HookGroup = {
  matcher?: string;
  hooks: HookHandler[];
  [key: string]: unknown;
};

export type HooksByEvent = Record<string, HookGroup[]>;

export type HooksFile = {
  hooks?: HooksByEvent;
  [key: string]: unknown;
};

export type HookEntry = {
  id: string;
  event: string;
  eventIndex: number;
  groupIndex: number;
  hookIndex: number;
  group: HookGroup;
  hook: HookHandler;
};

export type HookStash = {
  event: string;
  eventIndex: number;
  groupIndex: number;
  hookIndex: number;
  groupRemoved: boolean;
  group: HookGroup;
  hook: HookHandler;
};

const hashHook = (hook: HookHandler) =>
  createHash("sha256").update(JSON.stringify(hook)).digest("hex").slice(0, 12);

export const getHookEntries = (hooksByEvent: HooksByEvent): HookEntry[] =>
  Object.keys(hooksByEvent).flatMap((event, eventIndex) =>
    hooksByEvent[event].flatMap((group, groupIndex) =>
      group.hooks.map((hook, hookIndex) => ({
        id: `${event}:${groupIndex}:${hookIndex}:${hashHook(hook)}`,
        event,
        eventIndex,
        groupIndex,
        hookIndex,
        group,
        hook,
      })),
    ),
  );

export const disableHook = (hooksFile: HooksFile, id: string): HookStash => {
  const hooksByEvent = hooksFile.hooks ?? {};
  const entry = getHookEntries(hooksByEvent).find((item) => item.id === id);
  if (!entry) {
    throw new Error("Hook changed on disk; refresh and try again");
  }
  const groups = hooksByEvent[entry.event];
  entry.group.hooks.splice(entry.hookIndex, 1);
  const groupRemoved = entry.group.hooks.length === 0;
  if (groupRemoved) {
    groups.splice(entry.groupIndex, 1);
  }
  if (groups.length === 0) {
    delete hooksByEvent[entry.event];
  }
  return {
    event: entry.event,
    eventIndex: entry.eventIndex,
    groupIndex: entry.groupIndex,
    hookIndex: entry.hookIndex,
    groupRemoved,
    group: { ...entry.group, hooks: [] },
    hook: entry.hook,
  };
};

export const restoreHook = (hooksFile: HooksFile, stash: HookStash) => {
  const eventEntries = Object.entries(hooksFile.hooks ?? {});
  if (!eventEntries.some(([event]) => event === stash.event)) {
    eventEntries.splice(stash.eventIndex, 0, [stash.event, []]);
  }
  const hooksByEvent = Object.fromEntries(eventEntries);
  const groups = hooksByEvent[stash.event];
  const groupIndex = Math.min(stash.groupIndex, groups.length);
  const currentGroup = groups[groupIndex];
  if (stash.groupRemoved || !currentGroup || currentGroup.matcher !== stash.group.matcher) {
    groups.splice(groupIndex, 0, { ...stash.group, hooks: [] });
  }
  groups[groupIndex].hooks.splice(stash.hookIndex, 0, stash.hook);
  hooksFile.hooks = hooksByEvent;
};

export const serializeJson = (raw: string, value: unknown) => {
  const indent = raw.match(/^([ \t]+)"/m)?.[1] ?? "  ";
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  return JSON.stringify(value, null, indent) + trailingNewline;
};
