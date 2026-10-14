import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@get-bb/plugin-sdk/app";
import { Icon } from "./ui/icon";
import { SessionRow } from "./session-row";
import type { SessionItem } from "../lib/workspace-model";
import { SESSION_CARD_OPTIONS, sessionCards } from "../lib/session-cards";

type Section = { header: Extract<SessionItem, { kind: "section" }>; rows: Extract<SessionItem, { kind: "thread" }>[] };

export function WindowedSessions({ items, activeThreadId, onNavigate, toggleSection, collapsed, now }: {
  items: SessionItem[]; activeThreadId: string | null; onNavigate(): void;
  toggleSection(id: string): void; collapsed: ReadonlySet<string>; now: number;
}) {
  const scroller = useRef<HTMLDivElement>(null), prefix = useId();
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const cards = sessionCards(useSettings().values?.sessionCards), rowHeight = SESSION_CARD_OPTIONS[cards].rowHeight;
  const [instantSection, setInstantSection] = useState<string | null>(null);
  const [retainedRows, setRetainedRows] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const renderedRows = useRef<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const transitioningSections = useRef(new Set<string>());
  const nextRenderedRows = new Map<string, ReadonlySet<string>>();
  useLayoutEffect(() => { renderedRows.current = nextRenderedRows; });
  useEffect(() => {
    const node = scroller.current; if (!node) return;
    const update = () => setViewport({ top: node.scrollTop, height: node.clientHeight || 600 });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const sections = useMemo(() => {
    const groups: Section[] = [];
    for (const item of items) {
      if (item.kind === "section") groups.push({ header: item, rows: [] });
      else groups.at(-1)?.rows.push(item);
    }
    return groups;
  }, [items]);
  let sectionTop = 0;
  return <div className="pw-sessions-scroll" data-pw-session-cards={cards} ref={scroller} onScroll={event => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight || 600 })}>
    <div className="pw-window">
      {sections.map(({ header, rows }) => {
        const closed = collapsed.has(header.id), contentHeight = rows.length * rowHeight;
        const contentTop = sectionTop + header.height;
        sectionTop = contentTop + (closed ? 0 : contentHeight);
        const contentId = `${prefix}-${header.id}`;
        // Keep the content mounted while its height changes; only session rows
        // in the scroll window render, including when a section is closing.
        const visible = rows.map((item, index) => ({ item, top: index * rowHeight }))
          .filter(({ item, top }) => retainedRows.get(header.id)?.has(item.id) ||
            contentTop + top + rowHeight >= viewport.top - 500 && contentTop + top <= viewport.top + viewport.height + 500);
        nextRenderedRows.set(header.id, new Set(visible.map(({ item }) => item.id)));
        return <div key={header.id} className="pw-session-section" data-instant={instantSection === header.id || undefined}>
          <div style={{ height: header.height }}>
            <button className="pw-section-row" aria-expanded={!closed} aria-controls={contentId} onClick={event => {
              const instant = event.detail === 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
              setInstantSection(instant ? header.id : null);
              if (instant) {
                transitioningSections.current.delete(header.id);
                if (!transitioningSections.current.size) setRetainedRows(new Map());
              } else {
                transitioningSections.current.add(header.id);
                // Offsets target the final layout; retain the previous window
                // while preceding sections are still moving through that space.
                setRetainedRows(renderedRows.current);
              }
              toggleSection(header.id);
            }}><Icon name="ChevronRight" className="pw-small-icon pw-section-chevron" /><Icon name="Folder" className="pw-small-icon" /><span>{header.title}</span><span className="pw-count">{header.count}</span></button>
          </div>
          <div id={contentId} className="pw-section-content" aria-hidden={closed} inert={closed} style={{ height: closed ? 0 : contentHeight, opacity: closed ? 0 : 1 }} onTransitionEnd={event => {
            if (event.target !== event.currentTarget || event.propertyName !== "height") return;
            transitioningSections.current.delete(header.id);
            if (!transitioningSections.current.size) setRetainedRows(new Map());
          }}>
            <div className="pw-section-inner" style={{ height: contentHeight }}>
              {visible.map(({ item, top }) => <div key={item.id} className="pw-window-row" style={{ top, height: rowHeight }}>
                <SessionRow thread={item.thread} active={activeThreadId === item.thread.id} onNavigate={onNavigate} now={now} previewEnabled={!closed} />
              </div>)}
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}
