import { useCallback, useEffect, useState } from "react";
import { type SavedDeck, createDeck, deleteDeck, listDecks } from "./lib/deck-api";
import { useAuth } from "./lib/useAuth";

/**
 * DeckListPage — landing view at /play/decks/.
 *
 * Lists the signed-in user's saved decks with a "New Deck" button and per-row
 * Edit / Delete actions. Unauthenticated users see a sign-in prompt instead.
 */
export function DeckListPage({
  onOpenDeck,
  onNavigatePlay,
}: {
  onOpenDeck: (id: string) => void;
  onNavigatePlay: () => void;
}) {
  const { user, loading } = useAuth();
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDecks(await listDecks());
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (user) {void refresh();}
  }, [user, refresh]);

  if (loading) {
    return <div className="deck-list-page" data-testid="deck-list-page">Loading…</div>;
  }
  if (!user) {
    return (
      <div className="deck-list-page" data-testid="deck-list-page">
        <h1>Decks</h1>
        <p>
          You need to <a href="/api/auth/login">sign in</a> to manage decks.
        </p>
      </div>
    );
  }

  const onNew = async () => {
    setCreating(true);
    try {
      const deck = await createDeck({ name: "New Deck" });
      onOpenDeck(deck.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this deck?")) {return;}
    try {
      await deleteDeck(id);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="deck-list-page" data-testid="deck-list-page">
      <header className="deck-list-header">
        <h1>My Decks</h1>
        <nav className="deck-list-nav">
          <button type="button" onClick={onNavigatePlay} data-testid="nav-play">
            Play
          </button>
          <button
            type="button"
            onClick={onNew}
            disabled={creating}
            data-testid="deck-new-button"
          >
            + New Deck
          </button>
        </nav>
      </header>
      {error && (
        <div className="deck-list-error" data-testid="deck-list-error">
          {error}
        </div>
      )}
      {decks === null ? (
        <p>Loading decks…</p>
      ) : (decks.length === 0 ? (
        <p data-testid="deck-list-empty">No decks yet. Click <strong>+ New Deck</strong> to start.</p>
      ) : (
        <ul className="deck-list" data-testid="deck-list">
          {decks.map((d) => (
            <li key={d.id} className="deck-list-row" data-testid={`deck-row-${d.id}`}>
              <button
                type="button"
                className="deck-list-open"
                onClick={() => onOpenDeck(d.id)}
              >
                {d.name}
              </button>
              <span className="deck-list-meta">
                {d.format} · {d.gameVersion} · updated {d.updatedAt}
              </span>
              <button
                type="button"
                className="deck-list-delete"
                onClick={() => void onDelete(d.id)}
                data-testid={`deck-delete-${d.id}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
