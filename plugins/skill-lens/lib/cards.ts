import type { Usage } from "./usage";

export type CardEntry = {
  id: string;
  name: string;
  description: string | null;
  provider: string | null;
  pluginId: string | null;
  root: string;
  realRoot: string;
};

export type SkillCard = {
  key: string;
  name: string;
  description: string | null;
  source: string;
  providers: (string | null)[];
  entries: CardEntry[];
};

const sourceUsage = [
  { source: "claude", provider: "claude-code", exact: true },
  { source: "codex", provider: "codex", exact: false },
  { source: "cursor", provider: "acp-cursor", exact: false },
] as const;

export const tildePath = (path: string, home: string) =>
  path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;

const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

export const buildCards = (entries: readonly CardEntry[], home: string) => {
  const cards = new Map<string, SkillCard>();
  for (const entry of entries) {
    const key = `${entry.pluginId ?? ""}:${entry.name}`;
    const card = cards.get(key);
    if (card) {
      card.entries.push(entry);
      if (!card.providers.includes(entry.provider)) card.providers.push(entry.provider);
      card.description ??= entry.description;
      continue;
    }
    cards.set(key, {
      key,
      name: entry.name,
      description: entry.description,
      source: entry.pluginId ? `plugin · ${entry.pluginId}` : tildePath(parentPath(entry.root), home),
      providers: [entry.provider],
      entries: [entry],
    });
  }
  return [...cards.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const matches = (card: SkillCard, key: string, provider: string, exact: boolean) => {
  if (key.startsWith("/")) return card.entries.some((entry) => entry.realRoot === key || entry.root === key);
  if (key.startsWith("bb:")) return card.providers.includes(null) && card.name === key.slice(3);
  if (!card.providers.includes(provider) && !card.providers.includes(null)) return false;
  return key === card.name || (!exact && key === card.name.slice(card.name.lastIndexOf(":") + 1));
};

export const cardUsage = (card: SkillCard, usage: Usage) => {
  let count = 0;
  let approximate = false;
  for (const { source, provider, exact } of sourceUsage) {
    for (const [key, value] of Object.entries(usage[source])) {
      if (!matches(card, key, provider, exact)) continue;
      count += value;
      if (source !== "claude") approximate = true;
    }
  }
  return { count, approximate };
};

export const rankCards = (cards: readonly SkillCard[], usage: Usage) => {
  const counts = new Map(cards.map((card) => [card.key, cardUsage(card, usage).count]));
  return [...cards].sort((left, right) => (counts.get(right.key) ?? 0) - (counts.get(left.key) ?? 0));
};

export const usageLabel = ({ count, approximate }: { count: number; approximate: boolean }) =>
  `${approximate ? "~" : ""}${count} ${count === 1 ? "usage" : "usages"}`;
