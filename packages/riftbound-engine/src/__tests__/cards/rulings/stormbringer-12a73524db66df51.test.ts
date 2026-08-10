/**
 * Ruling 12a73524db66df51 — Stormbringer (OGN-250 → ogn-250-298) · Spell · Fury/Body · [6][rainbow][rainbow] · [Action]
 *     "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield,
 *      then move your unit there."
 *   × Darius, Trifarian (ogn-027-298) · 5 Might "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me."
 *
 * Q: Darius is played first, Stormbringer second (choosing Darius). Does Stormbringer use 5 or the 7 he would have
 *    once his "second card" trigger resolves?
 * A: 5. A spell only counts as played once it has fully resolved (and is in the trash), so Darius's trigger fires
 *    as Stormbringer finishes — Stormbringer's damage was already computed from his current Might, 5.
 * Rules: 359.3.e.10 ("when you play a spell" abilities trigger as the spell resolves), 383 (trigger then goes on
 *        the chain and resolves afterwards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const DARIUS_TRIFARIAN = "ogn-027-298";

/** P1's turn with 11 energy, 1 fury, 2 rainbow. P2's 6-Might Bulwark holds bf1 (5 damage won't kill it, 7 would). */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 11, power: { fury: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Bulwark" }, "bulwark")
    .hand(P1, DARIUS_TRIFARIAN, "darius")
    .hand(P1, STORMBRINGER, "storm");
}

/** Card 1: Darius to base (5, exhausted). Card 2: Stormbringer choosing Darius → bf1. Stops with Stormbringer on the chain. */
async function dariusThenStormbringer(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("darius", { to: "base" });
  await game.settle();
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
  expect(game.chain()).toEqual([]); // first card: Darius's own ability is silent
  await game.p1.cast("storm", { targets: ["darius", "bf1"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
  return game;
}

describe("Ruling 12a73524db66df51 — Stormbringer reads Darius at 5; his 'second card' +2 only comes as the spell finishes", () => {
  test("while Stormbringer sits on the chain Darius has NOT triggered yet: the chain is just the spell and he is still an exhausted 5 in base", async () => {
    const game = await dariusThenStormbringer();
    expect(game.chain().map((c) => c.cardId)).toEqual(["storm"]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0, zone: "base" });
  });

  test("Stormbringer resolves using Might 5: the 6-Might Bulwark takes exactly 5 (survives), Darius is moved to bf1 — and only NOW is Darius's trigger on the chain", async () => {
    const game = await dariusThenStormbringer();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stormbringer resolves
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.state("bulwark")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
    expect(game.locationOf("darius")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.state("darius")).toMatchObject({ might: 5, mightModifier: 0 }); // trigger not resolved yet
  });

  test("then the trigger resolves: Darius becomes 7 and READY at bf1 — after the damage was dealt, so the Bulwark still shows 5, not 7", async () => {
    const game = await dariusThenStormbringer();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stormbringer
    await game.p1.passPriority();
    await game.p2.passPriority(); // Darius's trigger
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7, mightModifier: 2, zone: "battlefield-bf1" });
    expect(game.state("bulwark")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
  });

  test("(epilogue: the arrival opens a combat at bf1 which the now-7 Darius wins against the pre-damaged Bulwark; P1 conquers)", async () => {
    const game = await dariusThenStormbringer();
    await game.settle();
    expect(game.zoneOf("bulwark")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
