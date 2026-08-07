/**
 * Stormbringer — ogn-250-298 · Spell · Fury/Body · 6 energy + [rainbow][rainbow]
 *
 *   Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a
 *   battlefield, then move your unit there.
 *
 * Rules: 135.2.e.6.c ([C] on a two-domain card = either domain's power; the engine pays it from
 * `power.rainbow`), 155 / 159.2.a.1 (no Action/Reaction → your turn, open state only), spell
 * damage to "all enemy units at a battlefield" hits every enemy unit at the chosen battlefield and
 * nothing else; "then move your unit there" is an effect-move of the chosen base unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-250-298";

/** autoProcedures(false): observe the board after the spell resolves, before any combat at bf1 is run. */
function board() {
  return scenario()
    .autoProcedures(false)
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Big" }, "big")
    .unit(P1, "base", { might: 1, name: "Small" }, "small")
    .unit(P1, "bf2", { might: 2, name: "Afield" }, "afield")
    .unit(P2, "bf1", { might: 5, name: "E5" }, "e5")
    .unit(P2, "bf1", { might: 3, name: "E3" }, "e3")
    .unit(P2, "bf2", { might: 3, name: "Other" }, "other")
    .hand(P1, CARD, "sb");
}

describe("Stormbringer (ogn-250-298)", () => {
  test("cost: 6 energy + 2 rainbow deducted, spell resolves to trash; unaffordable with 1 rainbow or 5 energy", async () => {
    const game = await board().build();
    // rule 355.8: both the Might-reference base unit and the battlefield are chosen as it is played.
    await game.p1.cast("sb", { targets: ["big", "bf1"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sb", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("sb")).toBe("trash");
    const onePow = await scenario().resources(P1, { energy: 6, power: { rainbow: 1 } }).battlefield("bf1").unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "sb").build();
    expect(onePow.p1.can("cast", "sb")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { rainbow: 2 } }).battlefield("bf1").unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "sb").build();
    expect(low.p1.can("cast", "sb")).toBe(false);
  });

  test("no [Action]/[Reaction]: not castable on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "sb")).toBe(false);
  });

  test("'Choose a friendly unit in your base' — the cast asks for one of YOUR BASE units (big | small), not a unit afield", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "sb")?.fields ?? [];
    const unitChoices = fields.flatMap((f) => (f.options ?? []) as string[][]).flat();
    expect(unitChoices).toEqual(expect.arrayContaining(["big", "small"]));
    expect(unitChoices).not.toContain("afield");
    expect(unitChoices).not.toContain("e5");
  });

  test("deals damage equal to the chosen unit's Might (4) to ALL enemy units at the chosen battlefield only", async () => {
    // Choosing Big (4 Might) and bf1 → E3 (3) dies, E5 takes 4; units at bf2 untouched.
    const game = await board().build();
    await game.p1.cast("sb", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.zoneOf("e3")).toBe("trash");
    expect(game.state("e5").damage).toBe(4);
    expect(game.locationOf("e5")).toBe("bf1");
    expect(game.state("other").damage).toBe(0);
    expect(game.state("afield").damage).toBe(0);
  });

  test("'…then move your unit there' — the chosen base unit ends up at that battlefield", async () => {
    // After the damage, Big moves from base to bf1 (Small stays home).
    const game = await board().build();
    await game.p1.cast("sb", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.locationOf("small")).toBe("base");
  });
});
