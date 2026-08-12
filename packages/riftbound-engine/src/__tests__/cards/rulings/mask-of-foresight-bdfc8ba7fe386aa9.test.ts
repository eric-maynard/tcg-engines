/**
 * Ruling bdfc8ba7fe386aa9 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · Unit · 3 [Might] · "When I attack or defend, give an enemy unit
 *     here -2 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does the Mask trigger go on the initial Chain with the "when I attack" / "when I defend" triggers, and what is
 *    the resolution order when a 2-[Might] unit with 2× Mask attacks Ahri?
 * A: The Mask is a "when I attack / when I defend" trigger like any other: all of them go on the one initial Chain,
 *    attack-side first and defend-side on top, so the DEFENDER's trigger resolves first (LIFO). Attacking Ahri:
 *    Ahri's -2 lands first (2 → 1, floored), then the two Masks (+1, +1) → 3 [Might], a trade with the 3-[Might] Ahri.
 * Rules: 383.3.d (the controller orders their own simultaneous triggers), 336/337 (Chain is LIFO),
 *        344 (attack triggers are placed before defend triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const AHRI_INQUISITIVE = "ogn-119-298";

/** P1's 2-[Might] attacker, wearing two Masks' worth of triggers, walks into Ahri's battlefield. */
function attackingAhri() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AHRI_INQUISITIVE, "ahri")
    .unit(P1, "base", { might: 2, name: "Atk" }, "atk")
    .gear(P1, MASK_OF_FORESIGHT, "mask1")
    .gear(P1, MASK_OF_FORESIGHT, "mask2");
}

/** Mirror: Ahri attacks a lone 2-[Might] defender of P1's who is covered by two Masks. */
function defendingAgainstAhri() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Def" }, "def")
    .unit(P2, "base", AHRI_INQUISITIVE, "ahri")
    .gear(P1, MASK_OF_FORESIGHT, "mask1")
    .gear(P1, MASK_OF_FORESIGHT, "mask2");
}

describe("Ruling bdfc8ba7fe386aa9 — Mask of Foresight is an attack/defend trigger on the same initial Chain", () => {
  test("one move builds the whole Chain: both Masks (attack side) below, Ahri's defend trigger on top", async () => {
    const game = await attackingAhri().build();
    await game.p1.move("atk", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask1", "mask2", "ahri"]);
    expect(game.chain()[2]).toMatchObject({ controller: P2, targets: ["atk"], triggered: true });
    expect(game.state("atk").might).toBe(2); // nothing has resolved yet
  });

  test("P1 is offered an order for their two simultaneous Mask triggers (383.3.d — soft, defaultable)", async () => {
    const game = await attackingAhri().build();
    await game.p1.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1, timing: "FIN" });
    expect(await game.acceptTriggerOrder()).toBe(true);
  });

  test("resolution is LIFO — Ahri's -2 first (2 → 1), then +1, +1 from the Masks: the attacker ends on 3", async () => {
    const game = await attackingAhri().build();
    await game.p1.move("atk", "bf1");
    await game.acceptTriggerOrder();
    await game.acting().pass();
    await game.acting().pass(); // Ahri's trigger
    expect(game.state("atk").might).toBe(1); // -2 floored at 1
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask1", "mask2"]);
    await game.acting().pass();
    await game.acting().pass(); // second Mask
    expect(game.state("atk").might).toBe(2);
    await game.acting().pass();
    await game.acting().pass(); // first Mask
    expect(game.chain()).toEqual([]);
    expect(game.state("atk").might).toBe(3);
  });

  test("…so 3 meets Ahri's 3 and they trade", async () => {
    const game = await attackingAhri().build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("mirror — defending, the Masks are the defend side and now sit on TOP, resolving before Ahri's attack trigger", async () => {
    const game = await defendingAgainstAhri().build();
    await game.p2.move("ahri", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri", "mask1", "mask2"]);
    await game.acceptTriggerOrder();
    await game.acting().pass();
    await game.acting().pass();
    await game.acting().pass();
    await game.acting().pass(); // both Masks
    expect(game.state("def").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri"]);
    await game.acting().pass();
    await game.acting().pass(); // Ahri last
    expect(game.state("def").might).toBe(2);
  });
});
