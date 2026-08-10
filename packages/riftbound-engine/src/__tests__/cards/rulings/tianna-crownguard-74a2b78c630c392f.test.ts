/**
 * Ruling 74a2b78c630c392f — Tianna Crownguard (SFD-060 → sfd-060-221) · Unit · Calm · 7 · 4 Might
 *     "[Deflect] While I'm at a battlefield, opponents can't gain points."  (errata: printed "score points" → "gain points")
 *   × Tryndamere, Barbarian (OGN-034 → ogn-034-298) — cited only as an example of a "score" effect.
 *
 * Q: Does Tianna prevent the point an opponent gains when I Burn Out (potentially an endless loop)?
 * A: No. Burning out makes an opponent GAIN a point, not SCORE one; Tianna blocks scoring (hold/conquer and effects that
 *    say "score") but not the burn-out gain, so the opponent still gets the point.
 * Rules: 431.2.c (burn out: choose an opponent to gain 1 point), 431.3.b (points from repeated burn-outs can't be
 *        prevented), 444–447 (scoring = hold/conquer).
 * NOTE: this ruling reads Tianna's pre-errata text ("can't score points"); the pool carries the errata'd "can't gain points".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
const SKULKER = "ogn-175-298";

/**
 * P2's turn (turn 2). P1's Tianna stands at bf1 (P1 controls it); bf2 is open. P1's Main Deck is EMPTY with one card
 * (t1) in the trash, so P1's next Draw Phase burns out exactly once. P2 has a real 5-card deck. 0–0.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", TIANNA, "tianna")
    .unit(P2, "base", { might: 3, name: "Walker" }, "walker")
    .trash(P1, SKULKER, "t1")
    .deck(P2, [SKULKER, SKULKER, SKULKER, SKULKER, SKULKER])
    .fillDecks({ main: 0, runes: 12 });
}

describe("Ruling 74a2b78c630c392f — Tianna stops opponents SCORING, not the point they GAIN from your Burn Out", () => {
  test("premise — Tianna at a battlefield does block the opponent's scoring: P2 conquers the open bf2 and gets NO point", async () => {
    const game = await board().build();
    expect(game.locationOf("tianna")).toBe("bf1");
    await game.p2.move("walker", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // the conquer itself happened …
    expect(game.p2.points()).toBe(0); // … but the point was blocked
  });

  // RULING-CONFLICT: riftjudge 74a2b78c630c392f says the Burn Out point is unstoppable because Tianna only blocks
  // *scoring*; that reads Tianna's PRE-ERRATA text ("opponents can't score points"). The pool carries the errata'd
  // "opponents can't gain points", and rule 431.2.c makes a burn out a point *gain*, so the errata'd text does reach it.
  // Rule 431.3.b makes only the points from the SECOND and later burn outs of a sequence unpreventable (asserted by the
  // loop test below); the first one is preventable. Engine follows the errata'd card text + CR.
  test("the FIRST burn-out point is a point GAIN (431.2.c), so the errata'd Tianna ('opponents can't gain points') prevents it", async () => {
    const game = await board().build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual(["t1"]);
    const r = await game.advanceTurn(); // P2 ends → P1's Awaken/Beginning/Channel/Draw → main
    expect(r.next).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    // The burn out was performed: trash recycled into the deck and the draw completed from it (431.2.b, 431.2.d).
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual(["t1"]);
    // P1 held bf1 in the Beginning Phase → 1 (own scoring is unaffected by own Tianna).
    expect(game.p1.points()).toBe(1);
    // The 431.2.c gain is prevented while Tianna stands at bf1 — P2 stays at 0.
    expect(game.p2.points()).toBe(0);
  });

  test("no endless loop either way: with P1's deck AND trash empty the burn-outs repeat and (431.3.b) those points cannot be prevented — P2 reaches 8 and wins even with Tianna out", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TIANNA, "tianna")
      .deck(P2, [SKULKER, SKULKER, SKULKER, SKULKER, SKULKER])
      .fillDecks({ main: 0, runes: 12 })
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    await game.p2.endTurn();
    const s = await game.settle();
    expect(s.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
  });
});
