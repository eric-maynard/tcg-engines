/**
 * Ruling 2f07267d36dbf6e0 — Irelia, Fervent (SFD-057 → sfd-057-221) · Calm champion · [5][calm] · 4 Might
 *   "[Deflect]  When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Does Irelia become a 5-Might unit when she is readied at the beginning of my turn?
 * A: Yes — the Ready Step readies every exhausted object you control, and readying her is "you ready me", so
 *    the trigger fires and she is 4 + 1 = 5 for that turn. If she was already ready she cannot be readied
 *    again, so nothing triggers and she stays at 4.
 * Rules: 316 (Ready Step of the start of turn), 415.1.b (a ready object cannot be readied), 383 (the trigger).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const EN_GARDE = "ogn-046-298"; // [Reaction] [1] "Give a friendly unit +1 [Might] this turn, then +1 more if alone."

/** Turn 2 is P2's; P1's Irelia sits in base in the given state. Advancing the turn runs P1's Ready Step. */
function board(exhausted: boolean) {
  return scenario()
    .turn(2)
    .active(P2)
    .unit(P1, "base", IRELIA, "irelia", { exhausted })
    .fillDecks({ main: 10, runes: 10 });
}

describe("Ruling 2f07267d36dbf6e0 — being readied in the Ready Step triggers Irelia's own +1", () => {
  test("ruling: an EXHAUSTED Irelia is readied at the start of P1's turn and becomes 5 Might", async () => {
    const game = await board(true).build();
    expect(game.state("irelia")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(5);
    expect(game.state("irelia").mightModifier).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: an already-READY Irelia cannot be readied, so nothing triggers and she stays at 4", async () => {
    const game = await board(false).build();
    expect(game.state("irelia").isReady).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("irelia").might).toBe(4);
    expect(game.state("irelia").mightModifier).toBe(0);
  });

  test("the +1 is 'this turn': after P1's turn ends she is back to 4", async () => {
    const game = await board(true).build();
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("irelia").might).toBe(4);
  });

  test("the other half of the same trigger — CHOOSING her also fires it: En Garde on a lone Irelia takes her to 7 (4 +1 hers +2 En Garde's)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", IRELIA, "irelia")
      .hand(P1, EN_GARDE, "engarde")
      .build();
    await game.p1.cast("engarde", { targets: "irelia" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "irelia"]); // her trigger sits above it
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
  });
});
