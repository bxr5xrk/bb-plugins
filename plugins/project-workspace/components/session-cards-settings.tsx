import { useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../lib/agent-contract";
import { SESSION_CARDS, SESSION_CARD_OPTIONS, sessionCards, type SessionCards } from "../lib/session-cards";
import { errorMessage } from "../lib/workspace-model";

function SampleCard({ cards }: { cards: SessionCards }) {
  return <span className="pw-card-sample" data-pw-session-cards={cards} aria-hidden="true">
    <span className="pw-session"><span className="pw-session-link">
      <span className="pw-session-headline"><span className="pw-session-title">Fix login redirect</span><time>4m</time></span>
      <span className="pw-session-preview">Updated the callback URL and added a test.</span>
      <span className="pw-session-bottom"><span className="pw-session-status" data-status="waiting"><span className="pw-status-dot" />Needs input</span></span>
    </span></span>
  </span>;
}

export function SessionCardsSettings() {
  const rpc = useRpc<typeof rpcContract>(), settings = useSettings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = sessionCards(settings.values?.sessionCards);
  async function choose(next: SessionCards) {
    if (pending) return;
    setPending(true); setError(null);
    try { await rpc.call("setSessionCards", { sessionCards: next }); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <div className="pw-settings">
    <div className="pw-card-options">
      {SESSION_CARDS.map(cards => <button key={cards} className="pw-card-option" disabled={pending || settings.isLoading} aria-pressed={current === cards} onClick={() => void choose(cards)}>
        <SampleCard cards={cards} />
        <span className="pw-card-option-label">{SESSION_CARD_OPTIONS[cards].label}</span>
        <span className="pw-card-option-summary">{SESSION_CARD_OPTIONS[cards].summary}</span>
      </button>)}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
