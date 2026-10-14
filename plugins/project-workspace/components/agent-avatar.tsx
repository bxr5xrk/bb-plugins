import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";
import { BotAvatar, botAvatarShapes } from "bot-avatars";

type AvatarMotion = "still" | "calm" | "working" | "waiting";
const waitingPose = { yaw: -.09, pitch: -.12, roll: -.075 };

function canvasAvailable() {
  // A real no-Canvas fallback also avoids calling jsdom's unavailable renderer.
  if (typeof document === "undefined" || typeof Path2D === "undefined") return false;
  try { return !!document.createElement("canvas").getContext("2d"); } catch { return false; }
}
function useAvatarMotion(root: RefObject<HTMLSpanElement | null>, animate: boolean) {
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(true), [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)"), change = () => setReduced(query.matches);
    change(); query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!animate || !root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    observer.observe(root.current); return () => observer.disconnect();
  }, [animate, root]);
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  return reduced || !visible || hidden || !animate;
}
function avatarSeed(avatar: string) {
  // Legacy identity values remain persisted unchanged; every visual is Pebble.
  let hash = 0;
  for (const character of avatar) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 997) / 997;
}
function PebbleFallback({ color }: { color: string }) {
  const gradient = `pw-pebble-${useId().replaceAll(":", "")}`;
  return <svg className="pw-pebble-fallback" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id={gradient} cx="30%" cy="20%" r="90%"><stop stopColor={color} /><stop offset="1" stopColor={color} stopOpacity=".72" /></radialGradient></defs>
    <path d={botAvatarShapes.pebble} fill={`url(#${gradient})`} />
    <ellipse cx="40" cy="49" rx="3" ry="5" fill="#27272b" /><ellipse cx="60" cy="49" rx="3" ry="5" fill="#27272b" />
    <path d="M45 61Q50 65 55 61" fill="none" stroke="#27272b" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
/** Selected Pebble mascot. Names and actual status remain outside its motion. */
export function AgentAvatar({ avatar, color, size = 24, motion = "still", seedKey }: { avatar: string; color: string; size?: number; motion?: AvatarMotion; seedKey?: string }) {
  const root = useRef<HTMLSpanElement>(null), [canvas] = useState(canvasAvailable);
  const paused = useAvatarMotion(root, canvas && (motion === "calm" || motion === "working"));
  return <span ref={root} className="pw-agent-avatar" data-motion={motion} data-paused={paused || undefined} aria-hidden="true" style={{ width: size, height: size, color, "--agent-color": color } as CSSProperties}>
    <span className="pw-pebble-rig">
      {canvas ? <BotAvatar type="pebble" shading="smooth" color={color} size={size} face="mouth" state="default" paused={paused} pose={motion === "waiting" ? waitingPose : undefined} speed={.75} turn={.42} jumpEvery={0} jumpSpin={0} interactive={false} seed={avatarSeed(`${avatar}/${seedKey ?? avatar}`)} saturation={1.05} depth={.7} theme="auto" aria-hidden="true" style={{ transition: "none" }} /> : <PebbleFallback color={color} />}
    </span>
  </span>;
}
export const AGENT_COLORS = ["#80cbc4", "#b5a0e3", "#e8b77b", "#a4bfdf", "#b0cc89", "#d59bbd"] as const;
