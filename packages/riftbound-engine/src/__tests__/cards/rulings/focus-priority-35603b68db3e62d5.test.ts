/**
 * Ruling 35603b68db3e62d5 — (no specific card) how Focus and Priority work while adding to a chain
 *
 * Q: When may players add Action- vs Reaction-speed cards to a chain, who gets priority, and when
 *    does Focus move?
 * A: The controller of the item that started the chain gets first priority; adding an item does NOT
 *    pass priority. Only Reaction speed may be added to an existing chain (Action speed may only
 *    START one, and in a showdown only with Focus). When everyone passes in succession the topmost
 *    item resolves and the controller of the next item gets priority. When the chain empties, Focus
 *    moves to the next player; the showdown ends only when all pass Focus without starting a chain.
 *    The initial combat trigger chain is special — closing it does not pass Focus.
 * Rules: 336–340 (chain, priority, LIFO), 340.4 (priority after each resolution), 341/342.1.a
 *        (initial combat chain), 346 (chain empties in a showdown ⇒ Focus passes), 347.1/347.2/348,
 *        355.2.a / 150.2 (Action vs Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

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

/** Standard-speed spell — playable only in your own Neutral Open main phase. */
const TONIC = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Tonic",
  rulesText: "Draw 1.",
} as const;

/** "When I attack, draw 1" — supplies an initial combat chain. */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 35603b68db3e62d5 — Focus and Priority around the chain", () => {
  test("main phase: the player who started the chain holds priority; only REACTION speed may be added to it — an Action spell is not playable onto an existing chain", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "a1")
      .hand(P1, RALLY, "a2")
      .hand(P1, STING, "r1")
      .hand(P2, RALLY, "pa")
      .hand(P2, STING, "pr")
      .build();
    await game.p1.cast("a1", { targets: "ally" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "r1")).toBe(true); // Reaction: may be added
    expect(game.p1.can("cast", "a2")).toBe(false); // Action: may not be added to a live chain
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "pr")).toBe(true);
    expect(game.p2.can("cast", "pa")).toBe(false);
  });

  test("standard (base) speed is only legal in your own Neutral Open main phase — not on a chain, not during the opponent's showdown", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "a1")
      .hand(P1, TONIC, "t")
      .hand(P2, TONIC, "pt")
      .build();
    expect(game.p1.can("cast", "t")).toBe(true);
    expect(game.p2.can("cast", "pt")).toBe(false); // not their turn
    await game.p1.cast("a1", { targets: "ally" });
    expect(game.p1.can("cast", "t")).toBe(false); // chain is live (Closed State)
  });

  test("adding an item never passes priority, and after the top item resolves the controller of the NEXT item gets priority", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "a1")
      .hand(P2, STING, "pr1")
      .hand(P2, STING, "pr2")
      .build();
    await game.p1.cast("a1", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("pr1", { targets: "ally" });
    expect(game.decision()).toMatchObject({ seat: P2 }); // still P2 — adding kept priority
    await game.p2.cast("pr2", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "pr1", "pr2"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // pr2 (top) resolves
    expect(game.state("ally").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "pr1"]);
    expect(game.decision()).toMatchObject({ seat: P2 }); // controller of the newest remaining item
  });

  test("showdown: an Action starts a chain only for the Focus holder; when the chain closes Focus moves to the next player and the pass sequence is untouched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, RALLY, "a1")
      .hand(P1, RALLY, "a2")
      .hand(P2, RALLY, "pa")
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ focusPlayer: P1, passedPlayers: [] });
    expect(game.p1.can("cast", "a1")).toBe(true);
    expect(game.p2.can("cast", "pa")).toBe(false); // no Focus
    await game.p1.cast("a1", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves, chain empties
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ focusPlayer: P2, passedPlayers: [] });
    expect(game.p1.can("cast", "a2")).toBe(false); // two Actions in a row need Focus back
    expect(game.p2.can("cast", "pa")).toBe(true);
  });

  test("a lone Reaction on a chain resolves and closes the chain at once — the caster gets no priority to add a second reaction to THAT chain; Focus passes on", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, STING, "r1")
      .hand(P1, STING, "r2")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("r1", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // r1 resolves; the chain is now empty
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "r2")).toBe(false); // P1 is not even the acting seat any more
  });

  test("the INITIAL combat chain is special: when it empties Focus stays with the attacker, who still gets to start a chain of their own", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", HERALD, "herald")
      .hand(P1, RALLY, "a1")
      .build();
    await game.p1.move("herald", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the attack trigger resolves; initial chain gone
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, passedPlayers: [] });
    expect(game.p1.can("cast", "a1")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the showdown ends only when every player passes FOCUS in succession without starting a chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, passedPlayers: [P1] });
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1, showdownComplete: true });
    expect(game.violations()).toEqual([]);
  });
});
