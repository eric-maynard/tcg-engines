/**
 * Ruling a398917009bf2194 — (no specific card) who acts first when a battlefield is contested?
 *   Exercised with vanilla units plus an inline [Action] "Give a unit +2 [Might] this turn." and
 *   an inline [Reaction] "Deal 1 to a unit."
 *
 * Q: When a player contests a battlefield and a showdown starts, who has priority to play first?
 * A: The contesting (attacking) player. They gain Focus — the permission to start a chain with an
 *    Action — and priority. Adding to the chain does not give priority away; when they pass
 *    priority they KEEP Focus and the defender may answer with a Reaction. Once the chain fully
 *    resolves, Focus moves to the next player, who then holds both Focus and priority.
 * Rules: 345 (the player who applied Contested gains Focus), 342/343 (Focus = permission to play
 *        an Action), 340.1 (adding an item does not pass priority), 346 (chain empties in a
 *        showdown ⇒ Focus passes), 347 (Focus/Pass).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

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

const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn; P1 attacks bf1, which P2 holds with a 9-Might Wall. Both sides hold both spells. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RALLY, "aAtk")
    .hand(P1, STING, "rAtk")
    .hand(P2, RALLY, "aDef")
    .hand(P2, STING, "rDef");

describe("Ruling a398917009bf2194 — the contesting player gets Focus and priority first", () => {
  test("the attacker holds Focus the instant the showdown opens, and the decision is theirs", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "aAtk")).toBe(true);
    // the defender may not start their own chain while the attacker holds Focus
    expect(game.p2.can("cast", "aDef")).toBe(false);
    expect(game.p2.can("cast", "rDef")).toBe(false);
  });

  test("Focus is the permission to start the chain: the attacker's Action becomes the first chain item, and they KEEP priority", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("aAtk", { targets: "raider" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["aAtk"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
  });

  test("passing PRIORITY keeps Focus with the attacker but lets the defender answer with a Reaction", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("aAtk", { targets: "raider" });
    await game.p1.passPriority();
    expect(showdown(game)?.focusPlayer).toBe(P1); // Focus did NOT move
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rDef")).toBe(true);
    expect(game.p2.can("cast", "aDef")).toBe(false); // Actions still need Focus + an empty chain
  });

  test("once the chain has fully resolved, Focus moves on and the next player holds Focus AND priority", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("aAtk", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item resolves; chain empty
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(6);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "aDef")).toBe(true); // now the defender may start their own chain
    expect(game.p1.can("cast", "aAtk")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
