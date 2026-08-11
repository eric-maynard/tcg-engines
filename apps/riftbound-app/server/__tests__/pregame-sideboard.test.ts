/**
 * Pregame sideboarding (assumed OP policy — see the "Sideboarding" note at the
 * top of server/pregame.ts): a `sideboard` phase sits between the reveal
 * (legends / champions / this game's battlefields) and the mulligan, only when
 * some seat registered a sideboard AND the swap window is open — game 2+ of a
 * match, or the explicit `sideboardBeforeGame1` opt-in; never before game 1 by
 * default. Swaps are 1-for-1, private, validated, and on both locks the main
 * decks are rebuilt + shuffled and hands drawn. The mechanics tests below opt
 * into `sideboardBeforeGame1` (or `gameNumber: 2`) to reach the phase.
 */

import { describe, expect, test } from "bun:test";
import { registry } from "../cards";
import { buildDefaultDeck } from "../decks";
import {
  advancePastReveal,
  buildPregamePayload,
  createGameFromDecks,
  handlePregameMessage,
  lockSideboard,
  sideboardWindowOpen,
  swapSideboard,
} from "../pregame";
import { buildGameSnapshot } from "../snapshot";
import { type DeckConfig, type GameSession, getInternalSnapshot } from "../state";

const P1 = "player-1";
const P2 = "player-2";

// Fury/Chaos starter: 40 singleton-ish main deck + Jinx champion. Sideboard
// fixtures are in-identity spells that the starter does not run.
const BASE = buildDefaultDeck();
const X = BASE.mainDeckCardIds[0] as string; // 1 copy in the main deck
const SPELLS = ["ogn-005-298", "ogn-008-298", "ogn-014-298", "ogn-022-298"].filter((id) => !BASE.mainDeckCardIds.includes(id));

function withSideboard(side: string[]): DeckConfig {
  return { ...BASE, sideboardCardIds: side };
}

interface SbPayload {
  phase: string;
  you: { main: { id: string; defId: string; name: string }[]; side: { id: string; defId: string }[]; locked: boolean; mainSize: number; sideSize: number; swaps: { ins: string[]; outs: string[] } } | null;
  opponent: { legend: { id: string; name: string } | null; champion: { id: string; name: string } | null; battlefields: { id: string; name: string }[]; status: string };
}

function handOf(session: GameSession, pid: string): string[] {
  const internal = getInternalSnapshot(session.engine);
  return (internal.zones.hand?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === pid);
}
function deckOf(session: GameSession, pid: string): string[] {
  const internal = getInternalSnapshot(session.engine);
  return (internal.zones.mainDeck?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === pid);
}

describe("phase gating", () => {
  test("no sideboards anywhere ⇒ no sideboard phase, hands already drawn, payload has no sideboard section (zero behaviour change)", () => {
    const s = createGameFromDecks(BASE, BASE, "sb-none", { gameMode: "duel" });
    expect(s.pregame?.phase).toBe("mulligan");
    expect(s.pregame?.sideboard).toBeUndefined();
    expect(handOf(s, P1)).toHaveLength(4);
    expect(handOf(s, P2)).toHaveLength(4);
    const payload = buildPregamePayload(s, P1) as Record<string, unknown>;
    expect(payload.you).toBeUndefined();
    expect(payload.opponent).toBeUndefined();
  });

  test("Bo3 game 1 with sideboards registered on BOTH seats ⇒ no sideboarding before game 1: battlefield_select → straight to mulligan with 4-card hands; sideboards ride along in session.decks for game 2", () => {
    expect(SPELLS.length).toBe(4);
    for (const sandbox of [false, true]) {
      const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), `sb-bo3-g1-${sandbox}`, { gameMode: "match", sandbox });
      expect(s.gameNumber).toBe(1);
      expect(s.pregame?.phase).toBe("battlefield_select");
      expect(s.pregame?.sideboard).toBeUndefined();
      // Hands are drawn at creation (no phase to wait for).
      expect(handOf(s, P1)).toHaveLength(4);
      expect(handOf(s, P2)).toHaveLength(4);
      s.pregame!.battlefieldSelections[P1] = BASE.battlefieldIds[0] as string;
      s.pregame!.battlefieldSelections[P2] = BASE.battlefieldIds[1] as string;
      advancePastReveal(s);
      expect(s.pregame?.phase).toBe("mulligan");
      const payload = buildPregamePayload(s, P1) as Record<string, unknown>;
      expect(payload.phase).toBe("mulligan");
      expect(payload.you).toBeUndefined();
      expect(swapSideboard(s, P1, "a", "b")).toEqual({ error: "Not in the sideboard phase", ok: false });
      expect(lockSideboard(s, P1).ok).toBe(false);
      // Nothing leaked into the engine; the registered sideboard is kept for the next game.
      expect(Object.keys(getInternalSnapshot(s.engine).cards).some((id) => id.includes("-side-"))).toBe(false);
      expect(s.decks?.[P1]?.sideboardCardIds).toEqual(SPELLS);
      expect(s.decks?.[P2]?.sideboardCardIds).toEqual(SPELLS.slice(0, 2));
      expect(s.postSideboardDecks).toBeUndefined();
    }
  });

  test("Bo3 game 1 over the WebSocket: the second battlefield pick lands both seats on the mulligan frame (never a 'sideboard' frame)", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), "sb-bo3-g1-ws", { gameMode: "match" });
    const sent: Record<string, Record<string, unknown>[]> = { a: [], b: [] };
    const fakeWs = (key: "a" | "b", playerId: string) =>
      ({ data: { connId: key, gameId: "g", playerId }, send: (raw: string) => sent[key]!.push(JSON.parse(raw)) }) as never;
    const wsA = fakeWs("a", P1);
    const wsB = fakeWs("b", P2);
    s.clients.set("a", { playerId: P1, ws: wsA });
    s.clients.set("b", { playerId: P2, ws: wsB });
    expect(handlePregameMessage(wsA, { battlefieldId: BASE.battlefieldIds[0], type: "pregame_battlefield_select" }, s, "g", P1)).toBe(true);
    expect(handlePregameMessage(wsB, { battlefieldId: BASE.battlefieldIds[2], type: "pregame_battlefield_select" }, s, "g", P2)).toBe(true);
    for (const key of ["a", "b"] as const) {
      expect(sent[key].some((f) => (f.pregame as { phase?: string } | null)?.phase === "sideboard")).toBe(false);
      expect((sent[key].at(-1)!.pregame as { phase: string }).phase).toBe("mulligan");
    }
    // A stray sideboard message before game 1 is refused, not acted on.
    expect(handlePregameMessage(wsA, { type: "sideboard_lock" }, s, "g", P1)).toBe(true);
    expect(sent.a.at(-1)!.type).toBe("error");
  });

  test("Bo1 Duel / goldfish game 1 with sideboards ⇒ mulligan directly by default (no pre-game-1 window)", () => {
    for (const sandbox of [false, true]) {
      const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 3)), `sb-duel-g1-${sandbox}`, { gameMode: "duel", sandbox });
      expect(s.pregame?.phase).toBe("mulligan");
      expect(s.pregame?.sideboard).toBeUndefined();
      expect(handOf(s, P1)).toHaveLength(4);
      expect(handOf(s, P2)).toHaveLength(4);
    }
  });

  test("the window opens BETWEEN games: gameNumber 2 (and 3) of a match arms the phase after battlefield_select; sideboardWindowOpen is the single gate", () => {
    expect(sideboardWindowOpen()).toBe(false);
    expect(sideboardWindowOpen({ gameNumber: 1 })).toBe(false);
    expect(sideboardWindowOpen({ gameNumber: 0 })).toBe(false);
    expect(sideboardWindowOpen({ gameNumber: 2 })).toBe(true);
    expect(sideboardWindowOpen({ gameNumber: 3 })).toBe(true);
    expect(sideboardWindowOpen({ gameNumber: 1, sideboardBeforeGame1: true })).toBe(true);
    for (const gameNumber of [2, 3]) {
      const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), `sb-bo3-g${gameNumber}`, { gameMode: "match", gameNumber });
      expect(s.gameNumber).toBe(gameNumber);
      expect(s.pregame?.phase).toBe("battlefield_select");
      expect(handOf(s, P1)).toHaveLength(0);
      s.pregame!.battlefieldSelections[P1] = BASE.battlefieldIds[0] as string;
      s.pregame!.battlefieldSelections[P2] = BASE.battlefieldIds[1] as string;
      advancePastReveal(s);
      expect(s.pregame?.phase).toBe("sideboard");
      expect((buildPregamePayload(s, P1) as unknown as SbPayload).you?.side).toHaveLength(4);
    }
    // Game 2 with no sideboards anywhere still has nothing to do.
    const bare = createGameFromDecks(BASE, BASE, "sb-bo3-g2-bare", { gameMode: "match", gameNumber: 2 });
    expect(bare.pregame?.sideboard).toBeUndefined();
    expect(handOf(bare, P1)).toHaveLength(4);
  });

  test("one seat with a sideboard (Duel, sideboardBeforeGame1 opt-in) ⇒ phase 'sideboard' right after the random battlefields, no hands yet; the seat with nothing to swap is auto-locked", () => {
    expect(SPELLS.length).toBe(4);
    const s = createGameFromDecks(withSideboard(SPELLS), BASE, "sb-duel", { gameMode: "duel", sandbox: false, sideboardBeforeGame1: true });
    expect(s.pregame?.phase).toBe("sideboard");
    expect(handOf(s, P1)).toHaveLength(0);
    expect(handOf(s, P2)).toHaveLength(0);
    expect(s.pregame?.sideboard?.[P1]?.locked).toBe(false);
    expect(s.pregame?.sideboard?.[P2]?.locked).toBe(true);
    // Sideboard cards are NOT engine cards.
    const internal = getInternalSnapshot(s.engine);
    expect(Object.keys(internal.cards).some((id) => id.includes("-side-"))).toBe(false);

    const p1 = buildPregamePayload(s, P1) as unknown as SbPayload;
    expect(p1.phase).toBe("sideboard");
    expect(p1.you?.main).toHaveLength(40);
    expect(p1.you?.side.map((c) => c.defId)).toEqual(SPELLS);
    expect(p1.you?.side[0]?.id).toBe(`${P1}-side-0-${SPELLS[0]}`);
    expect(p1.you?.locked).toBe(false);
    // The information sideboarding is based on: opponent legend / champion / battlefield.
    expect(p1.opponent.legend?.id).toBe(BASE.legendId as string);
    expect(p1.opponent.champion?.name).toBe(registry.get(BASE.championId as string)?.name as string);
    expect(p1.opponent.battlefields).toHaveLength(1);
    expect(p1.opponent.battlefields[0]?.id).toBe(s.pregame?.battlefieldSelections[P2] as string);
    expect(p1.opponent.status).toBe("locked");
  });

  test("Match (Bo3) game 2: battlefield_select first; once both battlefields are chosen the reveal advances into 'sideboard' (not mulligan)", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), "sb-match", { gameMode: "match", gameNumber: 2 });
    expect(s.pregame?.phase).toBe("battlefield_select");
    s.pregame!.battlefieldSelections[P1] = BASE.battlefieldIds[0] as string;
    s.pregame!.battlefieldSelections[P2] = BASE.battlefieldIds[1] as string;
    advancePastReveal(s);
    expect(s.pregame?.phase).toBe("sideboard");
    const p2 = buildPregamePayload(s, P2) as unknown as SbPayload;
    expect(p2.opponent.battlefields[0]?.id).toBe(BASE.battlefieldIds[0] as string);
    expect(p2.opponent.status).toBe("choosing");
    expect(p2.you?.side).toHaveLength(2);
  });
});

describe("swap validation", () => {
  function twoSided() {
    return createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 3)), "sb-swap", { gameMode: "duel", sideboardBeforeGame1: true });
  }

  test("a legal swap moves the cards across (in place), sizes unchanged; swapping back undoes it", () => {
    const s = twoSided();
    const seat = s.pregame!.sideboard![P1]!;
    const out = seat.main[5]!.id;
    const inn = seat.side[1]!.id;
    expect(swapSideboard(s, P1, out, inn)).toEqual({ ok: true });
    expect(seat.main[5]!.id).toBe(inn);
    expect(seat.side[1]!.id).toBe(out);
    expect(seat.main).toHaveLength(40);
    expect(seat.side).toHaveLength(4);
    const p = buildPregamePayload(s, P1) as unknown as SbPayload;
    expect(p.you?.swaps).toEqual({ ins: [inn], outs: [out] });
    // Undo = swap the pair back.
    expect(swapSideboard(s, P1, inn, out)).toEqual({ ok: true });
    expect((buildPregamePayload(s, P1) as unknown as SbPayload).you?.swaps).toEqual({ ins: [], outs: [] });
  });

  test("rejected: another seat's cards (wrong owner), a card not in the named zone, a non-1-for-1 request, unknown ids, after lock, outside the phase", () => {
    const s = twoSided();
    const p1 = s.pregame!.sideboard![P1]!;
    const p2 = s.pregame!.sideboard![P2]!;
    // Wrong owner: P2 names P1's instances.
    expect(swapSideboard(s, P2, p1.main[0]!.id, p1.side[0]!.id)).toEqual({ error: "That card is not in your main deck", ok: false });
    expect(swapSideboard(s, P2, p2.main[0]!.id, p1.side[0]!.id)).toEqual({ error: "That card is not in your sideboard", ok: false });
    // Not in zone: a sideboard card named as the outgoing main card, and vice versa.
    expect(swapSideboard(s, P1, p1.side[0]!.id, p1.side[1]!.id).ok).toBe(false);
    expect(swapSideboard(s, P1, p1.main[0]!.id, p1.main[1]!.id).ok).toBe(false);
    // Size overflow attempt: adding without removing (or removing without adding) is not a swap.
    expect(swapSideboard(s, P1, undefined, p1.side[0]!.id).ok).toBe(false);
    expect(swapSideboard(s, P1, p1.main[0]!.id, "").ok).toBe(false);
    expect(swapSideboard(s, P1, "player-1-main-999-nope", p1.side[0]!.id).ok).toBe(false);
    // Nothing changed.
    expect(p1.main).toHaveLength(40);
    expect(p1.side.map((c) => c.defId)).toEqual(SPELLS);
    // After lock.
    expect(lockSideboard(s, P2).ok).toBe(true);
    expect(swapSideboard(s, P2, p2.main[0]!.id, p2.side[0]!.id)).toEqual({ error: "Sideboard already locked in", ok: false });
    // Outside the phase.
    const plain = createGameFromDecks(BASE, BASE, "sb-plain", { gameMode: "duel" });
    expect(swapSideboard(plain, P1, "a", "b")).toEqual({ error: "Not in the sideboard phase", ok: false });
    expect(lockSideboard(plain, P1).ok).toBe(false);
  });

  test("copy limit (rule 103.2.b) is advisory: a deck registering 4× a name across main + sideboard still seats (flagged in the shared log, no card names), and swapping the 4th copy into the main deck is allowed", () => {
    // Main deck holds 1× X; sideboard brings three more X plus a spell.
    const s = createGameFromDecks(withSideboard([X, X, X, SPELLS[0] as string]), BASE, "sb-copies", { gameMode: "duel", sideboardBeforeGame1: true });
    const note = s.log.find((e) => e.text.includes("not tournament-legal"));
    expect(note?.text).toContain("Player 1");
    expect(note?.text).toContain("TOO_MANY_COPIES");
    expect(note?.text).not.toContain(registry.get(X)?.name as string);
    expect(s.log.some((e) => e.text.includes("Player 2") && e.text.includes("not tournament-legal"))).toBe(false);
    const seat = s.pregame!.sideboard![P1]!;
    const nonX = seat.main.filter((c) => c.defId !== X).map((c) => c.id);
    const xs = seat.side.filter((c) => c.defId === X).map((c) => c.id);
    expect(swapSideboard(s, P1, nonX[0], xs[0]).ok).toBe(true); // 2× X
    expect(swapSideboard(s, P1, nonX[1], xs[1]).ok).toBe(true); // 3× X
    expect(swapSideboard(s, P1, nonX[2], xs[2]).ok).toBe(true); // 4× X in the main deck — allowed
    expect(seat.main).toHaveLength(40);
    expect(seat.side).toHaveLength(4);
  });
});

describe("lock-in and deck rebuild", () => {
  test("both locked ⇒ main decks rebuilt from the post-swap lists (swapped-in card in the engine deck/hand, swapped-out card gone), reshuffled with the engine RNG, 4-card hands drawn, phase → mulligan, post-swap configs recorded", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 3)), "sb-lock", { gameMode: "duel", sideboardBeforeGame1: true });
    const seat = s.pregame!.sideboard![P1]!;
    const out = seat.main[0]!;
    const inn = seat.side[2]!;
    expect(swapSideboard(s, P1, out.id, inn.id).ok).toBe(true);
    const orderBefore = deckOf(s, P1).filter((id) => id !== out.id);

    expect(lockSideboard(s, P1)).toEqual({ ok: true });
    expect(s.pregame?.phase).toBe("sideboard"); // Still waiting for P2 (has a sideboard, not sandbox)
    expect((buildPregamePayload(s, P2) as unknown as SbPayload).opponent.status).toBe("locked");
    expect(handOf(s, P1)).toHaveLength(0);
    const done = lockSideboard(s, P2);
    expect(done).toEqual({ completed: true, ok: true });
    expect(s.pregame?.phase).toBe("mulligan");

    const internal = getInternalSnapshot(s.engine);
    const p1Cards = [...deckOf(s, P1), ...handOf(s, P1)];
    expect(handOf(s, P1)).toHaveLength(4);
    expect(handOf(s, P2)).toHaveLength(4);
    expect(p1Cards).toHaveLength(40);
    expect(p1Cards).toContain(inn.id);
    expect(p1Cards).not.toContain(out.id);
    expect(internal.cards[out.id]).toBeUndefined();
    expect(internal.cards[inn.id]?.zone === "mainDeck" || internal.cards[inn.id]?.zone === "hand").toBe(true);
    // No sideboard card that stayed in the sideboard leaked into the engine.
    for (const c of seat.side) {expect(internal.cards[c.id]).toBeUndefined();}
    for (const c of s.pregame!.sideboard![P2]!.side) {expect(internal.cards[c.id]).toBeUndefined();}
    // Reshuffled: the surviving cards are not in their pre-lock order.
    const orderAfter = [...handOf(s, P1), ...deckOf(s, P1)].filter((id) => id !== inn.id);
    expect(orderAfter.toSorted()).toEqual(orderBefore.toSorted());
    expect(orderAfter).not.toEqual(orderBefore);
    // Bo3 carry-over.
    expect(s.postSideboardDecks?.[P1]?.mainDeckCardIds).toContain(inn.defId);
    expect(s.postSideboardDecks?.[P1]?.sideboardCardIds).toContain(out.defId);
    expect(s.postSideboardDecks?.[P1]?.sideboardCardIds).toHaveLength(4);
    expect(s.postSideboardDecks?.[P2]?.sideboardCardIds).toEqual(SPELLS.slice(0, 3));
    // The mulligan then works off the freshly drawn hand.
    expect(s.engine.executeMove("mulligan", { params: { keepCards: [handOf(s, s.pregame!.firstPlayer)[0]], playerId: s.pregame!.firstPlayer }, playerId: s.pregame!.firstPlayer as never }).success).toBe(true);
  });

  test("goldfish / sandbox: the opponent seat auto-locks, so the human's lock completes the phase at once", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), "sb-goldfish", { gameMode: "duel", sandbox: true, sideboardBeforeGame1: true });
    expect(s.pregame?.phase).toBe("sideboard");
    expect(s.pregame?.sideboard?.[P2]?.locked).toBe(true);
    expect((buildPregamePayload(s, P1) as unknown as SbPayload).opponent.status).toBe("locked");
    expect(lockSideboard(s, P1)).toEqual({ completed: true, ok: true });
    expect(s.pregame?.phase).toBe("mulligan");
    expect(handOf(s, P1)).toHaveLength(4);
    expect(handOf(s, P2)).toHaveLength(4);
  });

  test("sandbox where only the auto-locked opponent seat has a sideboard ⇒ nobody has a decision: skip straight to the mulligan with hands drawn", () => {
    const s = createGameFromDecks(BASE, withSideboard(SPELLS), "sb-ai-only", { gameMode: "duel", sandbox: true, sideboardBeforeGame1: true });
    expect(s.pregame?.phase).toBe("mulligan");
    expect(handOf(s, P1)).toHaveLength(4);
    expect(handOf(s, P2)).toHaveLength(4);
  });
});

describe("privacy", () => {
  test("the opponent's pregame payload and game snapshot never contain my main-deck or sideboard lists (ids or the sideboard card names)", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 1)), "sb-privacy", { gameMode: "duel", sandbox: false, sideboardBeforeGame1: true });
    const mine = s.pregame!.sideboard![P1]!;
    swapSideboard(s, P1, mine.main[3]!.id, mine.side[3]!.id);
    const oppPayload = JSON.stringify(buildPregamePayload(s, P2));
    const oppSnapshot = JSON.stringify(buildGameSnapshot(s, P2));
    for (const blob of [oppPayload, oppSnapshot]) {
      expect(blob).not.toContain(`${P1}-main-`);
      expect(blob).not.toContain(`${P1}-side-`);
      // SPELLS[1..3] are only in P1's sideboard (P2's sideboard is SPELLS[0]).
      for (const defId of SPELLS.slice(1)) {
        expect(blob).not.toContain(defId);
        expect(blob).not.toContain(registry.get(defId)?.name as string);
      }
    }
    // The opponent learns only choosing|locked — no counts.
    const opp = (buildPregamePayload(s, P2) as unknown as SbPayload).opponent as Record<string, unknown>;
    expect(Object.keys(opp).sort()).toEqual(["battlefields", "champion", "id", "legend", "name", "status"]);
    // And my own payload does carry my lists.
    expect(JSON.stringify(buildPregamePayload(s, P1))).toContain(`${P1}-side-3-`);
  });

  test("over the WebSocket: a swap is acknowledged only to the acting seat; a bad swap gets an error frame; reconnect (fresh payload) restores the in-progress state", () => {
    const s = createGameFromDecks(withSideboard(SPELLS), withSideboard(SPELLS.slice(0, 2)), "sb-ws", { gameMode: "duel", sideboardBeforeGame1: true });
    const sent: Record<string, Record<string, unknown>[]> = { a: [], b: [] };
    const fakeWs = (key: "a" | "b", playerId: string) =>
      ({ data: { connId: key, gameId: "g", playerId }, send: (raw: string) => sent[key]!.push(JSON.parse(raw)) }) as never;
    const wsA = fakeWs("a", P1);
    const wsB = fakeWs("b", P2);
    s.clients.set("a", { playerId: P1, ws: wsA });
    s.clients.set("b", { playerId: P2, ws: wsB });
    const seat = s.pregame!.sideboard![P1]!;

    expect(handlePregameMessage(wsA, { in: seat.side[0]!.id, out: seat.main[7]!.id, type: "sideboard_swap" }, s, "g", P1)).toBe(true);
    expect(sent.a).toHaveLength(1);
    expect(sent.a[0]!.type).toBe("sync");
    expect(((sent.a[0]!.pregame as SbPayload).you?.swaps.ins ?? []).length).toBe(1);
    expect(sent.b).toHaveLength(0); // Opponent sees no traffic for my swaps

    expect(handlePregameMessage(wsA, { in: "nope", out: seat.main[1]!.id, type: "sideboard_swap" }, s, "g", P1)).toBe(true);
    expect(sent.a.at(-1)!.type).toBe("error");

    // Reconnect mid-phase: what gameWsOpen sends is buildPregamePayload — it carries the swap made so far.
    const again = buildPregamePayload(s, P1) as unknown as SbPayload;
    expect(again.phase).toBe("sideboard");
    expect(again.you?.swaps.ins).toEqual([`${P1}-side-0-${SPELLS[0]}`]);
    expect(again.you?.locked).toBe(false);

    // Lock from both over the socket → everyone gets the mulligan frame.
    expect(handlePregameMessage(wsA, { type: "sideboard_lock" }, s, "g", P1)).toBe(true);
    expect((sent.b.at(-1)!.pregame as SbPayload).opponent.status).toBe("locked");
    expect(handlePregameMessage(wsB, { type: "sideboard_lock" }, s, "g", P2)).toBe(true);
    expect((sent.a.at(-1)!.pregame as { phase: string }).phase).toBe("mulligan");
    expect((sent.b.at(-1)!.pregame as { phase: string }).phase).toBe("mulligan");
    // Game moves stay blocked during pregame.
    expect(handlePregameMessage(wsA, { type: "move" }, s, "g", P1)).toBe(true);
  });
});
