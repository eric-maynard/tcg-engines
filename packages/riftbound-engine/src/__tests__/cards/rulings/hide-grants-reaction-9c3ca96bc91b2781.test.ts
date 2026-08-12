/**
 * Ruling 9c3ca96bc91b2781 — (general [Hidden]; exercised with Hidden Blade, OGN-213 → ogn-213-298 ·
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action] Kill a unit at a battlefield.")
 *
 * Q: Does hiding a card grant it [Reaction]?
 * A: Yes — a card gains [Reaction] while facedown, so it can be flipped whenever a Reaction may be played.
 *    But not on the turn it was hidden: the grant starts on the following turn.
 * Rules: 811.6 (a Hidden card gains [Reaction] while facedown / played from facedown), 811.1.b ("beginning on
 *        the next turn, this gains [Reaction] and you may play this, ignoring its base cost"),
 *        444.2 (when a Reaction may be played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298"; // printed [Action] — NOT a Reaction from hand

/** [Action] "Deal 1 to a unit." — P2's slow spell, only there to open a chain. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Poke",
  powerCost: [],
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** P1's turn 2: P1 holds bf1 with a Sentry and has a Blade in hand plus a Power to pay the Hide. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1, rainbow: 1 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "holder")
    .unit(P2, "bf1", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, POKE, "poke");
}

async function hidden(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("blade", "bf1");
  expect(game.zoneOf("blade")).toBe("facedown-bf1");
  return game;
}

describe("Ruling 9c3ca96bc91b2781 — facedown ⇒ [Reaction], but only from the next turn", () => {
  test("from hand the card is an [Action]: on the opponent's turn, mid-chain, it cannot be cast", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune(); // pools empty at end of turn — P2 funds the spell from a channeled rune
    await game.p2.cast("poke", { targets: "holder" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.p1.can("cast", "blade")).toBe(false); // an Action, and there is a chain
  });

  test("hidden this turn: still not playable this turn, even in an open state of my own turn", async () => {
    const game = await hidden();
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("from the next turn the facedown card IS playable — including on the opponent's turn in response to their spell (Reaction speed)", async () => {
    const game = await hidden();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune(); // pools empty at end of turn — P2 funds the spell from a channeled rune
    await game.p2.cast("poke", { targets: "holder" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    await game.p1.pick("raider"); // its target is chosen as it is played, from among units at bf1
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
