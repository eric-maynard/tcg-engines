/**
 * Ruling f281aa2e37c941a3 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 [Might] · [6][calm][calm]
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Unforgiven (OGN-259 → ogn-259-298) · Yasuo's legend · "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: Does Yasuo's "when I attack" fire when the LEGEND ability moves him onto an enemy-occupied battlefield?
 * A: Yes. There is no "declare attackers" step: a unit that arrives at a battlefield an opponent occupies becomes the
 *    attacker however it got there, and "when I attack" is the first thing to trigger as the combat showdown starts.
 * Rules: 437/459 (attacker designation on arrival, no declaration step), 383 (triggered abilities), 344 (an effect move is not a standard move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const UNFORGIVEN = "ogn-259-298";

/** P1's turn. P1's legend is Unforgiven; Yasuo stands READY in base; P2 holds bf1 with a 3-Might unit. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .legend(P1, UNFORGIVEN, "legend")
    .unit(P2, "bf1", { might: 3, name: "Watchman" }, "watchman")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .resources(P1, { energy: 2 });
}

/** Use the legend to push Yasuo out of base onto the contested battlefield. */
async function legendMove(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("legend", 0);
  // Yasuo is the only friendly unit, so only the destination is asked (rule 355.4, choose-destination at finalization).
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf1");
  await game.acting().passPriority();
  await game.acting().passPriority(); // the legend ability resolves and Yasuo moves in
  return game;
}

describe("Ruling f281aa2e37c941a3 — a legend-ability move onto an occupied battlefield still triggers 'when I attack'", () => {
  test("the legend ability moves Yasuo to bf1 and exhausts the LEGEND, not Yasuo (it is not a standard move)", async () => {
    const game = await legendMove();
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").isExhausted).toBe(false);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("arriving makes Yasuo the attacker and puts his 'when I attack' trigger on the Chain aimed at the enemy unit", async () => {
    const game = await legendMove();
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("watchman").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["watchman"], triggered: true })]);
  });

  test("it resolves for his full 6 Might and kills the 3-Might defender", async () => {
    const game = await legendMove();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("watchman")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("Yasuo then wins the (now empty) combat and conquers the battlefield", async () => {
    const game = await legendMove();
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a standard move to the same battlefield triggers the same ability — but exhausts Yasuo", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["watchman"], triggered: true })]);
  });
});
