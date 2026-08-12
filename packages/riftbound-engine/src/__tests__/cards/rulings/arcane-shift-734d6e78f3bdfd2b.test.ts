/**
 * Ruling 734d6e78f3bdfd2b — Arcane Shift (SFD-200 → sfd-200-221) · Spell · Mind/Chaos · [3][rainbow] · [Action]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield.
 *      Banish this."
 *
 * Q: I control both battlefields with a unit at each and my opponent attacks battlefield A. Can I Arcane Shift my unit
 *    away from battlefield B and play it straight to battlefield A during the showdown?
 * A: Yes. Arcane Shift has no location requirement for the friendly unit, and units may be played to any battlefield
 *    you control — the defender keeps control of the contested battlefield while the showdown is ongoing. The damage
 *    half only needs some enemy unit at a battlefield (the attacker qualifies).
 * Rules: 190.4.b (control frozen during a showdown there), 355.2.a (play destinations = base + battlefields you
 *        control), 355.1.b ([Action] playable in showdowns), 359.3.f (destination chosen as the play happens).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";

const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.key) : []);

/** P2's turn. P1 controls bf1 (Guard 4) and bf2 (Mage 3). P2's 5-Might Raider attacks bf1. P1 has Arcane Shift + [3][rainbow]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 3, name: "Mage" }, "mage")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, ARCANE_SHIFT, "shift");
}

/** P2 attacks bf1 and passes Focus so P1 may act inside the showdown. */
async function showdownAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 734d6e78f3bdfd2b — Arcane Shift can pull a unit off the other battlefield and drop it into the contested one", () => {
  test("the spell is castable in the showdown naming the bf2 Mage and the attacking Raider — the friendly half has no location requirement", async () => {
    const game = await showdownAtBf1();
    expect(game.p1.can("cast", "shift")).toBe(true);
    const pairs = (game.p1.option("cast", "shift")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(pairs).toContainEqual(["mage", "raider"]); // Mage sits at bf2, far from the combat
    await game.p1.cast("shift", { targets: ["mage", "raider"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift"]);
  });

  test("on resolution the Mage is banished and replayed, and the CONTESTED bf1 is among the destinations — the defender still controls it (190.4.b)", async () => {
    const game = await showdownAtBf1();
    await game.p1.cast("shift", { targets: ["mage", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    // the battlefield under attack is still "a battlefield you control"
    expect(pickKeys(d)).toContain("battlefield-bf1");
    expect(pickKeys(d)).toContain("base");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("mage")).toBe("bf1");
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.zoneOf("shift")).toBe("banishment");
  });

  test("the damage half lands on the chosen attacker, and the arriving Mage joins the defence: the Raider (5) takes 3 and then dies to 4+3 of defenders", async () => {
    const game = await showdownAtBf1();
    await game.p1.cast("shift", { targets: ["mage", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("battlefield-bf1");
    expect(game.state("raider").damage).toBe(3);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
