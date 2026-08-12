/**
 * Ruling bb4dbb0e5e464d81 — Siphon Power (OGN-266 → ogn-266-298) · Spell · Mind/Order · [2][rainbow] · [Reaction]
 *   "Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there
 *    -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can Siphon Power affect all the Recruit tokens on a battlefield?
 * A: Yes. The spell chooses a BATTLEFIELD, and every friendly unit at that location gets +1 when it
 *    resolves. Token units and card units are treated exactly the same.
 * Rules: 355.10.d (a criteria-based "units there" is not individually targeted), 186 (a token is a unit like
 *        any other), 105.2 (a "-1 to a minimum of 1" floor).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SIPHON_POWER = "ogn-266-298";
const RECRUIT = "ogn-271-298"; // 1-Might Recruit unit token

/** P1's turn. bf1 holds two P1 Recruit tokens, a P1 card unit and two P2 units; bf2 has a bystander. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", RECRUIT, "tok1")
    .unit(P1, "bf1", RECRUIT, "tok2")
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 1, name: "Runt" }, "runt")
    .unit(P1, "bf2", { might: 3, name: "Far Ally" }, "far")
    .hand(P1, SIPHON_POWER, "siphon");
}

describe("Ruling bb4dbb0e5e464d81 — Siphon Power boosts every friendly unit at the chosen battlefield, tokens included", () => {
  test("nuance: the spell chooses a BATTLEFIELD — the play offers the battlefields, not the units", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "siphon")?.fields?.find((f) => f.name === "targets");
    expect(field).toMatchObject({ kind: "cards", max: 1, min: 1, required: true });
    expect(field?.options).toEqual([["bf1"], ["bf2"]]);
  });

  test("ruling: ALL friendly units at bf1 get +1 — both Recruit tokens as well as the card unit", async () => {
    const game = await board().build();
    expect(game.state("tok1").isToken).toBe(true);
    expect(game.state("tok2").isToken).toBe(true);
    expect(game.state("ally").isToken).toBe(false);

    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();

    expect(game.state("tok1").might).toBe(2);
    expect(game.state("tok2").might).toBe(2);
    expect(game.state("ally").might).toBe(4); // tokens and cards alike
  });

  test("ruling: enemy units there take -1, floored at 1 Might", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.state("foe").might).toBe(3);
    expect(game.state("runt").might).toBe(1); // 1 - 1 would be 0; the floor holds it at 1
  });

  test("the effect is scoped to the chosen battlefield: a friendly unit at bf2 is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.state("far").might).toBe(3);
  });

  test("it lasts only this turn", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.state("tok1").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("tok1").might).toBe(1);
    expect(game.state("foe").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
