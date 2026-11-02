import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";

export const SHELL_CSS = `
@media (min-width: 768px) and (pointer: fine) {
  /* Native window chrome already contains history and sidebar controls. */
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-top-reserve-row"] {
    display: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-sidebar-body"] {
    grid-row: 1 / -1;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-sidebar-body"] > div {
    width: 100% !important;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-body"] > [data-sidebar="content"] {
    scrollbar-gutter: auto;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-resize-handle"] {
    display: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-navigation-rail"] {
    grid-area: 1 / 1;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] {
    grid-area: 1 / 1;
    align-self: end;
    width: 100%;
    z-index: 11;
    background: transparent;
    border: 0;
    border-radius: 0;
    clip-path: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] > div {
    width: 100% !important;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] [data-sidebar="footer"] {
    padding: 0 0 4px;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] [data-sidebar="menu"] {
    justify-content: center;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] [data-sidebar="menu"] [data-sidebar="menu"] > li:not([data-footer-item="plugin:bb--provider-usage/usage"]) {
    display: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-body"] > div:has(> section[id^="plugin-sidebar-footer-disclosure-"]) {
    position: absolute;
    inset: auto auto 0 0;
    width: min(100%, 320px);
    z-index: 40;
    background: var(--sidebar, var(--background));
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]),
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="gap"],
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="panel"] {
    --sidebar-width: clamp(360px, var(--project-workspace-width, 480px), 48vw) !important;
  }
}
`;
export function mountShellStyle(_context: PluginContentScriptContext) {
  const style = document.createElement("style");
  style.dataset.projectWorkspaceStyle = "";
  style.textContent = SHELL_CSS;
  document.head.append(style);
  const root = document.querySelector<HTMLElement>('[data-testid="app-layout-root"]');
  const closeFooterDisclosure = (event: PointerEvent) => {
    if (!root?.querySelector("[data-project-workspace-sidebar]")) return;
    const target = event.target;
    if (!(target instanceof Element) || !root.contains(target) || target.closest('[data-sidebar="footer"]')) return;
    const section = root.querySelector<HTMLElement>('section[id^="plugin-sidebar-footer-disclosure-"]');
    if (!section || section.contains(target)) return;
    document.getElementById(section.id.replace("plugin-sidebar-footer-disclosure-", "plugin-sidebar-footer-trigger-"))?.click();
  };
  document.addEventListener("pointerdown", closeFooterDisclosure, true);
  // The CSS becomes inert as soon as the slot unmounts. Disable removes the
  // exact injected node and plugin variable without touching native settings.
  return () => { document.removeEventListener("pointerdown", closeFooterDisclosure, true); style.remove(); root?.style.removeProperty("--project-workspace-width"); };
}
