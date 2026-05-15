import { useCallback, useEffect, useState } from "react";
import { type SavedDeck, listDecks } from "./lib/deck-api";
import { startGoldfish } from "./lib/goldfish-api";
import { useAuth } from "./lib/useAuth";

/**
 * GoldfishPage — Slice 6 (RiftAtlas parity).
 *
 * Solo-practice landing page. The user picks one of their saved decks (or
 * proceeds with the engine's built-in real-decks fallback) and clicks
 * "Start Goldfish" — the server mints an EngineSession with player-1 as
 * the human seat and player-2 as the auto-step bot. The play page is then
 * launched with `?mode=goldfish&as=player-1`, which flips the "Step Bot"
 * affordance into a friendlier "Step Opponent" button and replaces the
 * "Waiting for opponent…" banner with an action hint.
 *
 * Unauthenticated users can still goldfish (no deck list, but the server
 * falls back to a real-decks session) — practice should be friction-free.
 */
export function GoldfishPage({
  onStart,
}: {
  onStart: (sessionId: string, deckId: string | null) => void;
}) {
  const { user, loading } = useAuth();
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDecks([]);
      return;
    }
    void (async () => {
      try {
        const d = await listDecks();
        setDecks(d);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        setDecks([]);
      }
    })();
  }, [user]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await startGoldfish(selectedDeck ?? undefined);
      onStart(resp.sessionId, resp.deckId);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [selectedDeck, onStart]);

  if (loading) {
    return (
      <div className="goldfish-page" data-testid="goldfish-page">
        Loading…
      </div>
    );
  }

  return (
    <div className="goldfish-page" data-testid="goldfish-page">
      <header className="goldfish-header">
        <h1>Goldfish Mode</h1>
        <p className="goldfish-subtitle">
          Practice solo against an auto-stepping opponent. No matchmaking,
          no commitments.
        </p>
      </header>

      <section className="goldfish-deck-picker">
        <h2>Pick a deck</h2>
        {decks === null ? (
          <p>Loading decks…</p>
        ) : (decks.length === 0 ? (
          <p data-testid="goldfish-deck-empty">
            {user
              ? "No saved decks yet — we'll use the engine's default deck."
              : "Not signed in — we'll use the engine's default deck."}
          </p>
        ) : (
          <ul className="goldfish-deck-list" data-testid="goldfish-deck-list">
            <li>
              <label>
                <input
                  type="radio"
                  name="goldfish-deck"
                  value=""
                  checked={selectedDeck === null}
                  onChange={() => setSelectedDeck(null)}
                  data-testid="goldfish-deck-default"
                />
                Use the engine's default deck
              </label>
            </li>
            {decks.map((d) => (
              <li key={d.id}>
                <label>
                  <input
                    type="radio"
                    name="goldfish-deck"
                    value={d.id}
                    checked={selectedDeck === d.id}
                    onChange={() => setSelectedDeck(d.id)}
                    data-testid={`goldfish-deck-${d.id}`}
                  />
                  {d.name}{" "}
                  <span className="goldfish-deck-meta">
                    ({d.format} · {d.gameVersion})
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="goldfish-actions">
        <button
          type="button"
          data-testid="goldfish-start-button"
          onClick={() => void handleStart()}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start Goldfish"}
        </button>
      </section>

      {error && (
        <div className="goldfish-error" data-testid="goldfish-error">
          {error}
        </div>
      )}
    </div>
  );
}
