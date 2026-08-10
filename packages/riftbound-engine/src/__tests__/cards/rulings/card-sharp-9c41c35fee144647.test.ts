/**
 * Ruling 9c41c35fee144647 — Card Sharp (SFD-081 → sfd-081-221) · Unit · Mind · 3 · 3 Might
 *     "When you play me, you and each opponent may play a Gold gear token exhausted. For each opponent who did,
 *      you play a Gold gear token exhausted."
 *   × Gold token (SFD-T03) · gear token · "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]."
 *
 * Q: If I play Card Sharp and my opponent chooses to play a token, do I get 2 tokens?
 * A: Yes (1v1): 1 from the first effect (you may) + 1 more because the opponent did → 2 for you, 1 for them.
 *    Two effects resolve in order. If the opponent declines you only get 1. With more opponents you can get more
 *    (1 + one per opponent who accepted).
 * Rules: 383.4.b (play trigger), 115 ("each opponent"), 187.5 (Gold token), 359.3.e.8 (instructions in order).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const CARD_SHARP = "sfd-081-221";

const goldOf = (game: Game, seat: string) => game.seat(seat).base().filter((id) => game.state(id).name === "Gold");

function board() {
  return scenario().resources(P1, { energy: 3 }).unit(P2, "base", { might: 2, name: "Bystander" }, "foe").hand(P1, CARD_SHARP, "sharp");
}

/** Play Card Sharp; answer every yes/no with `accept(seat)`; return the seats asked, in order. */
async function playSharp(game: Game, accept: (seat: string) => boolean): Promise<string[]> {
  const asked: string[] = [];
  await game.p1.play("sharp");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sharp", controller: P1, triggered: true })]);
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "yes-no") {
      break;
    }
    asked.push(d.seat);
    await (accept(d.seat) ? game.seat(d.seat).yes() : game.seat(d.seat).no());
  }
  expect(game.chain()).toEqual([]);
  return asked;
}

describe("Ruling 9c41c35fee144647 — Card Sharp: opponent accepts a Gold → you end with 2", () => {
  test("first effect: 'you and each opponent MAY' — both P1 and P2 are each asked their own yes/no", async () => {
    const game = await board().build();
    const asked = await playSharp(game, () => true);
    expect(asked).toContain(P1);
    expect(asked).toContain(P2);
    expect(asked.indexOf(P1)).toBeLessThan(asked.indexOf(P2)); // you first, then each opponent
  });

  test("1v1, opponent accepts: you get 1 (first effect) + 1 (for the opponent who did) = 2 exhausted Gold; they get 1", async () => {
    const game = await board().build();
    await playSharp(game, () => true);
    const mine = goldOf(game, P1);
    const theirs = goldOf(game, P2);
    expect(mine).toHaveLength(2);
    expect(theirs).toHaveLength(1);
    for (const id of [...mine, ...theirs]) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold" });
    }
    expect(game.state(theirs[0] as string).controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("1v1, opponent declines: only the first effect pays out — you get exactly 1 Gold, they get none", async () => {
    const game = await board().build();
    const asked = await playSharp(game, (seat) => seat === P1);
    expect(asked).toContain(P2); // they were asked and said no
    expect(goldOf(game, P1)).toHaveLength(1);
    expect(goldOf(game, P2)).toEqual([]);
  });

  test("multiplayer nuance (3 players): both opponents accept → 1 + 2 = 3 Gold for you, 1 each for them", async () => {
    const game = await scenario({ players: 3 }).resources(P1, { energy: 3 }).hand(P1, CARD_SHARP, "sharp").build();
    const asked = await playSharp(game, () => true);
    expect(new Set(asked)).toEqual(new Set([P1, P2, P3]));
    expect(goldOf(game, P1)).toHaveLength(3);
    expect(goldOf(game, P2)).toHaveLength(1);
    expect(goldOf(game, P3)).toHaveLength(1);
  });

  test("multiplayer nuance (3 players): only one opponent accepts → 1 + 1 = 2 Gold for you", async () => {
    const game = await scenario({ players: 3 }).resources(P1, { energy: 3 }).hand(P1, CARD_SHARP, "sharp").build();
    await playSharp(game, (seat) => seat !== P3);
    expect(goldOf(game, P1)).toHaveLength(2);
    expect(goldOf(game, P2)).toHaveLength(1);
    expect(goldOf(game, P3)).toEqual([]);
  });
});
