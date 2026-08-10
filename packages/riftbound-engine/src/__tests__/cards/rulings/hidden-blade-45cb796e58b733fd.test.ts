/**
 * Ruling 45cb796e58b733fd — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · 2+[order] · [Hidden][Action]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend): "If a buffed unit you control would die, you may pay [rainbow],
 *   exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   (+ Retreat ogn-104-298 as the Reaction that returns the unit to hand.)
 *
 * Q: If the Hidden-Bladed unit is returned to hand in response (not via The Boss), does its owner still draw 2?
 * A: No — on resolution the target is gone, so nothing is killed and no controller can be determined: no draw, and
 *    no re-targeting. Nuance: if instead The Boss replaces the death with a recall, the unit is still on the board and
 *    its controller DOES draw 2.
 * Rules: 359.3.e.14 (missing target → instruction not performed), 355.12 (no new target), 366/372 (replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn. P2 holds bf1 with X (3 might). P1: Hidden Blade + exactly [2][order]. P2: Retreat + [1] to cast it.
 * Both decks are auto-filled so draws are observable by hand size.
 */
function board(opts: { boss?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: opts.boss ? { rainbow: 1 } : {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target X" }, "X", opts.boss ? { buffed: true } : undefined)
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, RETREAT, "retreat");
  return opts.boss ? s.legend(P2, THE_BOSS, "boss") : s;
}

describe("Ruling 45cb796e58b733fd — Hidden Blade draws only if it can still find its unit on resolution", () => {
  test("baseline: unanswered, Hidden Blade kills X and X's controller (P2) draws 2; P1 draws nothing", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  test("P2 Retreats X to hand in response: Hidden Blade resolves with no target — nothing is killed and NOBODY draws 2", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length; // retreat + filler
    await game.p1.cast("blade", { targets: "X" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("retreat", { targets: "X" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("X")).toBe("hand"); // returned, not killed
    expect(game.p2.trash()).not.toContain("X");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    // P2's hand: − Retreat, + X, and NO two extra cards.
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.p2.hand()).toContain("X");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // P1 never draws off Hidden Blade either
    // No re-targeting prompt was ever raised.
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("nuance — The Boss replaces X's death with a recall to base: X stays on the board, so its controller (P2) still draws 2", async () => {
    const game = await board({ boss: true }).build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "X" });
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("X")).toMatchObject({ isBuffed: false, isExhausted: true, damage: 0 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("rainbow")).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
