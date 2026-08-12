/**
 * Ruling 32f25995c69691bb — (rules question) does attaching an Equipment count as choosing the unit?
 *   Stand-ins: Long Sword (sfd-022-221) "[Equip] [fury]" · Spirit Wheel (sfd-144-221) Gear —
 *   "When you choose a friendly unit, you may pay [1] and exhaust this to draw 1."
 *
 * Q: Does attaching an Equipment count as selecting/choosing the unit it goes on?
 * A: Yes — equipping DOES choose the unit. (The older Comprehensive Rules said attaching did not count
 *    as selecting; the Spirit Forged CR reversed that, rule 744.1.c.2.)
 * Rules: 744.1.c.2 (attaching chooses), 818.1.b.1 (the unit an [Equip] names is a target),
 *        383.4.b / 355.14.d (a Targeting Effect trigger sees the choice), 383.3.a/b (a leading
 *        "you may pay … to" is decided and paid at Finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LONG_SWORD = "sfd-022-221";
const SPIRIT_WHEEL = "sfd-144-221";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .gear(P1, LONG_SWORD, "sword")
    .gear(P1, SPIRIT_WHEEL, "wheel")
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire");
}

describe("Ruling 32f25995c69691bb — equipping chooses the unit", () => {
  test("activating [Equip] fires a 'when you choose a friendly unit' trigger — Spirit Wheel offers its optional cost", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.prompt).toMatch(/Spirit Wheel/i);
  });

  test("paying it (1 energy + exhaust the Wheel) draws a card; the [Equip] then resolves and attaches", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("wheel").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("declining costs nothing and the attach still happens — the choice was made either way", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.p1.no();
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("wheel").isExhausted).toBe(false);
    expect(game.state("sword").attachedTo).toBe("squire");
  });

  test("control: with no unit chosen — nothing equipped this turn — Spirit Wheel never triggers", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.state("wheel").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
