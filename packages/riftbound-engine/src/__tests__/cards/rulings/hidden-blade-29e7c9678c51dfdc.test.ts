/**
 * Ruling 29e7c9678c51dfdc — Hidden Blade (OGN-213 → ogn-213-298) [Hidden][Action] · 2 + [order] "Kill a unit at a battlefield.
 *   Its controller draws 2."
 *   × Retreat (OGN-104 → ogn-104-298) [Reaction] · 1 "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal it, exhaust it, recall it."
 *   × The Boss (Sett legend, ogn-269-298) — same kind of death replacement (mentioned as an equivalent case).
 *
 * Q: I Hidden Blade a unit; its controller Retreats it in response. Do they still draw 2?
 * A: No — when Hidden Blade resolves its target is gone (illegal), so nothing is killed and nobody draws. Contrast: if the
 *    target is legal at resolution but its death is REPLACED (Zhonya's / Sett), the controller still draws 2 — the target
 *    was legal; the death was merely replaced, not "undone".
 * Rules: 359.3.f.2 (target legality re-checked at resolution; dependent "its controller" instruction not performed),
 *        372/373 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RETREAT = "ogn-104-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn: Hidden Blade in hand (2 + order). P2 holds bf1 with a 3-Might Mark; Retreat in hand (1); known deck top d1, d2. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Mark" }, "mark")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, RETREAT, "retreat")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

describe("Ruling 29e7c9678c51dfdc — Retreat in response blanks Hidden Blade entirely (no kill, no draw)", () => {
  test("Retreat resolves first: Mark → P2's hand and P2 channels 1 rune exhausted; Hidden Blade then has no legal target — nothing dies and P2 draws NOTHING", async () => {
    const game = await board().build();
    const runesBefore = game.p2.runes().length;
    await game.p1.cast("blade", { targets: "mark" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("retreat", { targets: "mark" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("mark")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runesBefore + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("hand");
    expect(game.p2.hand()).toEqual(["mark"]); // no d1/d2 — no draw
    expect(game.p2.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p1.hand()).toEqual([]); // and certainly not P1
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: Mark is killed and ITS CONTROLLER (P2) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "mark" });
    await game.settle();
    expect(game.zoneOf("mark")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "retreat"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("nuance — death REPLACED by Zhonya's Hourglass: Mark was a legal target, Zhonya's dies instead (Mark healed, exhausted, recalled to base) and P2 STILL draws 2", async () => {
    const game = await board().gear(P2, ZHONYAS, "zhonya").build();
    await game.p1.cast("blade", { targets: "mark" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.state("mark")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "retreat"]);
  });
});
