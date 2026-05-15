/**
 * Typed fetch client for the deck-builder API exposed by `server.ts`.
 *
 * All endpoints require auth — cookie (`rb_token`) is sent automatically via
 * `credentials: "include"`. Callers should already have a user from `useAuth`.
 */

export type DeckZone = "main" | "sideboard" | "rune" | "battlefield";

export interface DeckCardEntry {
  cardId: string;
  quantity: number;
  zone: DeckZone;
}

export interface SavedDeck {
  id: string;
  userId: string;
  name: string;
  description: string;
  format: string;
  gameVersion: "standard" | "preview";
  legendId: string;
  championId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FullDeck extends SavedDeck {
  cards: DeckCardEntry[];
}

export interface CardSummary {
  id: string;
  name: string;
  cardType: string;
  domain?: string | readonly string[];
  energyCost?: number;
  might?: number;
  rarity?: string;
  rulesText?: string;
  setId?: string;
  tags?: readonly string[];
  imageUrl?: string;
  isChampion?: boolean;
}

const opts: RequestInit = { credentials: "include" };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function listDecks(): Promise<SavedDeck[]> {
  return asJson(await fetch("/api/decks", opts));
}

export async function fetchDeck(id: string): Promise<FullDeck> {
  return asJson(await fetch(`/api/decks/${encodeURIComponent(id)}`, opts));
}

export async function createDeck(input: {
  name: string;
  legendId?: string;
  championId?: string;
  gameVersion?: "standard" | "preview";
}): Promise<FullDeck> {
  return asJson(
    await fetch("/api/decks", {
      ...opts,
      body: JSON.stringify({ ...input, cards: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function saveDeck(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    legendId: string;
    championId: string;
    cards: DeckCardEntry[];
    gameVersion: "standard" | "preview";
  }>,
): Promise<FullDeck> {
  return asJson(
    await fetch(`/api/decks/${encodeURIComponent(id)}`, {
      ...opts,
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    }),
  );
}

export async function deleteDeck(id: string): Promise<void> {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    ...opts,
    method: "DELETE",
  });
  if (!res.ok) {throw new Error(`Delete failed: ${res.status}`);}
}

export async function exportDeck(id: string): Promise<string> {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}/export`, opts);
  if (!res.ok) {throw new Error(`Export failed: ${res.status}`);}
  return await res.text();
}

export async function importDeck(
  id: string,
  decklist: string,
): Promise<{ deck: FullDeck; warnings: string[] }> {
  return asJson(
    await fetch(`/api/decks/${encodeURIComponent(id)}/import`, {
      ...opts,
      body: JSON.stringify({ decklist }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export interface DeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mainCount: number;
  runeCount: number;
}

export async function validateDeck(id: string): Promise<DeckValidation> {
  return asJson(await fetch(`/api/decks/${encodeURIComponent(id)}/validate`, opts));
}

export async function fetchCards(filters?: {
  type?: string;
  domain?: string;
  set?: string;
  search?: string;
}): Promise<CardSummary[]> {
  const params = new URLSearchParams();
  if (filters?.type) {params.set("type", filters.type);}
  if (filters?.domain) {params.set("domain", filters.domain);}
  if (filters?.set) {params.set("set", filters.set);}
  if (filters?.search) {params.set("search", filters.search);}
  const q = params.toString();
  return asJson(await fetch(`/api/cards${q ? `?${q}` : ""}`));
}

/**
 * Decide which deck zone a freshly-clicked card should land in. Pre-game
 * deck-building zoning is opinionated:
 *   - legend → deck.legendId (single-slot)
 *   - battlefield → battlefield zone
 *   - rune → rune zone
 *   - everything else → main zone (unit/spell/gear/equipment, plus champion units)
 */
export function autoZoneForCard(cardType: string): DeckZone | "legend" {
  if (cardType === "legend") {return "legend";}
  if (cardType === "battlefield") {return "battlefield";}
  if (cardType === "rune") {return "rune";}
  return "main";
}

/** Sum of `quantity` across entries whose zone matches. */
export function countInZone(cards: readonly DeckCardEntry[], zone: DeckZone): number {
  let n = 0;
  for (const c of cards) {if (c.zone === zone) {n += c.quantity;}}
  return n;
}
