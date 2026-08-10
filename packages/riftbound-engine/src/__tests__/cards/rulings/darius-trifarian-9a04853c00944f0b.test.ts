/**
 * Ruling 9a04853c00944f0b — Darius, Trifarian (OGN-027 → ogn-027-298) × Challenge (OGN-128 → ogn-128-298)
 *   × Sky Splitter (OGN-014 → ogn-014-298)
 *
 *   Darius, Trifarian — Unit · Fury · 5+[fury] · 5 Might: "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me."
 *   Challenge — Action 2+[body]: "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   Sky Splitter — Action 8+[fury]: "This spell's Energy cost is reduced by the highest Might among units you control. Deal 5
 *     to a unit at a battlefield."
 *
 * Q: Play Darius, then Challenge or Sky Splitter as the second card — is Darius 7 or 5 for the spell, and does Sky Splitter
 *    cost 1 or 3?
 * A: The spell resolves first and only then does Darius trigger ("played" = resolved). Darius is 5 Might for Challenge's
 *    damage; Sky Splitter's cost is fixed before the trigger too: 8 − 5 = 3.
 * Rules: 419.4.a (play-triggers fire on resolution), 356.4 (cost reductions computed as the spell is played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const CHALLENGE = "ogn-128-298";
const SKY_SPLITTER = "ogn-014-298";

/** P1's turn: Darius + the spell in hand; P2's Foe (4) and Wall (9) at P2's bf1. Darius is the only unit P1 will control. */
function board(extraEnergy: number, power: Record<string, number>) {
  return scenario()
    .resources(P1, { energy: 5 + extraEnergy, power: { fury: 1, ...power } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .hand(P1, DARIUS, "darius")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, SKY_SPLITTER, "sky");
}

/** First card of the turn: Darius (5+[fury]) — enters exhausted at 5, no trigger. */
async function playDarius(game: Game): Promise<void> {
  await game.p1.play("darius");
  await game.settle();
  expect(game.zoneOf("darius")).toBe("base");
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  expect(game.chain()).toEqual([]);
}

describe("Ruling 9a04853c00944f0b — the second-card spell resolves before Darius's trigger; Darius is 5 for it", () => {
  test("Challenge as the 2nd card: while it is on the chain there is NO Darius trigger; it resolves with Darius at 5 (Foe takes 5 and dies, Darius takes 4) — THEN the trigger appears", async () => {
    const game = await board(2, { body: 1 }).build();
    await playDarius(game);
    await game.p1.cast("challenge", { targets: ["darius", "foe"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]); // no trigger yet
    expect(game.state("darius").might).toBe(5);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Challenge resolves
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash"); // dealt exactly 5 (≥ 4)
    expect(game.state("darius").damage).toBe(4);
    // Only now: "played your second card" → Darius's trigger is on the chain, still 5 until it resolves.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.state("darius").might).toBe(5);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
  });

  test("proof it was 5, not 7: Challenging the 9-Might Wall leaves it on exactly 5 damage", async () => {
    const game = await board(2, { body: 1 }).build();
    await playDarius(game);
    await game.p1.cast("challenge", { targets: ["darius", "wall"] });
    await game.settle();
    expect(game.state("wall").damage).toBe(5);
    expect(game.zoneOf("darius")).toBe("trash"); // took 9
  });

  test("Sky Splitter as the 2nd card costs 8 − 5 = 3 (Darius is 5 when the cost is locked): castable with exactly 3 energy, pool → 0", async () => {
    const game = await board(3, { fury: 2 }).build();
    await playDarius(game);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "wall" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sky"]);
    expect(game.state("darius").might).toBe(5);
    // …and with only 2 energy left after Darius it is NOT castable (it does not cost 1).
    const poor = await board(2, { fury: 2 }).build();
    await playDarius(poor);
    expect(poor.p1.energy()).toBe(2);
    expect(poor.p1.can("cast", "sky")).toBe(false);
  });

  test("Sky Splitter resolves (5 to the Wall), then Darius triggers: +2 (→ 7) and readied", async () => {
    const game = await board(3, { fury: 2 }).build();
    await playDarius(game);
    await game.p1.cast("sky", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sky Splitter resolves
    expect(game.state("wall").damage).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
