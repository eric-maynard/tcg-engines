/**
 * Deck Repository — CRUD for saved decks using bun:sqlite.
 */

import { getDb } from "./schema";

export type GameVersion = "standard" | "preview";

export interface SavedDeck {
  id: string;
  userId: string;
  name: string;
  description: string;
  format: string;
  gameVersion: GameVersion;
  legendId: string;
  championId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCardEntry {
  cardId: string;
  quantity: number;
  zone: "main" | "sideboard" | "rune" | "battlefield";
}

export interface FullDeck extends SavedDeck {
  cards: DeckCardEntry[];
}

export interface CreateDeckInput {
  userId: string;
  name: string;
  description?: string;
  format?: string;
  gameVersion?: GameVersion;
  legendId: string;
  championId: string;
  isPublic?: boolean;
  cards: DeckCardEntry[];
}

export interface UpdateDeckInput {
  name?: string;
  description?: string;
  gameVersion?: GameVersion;
  cards?: DeckCardEntry[];
}

export function createDeck(input: CreateDeckInput): FullDeck {
  const db = getDb();
  const id = crypto.randomUUID();

  db.run(
    `INSERT INTO decks (id, user_id, name, description, format, game_version, legend_id, champion_id, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.name, input.description ?? "", input.format ?? "duel",
     input.gameVersion ?? "standard", input.legendId, input.championId, input.isPublic ? 1 : 0],
  );

  const insert = db.prepare(
    `INSERT INTO deck_cards (deck_id, card_id, quantity, zone) VALUES (?, ?, ?, ?)
     ON CONFLICT(deck_id, card_id, zone) DO UPDATE SET quantity = excluded.quantity`,
  );
  for (const card of input.cards) {
    insert.run(id, card.cardId, card.quantity, card.zone);
  }

  return getDeck(id)!;
}

export function getDeck(deckId: string): FullDeck | null {
  const db = getDb();
  const row = db.query(
    `SELECT id, user_id as userId, name, description, format,
            game_version as gameVersion, legend_id as legendId, champion_id as championId,
            is_public as isPublic, created_at as createdAt, updated_at as updatedAt
     FROM decks WHERE id = ?`,
  ).get(deckId) as SavedDeck | null;

  if (!row) {return null;}

  const cards = db.query(
    `SELECT card_id as cardId, quantity, zone FROM deck_cards WHERE deck_id = ?`,
  ).all(deckId) as DeckCardEntry[];

  return { ...row, cards, isPublic: Boolean(row.isPublic) };
}

export function listDecks(userId: string): SavedDeck[] {
  const db = getDb();
  return db.query(
    `SELECT id, user_id as userId, name, description, format,
            game_version as gameVersion, legend_id as legendId, champion_id as championId,
            is_public as isPublic, created_at as createdAt, updated_at as updatedAt
     FROM decks WHERE user_id = ? ORDER BY updated_at DESC`,
  ).all(userId) as SavedDeck[];
}

export function listPublicDecks(limit = 50): SavedDeck[] {
  const db = getDb();
  return db.query(
    `SELECT id, user_id as userId, name, description, format,
            game_version as gameVersion, legend_id as legendId, champion_id as championId,
            is_public as isPublic, created_at as createdAt, updated_at as updatedAt
     FROM decks WHERE is_public = 1 ORDER BY updated_at DESC LIMIT ?`,
  ).all(limit) as SavedDeck[];
}

export function updateDeck(deckId: string, userId: string, input: UpdateDeckInput): FullDeck | null {
  const db = getDb();
  const existing = db.query("SELECT user_id FROM decks WHERE id = ?").get(deckId) as { user_id: string } | null;
  if (!existing || existing.user_id !== userId) {return null;}

  if (input.name !== undefined) {
    db.run("UPDATE decks SET name = ?, updated_at = datetime('now') WHERE id = ?", [input.name, deckId]);
  }

  if (input.gameVersion !== undefined) {
    db.run("UPDATE decks SET game_version = ?, updated_at = datetime('now') WHERE id = ?", [input.gameVersion, deckId]);
  }

  if (input.cards) {
    db.run("DELETE FROM deck_cards WHERE deck_id = ?", [deckId]);
    const insert = db.prepare("INSERT INTO deck_cards (deck_id, card_id, quantity, zone) VALUES (?, ?, ?, ?)");
    for (const card of input.cards) {
      insert.run(deckId, card.cardId, card.quantity, card.zone);
    }
  }

  return getDeck(deckId);
}

export function deleteDeck(deckId: string, userId: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM decks WHERE id = ? AND user_id = ?", [deckId, userId]);
  return result.changes > 0;
}
