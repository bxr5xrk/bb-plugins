import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SkillLens } from "./skill-lens";

type Hosts = { list: HTMLElement; main: HTMLElement; linkClass: string };

const activeClass = "bg-sidebar-accent";

const findHosts = (): Hosts | null => {
  const link = document.querySelector<HTMLAnchorElement>('[data-testid="skills-sidebar-body"] a[href="/skills?view=library"]');
  const main = document.querySelector<HTMLElement>('[data-testid="app-layout-content-shell"] > main');
  if (!link?.parentElement || !main) return null;
  const linkClass = link.className.split(" ").filter((name) => name !== activeClass && name !== "text-sidebar-foreground").join(" ");
  return { list: link.parentElement, main, linkClass };
};

export const SkillsTab = () => {
  const [hosts, setHosts] = useState<Hosts | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = findHosts();
      setHosts((current) => (current?.list === next?.list && current?.main === next?.main ? current : next));
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(sync);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!hosts) {
      setActive(false);
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a")) setActive(false);
    };
    hosts.list.addEventListener("click", onClick);
    return () => hosts.list.removeEventListener("click", onClick);
  }, [hosts]);

  useEffect(() => {
    if (!hosts || !active) return;
    hosts.list.dataset.skillLensActive = "";
    hosts.main.dataset.skillLensActive = "";
    return () => {
      delete hosts.list.dataset.skillLensActive;
      delete hosts.main.dataset.skillLensActive;
    };
  }, [hosts, active]);

  if (!hosts) return null;
  return (
    <>
      {createPortal(
        <button
          type="button"
          className={`${hosts.linkClass} text-sidebar-foreground${active ? ` ${activeClass}` : ""}`}
          aria-current={active ? "page" : undefined}
          data-skill-lens-tab=""
          onClick={() => setActive(true)}
        >
          <span className="min-w-0 flex-1 truncate text-left">Skill lens</span>
        </button>,
        hosts.list,
      )}
      {active && createPortal(<SkillLens />, hosts.main)}
    </>
  );
};
