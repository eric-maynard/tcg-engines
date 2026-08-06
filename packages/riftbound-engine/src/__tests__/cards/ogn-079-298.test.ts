/**
 * Leona, Zealot — ogn-079-298 · Champion Unit · Calm · 6 energy + 1 [calm] · 6 Might
 *
 *   If an opponent's score is within 3 points of the Victory Score, I enter ready.
 *   Stunned enemy units here have -8 [Might], to a minimum of 1 [Might].
 *
 * Rules: 359.2.c (units normally enter exhausted), 194.3 (Victory Score is 8 by
 * default), 423.1 (Stunned status), 364 (passive abilities apply continuously).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-079-298";

function toPlay(oppPoints: number, ownPoints = 0) {
  return scenario()
    .victoryScore(8)
    .points(P1, ownPoints)
    .points(P2, oppPoints)
    .resources(P1, { energy: 6, power: { calm: 1 } })
    .hand(P1, CARD, "leona");
}

describe("Leona, Zealot (ogn-079-298)", () => {
  test("costs 6 energy + 1 calm; not playable without the calm power", async () => {
    const game = await toPlay(0).build();
    await game.p1.play("leona");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("leona")).toBe("base");
    expect(game.state("leona").might).toBe(6);
    const noCalm = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "leona").build();
    expect(noCalm.p1.can("play", "leona")).toBe(false);
  });

  test("enters READY when an opponent is within 3 of the Victory Score (5 of 8)", async () => {
    const game = await toPlay(5).build();
    await game.p1.play("leona");
    await game.settle();
    expect(game.state("leona").isReady).toBe(true);
  });

  test("enters exhausted when the opponent is 4+ away (4 of 8), and your OWN near-win score does not count", async () => {
    const far = await toPlay(4).build();
    await far.p1.play("leona");
    await far.settle();
    expect(far.state("leona").isExhausted).toBe(true);
    const mine = await toPlay(0, 7).build();
    await mine.p1.play("leona");
    await mine.settle();
    expect(mine.state("leona").isExhausted).toBe(true);
  });

  test("stunned enemy units here get -8 Might (10 → 2); unstunned / elsewhere / friendly units are untouched", async () => {
    const game = await toPlay(0)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 10 }, "stunnedHere", { stunned: true })
      .unit(P2, "bf1", { might: 5 }, "awakeHere")
      .unit(P2, "bf2", { might: 10 }, "stunnedAway", { stunned: true })
      .unit(P1, "bf1", { might: 9 }, "stunnedFriend", { stunned: true })
      .build();
    expect(game.state("stunnedHere").might).toBe(10); // Leona not on the board yet
    await game.p1.play("leona", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("leona")).toBe("bf1");
    expect(game.state("stunnedHere").might).toBe(2);
    expect(game.state("awakeHere").might).toBe(5);
    expect(game.state("stunnedAway").might).toBe(10);
    expect(game.state("stunnedFriend").might).toBe(9);
    expect(game.state("leona").might).toBe(6);
  });

  test.failing("BUG: 'to a minimum of 1 [Might]' — a stunned 5-Might enemy here becomes 1 Might, not 0", async () => {
    // Expected: 5 - 8 floors at the stated minimum of 1. Actual: the engine clamps the modified
    // Might at 0, ignoring the ability's `minimum: 1`.
    const game = await toPlay(0)
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "bf1", { might: 5 }, "weak", { stunned: true })
      .build();
    await game.p1.play("leona", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("leona")).toBe("bf1");
    expect(game.state("weak").might).toBe(1);
  });
});
