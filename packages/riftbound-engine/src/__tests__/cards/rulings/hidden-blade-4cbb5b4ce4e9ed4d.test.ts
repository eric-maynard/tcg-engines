/**
 * Ruling 4cbb5b4ce4e9ed4d — Hidden Blade (OGN-213 → ogn-213-298)
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *
 * Q: If Hidden Blade's target becomes illegal before it resolves, does that target's controller draw?
 * A: No. An illegal target is entirely unaffected by the spell — the kill is ignored, and because the
 *    draw is a later linked instruction ("Its controller"), it is ignored too. Example: opponent Flashes
 *    the unit to base in response; the unit is not killed and nobody draws.
 * Rules: 359.3.e.2 (moved off the battlefield ⇒ no longer meets "at a battlefield"), 359.3.e.5,
 *        359.3.e.14.a (earlier linked instruction ignored ⇒ later one ignored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";

/** P1's turn. P2's unit sits at P2's bf1; P2 holds Flash with exactly [2]. P1 has exactly [2][order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

describe("Ruling 4cbb5b4ce4e9ed4d — Hidden Blade on an illegal target: no kill, no draw", () => {
  test("control (no response): the unit is killed and SOMEONE draws 2 off Hidden Blade", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    // 2 cards were drawn in total (who draws is the subject of a different ruling).
    expect(game.p1.hand().length - (p1Hand - 1) + (game.p2.hand().length - p2Hand)).toBe(2);
  });

  test("P2 may Flash the targeted unit to base in response; Flash resolves first and the Blade is still pending", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves (LIFO)
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  // Expected: at resolution the unit is in base, not "at a battlefield" → illegal target → the kill is
  // ignored (unit survives in base) AND the linked "Its controller draws 2" is ignored (nobody draws).
  // Actual: the engine does not re-check target legality at resolution — the unit is killed in its base
  // and 2 cards are still drawn (by the caster).
  test("ruling 4cbb5b4ce4e9ed4d — an illegal target ⇒ NOT killed and NOBODY draws (359.3.e.5, 359.3.e.14.a)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "victim" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    // Not killed.
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p2.trash()).not.toContain("victim");
    // Nobody drew: each hand only lost the spell it played; decks untouched.
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.deck()).toHaveLength(p1Deck);
    // Both spells finished in their owners' trash.
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
  });
});
