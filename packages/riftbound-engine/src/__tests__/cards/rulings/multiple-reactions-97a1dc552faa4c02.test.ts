/**
 * Ruling 97a1dc552faa4c02 — (general priority; no specific card)
 *   Stand-ins: two inline [Reaction] spells and one [Action] spell, plus a 3-Might dummy to point them at.
 *
 * Q: May a player play several reactions before passing priority, or does priority pass automatically after one?
 * A: As many as they want. Priority never passes by itself — a player must actively pass. (Focus is the other
 *    concept: it is what lets you start a new chain in a showdown and it does pass on its own when the last item
 *    of the current chain resolves.)
 * Rules: 336 / 337.4 (priority is held until passed), 340 (a chain resolves when all players pass in succession),
 *        347 (Focus in a showdown, handed on as the chain empties).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const buff = (name: string) =>
  ({
    abilities: [
      { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
    ],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name,
    rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
    timing: "reaction",
  }) as const;

const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Poke",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** P2's turn: P2 pokes P1's Dummy; P1 holds two Reactions and 4 energy. */
async function underPoke(): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { fury: 4 } })
    .resources(P2, { energy: 4, power: { fury: 4 } })
    .unit(P1, "base", { might: 3, name: "Dummy" }, "dummy")
    .hand(P1, buff("Reaction A"), "r1")
    .hand(P1, buff("Reaction B"), "r2")
    .hand(P2, POKE, "poke")
    .build();
  await game.p2.cast("poke", { targets: "dummy" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 97a1dc552faa4c02 — priority is held until you pass it, so you may stack several reactions", () => {
  test("after playing one reaction I STILL have priority — nothing passed on my behalf", async () => {
    const game = await underPoke();
    await game.p1.cast("r1", { targets: "dummy" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "r1"]);
    expect(game.state("dummy").might).toBe(3); // nothing has resolved
  });

  test("so I can play a second one before passing: three items on the chain, all put there by two seats", async () => {
    const game = await underPoke();
    await game.p1.cast("r1", { targets: "dummy" });
    await game.p1.cast("r2", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "r1", "r2"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("only an explicit pass hands priority over; the chain then resolves LIFO and both buffs land", async () => {
    const game = await underPoke();
    await game.p1.cast("r1", { targets: "dummy" });
    await game.p1.cast("r2", { targets: "dummy" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy").might).toBe(5); // 3 + 1 + 1
    expect(game.state("dummy").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("passing without playing anything is equally a choice — the opponent's spell simply resolves", async () => {
    const game = await underPoke();
    await game.p1.passPriority();
    await game.settle();
    expect(game.state("dummy").might).toBe(3);
    expect(game.state("dummy").damage).toBe(1);
  });
});
