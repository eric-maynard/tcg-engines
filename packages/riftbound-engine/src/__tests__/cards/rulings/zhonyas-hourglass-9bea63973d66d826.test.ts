/**
 * Ruling 9bea63973d66d826 — Zhonya's Hourglass (OGN-077 → ogn-077-298, Gear) "[Hidden] · If a
 *   friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × a second copy of itself.
 *
 * Q: If two Zhonya's Hourglasses are in play, do they both trigger when a single unit dies?
 * A: No. Zhonya's does not trigger — it REPLACES the death. The controller picks which one applies;
 *    that copy kills itself instead of the unit dying, and because there is no longer a death for
 *    the second copy to replace, the second copy does nothing and stays on the board.
 * Rules: 370 (replacement effects modify an event as it happens), 370.2 (an event replaced once is
 *        no longer the original event — a further replacement has nothing to apply to),
 *        372 (with several applicable replacements the affected object's controller orders them).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** [Action] "Deal 9 to a unit." — plenty to kill the 4-Might Hero. */
const BOLT9 = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 9",
  rulesText: "[Action] Deal 9 to a unit.",
  timing: "action",
} as const;

/** P2's turn; P2 shoots P1's Hero at bf1. `copies` = how many Hourglasses P1 has on the board. */
const board = (copies: number) => {
  let s = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Hero" }, "hero")
    .hand(P2, BOLT9, "bolt");
  for (let i = 0; i < copies; i++) {
    s = s.gear(P1, ZHONYAS, `hg${i + 1}`);
  }
  return s;
};

describe("Ruling 9bea63973d66d826 — a replaced death leaves nothing for the second Hourglass", () => {
  test("baseline with ONE copy: it kills itself instead, and the Hero is healed, exhausted and recalled", async () => {
    const game = await board(1).build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hg1")).toBe("trash");
    expect(game.zoneOf("hero")).toBe("base"); // recalled, not dead
    expect(game.state("hero")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("with TWO copies the unit's controller is asked which one applies (rule 372) — it is a choice, not two triggers", async () => {
    const game = await board(2).build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.settle(); // stops at the unanswered replacement question
    expect(game.decision()).toMatchObject({
      kind: "pick",
      seat: P1, // the dying unit's controller chooses
      semantics: "replacement-order",
    });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["hg1", "hg2"]);
  });

  test("exactly ONE copy is spent — the other is untouched and the Hero still survives", async () => {
    const game = await board(2).build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.settle();
    await game.p1.pick("hg1"); // hg1 applies first
    await game.settle();
    expect(game.zoneOf("hg1")).toBe("trash");
    expect(game.zoneOf("hg2")).toBe("base"); // nothing left for it to replace
    expect(game.zoneOf("hero")).toBe("base");
    expect(game.state("hero")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });

  test("naming the other copy first spends that one instead — the choice is real", async () => {
    const game = await board(2).build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.settle();
    await game.p1.pick("hg2");
    await game.settle();
    expect(game.zoneOf("hg2")).toBe("trash");
    expect(game.zoneOf("hg1")).toBe("base");
    expect(game.zoneOf("hero")).toBe("base");
  });

  test("the surviving copy is still live for a LATER death — it was never used up", async () => {
    const game = await board(2).hand(P2, BOLT9, "bolt2").build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.settle();
    await game.p1.pick("hg1");
    await game.settle();
    expect(game.zoneOf("hg2")).toBe("base");
    expect(game.zoneOf("hero")).toBe("base");
    await game.p2.cast("bolt2", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hg2")).toBe("trash"); // now the second one pays, unprompted (only one left)
    expect(game.zoneOf("hero")).toBe("base"); // and the Hero is saved again
    expect(game.violations()).toEqual([]);
  });
});
