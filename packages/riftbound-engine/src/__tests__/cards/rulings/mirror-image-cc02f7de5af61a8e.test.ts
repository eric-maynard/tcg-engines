/**
 * Ruling cc02f7de5af61a8e — Mirror Image (UNL-200 → unl-200-219) · Spell · Mind/Order · [3][rainbow][rainbow]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Reflection token (UNL-T06 → unl-t06) × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Mirror Image on an ENEMY Darius — does the Reflection enter ready and with +2?
 * A: It enters READY (Mirror Image says so) but WITHOUT +2: the token is created by the spell, it is not you "playing your
 *    second card", so Darius's trigger does not fire for it; and a copy takes the printed characteristics only, never the
 *    original's temporary bonuses.
 * Rules: 477.1.b (copy = base characteristics), 375 (modifiers are not copied), 187 (tokens), Darius's trigger counts CARDS played.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const DARIUS_TRIFARIAN = "ogn-027-298";

/** P1's turn, nothing played yet. P2's Darius, Trifarian (5) sits at P2's bf1. P1 holds Mirror Image with exactly [3] + 2 rainbow. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DARIUS_TRIFARIAN, "darius")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Cast Mirror Image choosing the enemy Darius, resolve, return the new token id in P1's base. */
async function reflectDarius(game: Game): Promise<string> {
  const before = game.p1.base();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("mirror", { targets: "darius" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return fresh[0]!;
}

describe("Ruling cc02f7de5af61a8e — Mirror Image on an enemy Darius: the Reflection is ready, 5 Might, no +2", () => {
  test("an ENEMY unit is a legal choice for Mirror Image ('Choose a unit')", async () => {
    const game = await board().build();
    const targets = (game.p1.option("cast", "mirror")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("darius");
  });

  test("the Reflection lands in P1's base as a copy of Darius, Trifarian: 5 Might printed, READY, and with NO +2 (might 5, no modifier, not buffed)", async () => {
    const game = await board().build();
    const tok = await reflectDarius(game);
    expect(game.state(tok)).toMatchObject({
      baseMight: 5,
      controller: P1,
      isExhausted: false,
      isReady: true,
      isToken: true,
      might: 5,
      mightModifier: 0,
      name: "Darius, Trifarian",
      zone: "base",
    });
    expect(game.state(tok).isBuffed).toBe(false);
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("nothing triggered off the token: the chain is empty afterwards, the original enemy Darius is untouched (5, no +2, still P2's at bf1)", async () => {
    const game = await board().build();
    await reflectDarius(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ controller: P2, might: 5, mightModifier: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Temporary]: the Reflection is killed at the start of P1's next Beginning Phase (a token that leaves the board is gone)", async () => {
    const game = await board().build();
    const tok = await reflectDarius(game);
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(tok)).toBe("base");
    await game.advanceTurn(); // → P1: Temporary kills it before scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(tok)).toBe("gone");
  });
});
