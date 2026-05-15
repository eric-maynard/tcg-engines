import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CardSummary,
  type DeckCardEntry,
  type FullDeck,
  autoZoneForCard,
  countInZone,
  exportDeck,
  fetchCards,
  fetchDeck,
  importDeck,
  saveDeck,
} from "./lib/deck-api";
import { useAuth } from "./lib/useAuth";

/**
 * DeckBuilderPage — Slice 1 deck-builder editor at /play/decks/:id.
 *
 * Layout (RiftAtlas-inspired, deliberately spare):
 *   - top bar: deck name (editable), Save, Export, Import, Back
 *   - left panel: card browser with text search + type filter
 *   - right panel: current deck — legend slot, battlefields, main, runes
 *
 * Click a card in the browser to add it to the deck (auto-zoned by
 * cardType). Click a card in the deck to remove one copy. Counts are
 * computed live and turn red when out of the legal duel range.
 */
const MAIN_TARGET = 40;
const RUNE_TARGET = 12;
const MAX_COPIES = 3;

interface DraftDeck {
  name: string;
  legendId: string;
  championId: string;
  cards: DeckCardEntry[];
}

function addCard(
  draft: DraftDeck,
  card: CardSummary,
): { draft: DraftDeck; error?: string } {
  const zone = autoZoneForCard(card.cardType);
  if (zone === "legend") {
    return { draft: { ...draft, legendId: card.id } };
  }
  const cards = [...draft.cards];
  const idx = cards.findIndex((c) => c.cardId === card.id && c.zone === zone);
  const existingQty = idx !== -1 ? cards[idx].quantity : 0;
  if (zone !== "rune" && existingQty >= MAX_COPIES) {
    return { draft, error: `Already at max ${MAX_COPIES} copies of ${card.name}` };
  }
  if (idx !== -1) {
    cards[idx] = { ...cards[idx], quantity: existingQty + 1 };
  } else {
    cards.push({ cardId: card.id, quantity: 1, zone });
  }
  // If this is a champion unit, set deck.championId for the engine.
  let {championId} = draft;
  if (card.cardType === "unit" && card.isChampion && !championId) {
    championId = card.id;
  }
  return { draft: { ...draft, cards, championId } };
}

function removeCard(
  draft: DraftDeck,
  zone: DeckCardEntry["zone"],
  cardId: string,
): DraftDeck {
  const cards = [...draft.cards];
  const idx = cards.findIndex((c) => c.cardId === cardId && c.zone === zone);
  if (idx === -1) {return draft;}
  const next = cards[idx].quantity - 1;
  if (next <= 0) {cards.splice(idx, 1);}
  else {cards[idx] = { ...cards[idx], quantity: next };}
  return { ...draft, cards };
}

export function DeckBuilderPage({
  deckId,
  onBack,
}: {
  deckId: string;
  onBack: () => void;
}) {
  const { user, loading } = useAuth();
  const [deck, setDeck] = useState<FullDeck | null>(null);
  const [draft, setDraft] = useState<DraftDeck | null>(null);
  const [allCards, setAllCards] = useState<CardSummary[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Load deck + card pool in parallel.
  useEffect(() => {
    if (!user) {return;}
    let cancelled = false;
    (async () => {
      try {
        const [d, cards] = await Promise.all([fetchDeck(deckId), fetchCards()]);
        if (cancelled) {return;}
        setDeck(d);
        setDraft({
          cards: d.cards,
          championId: d.championId,
          legendId: d.legendId,
          name: d.name,
        });
        setAllCards(cards);
      } catch (error) {
        if (!cancelled) {setError(error instanceof Error ? error.message : String(error));}
      }
    })();
    return () => { cancelled = true; };
  }, [deckId, user]);

  const filteredCards = useMemo(() => {
    let pool = allCards;
    if (typeFilter !== "all") {
      pool = pool.filter((c) => c.cardType === typeFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      pool = pool.filter(
        (c) => c.name.toLowerCase().includes(s) || (c.rulesText ?? "").toLowerCase().includes(s),
      );
    }
    return pool.slice(0, 300); // Cap render set; filters do the rest
  }, [allCards, search, typeFilter]);

  const cardById = useMemo(() => {
    const m = new Map<string, CardSummary>();
    for (const c of allCards) {m.set(c.id, c);}
    return m;
  }, [allCards]);

  const mainCount = draft ? countInZone(draft.cards, "main") : 0;
  const runeCount = draft ? countInZone(draft.cards, "rune") : 0;
  const bfCount = draft ? countInZone(draft.cards, "battlefield") : 0;

  const mainOk = mainCount === MAIN_TARGET;
  const runeOk = runeCount === RUNE_TARGET;
  const bfOk = bfCount >= 3;

  const onAdd = useCallback((card: CardSummary) => {
    setDraft((prev) => {
      if (!prev) {return prev;}
      const result = addCard(prev, card);
      if (result.error) {setError(result.error);}
      else {setError(null);}
      return result.draft;
    });
  }, []);

  const onRemove = useCallback((zone: DeckCardEntry["zone"], cardId: string) => {
    setDraft((prev) => (prev ? removeCard(prev, zone, cardId) : prev));
  }, []);

  const onSave = useCallback(async () => {
    if (!draft || !deck) {return;}
    setSaving(true);
    setError(null);
    try {
      const updated = await saveDeck(deck.id, {
        cards: draft.cards,
        championId: draft.championId,
        legendId: draft.legendId,
        name: draft.name,
      });
      setDeck(updated);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft, deck]);

  const onExport = useCallback(async () => {
    if (!deck) {return;}
    try {
      const text = await exportDeck(deck.id);
      // Copy to clipboard if possible; always show in a textarea overlay.
      if (navigator.clipboard) {await navigator.clipboard.writeText(text);}
      setImportText(text);
      setShowImport(true);
      setImportMsg("Copied decklist to clipboard.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [deck]);

  const onImport = useCallback(async () => {
    if (!deck) {return;}
    try {
      const result = await importDeck(deck.id, importText);
      setDeck(result.deck);
      setDraft({
        cards: result.deck.cards,
        championId: result.deck.championId,
        legendId: result.deck.legendId,
        name: result.deck.name,
      });
      setImportMsg(
        result.warnings.length === 0
          ? "Imported."
          : `Imported with ${result.warnings.length} warning(s): ${result.warnings.join("; ")}`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [deck, importText]);

  if (loading) {return <div data-testid="deck-builder-page">Loading…</div>;}
  if (!user) {
    return (
      <div data-testid="deck-builder-page">
        <p>You need to sign in to edit decks.</p>
      </div>
    );
  }
  if (!draft || !deck) {
    return (
      <div data-testid="deck-builder-page">
        {error ? <p className="deck-builder-error">{error}</p> : <p>Loading deck…</p>}
      </div>
    );
  }

  const legendCard = draft.legendId ? cardById.get(draft.legendId) : undefined;

  return (
    <div className="deck-builder-page" data-testid="deck-builder-page">
      <header className="deck-builder-header">
        <button type="button" onClick={onBack} data-testid="deck-builder-back">
          ← Decks
        </button>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="deck-builder-name"
          data-testid="deck-builder-name"
        />
        <div className="deck-builder-counts" data-testid="deck-builder-counts">
          <span className={mainOk ? "ok" : "bad"} data-testid="deck-main-count">
            Main {mainCount}/{MAIN_TARGET}
          </span>
          <span className={runeOk ? "ok" : "bad"} data-testid="deck-rune-count">
            Runes {runeCount}/{RUNE_TARGET}
          </span>
          <span className={bfOk ? "ok" : "bad"} data-testid="deck-bf-count">
            BFs {bfCount}
          </span>
        </div>
        <div className="deck-builder-actions">
          <button type="button" onClick={() => void onSave()} disabled={saving} data-testid="deck-save">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => void onExport()} data-testid="deck-export">
            Export
          </button>
          <button
            type="button"
            onClick={() => {setShowImport(!showImport); setImportText("");}}
            data-testid="deck-import-toggle"
          >
            Import
          </button>
        </div>
      </header>

      {error && (
        <div className="deck-builder-error" data-testid="deck-builder-error">
          {error}
        </div>
      )}

      {showImport && (
        <section className="deck-builder-import" data-testid="deck-builder-import">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`# Deck Name\n## Legends\n1 Trundle\n## Battlefields\n3 Altar to Unity\n## Main Deck\n3 Chemtech Enforcer\n## Rune Deck\n3 Body Rune`}
            rows={10}
            data-testid="deck-import-textarea"
          />
          <div>
            <button type="button" onClick={() => void onImport()} data-testid="deck-import-submit">
              Replace deck contents
            </button>
            {importMsg && <span className="deck-import-msg">{importMsg}</span>}
          </div>
        </section>
      )}

      <div className="deck-builder-body">
        <aside className="deck-builder-browser" data-testid="deck-browser">
          <div className="deck-browser-filters">
            <input
              type="search"
              placeholder="Search cards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="deck-browser-search"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              data-testid="deck-browser-type"
            >
              <option value="all">All types</option>
              <option value="unit">Unit</option>
              <option value="spell">Spell</option>
              <option value="gear">Gear</option>
              <option value="legend">Legend</option>
              <option value="battlefield">Battlefield</option>
              <option value="rune">Rune</option>
            </select>
          </div>
          <ul className="deck-browser-list">
            {filteredCards.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="deck-browser-card"
                  onClick={() => onAdd(c)}
                  data-testid={`browser-card-${c.id}`}
                >
                  {c.imageUrl && (
                    <img src={c.imageUrl} alt="" loading="lazy" className="deck-browser-thumb" />
                  )}
                  <span className="deck-browser-name">{c.name}</span>
                  <span className="deck-browser-type">{c.cardType}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <aside className="deck-builder-current" data-testid="deck-current">
          <section>
            <h3>Legend</h3>
            {legendCard ? (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, legendId: "" })}
                data-testid="deck-legend-slot"
              >
                {legendCard.name}
              </button>
            ) : (
              <p data-testid="deck-legend-empty">(none) — click a Legend in the browser</p>
            )}
          </section>

          <DeckZoneList
            title="Battlefields"
            zone="battlefield"
            entries={draft.cards}
            cardById={cardById}
            onRemove={onRemove}
          />
          <DeckZoneList
            title="Main Deck"
            zone="main"
            entries={draft.cards}
            cardById={cardById}
            onRemove={onRemove}
          />
          <DeckZoneList
            title="Rune Deck"
            zone="rune"
            entries={draft.cards}
            cardById={cardById}
            onRemove={onRemove}
          />
        </aside>
      </div>
    </div>
  );
}

function DeckZoneList({
  title,
  zone,
  entries,
  cardById,
  onRemove,
}: {
  title: string;
  zone: DeckCardEntry["zone"];
  entries: readonly DeckCardEntry[];
  cardById: Map<string, CardSummary>;
  onRemove: (zone: DeckCardEntry["zone"], cardId: string) => void;
}) {
  const zoneEntries = entries.filter((e) => e.zone === zone);
  return (
    <section>
      <h3>{title}</h3>
      {zoneEntries.length === 0 ? (
        <p>(empty)</p>
      ) : (
        <ul className="deck-zone-list">
          {zoneEntries.map((e) => {
            const card = cardById.get(e.cardId);
            return (
              <li key={`${zone}-${e.cardId}`}>
                <button
                  type="button"
                  onClick={() => onRemove(zone, e.cardId)}
                  data-testid={`deck-entry-${zone}-${e.cardId}`}
                >
                  {e.quantity}× {card?.name ?? e.cardId}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
