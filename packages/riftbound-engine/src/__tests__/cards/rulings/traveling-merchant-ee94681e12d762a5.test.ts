/**
 * Ruling ee94681e12d762a5 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · [2] · 2 Might
 *     "When I move, discard 1, then draw 1."
 *
 * Q: Does the Merchant's move trigger resolve before the showdown / combat at his destination starts?
 * A: Yes. The move puts the trigger on the chain; a showdown or combat is only STAGED and cannot begin while
 *    anything is on the chain, so the discard-and-draw happens first and combat waits for a Neutral Open State.
 * Rules: 383.4 (a "when I move" trigger becomes a chain item during the move), 310.3 / 344.2 (a showdown begins
 *        only from a Neutral Open State), 320 (Cleanup stages the showdown, it does not start it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";

/** P1's turn. P2 holds bf1 with a 2-Might Guard. P1's Merchant is in base with one spare card in hand to discard. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk");
}

/** The Merchant walks into the contested battlefield; his trigger is on the chain, nothing has resolved. */
async function moveIn(game: Game): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.locationOf("merchant")).toBe("bf1");
}

describe("Ruling ee94681e12d762a5 — the Merchant's move trigger resolves before the showdown/combat begins", () => {
  test("the move puts the trigger on the chain — and nothing of the combat has happened yet", async () => {
    const game = await board().build();
    await moveIn(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.zoneOf("junk")).toBe("hand"); // not discarded yet
    expect(game.state("merchant").damage).toBe(0);
    expect(game.state("guard").damage).toBe(0);
  });

  test("ruling: the discard-and-draw resolves FIRST, with the chain then empty and the combat still to come", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await moveIn(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // "discard 1" is P1's choice
    await game.p1.pick("junk");
    expect(game.zoneOf("junk")).toBe("trash"); // discard 1 …
    expect(game.p1.hand()).toHaveLength(handBefore); // … then draw 1
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(0); // combat damage has still not been dealt
    expect(game.violations()).toEqual([]);
  });

  test("only then does the combat run: the 2-Might Merchant and the 2-Might Guard trade", async () => {
    const game = await board().build();
    await moveIn(game);
    await game.settle();
    expect(game.zoneOf("merchant")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash"); // the trigger got its discard in before all that
    expect(game.violations()).toEqual([]);
  });

  test("moving to an EMPTY battlefield behaves the same way — trigger first, then the non-combat showdown and the conquer", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
      .build();
    await game.p1.move("merchant", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.gameState.battlefields.bf2?.controller).toBeFalsy(); // not settled while the chain is live
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
