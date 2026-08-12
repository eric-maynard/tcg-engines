/**
 * Ruling 937df6e31e708007 — (no specific card) which of "when I attack" / "when I defend" procs first?
 *   Sibling ruling 3fc626654cfb615c settles the same question; this file re-checks it from the
 *   defender's point of view (the opponent walks into MY battlefield).
 *
 * Q: The opponent enters my battlefield with a "when I attack" unit while I have a "when I defend"
 *    unit there. Which one procs first?
 * A: The "when I defend" trigger RESOLVES first, even though the "when I attack" trigger is placed on
 *    the chain first. The attacker (who has Focus) appends their triggers first and the defender last;
 *    the chain resolves last-in-first-out, so the defender's is on top and goes first.
 * Rules: 464.2.e.1 (attacker places first, non-defenders in turn order, defender last),
 *        340.1 (the newest Finalized item resolves), 337.4 (priority starts with the newest item's controller).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When I attack, draw 1." — the opponent's raider. */
const RAIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Test Raider",
  rulesText: "When I attack, draw 1.",
} as const;

/** "When I defend, draw 1." — my garrison. */
const GARRISON = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 6,
  name: "Test Garrison",
  rulesText: "When I defend, draw 1.",
} as const;

/** P2's turn: P2's Raider walks into bf1, which P1 holds with the Garrison. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GARRISON, "garrison")
    .unit(P2, "base", RAIDER, "raider");
}

describe("Ruling 937df6e31e708007 — attack trigger goes on the chain first; defend trigger resolves first", () => {
  test("placement: the attacker's item is at the bottom of the chain, the defender's on top", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("garrison").combatRole).toBe("defender");
    // chain() is bottom-first, so the newest (top) entry is last.
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider", "garrison"]);
    expect(game.chain()[0]).toMatchObject({ controller: P2, triggered: true });
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.violations()).toEqual([]);
  });

  test("resolution: the DEFENDER (P1) draws first, and only after that does the attacker (P2) draw", async () => {
    const game = await board().build();
    const p1Before = game.p1.hand().length;
    const p2Before = game.p2.hand().length;
    await game.p2.move("raider", "bf1");
    expect(game.p1.hand().length).toBe(p1Before); // nothing has resolved yet
    expect(game.p2.hand().length).toBe(p2Before);
    // 337.4 — the controller of the newest item (the defender, P1) speaks first.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (the defend trigger) resolves
    expect(game.p1.hand().length).toBe(p1Before + 1);
    expect(game.p2.hand().length).toBe(p2Before); // the attack trigger has NOT resolved
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand().length).toBe(p2Before + 1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("both are on the SAME opening chain — neither has resolved while the other is still pending", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((i) => i.triggered)).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
