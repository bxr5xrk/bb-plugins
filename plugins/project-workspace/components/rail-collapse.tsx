import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const RailCollapse = ({ id, collapsed, children }: { id: string; collapsed: boolean; children: ReactNode }) => {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (content.current) setHeight(content.current.getBoundingClientRect().height);
  }, [children]);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div id={id} className="pw-section-content" aria-hidden={collapsed} inert={collapsed} style={{ height: collapsed ? 0 : height, opacity: collapsed ? 0 : 1 }}>
    <div ref={content} className="pw-rail-collapse-inner">{children}</div>
  </div>;
};
