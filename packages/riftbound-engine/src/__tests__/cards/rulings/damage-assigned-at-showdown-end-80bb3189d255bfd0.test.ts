/**
 * Ruling 80bb3189d255bfd0 — (no specific card) when combat damage recipients are chosen.
 *
 * Q: When I attack a battlefield, can I change where my damage is going after the opponent reacts to
 *    pump the unit I was aiming at?
 * A: There is nothing to change: you do not say where your damage goes until the END of the showdown.
 *    Declare the attack, both players use actions and reactions, and only once everything has resolved
 *    and both pass Focus is the total Might assigned — using the Might the units have at that moment.
 * Rules: 465.2 ("when the Showdown closes … using their current Might"), 465.2.c (assignment order),
 *        465.2.c.3/4 (lethal in full, no excess), 343 (the Focus cycle runs first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Pass Focus for whoever is being asked until the combat damage assignment is on the table. */
async function passFocusToAssignment(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind === "distribute") {
      return;
    }
    if (d.kind !== "action") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** [Reaction] "Give a unit +3 [Might] this turn." — the pump the question is about. */
const BOLSTER = {
  abilities: [
    { effect: { amount: 3, target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Bolster",
  rulesText: "[Reaction] Give a unit +3 [Might] this turn.",
  timing: "reaction",
} as const;

/** [Action] "Deal 1 to a unit." — something for the attacker to do during the showdown. */
const JAB = {
  abilities: [
    {
      effect: { amount: 1, target: { location: "battlefield", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Jab",
  rulesText: "[Action] Deal 1 to a unit at a battlefield.",
  timing: "action",
} as const;

/** P1's 5-Might Raider attacks bf1, where P2 has two 2-Might Guards. P2 holds the pump. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard A" }, "guardA")
    .unit(P2, "bf1", { might: 2, name: "Guard B" }, "guardB")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, JAB, "jab")
    .hand(P2, BOLSTER, "bolster");
}

describe("Ruling 80bb3189d255bfd0 — damage recipients are named at the end of the showdown, not when you attack", () => {
  test("declaring the attack asks nothing about damage: no distribute prompt exists while actions are still legal", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.p1.cast("jab", { targets: "guardA" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Jab resolves; the showdown is still open
    expect(game.state("guardA").damage).toBe(1);
    expect(game.decision()?.kind).not.toBe("distribute"); // still nothing assigned
    expect(game.violations()).toEqual([]);
  });

  test("the opponent's pump lands BEFORE assignment, and the assignment then uses the new Might", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("bolster", { targets: "guardA" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // the pump resolves
    expect(game.state("guardA").might).toBe(5);
    expect(game.decision()?.kind).not.toBe("distribute"); // still no assignment
    await passFocusToAssignment(game);
    // Only now: 5 damage against a 5-Might Guard A and a 2-Might Guard B.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("consequence: with Guard A pumped to 5 the attacker can no longer kill both — the pump changed the outcome, not the aim", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("bolster", { targets: "guardA" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await passFocusToAssignment(game);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    await game.p1.distribute({ guardA: 5 }); // all-in on the pumped one
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("battlefield-bf1"); // it survives; both could not be killed
    expect(game.violations()).toEqual([]);
  });

  test("control — left alone (no pump) the same 5 Might kills both 2-Might Guards and conquers", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    await game.p1.distribute({ guardA: 3, guardB: 2 });
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
