/**
 * Ruling 4aa1e2930c994f46 — Singularity (OGN-105 → ogn-105-298) · Spell · Mind · 6+[mind][mind]
 *   "Deal 6 to each of up to two units."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · "If I would die, kill Guardian Angel instead. Heal me,
 *   exhaust me, and recall me."
 *   (+ Soaring Scout ogn-216-298 as the equipped unit: its [Deathknell] is the tell-tale for "did a kill happen?")
 *
 * Q: Does Singularity kill a unit wearing Guardian Angel?
 * A: No. The 6 damage is lethal, but Guardian Angel's replacement effect swaps the death for: Guardian Angel is killed,
 *    the unit is healed, exhausted and recalled to base. The unit never goes to the trash, so no "kill" of it occurred.
 * Rules: 366.1 / 372 (replacement, "instead"), 428.1 (killing = board → trash), 428.5.c (attribution only if a kill happens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const SOARING_SCOUT = "ogn-216-298"; // 1 Might, [Deathknell] — Channel 1 rune exhausted.

/**
 * P2's turn with exactly [6][mind][mind] and Singularity in hand. P1 controls bf1 with Soaring Scout wearing Guardian
 * Angel (damaged 0, ready) plus a plain 2-might Buddy (second target: it simply dies).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SOARING_SCOUT, "scout", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "scout" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .hand(P2, SINGULARITY, "sing");
}

describe("Ruling 4aa1e2930c994f46 — Guardian Angel replaces the death Singularity would cause", () => {
  test("premise: Guardian Angel is attached to the Scout at bf1", async () => {
    const game = await board().build();
    expect(game.state("scout").attachments).toEqual(["ga"]);
    expect(game.state("ga").attachedTo).toBe("scout");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.p2.can("cast", "sing")).toBe(true);
  });

  test("Singularity deals 6 to Scout (and Buddy): Buddy dies, but the Scout does NOT — Guardian Angel is killed instead and the Scout is healed, exhausted and recalled to base", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p2.cast("sing", { targets: ["scout", "buddy"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash"); // an ordinary lethal 6
    // The replacement: gear to trash, unit survives in base, no damage, exhausted.
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ attachments: [], damage: 0, isExhausted: true });
    expect(game.p1.trash()).not.toContain("scout");
    // No kill of the Scout took place → its Deathknell never triggered (no rune channeled), nothing on the chain.
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same Scout WITHOUT Guardian Angel simply dies to Singularity (and its Deathknell fires)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SOARING_SCOUT, "scout")
      .hand(P2, SINGULARITY, "sing")
      .build();
    const runesBefore = game.p1.runes().length;
    await game.p2.cast("sing", { targets: ["scout"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
  });
});
