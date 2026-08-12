/**
 * Ruling f7cbcbe29ccd88df — Warwick, Hunter (OGN-159 → ogn-159-298) · Champion Unit · Body · [6][body] · 5 Might
 *     "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · "[Deflect 2] · When I attack, deal 5 damage split
 *     among any number of enemy units here."
 *
 * Q: Attacking with Volibear and Warwick at once, can I have Volibear damage up to five units first and then
 *    have Warwick kill the damaged ones? More generally, when several "when I attack" abilities trigger at the
 *    same time, may their controller choose the order?
 * A: Yes. Simultaneous triggers you control are placed on the chain in the order you choose. Putting Warwick on
 *    the chain first (bottom) leaves Volibear on top, so Volibear's damage resolves first and Warwick then kills
 *    everything it damaged — all before combat begins.
 * Rules: 383.3.d (the controller orders simultaneous triggers), 464.2.c.3 (both attackers are designated in the
 *        same step), 336/337 (LIFO: last placed resolves first), 465 (combat damage comes after the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK_HUNTER = "ogn-159-298";
const VOLIBEAR_FURIOUS = "ogn-041-298";

/** P1's turn. P2 holds bf1 with three undamaged 6-Might grunts. Volibear (9) and Warwick (5) are ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Grunt 1" }, "g1")
    .unit(P2, "bf1", { might: 6, name: "Grunt 2" }, "g2")
    .unit(P2, "bf1", { might: 6, name: "Grunt 3" }, "g3")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli")
    .unit(P1, "base", WARWICK_HUNTER, "ww");
}

/**
 * Attack with both, name all three grunts as Volibear's split recipients, then place the triggers in `order`
 * (first entry = bottom of the chain = resolves last).
 */
async function attack(game: Game, order: readonly string[]): Promise<void> {
  game.script(P1, [
    (d) => (d.kind === "distribute" ? { allocation: { g1: 2, g2: 2, g3: 1 }, kind: "distribute" } : undefined),
  ], { replace: true });
  await game.p1.move(["voli", "ww"], "bf1");
  await game.p1.pick("g1", "g2", "g3"); // Volibear's split-target set, chosen at finalization
  const d = game.decision() as Decision | null;
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  const items = d?.kind === "order" ? d.items : [];
  expect(new Set(items.map((i) => i.card ?? i.key))).toEqual(new Set(["voli", "ww"]));
  await game.p1.order(order.map((c) => items.find((i) => (i.card ?? i.key) === c)?.key ?? c));
  expect(game.chain().map((c) => c.cardId)).toEqual([...order]);
}

/** Resolve the top chain item (both players pass priority once), answering Volibear's damage split 2/2/1. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
  if (game.decision()?.kind === "distribute") {
    await game.p1.distribute({ g1: 2, g2: 2, g3: 1 });
  }
}

describe("Ruling f7cbcbe29ccd88df — the controller orders simultaneous attack triggers, and the order decides the fight", () => {
  test("moving both in designates both as attackers and puts BOTH triggers on the chain under P1's control", async () => {
    const game = await board().build();
    await game.p1.move(["voli", "ww"], "bf1");
    expect(game.state("voli").combatRole).toBe("attacker");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
  });

  test("ruling: P1 is offered the ORDER of those two triggers — a decision naming Volibear's and Warwick's items", async () => {
    const game = await board().build();
    await game.p1.move(["voli", "ww"], "bf1");
    await game.p1.pick("g1", "g2", "g3");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card ?? i.key).sort() : []).toEqual(["voli", "ww"]);
  });

  test("Warwick placed first (bottom): Volibear resolves first and damages all three grunts, none dead yet", async () => {
    const game = await board().build();
    await attack(game, ["ww", "voli"]);
    await resolveTop(game); // Volibear
    expect(game.state("g1").damage).toBe(2);
    expect(game.state("g2").damage).toBe(2);
    expect(game.state("g3").damage).toBe(1);
    expect(game.p2.units("bf1")).toHaveLength(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
  });

  test("… then Warwick resolves and kills every damaged enemy here — all three die before any combat damage", async () => {
    const game = await board().build();
    await attack(game, ["ww", "voli"]);
    await resolveTop(game); // Volibear
    await resolveTop(game); // Warwick
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.zoneOf("g3")).toBe("trash");
    expect(game.state("voli").damage).toBe(0);
    expect(game.state("ww").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the opposite order is a different game: Warwick on top resolves first with nothing damaged, so it kills nothing", async () => {
    const game = await board().build();
    await attack(game, ["voli", "ww"]);
    await resolveTop(game); // Warwick — no damaged enemies yet
    expect(game.p2.units("bf1")).toHaveLength(3);
    expect(game.zoneOf("g1")).toBe("battlefield-bf1");
    await resolveTop(game); // Volibear damages them, too late to be killed
    expect(game.state("g1").damage).toBe(2);
    expect(game.p2.units("bf1")).toHaveLength(3);
  });

  test("outcome: the chosen order is what wipes the battlefield — Warwick-first ends with P1 conquering unopposed", async () => {
    const game = await board().build();
    await attack(game, ["ww", "voli"]);
    await game.settle();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["voli", "ww"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
