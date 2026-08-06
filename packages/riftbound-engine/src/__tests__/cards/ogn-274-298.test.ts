/**
 * Sprite — ogn-274-298 · Unit Token · no domain · no cost · 3 might
 *
 *   [Temporary] (Kill me at the start of your Beginning Phase, before scoring.)
 *
 * Rule 816: Temporary = "At the start of this permanent's controller's Beginning Phase,
 * before scoring, kill this." Rule 187.2: a Sprite token is a domainless 3-Might unit token.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SPRITE = "ogn-274-298";

const onBoard = (game: { p1: { base(): string[]; units(at?: string): string[] } }) => [...game.p1.base(), ...game.p1.units("bf1")];

describe("Sprite (ogn-274-298)", () => {
  test("is a costless 3-Might unit token with the Temporary keyword", async () => {
    const game = await scenario().unit(P1, "base", SPRITE, "sprite").build();
    // (the harness's isToken flag is keyed on generated token ids, so it is not asserted for a placed printing)
    expect(game.state("sprite")).toMatchObject({ baseMight: 3, cardType: "unit", energyCost: 0, might: 3, name: "Sprite" });
    expect(game.state("sprite").powerCost).toEqual([]);
    expect(game.state("sprite").domains).toEqual([]);
    expect(game.state("sprite").keywords).toContain("Temporary");
  });

  test("Temporary: survives the opponent's turn, is killed at the start of its controller's Beginning Phase", async () => {
    const game = await scenario().turn(2).active(P1).unit(P1, "base", SPRITE, "sprite").build();
    await game.advanceTurn(); // → P2's turn: not the controller's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(onBoard(game)).toContain("sprite");
    await game.advanceTurn(); // → P1's turn: killed during Beginning
    expect(game.turnPlayer()).toBe(P1);
    expect(onBoard(game)).not.toContain("sprite");
  });

  test("the kill happens in the Beginning Phase itself (gone before P1 reaches the main phase actions)", async () => {
    const game = await scenario().turn(2).active(P2).unit(P1, "base", SPRITE, "sprite").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(onBoard(game)).not.toContain("sprite");
  });

  test.failing("BUG: 'before scoring' — a battlefield held only by a Sprite does not score its controller a Hold point (rules 816.1.b, 190.4.c)", async () => {
    // Expected: the Sprite is killed first, P1 has no unit left at bf1, so no Hold point (0).
    // Actual: P1 is credited 1 point for holding bf1 and only then loses the Sprite.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 0)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(onBoard(game)).not.toContain("sprite");
    expect(game.p1.points()).toBe(0);
  });

  test("control: a non-Temporary unit holding the same battlefield does score 1 at the start of the turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 0)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("an opponent's Sprite is not killed at the start of YOUR Beginning Phase", async () => {
    const game = await scenario().turn(2).active(P2).unit(P2, "base", SPRITE, "theirs").build();
    await game.advanceTurn(); // → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.base()).toContain("theirs");
  });
});
