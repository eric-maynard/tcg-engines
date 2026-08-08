/**
 * Swain, Visionary — ven-173-166 · Champion Unit (Swain) · Mind · 6 energy + [mind] · 6 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   When I conquer, if you've played a non-token unit, a non-token gear, and a spell this turn,
 *   you score 1 point.
 *
 * Rules: 817 (Vision = "When this is played, predict"; ONE instance → ONE trigger), 436 (Predict:
 * look at the top card, may recycle it → bottom of Main Deck), 383.4.c (Conquer effects — "When I
 * conquer" needs THIS unit present at the conquered battlefield), 383.4.c.2.c (the conquer trigger
 * still fires when the conquer point itself is replaced), 471.1.a.1 (points from non-Conquer sources
 * ignore the Final-Point restriction; 471.1.b.1 the conquer point at victory−1 becomes a draw
 * unless every battlefield was scored), 185 (tokens are not "non-token" cards).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Exactly ONE Vision prompt (the parser emits both a Vision keyword and an equivalent play-self
 *     look trigger — a double prompt would be a silent mis-parse). Recycle → bottom; decline → stays.
 *  2. The bonus is an intervening-if checked on resolution against THIS TURN's plays by YOU: all three
 *     of {non-token unit, non-token gear, spell} → conquer is worth 2 (1 conquer + 1 Swain). Any one
 *     missing (unit+gear only; unit+spell only; gear+spell where the only unit was a TOKEN made by that
 *     spell) → exactly 1.
 *  3. "this turn" resets: play all three, pass the turn around, conquer next turn → 1 point only.
 *  4. "When I conquer": another friendly unit conquering while Swain sits in base → no bonus even with
 *     all three played.
 *  5. Final point: at 6/8 the conquer (7) + Swain (8) wins outright; at 7/8 with two battlefields the
 *     conquer point is replaced by a draw (471.1.b.1) yet Swain's trigger still fires (383.4.c.2.c) and
 *     its non-conquer point IS the winning 8th (471.1.a.1).
 * Partner cards: Desert's Call sfd-031-221 (a spell that plays a Sand Soldier unit TOKEN), Cleave
 * ogn-004-298 (cheap spell), inline 1-cost Mind unit / gear for the other two legs.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-173-166";
const FILLER = "ogn-175-298";
const CLEAVE = "ogn-004-298"; // spell, 1 energy
const DESERTS_CALL = "sfd-031-221"; // Calm spell, 2 energy — plays a 2-Might Sand Soldier unit token
const CHEAP_UNIT = { cardType: "unit", domain: "mind", energyCost: 1, might: 1, name: "Raven Acolyte" } as const;
const CHEAP_GEAR = { abilities: [], cardType: "gear", domain: "mind", energyCost: 1, name: "Raven Idol" } as const;

function toPlay() {
  return scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "swain").deckTop(P1, FILLER, "top");
}

/** Swain ready in P1's base, an enemy-held bf1 (empty) to walk onto, bf2 also enemy-held, and the three "legs" in hand. */
function readyToConquer(points = 0) {
  return scenario()
    .points(P1, points)
    .victoryScore(8)
    .resources(P1, { energy: 10, power: { calm: 2, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", CARD, "swain")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, CHEAP_UNIT, "u")
    .hand(P1, CHEAP_GEAR, "g")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DESERTS_CALL, "call");
}

async function playLegs(game: Game, legs: readonly ("u" | "g" | "cleave" | "call")[]): Promise<void> {
  for (const leg of legs) {
    if (leg === "cleave") {
      await game.p1.cast("cleave", { targets: "swain" });
    } else if (leg === "call") {
      await game.p1.cast("call");
    } else {
      await game.p1.play(leg);
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf(leg)).toBe(leg === "u" || leg === "g" ? "base" : "trash");
  }
}

async function conquerBf1With(game: Game, unit: string): Promise<void> {
  await game.p1.move(unit, "bf1");
  await game.settle({ policy: "first" });
  expect(game.locationOf(unit)).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

describe("Swain, Visionary (ven-173-166)", () => {
  test("registry payload should be [Vision keyword] + a 'When I conquer' trigger with the played-unit/gear/spell-this-turn condition scoring 1 point", async () => {
    // Expected: a conquer-self trigger carrying an if-condition and a score/gain-point effect.
    // Actual: Vision keyword + a DUPLICATE play-self look trigger; the conquer line is missing entirely.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 6, isChampion: true, might: 6, name: "Swain, Visionary", powerCost: ["mind"], tags: ["Swain"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.some((a) => a.keyword === "Vision")).toBe(true);
    const conquer = abilities.find((a) => (a.trigger as { event?: string } | undefined)?.event === "conquer");
    expect(conquer).toBeDefined();
    expect(JSON.stringify(conquer)).toMatch(/score|point/i);
    expect(abilities.filter((a) => (a.trigger as { event?: string } | undefined)?.event === "play-self")).toHaveLength(0);
  });

  test("cost: 6 energy + 1 mind; enters base exhausted at 6 Might with exactly one Vision trigger on the chain; unaffordable without the mind power or at 5 energy", async () => {
    const game = await toPlay().build();
    await game.p1.play("swain");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("swain")).toBe("base");
    expect(game.state("swain")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "swain", controller: P1, triggered: true })]);
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "swain").build()).p1.can("play", "swain")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { mind: 2 } }).hand(P1, CARD, "swain").build()).p1.can("play", "swain")).toBe(false);
  });

  test("Vision: ONE prompt showing the top card; picking it recycles it to the bottom of the Main Deck and play returns to an open main phase", async () => {
    const game = await toPlay().build();
    expect(game.p1.deck()[0]).toBe("top");
    await game.p1.play("swain");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "swain" } });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["top"]);
    await game.p1.pick("top");
    const after = await game.settle();
    expect(after.reason).toBe("open"); // no second Vision prompt
    const deck = game.p1.deck();
    expect(deck[0]).not.toBe("top");
    expect(deck[deck.length - 1]).toBe("top");
  });

  test("Vision: declining leaves the top card where it is; the opponent's deck is never looked at", async () => {
    const game = await toPlay().deckTop(P2, FILLER, "theirTop").build();
    await game.p1.play("swain");
    await game.settle();
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.decline();
    expect((await game.settle()).reason).toBe("open");
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p2.deck()[0]).toBe("theirTop");
  });

  test("conquer after playing a non-token unit, a non-token gear AND a spell this turn → 2 points (1 conquer + 1 from Swain)", async () => {
    // Expected: 0 → 2. Actual: the conquer trigger is not implemented, P1 ends on 1.
    const game = await readyToConquer().build();
    await playLegs(game, ["u", "g", "cleave"]);
    await conquerBf1With(game, "swain");
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: unit + gear but NO spell this turn → the conquer is worth exactly 1", async () => {
    const game = await readyToConquer().build();
    await playLegs(game, ["u", "g"]);
    await conquerBf1With(game, "swain");
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: unit + spell but NO gear this turn → exactly 1", async () => {
    const game = await readyToConquer().build();
    await playLegs(game, ["u", "cleave"]);
    await conquerBf1With(game, "swain");
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: gear + a spell whose only unit is a TOKEN (Desert's Call → Sand Soldier) → the 'non-token unit' leg is unmet, exactly 1", async () => {
    const game = await readyToConquer().build();
    await playLegs(game, ["g", "call"]);
    expect(game.p1.units("base").some((id) => game.state(id).isToken)).toBe(true); // the token really was played
    await conquerBf1With(game, "swain");
    expect(game.p1.points()).toBe(1);
  });

  test("'this turn': all three legs played, then the turn goes around — conquering on P1's NEXT turn is worth only 1", async () => {
    const game = await readyToConquer().build();
    await playLegs(game, ["u", "g", "cleave"]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    await conquerBf1With(game, "swain");
    expect(game.p1.points()).toBe(1);
  });

  test("'When I conquer': a different friendly unit conquers while Swain stays in base → no bonus even with all three legs played (exactly 1)", async () => {
    const game = await readyToConquer().build();
    await playLegs(game, ["u", "g", "cleave"]);
    await conquerBf1With(game, "runner");
    expect(game.locationOf("swain")).toBe("base");
    expect(game.p1.points()).toBe(1);
  });

  test("at 6 of 8 the conquer point (7) plus Swain's point (8) wins the game on the spot", async () => {
    // Expected: P1 reaches 8 = victory score → game over, P1 wins. Actual: stops at 7.
    const game = await readyToConquer(6).build();
    await playLegs(game, ["u", "g", "cleave"]);
    await game.p1.move("swain", "bf1");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("at 7 of 8 with bf2 unscored the CONQUER point is replaced by a draw (471.1.b.1) but Swain still triggers (383.4.c.2.c) and his non-conquer point is a legal winning 8th (471.1.a.1)", async () => {
    // Expected: hand +1 from the replaced conquer point, then 8 points and a P1 win. Actual: 7, game continues.
    const game = await readyToConquer(7).build();
    await playLegs(game, ["u", "g", "cleave"]);
    const handBefore = game.p1.hand().length;
    await game.p1.move("swain", "bf1");
    await game.settle({ policy: "first" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  test("471.1.b.1 baseline (no Swain bonus in play): at 7 of 8, conquering only bf1 draws a card instead of scoring — still 7, game not over", async () => {
    const game = await readyToConquer(7).build();
    const handBefore = game.p1.hand().length;
    await conquerBf1With(game, "runner");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });
});
