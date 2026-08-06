/**
 * Unlicensed Armory — ogn-023-298 · Gear · Fury · 2 energy
 *
 *   Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die
 *   this turn, you may pay [fury] to heal it, exhaust it, and recall it
 *   instead. (Send it to base. This isn't a move.)
 *
 * Rules: 204.2 (additional/activation costs), 369–373 (replacement effects),
 * 454 (recalls).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-023-298";
const FILLER = "ogn-175-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

function board(fury = 1) {
  return scenario()
    .resources(P1, { energy: 0, power: { fury } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "armory")
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "bf1", { might: 5 }, "wall")
    .hand(P1, FILLER, "junk")
    .hand(P1, BOLT, "bolt");
}

describe("Unlicensed Armory (ogn-023-298)", () => {
  test("playing the gear costs 2 energy and puts it in base", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "armory").build();
    await game.p1.play("armory");
    await game.settle();
    expect(game.zoneOf("armory")).toBe("base");
    expect(game.p1.energy()).toBe(1);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "armory").build();
    expect(poor.p1.can("play", "armory")).toBe(false);
  });

  test("activation cost: discard 1 + exhaust; the ability goes on the chain choosing a friendly unit", async () => {
    const game = await board().build();
    expect(game.p1.option("activate", "armory")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["ally"]]);
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "armory", controller: P1 })]);
    expect(game.p1.power("fury")).toBe(1); // [fury] is NOT paid on activation
    await game.settle();
    expect(game.chain()).toHaveLength(0);
  });

  test("not activatable with no card to discard, or when already exhausted", async () => {
    const noHand = await scenario().gear(P1, CARD, "armory").unit(P1, "base", { might: 2 }, "ally").build();
    expect(noHand.p1.can("activate", "armory")).toBe(false);
    const tapped = await scenario().gear(P1, CARD, "armory", { exhausted: true }).unit(P1, "base", { might: 2 }, "ally").hand(P1, FILLER, "junk").build();
    expect(tapped.p1.can("activate", "armory")).toBe(false);
  });

  test.failing("BUG: when the chosen unit would die to a spell, you may pay [fury] → it is healed, exhausted and stays in base", async () => {
    // Expected: a yes/no (pay [fury]) prompt; on yes fury goes 1→0, damage cleared, unit exhausted in base.
    // Actual: death is replaced silently with no prompt, no fury paid, damage left at 3 and the unit ready.
    const game = await board().build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
  });

  test.failing("BUG: when the chosen unit would die in combat, paying [fury] recalls it to base healed and exhausted (rule 454)", async () => {
    // Expected: ally (2) attacks wall (5), takes lethal → replacement offers pay [fury] → ally in base, 0 damage.
    // Actual: the replacement is not consulted on the combat-death path; ally goes to trash.
    const game = await board().build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
  });

  test.failing("BUG: without [fury] to pay, the unit dies normally ('you may pay [fury] … instead')", async () => {
    // Expected: the replacement is conditional on paying [fury]; with none, ally is killed.
    // Actual: the engine applies the replacement unconditionally and ally survives.
    const game = await board(0).build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("'this turn': the shield expires — next turn the unit dies normally", async () => {
    const game = await board().active(P1).hand(P2, BOLT, "bolt2").build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("bolt2", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });
});
