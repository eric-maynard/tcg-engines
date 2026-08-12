/**
 * Ruling 27d6926719d53f87 — Vi, Peacekeeper (UNL-176 → unl-176-219) · [5][order] · 5 Might
 *   "[Ambush] When I attack, [Stun] an enemy unit here."
 *
 * Q: Conquering a battlefield the opponent holds with a 3-Might and a 2-Might unit: I move a 2-Might unit
 *    in and Ambush Vi. With 5 Might, can she "attack both units" and stun them both?
 * A: No. Her ability is a single triggered ability that fires once when she gains the Attacker designation
 *    and stuns ONE enemy unit here — you pick which. And units never attack individual units: all attacking
 *    Might is pooled and assigned across the defenders, so Vi just contributes her 5 to that total.
 * Rules: 383.1 (one trigger, one execution — no [Repeat]), 355.9 (one chosen object), 460.2 (combat Might
 *        is summed and assigned, lethal first), 815 ([Stun] = deals no combat damage this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI_PEACEKEEPER = "unl-176-219";

/** P1's turn. P2 holds bf1 with Big (3) and Small (2). P1 has a 2-Might Grunt in base, Vi in hand + [5][order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, VI_PEACEKEEPER, "vi");
}

/** Grunt charges bf1, then Vi is Ambushed in as a Reaction; returns the game at Vi's stun choice. */
async function ambushVi(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("grunt", "bf1");
  expect(game.state("grunt").combatRole).toBe("attacker");
  await game.p1.play("vi", { to: "bf1" });
  expect(game.locationOf("vi")).toBe("bf1");
  return game;
}

describe("Ruling 27d6926719d53f87 — Vi's 'when I attack' stuns exactly one enemy unit, chosen by her controller", () => {
  test("ruling: Vi attacking puts exactly ONE trigger on the chain, not one per enemy unit", async () => {
    const game = await ambushVi();
    await game.settle();
    expect(game.state("vi").combatRole).toBe("attacker");
    const triggers = game.chain().filter((c) => c.cardId === "vi" && c.triggered);
    expect(triggers.length).toBeLessThanOrEqual(1);
  });

  test("ruling: the harness surfaces P1's choice between the two enemy units — a single pick, not both", async () => {
    const game = await ambushVi();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => String(o.card ?? o.key)).toSorted()).toEqual(["big", "small"]);
    expect(d.max ?? 1).toBe(1);
  });

  test("ruling: naming Big stuns Big only — Small is untouched by the ability", async () => {
    const game = await ambushVi();
    await game.settle();
    await game.p1.pick("big");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the single trigger resolves
    expect(game.state("big").isStunned).toBe(true);
    expect(game.state("small").isStunned).toBe(false);
  });

  test("ruling: Vi does not 'attack' a unit — her 5 joins the 2-Might Grunt in one 7-Might pool that kills both defenders", async () => {
    const game = await ambushVi();
    await game.settle();
    await game.p1.pick("big");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
