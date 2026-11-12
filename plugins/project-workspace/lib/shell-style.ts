import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";

const TITLE_BAR_HEIGHT = 40;

const CARD_RADIUS = 12;
const cardMask = (height: number) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='${height}'/><rect y='${height}' width='100%' height='100%' rx='${CARD_RADIUS}'/></svg>`;
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
  [data-testid="app-layout-root"]:has([data-project-workspace-sidebar]) [data-sidebar="gap"],
  [data-testid="app-layout-root"]:has([data-project-workspace-sidebar]) [data-sidebar="panel"] {
    transition: none;
  }
  html[style*="--bb-macos-traffic-light-center-y"]:has([data-testid="app-layout-root"][data-framed] [data-project-workspace-sidebar]) {
    --bb-window-title-bar-height: ${TITLE_BAR_HEIGHT}px !important;
    --bb-frame-card-radius: ${CARD_RADIUS}px !important;
    --bb-window-card-mask: ${cardMask(TITLE_BAR_HEIGHT)} !important;
    --bb-window-card-mask-square-left: ${cardMask(TITLE_BAR_HEIGHT)} !important;
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
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-sidebar-body"] {
    background: transparent;
    border: 0;
    clip-path: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-sidebar-body"] [data-sidebar="content"],
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-shell,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-section-row,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-session-search select {
    background: transparent;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-body"] .bg-gradient-to-b {
    display: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-projects {
    border-right-color: transparent;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-workspace {
    background: color-mix(in oklab, var(--background) 55%, var(--sidebar));
    border-radius: var(--bb-frame-card-radius);
    box-shadow: inset 0 0 0 1px var(--border-hairline, var(--border));
    overflow: hidden;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-workspace-header,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-tabs,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-session-search,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-explorer-root {
    border-color: var(--border-hairline, var(--border));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) {
    --pw-card-gap: 6px;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"] {
    margin-left: var(--pw-card-gap);
    clip-path: inset(0 round 0 0 var(--bb-frame-card-radius) var(--bb-frame-card-radius));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]::before,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="inset-edge"] {
    border-radius: var(--bb-frame-card-radius);
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]::after {
    display: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="inset-edge"] {
    border-color: var(--border-hairline, var(--border));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside)::before {
    background: transparent;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) > [data-sidebar="inset-edge"] {
    display: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) [data-panel-id="thread-detail-timeline-panel"] {
    position: relative;
    mask-image: ${cardMask(TITLE_BAR_HEIGHT)};
    clip-path: inset(0 round 0 0 var(--bb-frame-card-radius) var(--bb-frame-card-radius));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) [data-panel-id="thread-detail-timeline-panel"]::before,
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) [data-panel-id="thread-detail-timeline-panel"]::after {
    content: "";
    position: absolute;
    inset: var(--bb-window-title-bar-height) 0 0 0;
    border-radius: var(--bb-frame-card-radius);
    pointer-events: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) [data-panel-id="thread-detail-timeline-panel"]::before {
    z-index: -1;
    background: var(--background);
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) main[data-sidebar="inset"]:has([data-panel-id="thread-detail-secondary-panel"] > aside) [data-panel-id="thread-detail-timeline-panel"]::after {
    z-index: 30;
    box-shadow: inset 0 0 0 1px var(--border-hairline, var(--border));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-panel-resize-handle-id="thread-detail-secondary-panel-handle"]:not(:hover) > span:last-child {
    background: transparent;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-panel-id="thread-detail-secondary-panel"] > aside[data-surface-tone="sidebar"] {
    left: var(--pw-card-gap);
    right: 0;
    width: auto !important;
    border-left: 0;
    mask-image: ${cardMask(TITLE_BAR_HEIGHT)};
    clip-path: inset(0 round 0 0 var(--bb-frame-card-radius) var(--bb-frame-card-radius));
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-panel-id="thread-detail-secondary-panel"] > aside[data-surface-tone="sidebar"]::before {
    top: var(--bb-window-title-bar-height);
    background: color-mix(in oklab, var(--background) 55%, var(--sidebar));
    border-radius: var(--bb-frame-card-radius);
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-panel-id="thread-detail-secondary-panel"] > aside[data-surface-tone="sidebar"]::after {
    content: "";
    position: absolute;
    inset: var(--bb-window-title-bar-height) 0 0 0;
    z-index: 30;
    border-radius: var(--bb-frame-card-radius);
    box-shadow: inset 0 0 0 1px var(--border-hairline, var(--border));
    pointer-events: none;
  }
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-panel-id="thread-detail-secondary-panel"] > aside[data-surface-tone="sidebar"] > div > div:last-child {
    background: transparent;
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
  return () => { document.removeEventListener("pointerdown", closeFooterDisclosure, true); style.remove(); root?.querySelectorAll<HTMLElement>('[data-sidebar="gap"], [data-sidebar="panel"]').forEach(part => { part.style.removeProperty("--project-workspace-width"); part.style.removeProperty("--pw-rail-width"); }); };
}
