/**
 * Ruling 3488dd0ee6eefe84 — Forbidding Waste (UNL-210 → unl-210-219) · Battlefield
 *   "While a unit here is defending alone, it has -2 [Might]."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · Spell [3][rainbow] [Action]
 *   "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *
 * Q: Opponent's 5-Might unit is alone at Forbidding Waste. I attack with a unit, then Arcane Shift my unit (replayed
 *    to base) and their unit. Does their unit die?
 * A: Yes. Defending alone it is 5-2 = 3 Might; Arcane Shift replays my unit, then deals 3 to theirs; 3 damage on a
 *    3-Might unit is lethal, so it is killed.
 * Rules: 710 (current Might), 323.5.3b (lethal damage check in cleanup), 359.3.e.8 (multi-instruction spell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORBIDDING_WASTE = "unl-210-219";
const ARCANE_SHIFT = "sfd-200-221";
const COST = { energy: 3, power: { rainbow: 1 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("waste", { controller: P2, def: FORBIDDING_WASTE, inert: false })
    .unit(P2, "waste", { might: 5, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, ARCANE_SHIFT, "shift")
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => (o.zone ?? o.key) === "base" || o.label === "base") ? "base" : undefined)]);
}

async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sentinel").might).toBe(5); // not defending yet
  await game.p1.move("scout", "waste");
  return game;
}

describe("Ruling 3488dd0ee6eefe84 — a lone defender at Forbidding Waste (5→3) dies to Arcane Shift's 3 damage", () => {
  test("state: once my Scout attacks, the Sentinel is defending alone → 3 Might; Arcane Shift is playable in the showdown on [scout, sentinel]", async () => {
    const game = await attack();
    expect(game.state("sentinel")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "shift")).toBe(true);
    await game.p1.cast("shift", { targets: ["scout", "sentinel"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", controller: P1 })]);
  });

  test("resolution: Scout is banished and replayed (to base, free), Sentinel takes 3 at 3 Might and is killed; Arcane Shift banishes itself", async () => {
    const game = await attack();
    await game.p1.cast("shift", { targets: ["scout", "sentinel"] });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p2.units("waste")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
