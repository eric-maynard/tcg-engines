import { useCallback, useState } from "react";
import { type SealedCard, openSealedPool } from "./lib/goldfish-api";

/**
 * SealedPage — Slice 6 (RiftAtlas parity).
 *
 * "Open a sealed pool" landing page. Click "Open Pool" → server generates a
 * pool of (default) 6 packs × 12 cards weighted by rarity. The grid shows
 * every card; clicking a card adds it to a "main" zone counter. When the
 * counter reaches 30 the user can save the pool+selections as a normal
 * saved deck (deferred to a future slice — for now we expose the pool and
 * the per-card counters as a local-state deck-builder primitive).
 *
 * No auth required — the pool is held in component state so a signed-out
 * user can still try sealed.
 */
export function SealedPage() {
  const [pool, setPool] = useState<readonly SealedCard[] | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await openSealedPool(6);
      setPool(resp.poolCards);
      setSeed(resp.seed);
      setPicks({});
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const togglePick = useCallback(
    (cardIdx: number, cardId: string) => {
      const key = `${cardIdx}:${cardId}`;
      setPicks((prev) => {
        const next = { ...prev };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = 1;
        }
        return next;
      });
    },
    [],
  );

  const pickedCount = Object.values(picks).reduce((a, b) => a + b, 0);
  const target = 30;

  return (
    <div className="sealed-page" data-testid="sealed-page">
      <header className="sealed-header">
        <h1>Sealed</h1>
        <p className="sealed-subtitle">
          Open a pool of 6 booster packs and build a 30-card deck from what
          you crack open.
        </p>
      </header>

      <section className="sealed-actions">
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={busy}
          data-testid="sealed-open-button"
        >
          {busy ? "Opening pool…" : (pool ? "Open New Pool" : "Open Pool")}
        </button>
        {pool && (
          <span className="sealed-counter" data-testid="sealed-counter">
            {pickedCount} / {target} picked
          </span>
        )}
        {seed && (
          <span
            className="sealed-seed"
            data-testid="sealed-seed"
            title={`seed: ${seed}`}
          >
            seed: {seed.slice(0, 12)}…
          </span>
        )}
      </section>

      {error && (
        <div className="sealed-error" data-testid="sealed-error">
          {error}
        </div>
      )}

      {pool && (
        <section
          className="sealed-pool-grid"
          data-testid="sealed-pool-grid"
          aria-label="Sealed card pool"
        >
          {pool.map((c, idx) => {
            const key = `${idx}:${c.cardId}`;
            const picked = Boolean(picks[key]);
            return (
              <button
                type="button"
                key={key}
                className={`sealed-card${picked ? " sealed-card-picked" : ""}`}
                data-testid={`sealed-card-${idx}`}
                data-card-id={c.cardId}
                data-picked={picked ? "true" : "false"}
                onClick={() => togglePick(idx, c.cardId)}
                aria-pressed={picked}
              >
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="sealed-card-img"
                  />
                ) : (
                  <span className="sealed-card-name">{c.name}</span>
                )}
                <span
                  className={`sealed-card-rarity sealed-rarity-${c.rarity ?? "common"}`}
                >
                  {c.rarity ?? "common"}
                </span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
