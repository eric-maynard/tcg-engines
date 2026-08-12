/**
 * Ruling e9ad0e32ca90b222 — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … banish a unit … that has Might up to 1 more
 *    than the killed unit and play it, ignoring its cost."
 *   × Vayne, Hunter (OGN-035 → ogn-035-298) 2 [Might], "[Assault 3] (+3 [Might] while I'm an attacker.)"
 *
 * Q: Does Might granted by [Assault] count towards Baited Hook's threshold?
 * A: Yes. Baited Hook reads the unit's CURRENT Might when it is killed, and [Assault] is a continuous modifier
 *    while the unit carries the Attacker designation — so an attacking Vayne is killed as a 5, giving a 6 ceiling.
 *    With no Attacker designation the bonus is simply absent and she is a 2 (ceiling 3).
 * Rules: 807.1.c/d.1 ([Assault] while Attacker), 715 (current Might), FAQ #8885 (Hook reads current Might).
 * Note: the Attacker designation is seeded here — in live play it only exists inside a showdown, where a plain
 *       activated gear ability is unavailable (rule 145.2; see ruling f9653b85ffada0ec).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const VAYNE = "ogn-035-298"; // 2 Might, [Assault 3]

const SIX = { cardType: "unit", energyCost: 6, might: 6, name: "Six-Might Beast" } as const;
const THREE = { cardType: "unit", energyCost: 3, might: 3, name: "Three-Might Scout" } as const;
const ONE = { cardType: "unit", energyCost: 1, might: 1, name: "One-Might Poro" } as const;

/** P1's turn; Vayne is in base, optionally already designated an Attacker. Deck top: a 6, a 3 and a 1. */
function board(asAttacker: boolean) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", VAYNE, "vayne", asAttacker ? ({ combatRole: "attacker" } as Record<string, unknown>) : undefined)
    .deck(P1, [SIX, THREE, ONE, THREE, ONE, SIX], ["six", "three", "one", "three2", "one2", "below"]);
}

async function hookVayne(asAttacker: boolean): Promise<string[]> {
  const game = await board(asAttacker).build();
  await game.p1.activate("hook", 0, { targets: "vayne" });
  await game.settle();
  const d = game.decision() as Extract<Decision, { kind: "pick" }> | null;
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return (d?.options ?? []).map((o) => o.card ?? o.key);
}

describe("Ruling e9ad0e32ca90b222 — Baited Hook's ceiling is the killed unit's CURRENT Might, [Assault] included", () => {
  test("premise: Vayne is a printed 2 who becomes a 5 while she carries the Attacker designation", async () => {
    const plain = await board(false).build();
    expect(plain.state("vayne")).toMatchObject({ baseMight: 2, combatRole: null, might: 2 });
    const attacking = await board(true).build();
    expect(attacking.state("vayne")).toMatchObject({ baseMight: 2, combatRole: "attacker", might: 5 });
  });

  test("killed as an ATTACKER (5 Might) the ceiling is 6 — the 6-Might Beast is on offer", async () => {
    const offered = await hookVayne(true);
    expect(offered).toContain("six");
    expect(offered).toContain("three");
  });

  test("killed with no Attacker designation (2 Might) the ceiling is 3 — the Beast is out of range", async () => {
    const offered = await hookVayne(false);
    expect(offered).not.toContain("six");
    expect(offered).toContain("three"); // 3 ≤ 2 + 1
    expect(offered).toContain("one");
  });

  test("taking the 6-Might Beast off the attacking Vayne actually plays it, ignoring its cost", async () => {
    const game = await board(true).build();
    await game.p1.activate("hook", 0, { targets: "vayne" });
    await game.settle();
    await game.p1.pick("six");
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("trash");
    expect(game.zoneOf("six")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // only the Hook's own [1][order]
    expect(game.violations()).toEqual([]);
  });
});
