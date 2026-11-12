import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";

const TITLE_BAR_HEIGHT = 40;

const cardMask = (height: number, squareLeft: boolean) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='${height}'/><rect y='${height}' width='100%' height='100%' rx='8'/>${squareLeft ? `<rect y='${height}' width='8' height='8'/>` : ""}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

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
  html[style*="--bb-macos-traffic-light-center-y"]:has([data-testid="app-layout-root"][data-framed] [data-project-workspace-sidebar]) {
    --bb-window-title-bar-height: ${TITLE_BAR_HEIGHT}px !important;
    --bb-window-card-mask: ${cardMask(TITLE_BAR_HEIGHT, false)} !important;
    --bb-window-card-mask-square-left: ${cardMask(TITLE_BAR_HEIGHT, true)} !important;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="gap"] {
    anchor-name: --pw-sidebar;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-rail-footer {
    display: block;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-navigation-rail"] {
    position: fixed;
    position-anchor: --pw-sidebar;
    bottom: anchor(bottom);
    left: anchor(left);
    width: calc(var(--pw-rail-width) - 70px);
    height: 40px;
    z-index: 11;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-navigation-rail"] > div,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] {
    height: 100%;
    padding: 0;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] > div {
    flex-direction: row;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 0 6px;
    overflow: visible;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] button[aria-label="Home"] {
    display: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] > div > * {
    flex: 0 1 28px;
    min-width: 0;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] button {
    width: 100%;
    height: 28px;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] button,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="panel"] button[aria-label^="Settings"] {
    width: 28px;
    height: 28px;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"],
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="panel"] div:has(> button[aria-label^="Settings"]) {
    position: fixed;
    position-anchor: --pw-sidebar;
    bottom: anchor(bottom);
    display: flex;
    align-items: center;
    width: 28px;
    height: 40px;
    padding: 0;
    z-index: 11;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] {
    left: calc(anchor(left) + var(--pw-rail-width) - 66px);
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="panel"] div:has(> button[aria-label^="Settings"]) {
    left: calc(anchor(left) + var(--pw-rail-width) - 34px);
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] > div,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="sidebar-footer-body"] [data-sidebar="footer"] {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-body"] > div:has(> section[id^="plugin-sidebar-footer-disclosure-"]) {
    bottom: 41px;
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
  return () => { document.removeEventListener("pointerdown", closeFooterDisclosure, true); style.remove(); root?.style.removeProperty("--project-workspace-width"); root?.style.removeProperty("--pw-rail-width"); };
}
