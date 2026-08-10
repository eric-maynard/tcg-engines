/**
 * Ruling 32718a57e6035795 — Scorchclaw (UNL-016 → unl-016-219) · Unit · Fury · [3][fury] · 3 Might
 *   "[Hunt 2] (When I conquer or hold, gain 2 XP.)
 *    [Level 3][>] I have +1 [Might] and enter ready. (While you have 3+ XP, get the effect.)"
 *   × Crowd Favorite (unl-102-219) "Spend 2 XP: [Buff] me." — a real XP sink for the reverse check.
 *
 * Q: Scorchclaw was played from hand before I was Level 3 and is still on the board when I later reach 3 XP —
 *    does its Level ability turn on?
 * A: Yes. Level is a Dependent keyword that continuously checks your XP: the moment you have 3+ XP the +1 Might
 *    applies at once. The "enter ready" part only matters at the moment it enters the board, so it does nothing
 *    for a Scorchclaw already in play (it is not readied retroactively).
 * Rules: 824.1.b.1 / 824.1.c / 824.1.d (Level = "while you have N+ XP"), continuous statics.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SCORCHCLAW = "unl-016-219";
const CROWD_FAVORITE = "unl-102-219";

describe("Ruling 32718a57e6035795 — Scorchclaw's Level 3 turns on the moment its controller reaches 3 XP, wherever it already is", () => {
  test("played from hand at 1 XP it is a plain exhausted 3-Might unit (Level 3 inactive: no +1, does not enter ready)", async () => {
    const game = await scenario()
      .xp(P1, 1)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, SCORCHCLAW, "claw")
      .build();
    await game.p1.play("claw");
    await game.settle();
    expect(game.zoneOf("claw")).toBe("base");
    expect(game.state("claw")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
  });

  test("already in play at 1 XP, Scorchclaw conquers an open battlefield → Hunt 2 takes P1 to 3 XP mid-turn and the +1 Might applies IMMEDIATELY (4 Might); 'enter ready' does nothing now — it stays exhausted from the move", async () => {
    const game = await scenario()
      .xp(P1, 1)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", SCORCHCLAW, "claw")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
      .build();
    expect(game.state("claw")).toMatchObject({ isExhausted: false, might: 3 });
    await game.p1.move("claw", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3); // Hunt 2 on conquer
    expect(game.state("claw")).toMatchObject({ baseMight: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.state("claw").isExhausted).toBe(true); // moved ⇒ exhausted; Level 3 does not ready it retroactively
    expect(game.violations()).toEqual([]);
  });

  test("the hold route: Scorchclaw holds a battlefield at 1 XP → Hunt 2 during the Beginning Phase → 3 XP and 4 Might for the rest of the game", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .xp(P1, 1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SCORCHCLAW, "claw", { exhausted: true })
      .build();
    expect(game.state("claw").might).toBe(3);
    await game.advanceTurn(); // P2 ends → P1's turn: hold bf1 → Hunt 2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
    expect(game.state("claw")).toMatchObject({ baseMight: 3, might: 4, zone: "battlefield-bf1" });
  });

  test("and it is continuous the other way too (824.1.d): spending back under 3 XP (Crowd Favorite 'Spend 2 XP') switches the +1 off again", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .unit(P1, "base", SCORCHCLAW, "claw")
      .unit(P1, "base", CROWD_FAVORITE, "fav")
      .build();
    expect(game.state("claw").might).toBe(4);
    await game.p1.activate("fav");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.state("fav").isBuffed).toBe(true);
    expect(game.state("claw").might).toBe(3);
  });

  test("contrast — 'enter ready' is an enter-the-board effect: played from hand while ALREADY at 3 XP, Scorchclaw enters ready with 4 Might", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, SCORCHCLAW, "claw")
      .build();
    await game.p1.play("claw");
    await game.settle();
    expect(game.state("claw")).toMatchObject({ isExhausted: false, might: 4, zone: "base" });
  });
});
