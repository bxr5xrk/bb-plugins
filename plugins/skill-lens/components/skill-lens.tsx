import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Markdown,
  experimental_Icon as Icon,
  experimental_ProviderIcon as ProviderIcon,
  experimental_SourceCode as SourceCode,
  experimental_useProviders as useProviders,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { SkillFileRow, SkillRow, rpcContract } from "../server";
import { formatSize, treeRows } from "../lib/file-tree";
import { buildCards, cardUsage, rankCards, tildePath, usageLabel, type SkillCard } from "../lib/cards";
import type { Usage } from "../lib/usage";
import { bbLogo } from "../lib/bb-logo";

type Preview = { size: number; binary: boolean; content: string | null };

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const Logos = ({ providers }: { providers: readonly (string | null)[] }) => {
  const known = useProviders().providers;
  return (
    <span className="flex items-center gap-1">
      {providers.map((id) =>
        id === null ? (
          <img key="bb" src={bbLogo} alt="bb" title="bb" className="size-4 object-contain dark:invert" />
        ) : (
          <span key={id} title={id} className="inline-flex">
            <ProviderIcon
              providerKind="agent"
              provider={known.find((provider) => provider.id === id) ?? { id, logoUrl: `/api/v1/system/providers/${id}/logo` }}
              className="size-4"
            />
          </span>
        ),
      )}
    </span>
  );
};

const Column = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={`md:pr-3${className ? ` ${className}` : ""}`}>
    <div className="mx-auto w-full max-w-5xl px-4 md:px-5">{children}</div>
  </div>
);

const Card = ({ card, usage, onOpen }: { card: SkillCard; usage: Usage | null; onOpen: () => void }) => (
  <div className="group relative grid min-h-28 w-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr_auto] gap-2 rounded-lg border border-border bg-card p-3 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/30 hover:bg-[color-mix(in_oklab,var(--ink)_2.5%,transparent)] hover:shadow-sm">
    <button
      type="button"
      aria-label={`View details for ${card.name}`}
      className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onOpen}
    />
    <span className="pointer-events-none relative col-start-1 row-start-1 min-w-0 self-center">
      <span className="block truncate text-sm font-medium text-foreground">{card.name}</span>
    </span>
    <span className="pointer-events-none relative col-start-2 row-start-1 flex shrink-0 items-center justify-end whitespace-nowrap">
      <Logos providers={card.providers} />
    </span>
    <span className="pointer-events-none relative col-span-2 row-start-2 self-center text-left text-xs leading-snug text-muted-foreground line-clamp-2">
      {card.description}
    </span>
    <span className="pointer-events-none relative col-start-1 row-start-3 mt-1.5 flex min-h-4 min-w-0 items-center text-left text-xs text-subtle-foreground">
      <span className="block min-w-0 truncate">{card.source}</span>
    </span>
    <span className="pointer-events-none relative col-start-2 row-start-3 mt-1.5 flex min-h-4 min-w-0 items-center justify-end text-right">
      {usage && (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap px-1 text-[11px] leading-none text-muted-foreground">
          {usageLabel(cardUsage(card, usage))}
        </span>
      )}
    </span>
  </div>
);

const SkillPage = ({ card, usage, home, onBack }: { card: SkillCard; usage: Usage | null; home: string; onBack: () => void }) => {
  const rpc = useRpc<typeof rpcContract>();
  const roots = useMemo(() => {
    const result = new Map<string, SkillCard["entries"]>();
    for (const entry of card.entries) result.set(entry.realRoot, [...(result.get(entry.realRoot) ?? []), entry]);
    return [...result.values()];
  }, [card]);
  const [skillId, setSkillId] = useState(card.entries[0].id);
  const [files, setFiles] = useState<{ files: SkillFileRow[]; truncated: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [source, setSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpc.call("listFiles", { skillId }).then(
      (result) => {
        if (cancelled) return;
        setFiles(result);
        setPath(result.files.find((file) => file.path === "SKILL.md")?.path ?? result.files[0]?.path ?? null);
      },
      (cause) => !cancelled && setError(getErrorMessage(cause)),
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, skillId]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setPreview(null);
    rpc.call("readFile", { skillId, path }).then(
      (result) => !cancelled && setPreview(result),
      (cause) => !cancelled && setError(getErrorMessage(cause)),
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, skillId, path]);

  const entry = card.entries.find((item) => item.id === skillId) ?? card.entries[0];
  const rows = useMemo(() => treeRows(files?.files.map((file) => file.path) ?? [], collapsed), [files, collapsed]);
  const markdown = path?.toLowerCase().endsWith(".md") ?? false;

  const selectRoot = (id: string) => {
    setSkillId(id);
    setFiles(null);
    setPath(null);
    setPreview(null);
    setCollapsed(new Set());
  };

  const toggleFolder = (folder: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(folder)) next.add(folder);
      return next;
    });

  return (
    <div className="sl-page">
      <header className="sl-page-header">
        <button type="button" className="sl-back" onClick={onBack}>
          ← Skill lens
        </button>
        <div className="sl-title">
          <h1>{card.name}</h1>
          <Logos providers={card.providers} />
          {usage && <span className="sl-usage">{usageLabel(cardUsage(card, usage))}</span>}
        </div>
        <div className="sl-roots">
          {roots.length > 1 &&
            roots.map((items) => (
              <button
                key={items[0].realRoot}
                type="button"
                className="sl-root-option"
                aria-pressed={items.some((item) => item.id === skillId)}
                title={tildePath(items[0].realRoot, home)}
                onClick={() => selectRoot(items[0].id)}
              >
                <Logos providers={[...new Set(items.map((item) => item.provider))]} />
              </button>
            ))}
          <span className="sl-path" title={entry.root}>
            {tildePath(entry.root, home)}
          </span>
        </div>
      </header>
      <div className="sl-split">
        <section className="sl-files">
          <div className="sl-scroll">
            {files === null ? (
              <p className="sl-message" role="status">Loading files…</p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.path}
                  type="button"
                  className="sl-file"
                  style={{ paddingLeft: 8 + row.depth * 14 }}
                  aria-pressed={!row.folder && row.path === path}
                  aria-expanded={row.folder ? !collapsed.has(row.path) : undefined}
                  onClick={() => (row.folder ? toggleFolder(row.path) : setPath(row.path))}
                >
                  <span className="sl-file-mark">{row.folder ? (collapsed.has(row.path) ? "▸" : "▾") : ""}</span>
                  <span className="sl-file-name">{row.folder ? `${row.name}/` : row.name}</span>
                </button>
              ))
            )}
            {files?.truncated && <p className="sl-message">Only the first {files.files.length} files are shown.</p>}
          </div>
        </section>
        <section className="sl-preview">
          {error && (
            <p className="sl-message sl-error" role="alert">
              {error}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </p>
          )}
          {path && (
            <header className="sl-preview-header">
              <span className="sl-preview-path">{path}</span>
              {preview && <span className="sl-preview-size">{formatSize(preview.size)}</span>}
              {markdown && (
                <div className="sl-mode" role="group" aria-label="Markdown view">
                  <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>Rendered</button>
                  <button type="button" aria-pressed={source} onClick={() => setSource(true)}>Source</button>
                </div>
              )}
            </header>
          )}
          <div className="sl-preview-body">
            {path === null ? null : preview === null ? (
              <p className="sl-message" role="status">Loading file…</p>
            ) : preview.content === null ? (
              <p className="sl-message">{preview.binary ? "Binary file, no preview." : "File is larger than 1 MB, no preview."}</p>
            ) : markdown && !source ? (
              <Markdown content={preview.content} className="sl-markdown" />
            ) : (
              <SourceCode content={preview.content} path={path} overflow="scroll" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export const SkillLens = () => {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<{ skills: SkillRow[]; home: string } | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [query, setQuery] = useState("");
  const [cardKey, setCardKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc.call("listSkills").then(setData, (cause) => setError(getErrorMessage(cause)));
    rpc.call("usage").then(setUsage, (cause) => setError(getErrorMessage(cause)));
  }, [rpc]);

  const cards = useMemo(() => (data ? buildCards(data.skills, data.home) : []), [data]);
  const ranked = useMemo(() => (usage ? rankCards(cards, usage) : cards), [cards, usage]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? ranked.filter((card) => `${card.name} ${card.description ?? ""}`.toLowerCase().includes(needle)) : ranked;
  }, [ranked, query]);
  const card = cards.find((item) => item.key === cardKey);

  return (
    <div className="sl-root -mx-4 -mb-4 -mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:-mx-5 md:-mb-5 md:-mt-5">
      {card && data ? (
        <SkillPage key={card.key} card={card} usage={usage} home={data.home} onBack={() => setCardKey(null)} />
      ) : (
        <div className="box-border flex h-full min-h-0 w-full flex-col gap-5 pb-4 pt-3 md:pt-4">
          <Column>
            <p className="text-sm leading-5 text-muted-foreground">
              Every skill on this bb host with all of its files, the agents that have it, and how often it was used.
            </p>
          </Column>
          <Column className="shrink-0">
            <form role="search" className="flex w-full min-w-0 items-center gap-2" onSubmit={(event) => event.preventDefault()}>
              <div className="relative min-w-0 flex-1">
                <Icon
                  name="Search"
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="search"
                  placeholder="Search skills"
                  aria-label="Search skills"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="flex w-full rounded-md border border-input bg-transparent pr-3 py-1 transition-colors duration-150 hover:duration-0 placeholder:text-muted-foreground focus-visible:outline-none text-sm h-8 truncate pl-8 focus:border-ring/60 focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </form>
          </Column>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Column>
              {error && (
                <p className="sl-message sl-error" role="alert">
                  {error}
                  <button type="button" onClick={() => setError(null)}>Dismiss</button>
                </p>
              )}
              {data === null ? (
                <p className="text-sm text-muted-foreground" role="status">Loading skills…</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,23rem),1fr))] gap-2.5">
                  {visible.map((item) => (
                    <Card key={item.key} card={item} usage={usage} onOpen={() => setCardKey(item.key)} />
                  ))}
                </div>
              )}
            </Column>
          </div>
        </div>
      )}
    </div>
  );
};
