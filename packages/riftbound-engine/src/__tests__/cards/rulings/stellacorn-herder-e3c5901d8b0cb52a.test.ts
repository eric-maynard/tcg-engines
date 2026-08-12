/**
 * Ruling e3c5901d8b0cb52a — Stellacorn Herder (SFD-048 → sfd-048-221) · 3 Might
 *   "When I move, draw 1."
 *
 * Q: An attacking Herder is stunned, survives combat and goes back to base — do you draw again?
 * A: No. Being sent home after a combat you did not win is a RECALL, and a recall is not a move
 *    (the reminder text on recall effects even says "This isn't a move"). Only the attacking move
 *    itself drew a card.
 * Rules: 466.4 (attackers are recalled when defenders remain), recall ≠ move,
 *        "when I move" triggers only on a move game action.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERDER = "sfd-048-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit, used as deck filler

/** P1's turn. `stunned` makes the Herder deal no combat damage so the defender survives. */
function board(opts: { stunned: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", HERDER, "herder", opts.stunned ? { stunned: true } : undefined)
    .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

/** Resolve everything on the chain without touching the open showdown. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling e3c5901d8b0cb52a — a post-combat recall is not a move, so Stellacorn Herder does not draw again", () => {
  test("the attacking MOVE puts the Herder's trigger on the chain and draws exactly one card, before any combat damage", async () => {
    const game = await board({ stunned: true }).build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("herder", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["herder"]);
    await drainChain(game);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("herder")).toBe("battlefield-bf1");
  });

  test("stunned attacker survives, the defender lives, and the Herder is RECALLED to base — still only one card drawn all turn", async () => {
    const game = await board({ stunned: true }).build();
    await game.p1.move("herder", "bf1");
    await drainChain(game);
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat: stunned Herder deals 0, Picket deals 2 < 3 Might
    await game.settle();
    // Defender remained ⇒ the attacker goes home (466.4) and the battlefield stays P2's.
    expect(game.zoneOf("picket")).toBe("battlefield-bf1");
    expect(game.locationOf("herder")).toBe("base");
    // THE RULING: no second draw for the trip home, and no second trigger ever hit the chain.
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: an un-stunned Herder kills the defender, stays put and conquers — also exactly one draw, so the count above is not an artifact of the stun", async () => {
    const game = await board({ stunned: false }).build();
    await game.p1.move("herder", "bf1");
    await drainChain(game);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.zoneOf("herder")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
