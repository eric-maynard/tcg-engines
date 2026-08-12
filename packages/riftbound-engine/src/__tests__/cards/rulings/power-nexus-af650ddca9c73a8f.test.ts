/**
 * Ruling af650ddca9c73a8f — Power Nexus (SFD-214 → sfd-214-221) · Battlefield
 *   "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *
 * Q: Holding Power Nexus takes me from 6 to 7. Can I then pay the ability's cost to reach 8 and win?
 * A: Yes. Points from a card ability are not a Conquer or a Hold, so the "final point" restrictions that gate winning
 *    by Conquer do not apply — P1 wins on the spot at 8 even though the other battlefield was never scored this turn.
 * Rules: 466.1.a.1 (points from other sources escape the final-point restriction), 466.1.b (final point via Conquer),
 *        383.3.a/b + 204.3.a (a leading "you may [cost] to …" is decided and paid at finalization; Adds stay legal
 *        while the Pay prompt is open).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POWER_NEXUS = "sfd-214-221";

/** P2's turn is ending; P1 sits on 6 of 8 points, holds the live Nexus with a unit, and has 4 ready runes to recycle. */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "nexus", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "TheirHolder" }, "th")
    .runes(P1, "fury", 4);
}

describe("Ruling af650ddca9c73a8f — Power Nexus' paid point can be the game-winning 8th", () => {
  test("the Hold itself scores 6 → 7 and then the ability's Pay is offered at finalization", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      seat: P1,
      source: { battlefieldId: "nexus", cardId: "nexus" },
      timing: "FIN",
    });
    expect(game.decision()?.prompt).toContain("[rainbow][rainbow][rainbow][rainbow]");
  });

  test("runes may be recycled while that prompt is open; accepting spends 4 Power and scores the 8th point — P1 wins", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.p1.resources()).toMatchObject({ power: {} }); // pools emptied in P2's Ending Phase
    for (const rune of game.p1.runes({ ready: true })) {
      await game.p1.recycleRune(rune);
    }
    expect(game.p1.power("fury")).toBe(4); // [rainbow] pips take Power of any Domain
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0); // the cost was paid at finalization
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("…and this final point is NOT gated on having scored every battlefield — bf2 stayed P2's all along", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    for (const rune of game.p1.runes({ ready: true })) {
      await game.p1.recycleRune(rune);
    }
    await game.p1.yes();
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.winner()).toBe(P1);
  });

  test("declining leaves P1 on 7 with the game alive and the runes still ready", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.power("fury")).toBe(0); // nothing was recycled
    expect(game.p1.runes({ ready: true })).toHaveLength(6); // the seeded 4 plus the 2 channelled this turn
    expect(game.violations()).toEqual([]);
  });

  test("with nothing to pay from, the offer cannot be accepted at all", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "nexus", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "TheirHolder" }, "th")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(7);
    const attempt = await game.p1.try((p) => p.yes());
    expect(attempt.ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(7);
  });
});
