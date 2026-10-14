import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { HookRow, HookSource, rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Provider = HookSource["provider"];
type HookItemData = HookRow & { sourcePath: string; eventKey: string };

const providerStorageKey = "provider-hooks:provider";
const scriptPattern = /([^\s"'/\\]+\.(?:js|ts|sh|py|mjs|cjs))\b/;

const eventDescriptions: Record<string, string> = {
  SessionStart: "When a session starts or resumes",
  UserPromptSubmit: "When the user submits a prompt",
  PreToolUse: "Before a tool runs",
  PermissionRequest: "When a permission prompt appears",
  PostToolUse: "After a tool succeeds",
  PostToolUseFailure: "After a tool fails",
  Notification: "When the agent sends a notification",
  SubagentStart: "When a subagent starts",
  SubagentStop: "When a subagent finishes",
  TeammateIdle: "When a teammate goes idle",
  PreCompact: "Before the context is compacted",
  PostCompact: "After the context is compacted",
  Stop: "When the agent finishes responding",
  StopFailure: "When a turn ends with an error",
  Interrupt: "When a turn is interrupted",
  SessionEnd: "When a session ends",
};

const providerEvents: Record<Provider, string[]> = {
  claude: [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "TeammateIdle",
    "PreCompact",
    "PostCompact",
    "Stop",
    "StopFailure",
    "SessionEnd",
  ],
  codex: [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    "PostCompact",
    "Stop",
    "Interrupt",
    "SessionEnd",
  ],
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const toEventKey = (event: string) =>
  event
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const getHookName = (hook: HookItemData) => {
  const command = hook.command ?? "";
  if (command.includes(".orca/agent-hooks")) {
    return "Orca agent hooks";
  }
  const script = command.match(scriptPattern)?.[1];
  if (script) {
    return script;
  }
  if (command.length > 40) {
    return `${command.slice(0, 40)}…`;
  }
  return command || hook.type;
};

const getDotTone = (hooks: HookItemData[]) => {
  if (hooks.some((hook) => hook.enabled)) {
    return "border-success bg-success";
  }
  if (hooks.length > 0) {
    return "border-success bg-background";
  }
  return "border-border bg-background";
};

const HookItem = ({
  hook,
  disabled,
  onToggle,
}: {
  hook: HookItemData;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const details = [
    ["Event", hook.event],
    ["Matcher", hook.matcher ?? "—"],
    ["Type", hook.type],
    ["Command", hook.command ?? "—"],
    ["Timeout", hook.timeout === null ? "—" : `${hook.timeout}s`],
    ["Source file", hook.sourcePath],
  ];
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <Icon
            name="ChevronRight"
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          <span className={cn("truncate text-sm", !hook.enabled && "text-muted-foreground")}>{getHookName(hook)}</span>
          {hook.matcher === null ? null : (
            <span className="max-w-40 shrink-0 truncate rounded bg-muted px-1.5 font-mono text-[11px] leading-5 text-muted-foreground">
              {hook.matcher}
            </span>
          )}
        </button>
        <Switch
          checked={hook.enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-label={`${hook.enabled ? "Disable" : "Enable"} ${getHookName(hook)}`}
        />
      </div>
      {expanded ? (
        <dl className="mt-2 ml-5 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 rounded-md bg-muted/50 p-3 text-xs">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn("min-w-0 break-all", (label === "Command" || label === "Source file") && "whitespace-pre-wrap font-mono")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
};

const Timeline = ({
  items,
  events,
  pendingId,
  onToggle,
}: {
  items: HookItemData[];
  events: string[];
  pendingId: string | null;
  onToggle: (hook: HookItemData, enabled: boolean) => void;
}) => (
  <ol className="ml-1.5 border-l border-border">
    {events.map((event) => {
      const hooks = items.filter((item) => item.eventKey === event);
      const description = eventDescriptions[event] ?? "Custom event";
      return (
        <li key={event} className="relative pb-4 pl-5 last:pb-0">
          <span className={cn("absolute -left-[5px] top-1 size-2.5 rounded-full border", getDotTone(hooks))} />
          {hooks.length === 0 ? (
            <p className="text-xs text-muted-foreground opacity-60">
              {event} · {description}
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                <span className="text-sm font-medium text-foreground">{event}</span> · {description} ·{" "}
                {hooks.length === 1 ? "1 hook" : `${hooks.length} hooks`}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
                {hooks.map((hook) => (
                  <HookItem
                    key={hook.id}
                    hook={hook}
                    disabled={pendingId !== null}
                    onToggle={(enabled) => onToggle(hook, enabled)}
                  />
                ))}
              </ul>
            </div>
          )}
        </li>
      );
    })}
  </ol>
);

const ProviderSwitch = ({
  sources,
  provider,
  onChange,
}: {
  sources: HookSource[];
  provider: Provider;
  onChange: (provider: Provider) => void;
}) => (
  <div role="tablist" className="inline-flex rounded-md border border-border bg-muted p-0.5">
    {sources.map((source) => (
      <button
        key={source.provider}
        type="button"
        role="tab"
        aria-selected={provider === source.provider}
        onClick={() => onChange(source.provider)}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-muted-foreground",
          provider === source.provider && "bg-background text-foreground shadow-xs",
        )}
      >
        {source.label}
        <span className="text-muted-foreground">{source.hooks.length}</span>
      </button>
    ))}
  </div>
);

const HooksSettings = () => {
  const rpc = useRpc<typeof rpcContract>();
  const [sources, setSources] = useState<HookSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>(() =>
    localStorage.getItem(providerStorageKey) === "codex" ? "codex" : "claude",
  );

  const refresh = useCallback(() => {
    rpc.call("listHooks").then(
      (result) => {
        setSources(result.sources);
        setError(null);
      },
      (cause) => setError(getErrorMessage(cause)),
    );
  }, [rpc]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectProvider = (nextProvider: Provider) => {
    localStorage.setItem(providerStorageKey, nextProvider);
    setProvider(nextProvider);
  };

  const toggle = (hook: HookItemData, enabled: boolean) => {
    setPendingId(hook.id);
    rpc
      .call("setHookEnabled", { provider, id: hook.id, enabled })
      .then(
        (result) => {
          setSources(result.sources);
          setError(null);
        },
        (cause) => setError(getErrorMessage(cause)),
      )
      .finally(() => setPendingId(null));
  };

  const source = sources?.find((item) => item.provider === provider);
  const items = (source?.hooks ?? []).map((hook) => ({
    ...hook,
    sourcePath: source?.path ?? "",
    eventKey: toEventKey(hook.event),
  }));
  const knownEvents = providerEvents[provider];
  const extraEvents = [...new Set(items.map((item) => item.eventKey))].filter((event) => !knownEvents.includes(event));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {sources === null ? null : <ProviderSwitch sources={sources} provider={provider} onChange={selectProvider} />}
          {source ? <p className="truncate font-mono text-xs text-muted-foreground">{source.path}</p> : null}
        </div>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Refresh hooks" onClick={refresh} disabled={pendingId !== null}>
          <Icon name="RotateCcw" />
        </Button>
      </div>
      {[error, source?.error ?? null]
        .filter((message) => message !== null)
        .map((message) => (
          <p key={message} role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ))}
      {sources === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading hooks…
        </p>
      ) : (
        <Timeline items={items} events={[...knownEvents, ...extraEvents]} pendingId={pendingId} onToggle={toggle} />
      )}
    </div>
  );
};

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "hooks",
    title: "Hooks",
    description: "User-level Claude Code and Codex hooks. Changes are saved to the provider config files.",
    component: HooksSettings,
  });
});
