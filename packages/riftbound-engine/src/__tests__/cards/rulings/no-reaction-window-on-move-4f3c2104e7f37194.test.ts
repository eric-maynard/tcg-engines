/**
 * Ruling 4f3c2104e7f37194 — (no specific card) can you react to a unit moving onto a battlefield
 * before the showdown starts?
 *
 * Q: Does a Standard Move into a battlefield give players a window to react before the showdown begins?
 * A: No. A plain move triggers a Cleanup, STAGES the showdown and proceeds straight into it — nobody gets
 *    priority unless something triggers and opens a chain. Move triggers happen before the showdown
 *    begins (it is only staged meanwhile); if an initial attack/defend chain exists players do get
 *    priority on it, but Focus does not pass until the showdown is under way.
 * Rules: 140 (Standard Move uses no chain), 319/323 (Cleanup), 323.13 / 344.1 (staged showdown opened by
 *        the Cleanup), 342.1.a (initial attack/defend chain), 345 (attacker holds Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** "When I move, draw 1" — a move trigger that DOES open a chain before the showdown. */
const RANGER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Ranger",
  rulesText: "When I move, draw 1.",
} as const;

/** "When I defend, draw 1" — supplies an initial combat chain. */
const SENTRY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 5,
  name: "Test Sentry",
  rulesText: "When I defend, draw 1.",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 4f3c2104e7f37194 — no priority window between a Standard Move and the showdown", () => {
  test("plain move into an occupied battlefield: the very next decision is the showdown itself, with the attacker holding Focus — no chain, no intermediate priority", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P2, STING, "psting")
      .build();
    // before the move, P2 has no window at all (it is P1's open main phase)
    expect(game.p2.can("cast", "psting")).toBe(false);
    await game.p1.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // the defender's first opportunity comes inside the showdown, after the attacker acts/passes
    expect(game.p2.can("cast", "psting")).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "psting")).toBe(true);
  });

  test("a move into an EMPTY battlefield opens a non-combat showdown the same way, with no reaction window first", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: false });
    expect(game.p2.can("cast", "psting")).toBe(false);
  });

  test("a MOVE TRIGGER does open a chain — and it resolves BEFORE the showdown begins: the showdown is merely staged, the mover has no combat role yet", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", RANGER, "ranger")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.move("ranger", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ranger"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)?.active).not.toBe(true); // staged, not begun
    expect(game.state("ranger").combatRole).toBeNull();
    expect(game.p2.can("cast", "psting")).toBe(false); // P1 holds priority first
    await game.p1.passPriority();
    expect(game.p2.can("cast", "psting")).toBe(true); // now there IS something to react to
    await game.p2.passPriority(); // the move trigger resolves; the staged showdown opens
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, focusPlayer: P1 });
    expect(game.state("ranger").combatRole).toBe("attacker");
    expect(game.violations()).toEqual([]);
  });

  test("an initial attack/defend chain gives priority inside the (now begun) showdown, and Focus stays with the attacker while it drains", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SENTRY, "sentry")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry"]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    // 337.4: priority goes to the controller of the newest chain item — here the defender, whose
    // "when I defend" trigger is the only thing on the initial chain (the attacker holds FOCUS, which
    // is a different thing from priority).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "psting")).toBe(true);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 }); // Focus did not pass
    expect(game.violations()).toEqual([]);
  });
});
