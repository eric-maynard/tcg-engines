/**
 * Ruling 044e538dfd66b0f6 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can you play Star-Crossed if you don't control a unit?
 * A: No. Both the friendly unit and the enemy unit are mandatory targets (no "up to"); with no friendly unit on the board the
 *    targeting requirement can't be met and the spell can't be played at all.
 * Rules: 355.8 (a spell without a legal target set can't be played), 355.10 (both named objects are targets), 402.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/** P1's turn with exactly [3][chaos] and Star-Crossed; P2 has two units on the board (base + bf1). P1's own units vary per case. */
function base() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe A" }, "foeA")
    .unit(P2, "base", { might: 2, name: "Foe B" }, "foeB")
    .hand(P1, STAR_CROSSED, "sc");
}

describe("Ruling 044e538dfd66b0f6 — Star-Crossed can't be played without a friendly unit on the board", () => {
  test("P1 controls NO unit (enemy units exist): Star-Crossed is not offered, and forcing it with only an enemy target is refused — nothing leaves the hand or the pool", async () => {
    const game = await base().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "sc")).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["foeA"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["foeA", "foeB"] }))).ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
    expect(game.zoneOf("foeA")).toBe("battlefield-bf1");
  });

  test("a friendly unit in P1's HAND or TRASH doesn't count — targets must be on the board", async () => {
    const game = await base().hand(P1, { cardType: "unit", energyCost: 9, might: 2, name: "In Hand" }, "inHand").trash(P1, "ogn-175-298", "inTrash").build();
    expect(game.p1.can("cast", "sc")).toBe(false);
  });

  test("control: the moment P1 controls a unit (anywhere on the board — base is fine) the spell is playable with the mandatory [friendly, enemy] pair and bounces both", async () => {
    const game = await base().unit(P1, "base", { might: 1, name: "Friend" }, "friend").build();
    expect(game.p1.can("cast", "sc")).toBe(true);
    const targets = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets");
    expect(targets?.required).toBe(true);
    expect(targets?.options).toEqual(
      expect.arrayContaining([
        ["friend", "foeA"],
        ["friend", "foeB"],
      ]),
    );
    expect((targets?.options ?? []).every((o) => Array.isArray(o) && o.length === 2)).toBe(true); // never a lone target
    await game.p1.cast("sc", { targets: ["friend", "foeA"] });
    await game.settle();
    expect(game.zoneOf("friend")).toBe("hand");
    expect(game.zoneOf("foeA")).toBe("hand");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
