/**
 * Ruling fd7c7460c73cfeee — Pridestalker (UNL-183 → unl-183-219, the Rengar LEGEND)
 *   "When you play a unit, give a unit +1 [Might] this turn."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · "Give a unit -1 [Might] this turn… Draw 1."
 *
 * Q: Does the Rengar legend ability use the stack (chain)?
 * A: Yes. "When you play a unit…" is a triggered ability, so it is put on the chain as a chain item, resolves
 *    LIFO, and opponents may respond to it with [Reaction]s before it resolves.
 * Rules: 383 (triggered abilities are placed on the chain), 336–340 (chain / LIFO resolution),
 *        321 ([Reaction] timing), 402 (targets chosen at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PRIDESTALKER = "unl-183-219";
const STUPEFY = "ogn-095-298";

/** P1's turn. P1 has the Rengar legend, a Scout in base and a 3-Might unit to play; P2 holds a Stupefy. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { rainbow: 1 } })
    .legend(P1, PRIDESTALKER, "rengar")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 3, name: "Brawler" }, "brawler")
    .hand(P2, STUPEFY, "stupefy");
}

describe("Ruling fd7c7460c73cfeee — the Rengar legend's 'when you play a unit' is a triggered ability and uses the chain", () => {
  test("ruling: playing a unit puts the legend's ability on the chain as a TRIGGERED chain item controlled by P1", async () => {
    const game = await board().build();
    await game.p1.play("brawler", { to: "base" });
    const items = game.chain();
    expect(items).toEqual([expect.objectContaining({ cardId: "rengar", controller: P1, triggered: true })]);
    expect(game.state("scout").might).toBe(2); // nothing has resolved yet
  });

  test("its target is chosen at finalization and shown on the chain item before anyone gets priority", async () => {
    const game = await board().build();
    await game.p1.play("brawler", { to: "base", answers: ["scout"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rengar", targets: ["scout"] })]);
    await game.settle();
    expect(game.state("scout").might).toBe(3); // 2 + 1 this turn
    expect(game.chain()).toEqual([]);
  });

  test("because it is on the chain, P2 can respond to it — the Stupefy goes on top and resolves FIRST (LIFO)", async () => {
    const game = await board().build();
    await game.p1.play("brawler", { to: "base", answers: ["scout"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rengar", "stupefy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").might).toBe(2); // 2 - 1 (Stupefy) + 1 (Rengar)
    expect(game.state("scout").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the +1 is only 'this turn' — it is gone once the turn ends", async () => {
    const game = await board().build();
    await game.p1.play("brawler", { to: "base", answers: ["scout"] });
    await game.settle();
    expect(game.state("scout").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("scout")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
