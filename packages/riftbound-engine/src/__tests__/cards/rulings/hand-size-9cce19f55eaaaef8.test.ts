/**
 * Ruling 9cce19f55eaaaef8 — (general zones; no specific card)
 *
 * Q: Is there a maximum hand size in Riftbound?
 * A: No. The Hand is a zone with no size limit — no rule makes a player discard down to a number, at end of turn
 *    or ever, so a hand of a dozen cards simply stays a hand of a dozen cards.
 * Rules: 108.7 (the Hand zone), 317 (the Ending Phase: heal, expire, empty pools — no discard step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const vanilla = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

describe("Ruling 9cce19f55eaaaef8 — no maximum hand size", () => {
  test("a 15-card hand survives the Ending Phase untouched — no discard is demanded", async () => {
    const game = await scenario()
      .cards(P1, "hand", Array.from({ length: 15 }, (_, i) => vanilla(`Card ${i}`)))
      .build();
    const before = game.p1.hand().length;
    expect(before).toBeGreaterThanOrEqual(15);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand().length).toBe(before);
    expect(game.p1.trash()).toEqual([]);
  });

  test("no prompt to discard is ever raised while the turn ends", async () => {
    const game = await scenario()
      .cards(P1, "hand", Array.from({ length: 15 }, (_, i) => vanilla(`Card ${i}`)))
      .build();
    await game.p1.endTurn();
    const d = game.decision();
    expect(d?.prompt ?? "").not.toMatch(/discard/i);
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("the hand only grows across turns: P1 draws on their next turn and still discards nothing", async () => {
    const game = await scenario()
      .cards(P1, "hand", Array.from({ length: 15 }, (_, i) => vanilla(`Card ${i}`)))
      .build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.p1.hand().length).toBeGreaterThan(before); // +1 for the turn's draw, nothing shed
  });
});
