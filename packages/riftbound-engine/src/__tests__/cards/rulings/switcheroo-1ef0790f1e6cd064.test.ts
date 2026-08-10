/**
 * Ruling 1ef0790f1e6cd064 — Switcheroo (SFD-145 → sfd-145-221) · Action [2][chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 · "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: My GA-wearing unit gets Switcheroo'd; when GA later saves and recalls it, does it go back to normal Might or
 *    stay at the swapped amount minus GA's +1?
 * A: It stays swapped, minus 1. Switcheroo applies a fixed ±X modifier for the turn computed from CURRENT Might
 *    (gear included); GA dying drops its +1; the recall does not reset Might. Example: 5 (4 + GA) swapped with a
 *    2 → −3 → 2; GA dies → 1; stays 1 in base until the swap expires at end of turn.
 * Rules: 433 (Swap = ±difference modifiers), 453 (Recall doesn't reset), 366 ff. (replacement), FAQ #9335/#8433.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — Deal 3 to a unit at a battlefield (the "would die" event)

/**
 * P1's turn. At bf1: P1's "Mine" (base 4, wearing Guardian Angel → 5) and P2's "Small" (2). P1 holds Switcheroo and
 * Hextech Ray with exactly [3] + chaos×2 + fury.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 2, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Mine" }, "mine", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "mine" }, owner: P1, zone: "bf1" })
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .hand(P1, SWITCHEROO, "switcheroo")
    .hand(P1, HEXTECH_RAY, "ray");
}

async function swapped(): Promise<Game> {
  const game = await board().build();
  expect(game.state("mine")).toMatchObject({ attachments: ["ga"], baseMight: 4, might: 5 });
  expect(game.state("small").might).toBe(2);
  await game.p1.cast("switcheroo", { targets: ["mine", "small"] });
  await game.settle();
  expect(game.zoneOf("switcheroo")).toBe("trash");
  return game;
}

describe("Ruling 1ef0790f1e6cd064 — the Switcheroo modifier survives Guardian Angel's save; only GA's +1 is lost", () => {
  test("the FAQ example: Mine at 5 (4 + GA) swapped with a 2 → a fixed −3 modifier → Mine 2, Small 5", async () => {
    const game = await swapped();
    expect(game.state("mine").might).toBe(2);
    expect(game.state("mine").mightModifier).toBe(-3);
    expect(game.state("small").might).toBe(5);
  });

  test("Mine (2) takes 3 and would die → GA is killed instead; Mine is healed, exhausted, recalled — and sits at 1 (4 − 3 swap − GA's lost +1… i.e. 2 − 1), NOT back at 4", async () => {
    const game = await swapped();
    await game.p1.cast("ray", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine")).toMatchObject({ attachments: [], damage: 0, isExhausted: true });
    expect(game.state("mine").mightModifier).toBe(-3); // the recall did not clear the swap
    expect(game.state("mine").might).toBe(1);
    expect(game.state("small").might).toBe(5); // the other half of the swap is untouched
    expect(game.violations()).toEqual([]);
  });

  test("the swap expires at end of turn: next turn Mine is its plain 4 (no GA any more), Small back to 2", async () => {
    const game = await swapped();
    await game.p1.cast("ray", { targets: "mine" });
    await game.settle();
    expect(game.state("mine").might).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mine")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("small")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
