/**
 * Ruling 2f9351c4cf56247b — (no specific card) how the chain works when you attack a battlefield
 *
 * Q: When you attack a battlefield, who starts the chain, what can be played, and can you cast
 *    another spell after both players have passed priority?
 * A: Attacking opens a Combat Showdown; the attacker holds Focus. Any "when I attack"/"when I defend"
 *    triggers form an initial chain the attacker may react to first. Whoever adds an item KEEPS priority
 *    and may keep adding reactions until they pass; then the other player may. Once both pass in
 *    succession the TOP item resolves — you may NOT cast another spell at that moment. When a chain
 *    empties, Focus moves on; the showdown ends only when both pass Focus without starting a chain.
 * Rules: 442.1.b.1 / 464.2 (attack ⇒ combat showdown, attacker holds Focus), 342.1.a (initial trigger
 *        chain), 336–340 (add ⇒ keep priority; all pass ⇒ top item resolves, LIFO), 346 (chain empties
 *        in a showdown ⇒ Focus passes), 347.1/347.2/348 (Focus, Pass, close).
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

/** Vanilla defender + "When I attack, draw 1" attacker so the initial chain exists on demand. */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks P2's bf1 with a plain 4-Might Raider; no triggers anywhere. */
function plainBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RALLY, "a1")
    .hand(P1, STING, "r1")
    .hand(P1, STING, "r2")
    .hand(P2, STING, "d1")
    .hand(P2, STING, "d2");
}

describe("Ruling 2f9351c4cf56247b — the chain during a combat showdown", () => {
  test("attacking opens a COMBAT showdown with the attacker holding Focus; with no attack/defend triggers the initial chain is empty and the attacker acts first", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P1,
      battlefieldId: "bf1",
      defendingPlayer: P2,
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
  });

  test("the attacker starts a chain with an Action and KEEPS priority: they may add reaction after reaction before passing", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    // adding an item does not pass priority (340.1)
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("r1", { targets: "wall" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("r2", { targets: "wall" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "r1", "r2"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // only when they pass does the defender get to answer
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "d1")).toBe(true);
  });

  test("the defender may add any number of reactions before passing; then both having passed resolves ONLY the top item — nobody may cast at that moment, priority is re-offered afterwards", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.cast("d1", { targets: "raider" });
    await game.p2.cast("d2", { targets: "raider" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "d1", "d2"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // both passed in succession → TOP item (d2) resolves, and only it
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.state("raider").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["a1", "d1"]);
    // "if you pass and your opponent passes, the next item resolves — you cannot cast another spell
    // at that point": the resolution happened without either player getting a cast in between.
    expect(game.zoneOf("d1")).toBe("chain");
    expect(game.state("raider").might).toBe(4); // a1 has NOT resolved
    // priority is live again for the controller of the newest remaining item (340.4)
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("chain drained: the Action finally resolves, the chain empties and FOCUS passes to the defender, who may now start their own chain", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // a1 resolves, chain empty
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(6);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    // the attacker cannot start a second Action chain until Focus comes back
    expect(game.p1.can("cast", "a1")).toBe(false);
  });

  test("both passing FOCUS without starting a chain ends the showdown and combat resolves; a card played instead keeps it going", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, passedPlayers: [P1] });
    // P2 plays instead of passing → the pass sequence resets, showdown continues
    await game.p2.cast("d1", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(showdown(game)).toMatchObject({ active: true, passedPlayers: [] });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("initial chain: an attacking unit's 'when I attack' trigger is on the chain BEFORE anyone acts, and the attacker has priority to react to it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", HERALD, "herald")
      .hand(P1, STING, "r1")
      .hand(P2, STING, "d1")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("herald", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.p1.hand().length).toBe(handBefore); // not drawn yet — the trigger is still pending
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("r1", { targets: "wall" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald", "r1"]);
    // LIFO: the reaction resolves first, the attack trigger last
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.state("wall").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["herald"]);
    expect(game.p1.hand().length).toBe(handBefore - 1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(handBefore); // the attack trigger's draw
    expect(game.violations()).toEqual([]);
  });
});
