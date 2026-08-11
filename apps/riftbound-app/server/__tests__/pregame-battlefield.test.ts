/**
 * Pregame battlefield selection (rule 485.5 / 486.5, DESIGN.md §Pregame).
 *
 * Duel (Bo1): the GAME picks 1 of each player's 3 battlefields at random from
 * the seeded engine RNG — no `battlefield_select` phase, the pick is placed at
 * once, and the pregame payload names it ("Battlefield selected at random").
 * Match (Bo3) — and the sandbox's Bo3 option — keep the manual picker.
 */

import { describe, expect, test } from "bun:test";
import { buildDefaultDeck } from "../decks";
import { buildPregamePayload, createGameFromDecks, handlePregameMessage, selectBattlefield } from "../pregame";
import { getInternalSnapshot } from "../state";

const P1 = "player-1";
const P2 = "player-2";

function rowOf(session: ReturnType<typeof createGameFromDecks>, pid?: string): string[] {
  const internal = getInternalSnapshot(session.engine);
  const ids = internal.zones.battlefieldRow?.cardIds ?? [];
  return pid ? ids.filter((id) => internal.cards[id]?.owner === pid) : [...ids];
}

describe("Duel (Bo1): battlefields are selected at random by the game (485.5)", () => {
  const deck = buildDefaultDeck();

  test("no battlefield-choice phase: the pregame opens directly on the mulligan with exactly one battlefield per player already in play, drawn from that player's three", () => {
    expect(deck.battlefieldIds.length).toBe(3);
    const session = createGameFromDecks(deck, deck, "bo1-seed-a", { gameMode: "duel", sandbox: false });
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.battlefieldRandom).toBe(true);
    for (const pid of [P1, P2]) {
      const row = rowOf(session, pid);
      expect(row).toHaveLength(1);
      const defId = (row[0] as string).replace(`${pid}-bf-`, "");
      expect(deck.battlefieldIds).toContain(defId);
      // The overlay/payload names the SAME battlefield that is actually in play.
      expect(session.pregame?.battlefieldSelections[pid]).toBe(defId);
      expect(session.engine.getState().battlefields[row[0] as string]).toEqual({ contested: false, controller: null, id: row[0] as string });
    }
    expect(Object.keys(session.engine.getState().battlefields)).toHaveLength(2);
  });

  test("the pick comes from the seeded engine RNG: same seed ⇒ same battlefields, and across seeds P1 does not always get the same one", () => {
    const a = createGameFromDecks(deck, deck, "bo1-seed-repeat", { gameMode: "duel" });
    const b = createGameFromDecks(deck, deck, "bo1-seed-repeat", { gameMode: "duel" });
    expect(rowOf(a)).toEqual(rowOf(b));
    const kept = new Set<string>();
    for (let i = 0; i < 16; i++) {
      kept.add(rowOf(createGameFromDecks(deck, deck, `bo1-seed-${i}`, { gameMode: "duel" }), P1)[0] as string);
    }
    expect(kept.size).toBeGreaterThan(1);
  });

  test("the pregame payload tells the client the battlefield was selected at random and names it (for 'Battlefield selected at random: X'); a manual pick message is ignored", () => {
    const session = createGameFromDecks(deck, deck, "bo1-seed-payload", { gameMode: "duel" });
    const payload = buildPregamePayload(session, P1) as Record<string, unknown>;
    expect(payload.phase).toBe("mulligan");
    expect(payload.battlefieldRandom).toBe(true);
    expect(typeof payload.battlefieldSelected).toBe("string");
    expect(typeof payload.battlefieldSelectedName).toBe("string");
    expect((payload.battlefieldSelectedName as string).length).toBeGreaterThan(0);
    const both = payload.battlefieldRandomSelections as Record<string, { id: string; name: string }>;
    expect(Object.keys(both).sort()).toEqual([P1, P2]);
    expect(both[P1]?.id).toBe(session.pregame?.battlefieldSelections[P1]);
    // The two unselected battlefields are set aside (removed), never trashed.
    const internal = getInternalSnapshot(session.engine);
    expect(internal.zones.trash?.cardIds.filter((id) => id.includes("-bf-")) ?? []).toEqual([]);
    expect((internal.zones.setAside?.cardIds ?? []).filter((id) => id.startsWith(`${P1}-bf-`))).toHaveLength(2);
  });

  test("sandbox Duel behaves the same (random, seeded) — the sandbox's manual pick is its Bo3/Match option", () => {
    const session = createGameFromDecks(deck, deck, "bo1-sandbox", { gameMode: "duel", sandbox: true });
    expect(session.pregame?.phase).toBe("mulligan");
    expect(rowOf(session, P1)).toHaveLength(1);
    expect(rowOf(session, P2)).toHaveLength(1);
  });
});

describe("Match (Bo3) / sandbox manual pick: the choice IS offered (486.5)", () => {
  const deck = buildDefaultDeck();

  test("the pregame opens on battlefield_select with all three options, nothing placed and nothing pre-selected", () => {
    for (const sandbox of [true, false]) {
      const session = createGameFromDecks(deck, deck, "bo3-seed", { gameMode: "match", sandbox });
      expect(session.pregame?.phase).toBe("battlefield_select");
      expect(session.pregame?.battlefieldRandom).toBe(false);
      expect(session.pregame?.battlefieldSelections).toEqual({});
      expect(rowOf(session)).toEqual([]);
      const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string }[]; battlefieldSelected: unknown; battlefieldRandom?: unknown };
      expect(payload.battlefieldOptions.map((o) => o.id)).toEqual(deck.battlefieldIds);
      expect(payload.battlefieldSelected).toBeNull();
      expect(payload.battlefieldRandom).toBeUndefined();
    }
  });

  test("lock-in is final: a second pick from the same seat (incl. a raw WS frame) is refused with an error frame and changes nothing; unknown ids / foreign seats are refused too", () => {
    const session = createGameFromDecks(deck, deck, "bo3-lock", { gameMode: "match", sandbox: false });
    const [a, b] = deck.battlefieldIds as [string, string];
    expect(selectBattlefield(session, P1, "not-a-battlefield")).toEqual({ error: "Invalid battlefield choice", ok: false });
    expect(selectBattlefield(session, "player-3", a)).toEqual({ error: "Not a seated player", ok: false });
    expect(selectBattlefield(session, P1, a)).toEqual({ completed: false, ok: true });
    expect(selectBattlefield(session, P1, b)).toEqual({ error: "Battlefield already locked in", ok: false });
    expect(session.pregame?.battlefieldSelections[P1]).toBe(a);

    // Same over the socket: error frame with a code, no broadcast, selection intact.
    const sent: Record<string, unknown>[] = [];
    const ws = { data: { connId: "c", gameId: "g", playerId: P1 }, send: (raw: string) => sent.push(JSON.parse(raw)) } as never;
    session.clients.set("c", { playerId: P1, ws });
    expect(handlePregameMessage(ws, { battlefieldId: b, type: "pregame_battlefield_select" }, session, "g", P1)).toBe(true);
    expect(sent).toEqual([{ error: "Battlefield already locked in", errorCode: "BATTLEFIELD_SELECT", type: "error" }]);
    expect(session.pregame?.battlefieldSelections[P1]).toBe(a);
    expect(session.log.filter((e) => /locked in a battlefield/.test(e.text))).toHaveLength(1);

    // The other seat's (first) pick still completes the phase.
    expect(selectBattlefield(session, P2, b)).toEqual({ completed: true, ok: true });
    expect(session.pregame?.phase).toBe("mulligan");
    // And nothing is accepted once the phase has moved on.
    expect(selectBattlefield(session, P2, a).ok).toBe(false);
  });
});
