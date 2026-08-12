/**
 * Ruling b8f0c67173cd747e — Smoke and Mirrors (UNL-083 → unl-083-219) · [Hidden] [Action] · Mind · [2]
 *     "Choose a unit you control and another unit you control at a different location. If at least one of them
 *      has [Temporary], move each to the other's location. Draw 1."
 *
 * Q: A showdown is running. The attacker passes Focus, the defender plays an Action (Smoke and Mirrors) and then
 *    passes. Can the attacker now play an ACTION, or only a [Reaction]?
 * A: An Action. Playing the spell closed the state, and passing there only hands priority across; once the chain
 *    has resolved the showdown is in an Open State again and Focus goes back to the attacker, who may play
 *    anything legally timed — Actions included. The showdown ends only when both players pass Focus in a row.
 * Rules: 346 (chain empties → Open State, Focus moves on), 344.2/347 ([Action] = your turn or any showdown),
 *        347.3.a (consecutive Focus passes end the showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_AND_MIRRORS = "unl-083-219";
const CHALLENGE = "ogn-128-298"; // the attacker's [Action] test card

/**
 * P1's turn 3. P2 holds bf1 with a [Temporary] Guard and keeps a Spare in base (Smoke and Mirrors needs two
 * friendly units at different locations, one [Temporary]). P1 attacks with a Striker and holds Challenge.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { body: 2 } })
    .resources(P2, { energy: 5, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Temporary"], might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Spare" }, "spare")
    .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
    .hand(P2, SMOKE_AND_MIRRORS, "sm")
    .hand(P1, CHALLENGE, "challenge");
}

/** P1 attacks bf1 and passes Focus, so the defender P2 is on. */
async function defenderOnTurn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling b8f0c67173cd747e — after the defender's Action resolves, Focus returns to the attacker, who may play an Action", () => {
  test("the defender plays Smoke and Mirrors: the state closes and the game is on the CHAIN, not the showdown", async () => {
    const game = await defenderOnTurn();
    await game.p2.cast("sm", { targets: ["guard", "spare"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sm"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("the defender then passes: that is priority, not the end of the showdown — the attacker is asked on the chain", async () => {
    const game = await defenderOnTurn();
    await game.p2.cast("sm", { targets: ["guard", "spare"] });
    await game.p2.pass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sm"]);
  });

  test("once the chain resolves the showdown is Open again and Focus is back with the ATTACKER", async () => {
    const game = await defenderOnTurn();
    await game.p2.cast("sm", { targets: ["guard", "spare"] });
    await game.p2.pass();
    await game.p1.pass(); // Smoke and Mirrors resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sm")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("ruling: the attacker is NOT limited to [Reaction] cards — an [Action] (Challenge) is legal right now", async () => {
    const game = await defenderOnTurn();
    await game.p2.cast("sm", { targets: ["guard", "spare"] });
    await game.p2.pass();
    await game.p1.pass();
    expect(game.p1.can("cast", "challenge")).toBe(true);
    const played = await game.p1.try((p) => p.cast("challenge", { targets: ["striker", "spare"] }));
    expect(played.ok).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.violations()).toEqual([]);
  });

  test("and the showdown only ends when both players pass Focus in a row", async () => {
    const game = await defenderOnTurn();
    await game.p2.cast("sm", { targets: ["guard", "spare"] });
    await game.p2.pass();
    await game.p1.pass();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.showdownComplete ?? true).toBe(true);
  });
});
