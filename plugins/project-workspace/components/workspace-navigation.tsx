import { useState } from "react";
import { Icon } from "./ui/icon";

// BB 0.46 removed the navigation slot/hooks. Forward ordinary DOM activation
// to host-rendered controls, retaining native search, routes and shortcuts.
export function activateHostNavigation(id: string): boolean {
  const selector = id === "settings"
    ? 'nav[aria-label="Primary navigation"] > button[aria-label^="Settings"]'
    : `[data-nav-rail-item="${id}"] button`;
  const target = document.querySelector<HTMLButtonElement>(selector);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}
const destinations = [
  { id: "__bb__/search-threads", label: "Search threads", icon: "Search" },
  { id: "__bb__/extensions", label: "Plugins", icon: "Plug02" },
  { id: "__bb__/skills", label: "Skills", icon: "Zap" },
  { id: "__bb__/automations", label: "Automations", icon: "Repeat" },
] as const;
export function RailNavigation() {
  const [error, setError] = useState<string | null>(null);
  return <nav className="pw-navigation" aria-label="BB navigation">
    {destinations.map(item => <button key={item.id} className="pw-nav-item"
      title={item.label} aria-label={item.label}
      onClick={() => setError(activateHostNavigation(item.id) ? null : `${item.label} is unavailable.`)}>
      <Icon name={item.icon} className="pw-icon" />
      <span className="pw-nav-label">{item.label}</span>
    </button>)}
    {error && <p role="alert" className="pw-row-error">{error}</p>}
  </nav>;
}
