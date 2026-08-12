/**
 * Ruling 4008c4c005e5e322 — Switcheroo (SFD-145 → sfd-145-221) · [Action] · [2][chaos][chaos]
 *   "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: If I Switcheroo a unit that has a buff, does it keep the buff / the +1 after the swap?
 * A: The buff object never moves — it stays on the unit that had it. What is swapped is the two units'
 *    CURRENT Might, buff included: Switcheroo applies a fixed Might modifier to each unit for the turn so
 *    the totals trade places. So the buffed unit still "has" its buff (and would lose that +1 later if the
 *    buff is spent or removed), while its Might now reads the other unit's number.
 * Rules: 355.5 (two-role targets), 745 (buffs are objects on the unit, not part of a Might value),
 *        421 (a Might modifier lasting "this turn"), 317.2 (it lapses in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";

/** P1's turn. At bf1: P1's buffed Squire (2 printed, buffed → 3) and P2's Ogre (5). P1 holds Switcheroo. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { buffed: true })
    .unit(P2, "bf1", { might: 5, name: "Ogre" }, "ogre")
    .hand(P1, SWITCHEROO, "switch");
}

describe("Ruling 4008c4c005e5e322 — Switcheroo trades current Might; the buff object stays put", () => {
  test("premise: the buff is worth +1, so the Squire's CURRENT Might is 3 against the Ogre's 5", async () => {
    const game = await board().build();
    expect(game.state("squire")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
    expect(game.state("ogre")).toMatchObject({ isBuffed: false, might: 5 });
  });

  test("ruling: after the swap the Squire reads 5 and the Ogre reads 3 — the buffed value was the one traded", async () => {
    const game = await board().build();
    await game.p1.cast("switch", { targets: ["squire", "ogre"] });
    await game.settle();
    expect(game.zoneOf("switch")).toBe("trash");
    expect(game.state("squire").might).toBe(5);
    expect(game.state("ogre").might).toBe(3);
  });

  test("the buff itself did NOT move: the Squire still has it, the Ogre still has none", async () => {
    const game = await board().build();
    await game.p1.cast("switch", { targets: ["squire", "ogre"] });
    await game.settle();
    expect(game.state("squire").isBuffed).toBe(true);
    expect(game.state("ogre").isBuffed).toBe(false);
    expect(game.state("squire").baseMight).toBe(2); // printed Might is untouched — this is a modifier
    expect(game.state("ogre").baseMight).toBe(5);
  });

  test("'this turn': the fixed modifiers lapse at end of turn and both units return to 3 and 5", async () => {
    const game = await board().build();
    await game.p1.cast("switch", { targets: ["squire", "ogre"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("squire")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("ogre")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("both units must be at the SAME battlefield: a unit elsewhere is not a legal partner", async () => {
    const game = await board()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Far" }, "far")
      .build();
    const pairs = (game.p1.option("cast", "switch")?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => JSON.stringify(v));
    expect(pairs.some((p) => p.includes("far"))).toBe(false);
    expect((await game.p1.try((p) => p.cast("switch", { targets: ["squire", "far"] }))).ok).toBe(false);
  });
});
