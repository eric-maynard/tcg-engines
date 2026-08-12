/**
 * Ruling 9b4fb50ca0725c08 — (no specific card) when do you get priority on the opponent's turn?
 *   Exercised with vanilla units and three inline spells: a "standard" (base-speed) one, an
 *   [Action] and a [Reaction].
 *
 * Q: When do players get priority during their opponent's turn to play reactions?
 * A: Four windows. (1) Your own Action Phase, Neutral Open, empty chain — base-speed, Action and
 *    Reaction cards are all legal. (2) A Showdown where you hold Focus and the chain is empty —
 *    Actions and Reactions. (3) After a chain item resolves, when you control the new topmost
 *    item. (4) Whenever a player passes you priority while a chain exists — Reactions only. You
 *    get nothing at the bare end of a turn unless a chain item is created there.
 * Rules: 336–340 (priority on a chain), 342/343 (Focus and the windows a state opens),
 *        340.4 (after a resolution, the controller of the new top item has priority),
 *        151.2 / 419.1 (base-speed cards need your own Neutral Open State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BASE_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Base Spell",
  rulesText: "Deal 1 to a unit.",
  timing: "standard",
} as const;

const ACTION_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Action Spell",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

const REACTION_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Reaction Spell",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Both seats hold one of each spell; P1 is the turn player and bf1 is P2's, defended by a Wall. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BASE_SPELL, "pBase")
    .hand(P1, ACTION_SPELL, "pAction")
    .hand(P1, REACTION_SPELL, "pReact")
    .hand(P2, BASE_SPELL, "oBase")
    .hand(P2, ACTION_SPELL, "oAction")
    .hand(P2, REACTION_SPELL, "oReact");

describe("Ruling 9b4fb50ca0725c08 — the four priority windows", () => {
  test("window 1 — your own Action Phase, no showdown, empty chain: base speed, Action AND Reaction are all legal for YOU", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
    expect(game.p1.can("cast", "pBase")).toBe(true);
    expect(game.p1.can("cast", "pAction")).toBe(true);
    expect(game.p1.can("cast", "pReact")).toBe(true);
    // …and the opponent has NO window at all in that same state.
    expect(game.p2.can("cast", "oBase")).toBe(false);
    expect(game.p2.can("cast", "oAction")).toBe(false);
    expect(game.p2.can("cast", "oReact")).toBe(false);
  });

  test("window 2 — a showdown where you hold Focus with an empty chain: Action and Reaction, but not base speed", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.p1.can("cast", "pAction")).toBe(true);
    expect(game.p1.can("cast", "pReact")).toBe(true);
    expect(game.p1.can("cast", "pBase")).toBe(false); // base speed needs a NEUTRAL open state
    // and it really is Focus that opens it: after Focus passes, the defender gets the same window
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p2.can("cast", "oAction")).toBe(true);
    expect(game.p2.can("cast", "oBase")).toBe(false);
  });

  test("window 4 — a chain exists and the opponent passes you priority: Reactions only", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("pAction", { targets: "wall" });
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 }); // adding kept priority
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    expect(game.p2.can("cast", "oReact")).toBe(true);
    expect(game.p2.can("cast", "oAction")).toBe(false);
    expect(game.p2.can("cast", "oBase")).toBe(false);
  });

  test("window 3 — a chain item resolves and the controller of the NEW TOPMOST item has priority (here P1, whose Action is left)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("pAction", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.cast("oReact", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item (P2's reaction) resolves
    expect(game.state("raider").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["pAction"]);
    // the new top of the chain is P1's own Action, so priority comes back to P1 (rule 340.4)
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.p1.can("cast", "pReact")).toBe(true);
  });

  test("no window at the bare end of a turn: the opponent is never handed priority as the turn simply ends", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    // the turn passes to P2 without ever stopping to offer P1's opponent a reaction window on it
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "pReact")).toBe(false); // now it is P2's Neutral Open state
    expect(game.violations()).toEqual([]);
  });
});
