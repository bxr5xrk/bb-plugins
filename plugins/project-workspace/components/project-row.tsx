import type { ReactNode } from "react";
import * as Menu from "@radix-ui/react-context-menu";
import { UrlLink, useBbNavigate } from "@get-bb/plugin-sdk/app";

export function ProjectRow({ id, name, active, children, onSelect, onHide, onNavigate, settingsHref }: {
  id: string; name: string; active: boolean; children: ReactNode; onSelect(): void;
  onHide(): void; onNavigate(): void; settingsHref?: string;
}) {
  const navigate = useBbNavigate();
  return <Menu.Root><Menu.Trigger asChild>
    <button className="pw-project-row" aria-label={name} aria-pressed={active} title={name}
      aria-haspopup="menu" aria-keyshortcuts="Shift+F10" onClick={onSelect}
      onKeyDown={event => {
        if (!(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom }));
      }}>{children}</button>
  </Menu.Trigger><Menu.Portal><Menu.Content className="pw-menu">
    <Menu.Item className="pw-menu-item" onSelect={() => {
      onSelect(); navigate.toCompose({ projectId: id, focusPrompt: true }); onNavigate();
    }}>New session</Menu.Item>
    <Menu.Item asChild><UrlLink className="pw-menu-item" href={settingsHref ?? `/settings/projects/${encodeURIComponent(id)}`} onClick={onNavigate}>Project settings</UrlLink></Menu.Item>
    <Menu.Separator className="pw-menu-separator" />
    <Menu.Item className="pw-menu-item" onSelect={onHide}>Hide from list</Menu.Item>
  </Menu.Content></Menu.Portal></Menu.Root>;
}
