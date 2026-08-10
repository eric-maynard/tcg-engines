/**
 * Ruling 18c185da36207fe7 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) · 4 Might, buffed by "Cleaver" — mapped to Cleave (ogn-004-298)
 *     · Action [1] "Give a unit [Assault 3] this turn." (+3 while attacking → 7).
 *
 * Q: If Smoke Screen is played on a unit that later gains Might (Cleave), does its reduction snapshot at
 *    resolution or track the unit's current Might?
 * A: Snapshotted at resolution. In response to Cleave (Hopeful still 4) it can only take 3 (4 → 1), and that -3 is
 *    what applies for the rest of the turn — Cleave then brings it to 4. Played after Cleave fully resolved
 *    (Hopeful 7) the full -4 applies → 3.
 * Rules: 336 (LIFO), "to a minimum of 1" reductions lock their amount when they resolve.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. P2 holds bf1 with a 1-Might Defender. P1: Noxus Hopeful (4) in base, Cleave in hand, [1].
 * P2: Smoke Screen in hand, [2] + 1 mind.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .unit(P1, "base", NOXUS_HOPEFUL, "hopeful")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { mind: 1 } });
}

/** Hopeful attacks bf1 (showdown, P1 has focus) and P1 casts Cleave on it. */
async function attackAndCleave(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("hopeful", "bf1");
  expect(game.state("hopeful").combatRole).toBe("attacker");
  expect(game.state("hopeful").might).toBe(4);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("cleave", { targets: "hopeful" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  return game;
}

describe("Ruling 18c185da36207fe7 — Smoke Screen's 'to a minimum of 1' reduction is snapshotted when it resolves", () => {
  test("Smoke Screen in RESPONSE to Cleave: it resolves first against a 4-Might Hopeful → 1 (only -3 taken)", async () => {
    const game = await attackAndCleave();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "hopeful" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "smoke"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves (LIFO)
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.state("hopeful").might).toBe(1);
    expect(game.state("hopeful").mightModifier).toBe(-3); // snapshotted: 4 → 1 is only -3
  });

  test("…then Cleave resolves: Assault 3 on the attacker adds to the snapshotted -3 → Hopeful fights at 4, not 1 and not 3", async () => {
    const game = await attackAndCleave();
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "hopeful" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("hopeful").grantedKeywords).toEqual(
      expect.arrayContaining([expect.objectContaining({ keyword: "Assault", value: 3 })]),
    );
    expect(game.state("hopeful").mightModifier).toBe(-3); // the reduction did NOT grow to -4
    expect(game.state("hopeful").might).toBe(4); // 4 base − 3 + 3
    expect(game.violations()).toEqual([]);
  });

  test("Smoke Screen AFTER Cleave fully resolved: Hopeful is 7 when it resolves → the full -4 applies → 3", async () => {
    const game = await attackAndCleave();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves uncontested
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("hopeful").might).toBe(7);
    // Focus passes to P2 in the showdown; P2 now plays Smoke Screen on an empty chain.
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("smoke", { targets: "hopeful" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("hopeful").mightModifier).toBe(-4);
    expect(game.state("hopeful").might).toBe(3); // 4 + 3 − 4
    expect(game.violations()).toEqual([]);
  });
});
