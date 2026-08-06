/**
 * Noxus Saboteur — ogn-018-298 · Unit · Fury · 3 energy · 3 Might
 *
 *   Your opponents' [Hidden] cards can't be revealed here.
 *
 * A facedown (Hidden) card is revealed when its owner plays it from facedown
 * (rule 811.1.b / 811.1.c.3) — the engine's `revealHidden` move. While the
 * Saboteur is at a battlefield, opponents may not do that there.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-018-298";
const PAKAA_CUB = "ogn-135-298"; // vanilla [Hidden] unit
const CONSULT = "ogn-083-298"; // [Hidden] [Reaction] Draw 2.

/** P2's turn 3; P2 hid `trap` at bf1 (which P2 controls) on an earlier turn. */
function board(saboteurAt: "bf1" | "bf2" | "base") {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2 }, "guard")
    .facedown(P2, "bf1", PAKAA_CUB, "trap")
    .unit(P1, saboteurAt, CARD, "sab");
}

describe("Noxus Saboteur (ogn-018-298)", () => {
  test("control: without the Saboteur here, the opponent may reveal (play) their hidden card at bf1", async () => {
    const game = await board("bf2").build();
    expect(game.p2.can("reveal", "trap")).toBe(true);
    await game.p2.reveal("trap");
    await game.settle();
    expect(game.zoneOf("trap")).toBe("battlefield-bf1");
  });

  test.failing("BUG: an opponent's hidden card at the Saboteur's battlefield cannot be revealed", async () => {
    // Expected: with Noxus Saboteur at bf1, P2's `revealHidden` on the card hidden at bf1 is
    // not a legal move. Actual: the static is captured as an unimplemented "PreventReveal"
    // keyword grant, so the reveal gate ignores it and P2 can still play the card.
    const game = await board("bf1").build();
    expect(game.p2.can("reveal", "trap")).toBe(false);
    const r = await game.p2.try((p) => p.reveal("trap"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("trap")).toBe("facedown-bf1");
  });

  test("'here' only: the Saboteur in base does not stop a reveal at bf1", async () => {
    const game = await board("base").build();
    expect(game.p2.can("reveal", "trap")).toBe(true);
  });

  test("'opponents' only: the Saboteur's controller may still reveal their own hidden card here", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sab")
      .facedown(P1, "bf1", CONSULT, "mine")
      .build();
    expect(game.p1.can("reveal", "mine")).toBe(true);
    const before = game.p1.hand().length;
    await game.p1.reveal("mine");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(before + 2);
  });

  test("costs 3 energy to play (3 Might body); unaffordable at 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "sab").build();
    await game.p1.play("sab");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sab")).toBe("base");
    expect(game.state("sab").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sab").build();
    expect(poor.p1.can("play", "sab")).toBe(false);
  });
});
