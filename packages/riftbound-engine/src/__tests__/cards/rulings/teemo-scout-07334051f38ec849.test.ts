/**
 * Ruling 07334051f38ec849 — (general Hidden rule; Teemo, Scout OGN-197 → ogn-197-298 "[Hidden] When you play me, give me +3 [Might]
 *     this turn" stands in as the hidden unit.)
 *
 * Q: I hid a unit at my battlefield. The opponent contests and takes the battlefield while I choose NOT to flip it. Is the hidden
 *    card revealed and discarded, or does it get played to my base exhausted?
 * A: It is discarded: revealed and put into your trash face up. It is not played anywhere.
 * Rules: 323.7 / 811 (a facedown card at a battlefield you no longer control is put into its owner's trash, revealed), 466.5.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";

/** Turn 3, P2's turn. P1 holds bf1 with a Sentinel (2) and hid Teemo there earlier. P2's Brute (5) ready in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Sentinel" }, "sent")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute");
}

/** Brute attacks bf1; P1 deliberately does NOT flip Teemo (just passes every window); combat resolves. */
async function loseBf1WithoutFlipping(game: Game): Promise<void> {
  await game.p2.move("brute", "bf1");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    if (d.seat === P1) {
      expect(game.p1.can("reveal", "teemo")).toBe(true); // P1 COULD flip it here — and chooses not to
    }
    await game.seat(d.seat).pass();
  }
  await game.settle();
  expect(game.zoneOf("sent")).toBe("trash"); // 5 into 2
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
}

describe("Ruling 07334051f38ec849 — an unflipped hidden card at a battlefield you lose is revealed and trashed, not played to base", () => {
  test("premise: before the attack Teemo is a facedown card of P1's at bf1", async () => {
    const game = await board().build();
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo")).toMatchObject({ isHidden: true, owner: P1 });
    expect(game.p1.facedown("bf1")).toEqual(["teemo"]);
  });

  test("P2 conquers bf1 while P1 never flips: Teemo goes to P1's TRASH (a public, face-up zone) — not to P1's base, not to hand, and it was never played (still 1 Might printed, no +3)", async () => {
    const game = await board().build();
    await loseBf1WithoutFlipping(game);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.trash()).toContain("teemo");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.base()).not.toContain("teemo");
    expect(game.p1.hand()).not.toContain("teemo");
    expect(game.p1.units()).not.toContain("teemo");
    expect(game.state("teemo")).toMatchObject({ isHidden: false, zone: "trash" });
    expect(game.state("teemo").mightModifier).toBe(0); // "When you play me" never happened
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: had P1 flipped Teemo in a response window he would have been PLAYED there (face up, +3 this turn) and fought as a defender", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    await game.p1.reveal("teemo");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", isHidden: false, might: 4 });
  });
});
