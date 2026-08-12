/**
 * Ruling f771a2ff595277fb — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · [2][order]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 [Might] · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: Yasuo attacks and his trigger goes on the Chain; in response a hidden Hidden Blade kills him. Does the trigger
 *    still deal its damage?
 * A: No. The instruction damages a unit "here" for "my Might" — with Yasuo gone from the battlefield there is no
 *    source and no "here", so the item resolves without dealing anything. The target survives undamaged.
 * Rules: 359.3.e.5 (an instruction whose source/location is gone does nothing), 195 (a card off the board has no Might),
 *        336/337 (LIFO: the response resolves first), 811 (a card played from Hidden reacts).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P1's turn. P2 holds bf1 with a 4-Might defender and a Hidden Blade already hidden there. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Sentry" }, "sentry")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade");
}

/** Yasuo attacks; his trigger is on the Chain aimed at the Sentry, and P2 has priority to react. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
  expect(game.chain()[0]).toMatchObject({ controller: P1, targets: ["sentry"], triggered: true });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling f771a2ff595277fb — killing Yasuo in response makes his 'deal my Might here' trigger do nothing", () => {
  test("baseline: left alone, the trigger deals 6 and kills the 4-Might Sentry", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("sentry")).toBe("trash");
  });

  test("the hidden Hidden Blade reacts to the trigger and resolves first, killing Yasuo", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("yasuo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "blade"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // "its controller draws 2" — Yasuo's controller
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // the orphaned trigger is still on the Chain
  });

  test("the orphaned trigger then resolves for nothing — the Sentry takes no damage and lives", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("blade", { answers: ["yasuo"] });
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("with the attacker gone the battlefield stays P2's and P1 scores nothing", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("blade", { answers: ["yasuo"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});
