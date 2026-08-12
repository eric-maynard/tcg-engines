/**
 * Interaction: the three boundaries of an object-scoped, per-turn tally, plus the game boundary.
 *
 *   Draven, Audacious (sfd-148-221) Unit · Chaos · [6]+[chaos] · 6 Might
 *     "[Deflect] · The first time I win a combat each turn, you score 1 point.
 *      · When I die in combat, choose an opponent. They score 1 point."
 *   Tactical Retreat  (unl-175-219) Spell · Order · [2] · [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall
 *      it instead. (Send it to base. This isn't a move.)"
 *
 * Q: "The first time I win a combat each turn" is a tally keyed by card id and scoped to the OBJECT
 *    (`<event>|c:<cardId>`, isObjectScopedTallyKey in operations/object-identity.ts). Walk all three
 *    boundaries in one turn plus the game boundary. (i) A second combat win the same turn — second
 *    point? (ii) Draven is Tactical-Retreated (recall to base, explicitly not a Move) and comes back
 *    to win again that turn — does the recall reset the tally? (iii) Draven DIES in combat and is
 *    replayed the same turn — does his next win score? (iv) Game 2 of the Bo3, same card id?
 *
 * A: (i) No second point: the tally is per-turn and object-scoped, and only the turn boundary clears
 *    it. (ii) The recall does NOT reset it — 455/456.1 send the unit to its base, still a BOARD space,
 *    so 446.1/458.1 keep its bookkeeping and 124 never mints a new object (no resetObjectIdentity).
 *    (iii) YES — dying moves Draven to the trash, a NON-board zone, so 124/124.1 make the replayed
 *    card a new game object: every object-scoped tally for that card id is purged and the next
 *    instance is minted, so "the first time I win a combat each turn" has never fired for it. The
 *    death also fires "choose an opponent. They score 1 point" (auto-resolved in 1v1) BEFORE the
 *    replay. The boundary tears down only OBJECT-scoped records: a player-scoped `…|p:<player>` turn
 *    record is untouched (359.3.e.4 / 371.1). (iv) Yes — game 2 is a fresh engine (486.6), so the
 *    identical card id starts with an empty tally table. In every branch the point is a
 *    triggered-ability point, so 471.1.a.1 exempts it from the Final-Point conquer restriction
 *    (471.1.b.1), and the game-ending check still waits for the Cleanup (323.1).
 *
 * Rules: 124 / 124.1 (new object across a non-board zone change) · 446.1 (board-to-board is a Move,
 * not a zone change) · 455 / 456.1 / 458.1 (Recall: to base, no move triggers, statuses unaffected) ·
 * 359.3.e.4 (a returned card is not the same object) · 371.1 (per-turn replacement allowances) ·
 * 466.3.a (winning a combat) · 194.1.c / 471.1.a.1 / 471.1.b.1 (triggered-ability points vs the Final
 * Point) · 323.1 (the win check is a Cleanup task) · 486.6 (Bo3: reset the game state between games).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const TACTICAL_RETREAT = "unl-175-219";

const tallies = (game: Game): Readonly<Record<string, number>> =>
  (game.gameState as unknown as { turnEventCounts?: Record<string, number> }).turnEventCounts ?? {};
const instances = (game: Game): Readonly<Record<string, number>> =>
  (game.gameState as unknown as { objectInstances?: Record<string, number> }).objectInstances ?? {};

/**
 * P1's turn, three enemy battlefields: bf1 and bf3 hold a 1-Might picket Draven beats, bf2 holds a
 * 7-Might bruiser that kills him. Draven waits in P1's base with Tactical Retreat in hand.
 */
function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 12, power: { chaos: 4, order: 4, rainbow: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Picket A" }, "picketA")
    .unit(P2, "bf2", { might: 7, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf3", { might: 1, name: "Picket C" }, "picketC")
    .unit(P1, "base", DRAVEN, "draven")
    .hand(P1, TACTICAL_RETREAT, "retreat");
}

/**
 * Send Draven home and back out again inside the same turn. A unit exhausts when it moves, so the
 * sandbox `readyCard` move stands in for whatever would ready him — the tally, not the economy, is
 * what these tests are about.
 */
async function redeploy(game: Game, to: string): Promise<void> {
  await game.p1.do("readyCard", { cardId: game.card("draven") });
  if (game.locationOf("draven") !== "base") {
    await game.p1.move("draven", "base");
    await game.settle();
    await game.p1.do("readyCard", { cardId: game.card("draven") });
  }
  await game.p1.move("draven", to);
  await game.settle();
}

/** Draven's opening attack: he beats the 1-Might picket at bf1 and conquers it. */
async function firstWin(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("draven", "bf1");
  await game.settle();
  return game;
}

describe("Draven, Audacious — 'the first time I win a combat each turn' across three boundaries", () => {
  // ── (i) same object, same turn ───────────────────────────────────────────────────────────────

  test("(i) the first win pays twice — 1 point for the Conquer and 1 for Draven's trigger — and marks the object-scoped tally spent", async () => {
    const game = await firstWin();
    expect(game.zoneOf("picketA")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(2);
    expect(tallies(game)["win-combat|c:draven"]).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(i) a SECOND combat win the same turn pays the Conquer only — no second Draven point", async () => {
    const game = await firstWin();
    await redeploy(game, "bf3"); // the other 1-Might picket
    expect(game.zoneOf("picketC")).toBe("trash");
    expect(game.p1.points()).toBe(3); // 2 + conquer, not 2 + conquer + trigger
    expect(tallies(game)["win-combat|c:draven"]).toBe(2); // the EVENT happened twice…
    expect(instances(game)["draven"]).toBeUndefined(); // …and it is still the same object
  });

  // ── (ii) recall is not a zone change to a non-board zone ─────────────────────────────────────

  test("(ii) Tactical Retreat's recall sends Draven to base without minting a new object — the spent tally survives and his next win that turn still pays only the Conquer", async () => {
    const game = await firstWin();
    const afterFirst = game.p1.points();
    await game.p1.cast("retreat", { targets: "draven" });
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");

    await redeploy(game, "bf2"); // the 7-Might bruiser would kill him; the replacement recalls instead
    expect(game.locationOf("draven")).toBe("base"); // 455 — recalled, not dead
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven").isExhausted).toBe(true); // "heal it, exhaust it, and recall it"
    expect(instances(game)["draven"]).toBeUndefined(); // 446.1 / 124: no new object
    expect(tallies(game)["win-combat|c:draven"]).toBe(1); // 458.1: bookkeeping unaffected

    await redeploy(game, "bf3");
    expect(game.p1.points()).toBe(afterFirst + 1); // conquer only — the tally was never reset
  });

  // ── (iii) death is a zone change to a non-board zone ─────────────────────────────────────────

  test("(iii) dying in combat gives the opponent a point, mints a new object instance and purges the OBJECT-scoped tally — while the player-scoped record of the same turn survives", async () => {
    const game = await firstWin();
    expect(tallies(game)["win-combat|p:player-1"]).toBe(1);
    await redeploy(game, "bf2"); // 7 Might kills the 6-Might Draven
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p2.points()).toBe(1); // "When I die in combat, choose an opponent. They score 1 point."
    expect(instances(game)["draven"]).toBe(1); // 124 — next incarnation
    expect(tallies(game)["win-combat|c:draven"]).toBeUndefined(); // 124.1 — object-scoped, purged
    expect(tallies(game)["win-combat|p:player-1"]).toBe(1); // player-scoped, untouched
  });

  test("(iii) the replayed Draven is a NEW object: his next combat win that same turn scores again (Conquer + trigger = 2)", async () => {
    const game = await firstWin();
    const afterFirst = game.p1.points();
    await redeploy(game, "bf2");
    expect(game.zoneOf("draven")).toBe("trash");
    await game.p1.do("sendToHand", { cardId: game.card("draven") }); // back to hand, then replayed
    expect(game.zoneOf("draven")).toBe("hand");
    await game.p1.play("draven");
    await game.settle();
    expect(game.zoneOf("draven")).toBe("base");
    await redeploy(game, "bf3");
    expect(game.p1.points()).toBe(afterFirst + 2); // conquer + a fresh "first time I win a combat"
    expect(tallies(game)["win-combat|c:draven"]).toBe(1); // counting restarted from the new object
  });

  // ── (iv) the game boundary ───────────────────────────────────────────────────────────────────

  test("(iv) game 2 of the match is a fresh engine (486.6): the identical card id starts with an empty tally table, so its first combat win scores", async () => {
    const game2 = await board().build();
    expect(tallies(game2)["win-combat|c:draven"]).toBeUndefined();
    expect(instances(game2)["draven"]).toBeUndefined();
    await game2.p1.move("draven", "bf1");
    await game2.settle();
    expect(game2.p1.points()).toBe(2);
  });

  // ── the point's own legality ─────────────────────────────────────────────────────────────────

  test("471.1.a.1 — at 7 of 8 with an unscored second battlefield the CONQUER draws a card instead of the Final Point (471.1.b.1), but Draven's triggered point is not beholden and wins the game", async () => {
    const game = await scenario()
      .active(P1)
      .points(P1, 7)
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 1, name: "Picket" }, "picket")
      .unit(P1, "base", DRAVEN, "draven")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1); // the conquer became a draw
    expect(game.p1.points()).toBe(8); // exactly one point: the triggered one
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
