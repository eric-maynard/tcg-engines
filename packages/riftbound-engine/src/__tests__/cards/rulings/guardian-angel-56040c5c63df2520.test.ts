/**
 * Ruling 56040c5c63df2520 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · "If I would die, kill Guardian Angel instead.
 *   Heal me, exhaust me, and recall me."
 *   × Apprentice Smith (SFD-041 → sfd-041-221) · 2 Might · "When I move, reveal the top card of your Main Deck. If it's a gear,
 *   draw it. Otherwise, recycle it."
 *
 * Q: Does Guardian Angel's recall count as a move for Apprentice Smith?
 * A: No. A Recall is not a Move — her "When I move" does not trigger.
 * Rules: 434.4.a / recall reminder text ("This isn't a move"), 137 (Move), 366 (replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const APPRENTICE_SMITH = "sfd-041-221";
const TOP_GEAR = "ogn-228-298"; // Vanguard Helm — a plain gear for the deck top, so a real move trigger would visibly DRAW it

/** P2's turn. P1 holds bf1 with Apprentice Smith wearing Guardian Angel; P1's deck top is a gear. P2's Bruiser (8) will attack. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", APPRENTICE_SMITH, "smith", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "smith" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .deck(P1, [TOP_GEAR, "ogn-175-298"], ["topgear", "d2"]);
}

describe("Ruling 56040c5c63df2520 — Guardian Angel's recall is not a move", () => {
  test("Smith takes lethal combat damage: GA dies instead and Smith is healed, exhausted and RECALLED to base — her 'When I move' does NOT trigger (no reveal, deck and hand untouched)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("smith")).toBe("base");
    expect(game.state("smith")).toMatchObject({ attachments: [], damage: 0, isExhausted: true });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.deck().slice(0, 2)).toEqual(["topgear", "d2"]); // nothing revealed, drawn or recycled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an actual Move of the Smith does trigger it: the top card (a gear) is revealed and drawn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [TOP_GEAR, "ogn-175-298"], ["topgear", "d2"])
      .build();
    await game.p1.move("smith", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toContain("topgear");
    expect(game.p1.deck()[0]).toBe("d2");
  });
});
