/**
 * Ruling 3dcee02ec7af650d — Irelia, Fervent (SFD-057 → sfd-057-221) · Unit · 4 Might
 *   "[Deflect] — When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Does Irelia get +1 Might at the start of the turn, during the Awaken phase?
 * A: Only if she was EXHAUSTED. Awaken readies the turn player's exhausted objects, and readying her triggers
 *    "when you ready me" for +1. A unit that is already ready cannot be readied again, so nothing triggers.
 * Rules: 315 (Awaken: the turn player readies their exhausted game objects), 414.1.c (a ready object cannot be
 *        readied), 383.4 (when-you-ready triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA_FERVENT = "sfd-057-221";

/** It is P2's turn 2; P1's Irelia sits in P1's base, exhausted or ready. Ending P2's turn starts P1's. */
function board(exhausted: boolean) {
  return scenario()
    .turn(2)
    .active(P2)
    .unit(P1, "base", IRELIA_FERVENT, "irelia", { exhausted } as Record<string, unknown>);
}

async function intoP1sTurn(exhausted: boolean): Promise<Game> {
  const game = await board(exhausted).build();
  expect(game.state("irelia")).toMatchObject({ isExhausted: exhausted, might: 4 });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling 3dcee02ec7af650d — Irelia's Awaken +1 depends on her having been exhausted", () => {
  test("ruling: exhausted at the start of P1's turn, Awaken readies her and the trigger gives +1 → 5", async () => {
    const game = await intoP1sTurn(true);
    expect(game.state("irelia")).toMatchObject({ isExhausted: false, isReady: true, might: 5 });
    expect(game.state("irelia").mightModifier).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: already ready, she cannot be readied again — no trigger, she stays 4", async () => {
    const game = await intoP1sTurn(false);
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 4 });
    expect(game.state("irelia").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the +1 is 'this turn' only — it is gone by P2's next turn", async () => {
    const game = await intoP1sTurn(true);
    expect(game.state("irelia").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("irelia").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("Awaken only readies the TURN player's objects: P1's exhausted Irelia is untouched while P2 is awakening", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .unit(P1, "base", IRELIA_FERVENT, "irelia", { exhausted: true } as Record<string, unknown>)
      .build();
    await game.advanceTurn(); // P1 ends → it becomes P2's turn, P2 awakens
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
