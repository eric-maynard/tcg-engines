/**
 * The practice opponent's deck (Goldfish / Claude seat in sandbox lobbies):
 * the `opponent.deck` field of a create request, the ownership rule shared
 * with the lobby's `select_deck`, and resolution to a deck id at game start.
 *
 *   opponent.deck = { mode: "default" }              starter deck (legacy behaviour)
 *                 | { mode: "mirror" }               whatever deck the host picks
 *                 | { mode: "random-mine" }          one of the requesting user's legal saved decks
 *                 | { mode: "deck", deckId }         a saved deck the user owns, or a public one
 *
 * Ownership is decided server-side from the authenticated user id — a deck id
 * in the body is a parameter to validate, never a grant.
 */

import { getDeck, listDecks } from "../src/db/deck-repo";
import type { FullDeck } from "../src/db/deck-repo";
import { savedDeckToDeckConfig } from "./decks";
import type { Lobby } from "./state";

export type OpponentDeckMode = "default" | "mirror" | "random-mine" | "deck";

/** Validated spec stored on the lobby. `deckId` is set for "deck" and (already drawn) "random-mine". */
export interface OpponentDeckSpec {
  mode: OpponentDeckMode;
  deckId?: string;
  /** Display name of the resolved saved deck (for logs / the lobby card). */
  deckName?: string;
}

export type ParsedOpponentDeck =
  | { ok: true; spec: OpponentDeckSpec }
  | { ok: false; status: number; error: string };

const MODES: ReadonlySet<string> = new Set(["default", "mirror", "random-mine", "deck"]);

/**
 * The saved deck `deckId` if `userId` may play it: their own deck, or a
 * public one. Null for missing AND for another user's private deck (callers
 * answer both with the same "not found" so existence does not leak).
 */
export function deckAccessibleTo(deckId: string, userId: string | null | undefined): FullDeck | null {
  let deck: FullDeck | null = null;
  try {
    deck = getDeck(deckId);
  } catch {
    return null;
  }
  if (!deck) {return null;}
  if (deck.isPublic) {return deck;}
  return userId && deck.userId === userId ? deck : null;
}

/** True when a lobby seat may select `deckId` ("default" is always allowed). */
export function maySelectDeck(deckId: string, userId: string | null | undefined): boolean {
  return deckId === "default" || deckAccessibleTo(deckId, userId) !== null;
}

function legalityError(deck: FullDeck): string {
  return `"${deck.name}" is not a legal deck (needs a legend, a chosen champion, a 40-card main deck within the copy limit, and runes)`;
}

/** Validate the `opponent.deck` field of a create request. Absent → the starter deck. */
export function parseOpponentDeck(raw: unknown, userId: string | null | undefined): ParsedOpponentDeck {
  if (raw === undefined || raw === null) {
    return { ok: true, spec: { mode: "default" } };
  }
  if (typeof raw !== "object") {
    return { error: "opponent.deck must be an object", ok: false, status: 400 };
  }
  const o = raw as { mode?: unknown; deckId?: unknown };
  const mode = o.mode === undefined ? "default" : o.mode;
  if (typeof mode !== "string" || !MODES.has(mode)) {
    return { error: "opponent.deck.mode must be one of: default, mirror, random-mine, deck", ok: false, status: 400 };
  }
  if (mode === "default" || mode === "mirror") {
    return { ok: true, spec: { mode } };
  }
  if (mode === "random-mine") {
    if (!userId) {
      return { error: "Log in to have the opponent use one of your decks", ok: false, status: 401 };
    }
    const legal = listDecks(userId)
      .map((d) => getDeck(d.id))
      .filter((d): d is FullDeck => d !== null && savedDeckToDeckConfig(d) !== null);
    if (legal.length === 0) {
      return { error: "You have no legal saved decks for the opponent to pick from", ok: false, status: 400 };
    }
    const pick = legal[crypto.getRandomValues(new Uint32Array(1))[0]! % legal.length]!;
    return { ok: true, spec: { deckId: pick.id, deckName: pick.name, mode } };
  }
  // mode === "deck"
  if (typeof o.deckId !== "string" || !o.deckId) {
    return { error: "opponent.deck.deckId is required for mode 'deck'", ok: false, status: 400 };
  }
  if (o.deckId === "default") {
    return { ok: true, spec: { mode: "default" } };
  }
  const deck = deckAccessibleTo(o.deckId, userId);
  if (!deck) {
    return { error: "Opponent deck not found", ok: false, status: 404 };
  }
  if (!savedDeckToDeckConfig(deck)) {
    return { error: `Opponent deck ${legalityError(deck)}`, ok: false, status: 400 };
  }
  return { ok: true, spec: { deckId: deck.id, deckName: deck.name, mode } };
}

/**
 * The deck id the auto-joined practice seat should load, given the lobby's
 * spec and the host's current choice ("mirror" of an unset / starter host
 * deck is the starter deck).
 */
export function resolveOpponentDeckId(spec: OpponentDeckSpec | undefined, hostDeckId: string | null): string {
  switch (spec?.mode) {
    case "mirror": {
      return hostDeckId || "default";
    }
    case "deck":
    case "random-mine": {
      return spec.deckId ?? "default";
    }
    default: {
      return "default";
    }
  }
}

/** Keep the practice seat's deckId in step with the spec + host deck (call after either changes). */
export function syncOpponentSeatDeck(lobby: Lobby): void {
  // The practice seat never connects (connId stays ""); a human guest who joined before a
  // Single Player toggle keeps their own pick.
  if (!lobby.sandbox || !lobby.guest || lobby.guest.connId !== "" || lobby.guest.ws !== null) {return;}
  lobby.guest.deckId = resolveOpponentDeckId(lobby.opponentDeck, lobby.host.deckId);
  lobby.guest.ready = true;
}
