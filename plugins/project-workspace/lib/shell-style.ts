import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";

export const SHELL_CSS = `
[data-testid="app-layout-root"]:not(:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar])) [data-footer-item="plugin:project-workspace/settings"] {
  display: none;
}
@media (min-width: 768px) and (pointer: fine) {
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-nav-rail"] {
    display: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-sidebar-body"] > div {
    width: 100% !important;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="nav-rail-header"] {
    display: none;
  }
  /* Native window chrome already contains history and sidebar controls. */
  [data-testid="app-layout-root"][data-framed]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-top-reserve-row"] {
    display: none;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-footer-item="plugin:project-workspace/settings"] {
    order: -1;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]),
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="gap"],
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="panel"] {
    --sidebar-width: clamp(360px, var(--project-workspace-width, 480px), 48vw) !important;
  }
}
@media (min-width: 1100px) and (pointer: fine) {
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-testid="app-sidebar-body"] {
    position: relative;
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="footer"] {
    position: absolute;
    inset: auto auto 0 0;
    width: var(--project-workspace-rail-width, 200px);
    max-width: 100%;
    z-index: 2;
    background: var(--sidebar, var(--background));
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) [data-sidebar="footer"]:has([data-testid^="plugin-sidebar-footer-disclosure-"]) {
    width: max(var(--project-workspace-rail-width, 200px), 300px);
  }
  [data-testid="app-layout-root"]:has([data-side="left"][data-state="expanded"] [data-testid="app-sidebar-body"]:not([hidden]) [data-project-workspace-sidebar]) .pw-projects {
    padding-bottom: var(--project-workspace-footer-height, 48px);
  }
}
`;
export function mountShellStyle(_context: PluginContentScriptContext) {
  const style = document.createElement("style");
  style.dataset.projectWorkspaceStyle = "";
  style.textContent = SHELL_CSS;
  document.head.append(style);
  const root = document.querySelector<HTMLElement>('[data-testid="app-layout-root"]');
  // BB's native resize writes inline --sidebar-width on the panel and gap.
  // Forward those changes into
  // our scoped override; leave the host value and its persistence untouched.
  const observer = root ? new MutationObserver(records => {
    if (!root.querySelector("[data-project-workspace-sidebar]")) return;
    for (const record of records) {
      const target = record.target;
      if (!(target instanceof HTMLElement) ||
          !(target === root || target.matches('[data-sidebar="gap"], [data-sidebar="panel"]'))) continue;
      const old = document.createElement("div"); old.setAttribute("style", record.oldValue ?? "");
      const before = old.style.getPropertyValue("--sidebar-width");
      const next = target.style.getPropertyValue("--sidebar-width");
      if (next !== before && /^\d+(?:\.\d+)?px$/.test(next.trim())) {
        root.style.setProperty("--project-workspace-width", next.trim());
      }
    }
  }) : null;
  observer?.observe(root!, { attributes: true, subtree: true, attributeFilter: ["style"], attributeOldValue: true });
  const closeFooterDisclosure = (event: PointerEvent) => {
    if (!root?.querySelector("[data-project-workspace-sidebar]")) return;
    const target = event.target;
    if (!(target instanceof Element) || !root.contains(target) || target.closest('[data-sidebar="footer"]')) return;
    const section = root.querySelector<HTMLElement>('[data-sidebar="footer"] section[id^="plugin-sidebar-footer-disclosure-"]');
    if (!section) return;
    document.getElementById(section.id.replace("plugin-sidebar-footer-disclosure-", "plugin-sidebar-footer-trigger-"))?.click();
  };
  document.addEventListener("pointerdown", closeFooterDisclosure, true);
  // The CSS becomes inert as soon as the slot unmounts. Disable removes the
  // exact injected node and plugin variable without touching native settings.
  return () => { observer?.disconnect(); document.removeEventListener("pointerdown", closeFooterDisclosure, true); style.remove(); root?.style.removeProperty("--project-workspace-width"); };
}
