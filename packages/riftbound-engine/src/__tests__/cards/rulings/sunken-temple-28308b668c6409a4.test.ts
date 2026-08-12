/**
 * Ruling 28308b668c6409a4 — Sunken Temple (SFD-218 → sfd-218-221, Battlefield)
 *     "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *   × Call to Glory (ogn-207-298) · Reaction · [3] · "Give a unit +3 [Might] this turn."
 *
 * Q: If the conquering unit only becomes Mighty after the conquer, can the draw still be triggered?
 * A: No. The trigger condition is checked at the instant the conquer happens; a unit that reaches 5+ Might
 *    afterwards is too late — no trigger, no draw.
 * Rules: 383.2 (a triggered ability's condition is evaluated when the event occurs), 466.5.d/466.6 (conquer
 *        and its triggers happen at combat resolution), 730 ([Mighty] = 5+ Might, checked continuously but
 *        only relevant to the trigger at that moment).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const CALL_TO_GLORY = "ogn-207-298";

/** P1's turn with [4] (Temple's [1] plus Call to Glory's [3]). P2 holds the live Sunken Temple with a 2-Might guard. */
function board(attackerMight: number) {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: P1 })
    .unit(P1, "base", { might: attackerMight, name: "Raider" }, "raider")
    .unit(P2, "temple", { might: 2, name: "Temple Guard" }, "guard")
    .hand(P1, CALL_TO_GLORY, "glory");
}

describe("Ruling 28308b668c6409a4 — Sunken Temple looks at Might at the moment of the conquer, not afterwards", () => {
  test("control: conquering with an already-Mighty 5-Might Raider offers the pay-[1]-draw-1", async () => {
    const game = await board(5).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "temple");
    await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("a 4-Might conqueror is not Mighty when the conquer happens: no offer at all, and play returns to the open main phase", async () => {
    const game = await board(4).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "temple");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand);
  });

  test("making that same Raider Mighty AFTER the conquer (Call to Glory, +3 → 7) is too late — no trigger, no draw", async () => {
    const game = await board(4).build();
    await game.p1.move("raider", "temple");
    await game.settle();
    const hand = game.p1.hand().length; // includes Call to Glory
    await game.p1.cast("glory", { targets: "raider" });
    await game.settle();
    expect(game.state("raider").might).toBe(7); // Mighty now …
    expect(game.locationOf("raider")).toBe("temple");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // … but nothing triggered
    expect(game.p1.hand()).toHaveLength(hand - 1); // only Call to Glory left the hand
    expect(game.p1.energy()).toBe(1); // [3] spent on Call to Glory, the Temple's [1] never asked for
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
