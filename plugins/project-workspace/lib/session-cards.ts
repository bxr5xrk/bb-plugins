import { SESSION_ROW_HEIGHT } from "./workspace-model";

export const SESSION_CARDS = ["detailed", "compact", "title-only"] as const;
export type SessionCards = typeof SESSION_CARDS[number];

export const SESSION_CARD_OPTIONS: Record<SessionCards, { label: string; summary: string; rowHeight: number }> = {
  detailed: { label: "Detailed", summary: "Title, last message and status, each on its own line.", rowHeight: SESSION_ROW_HEIGHT },
  compact: { label: "Compact", summary: "Status beside the title, time beside the last message.", rowHeight: 64 },
  "title-only": { label: "Title only", summary: "Title and time. Status becomes a colored dot.", rowHeight: 40 },
};

export const sessionCardsSetting = {
  type: "select" as const,
  label: "Session cards",
  description: "How much each card in the Sessions list shows. Detailed: title, last message and status on separate lines. Compact: the same in two lines. Title only: one line with a status dot.",
  options: [...SESSION_CARDS],
  experimental_optionLabels: { detailed: "Detailed", compact: "Compact", "title-only": "Title only" },
  default: "detailed",
};

export const sessionCards = (value: unknown): SessionCards =>
  SESSION_CARDS.includes(value as SessionCards) ? value as SessionCards : "detailed";
