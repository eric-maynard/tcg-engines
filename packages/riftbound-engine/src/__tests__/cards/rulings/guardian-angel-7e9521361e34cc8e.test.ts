/**
 * Ruling 7e9521361e34cc8e — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · Calm · [2] · +1 [Might]
 *   "[Equip] [calm] ([calm]: Attach this to a unit you control.)
 *    If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: How do you equip Guardian Angel?
 * A: With its [Equip] activated ability: pay the cost printed next to Equip ([calm]), choose a unit you control,
 *    and the gear attaches to it. You cannot activate Equip while it is already attached to something.
 * Rules: 818.1 (Equip is an activated ability on gear), 818.2 (the unit becomes Equipped),
 *        135.4 (an attached card's printed rules text goes inactive; its equipment-granted ability stays on).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn, one [calm] in the pool (Equip's whole cost) and two possible bearers. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { power: { calm: 1 } })
    .gear(P1, GUARDIAN_ANGEL, "ga")
    .unit(P1, "base", { might: 4, name: "Hero" }, "hero")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire");
}

/** Every "<gear> -> <bearer>" pair the Equip ability currently offers. */
const equipPairs = (game: Game) =>
  (game.p1.option("equipCard")?.variants ?? []).map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`).toSorted();

describe("Ruling 7e9521361e34cc8e — Guardian Angel is equipped with its [Equip] activated ability", () => {
  test("an unattached Guardian Angel offers Equip, and its cost is the printed [calm]", async () => {
    const game = await board().build();
    expect(game.state("ga").attachedTo).toBeUndefined();
    expect(game.p1.can("equipCard")).toBe(true);
    expect(equipPairs(game)).toEqual(["ga->hero", "ga->squire"]);
    expect(game.p1.power("calm")).toBe(1);
  });

  test("activating it attaches the gear to the chosen unit and spends the [calm]", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "ga", unitId: "hero" });
    await game.settle();
    expect(game.state("ga").attachedTo).toBe("hero");
    expect(game.state("hero").attachments).toContain("ga");
    expect(game.p1.power("calm")).toBe(0);
  });

  test("the bearer is Equipped and picks up the gear's +1 [Might]", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "ga", unitId: "hero" });
    await game.settle();
    expect(game.state("hero")).toMatchObject({ baseMight: 4, might: 5 });
    expect(game.state("squire").might).toBe(2); // only the chosen unit
  });

  test("you cannot Equip it again while it is attached — no second bearer", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "ga", unitId: "hero" });
    await game.settle();
    await game.p1.do("addResources", { playerId: P1, power: { calm: 1 } });
    expect(equipPairs(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "ga", unitId: "squire" }))).ok).toBe(false);
    expect(game.state("ga").attachedTo).toBe("hero");
    expect(game.violations()).toEqual([]);
  });
});
