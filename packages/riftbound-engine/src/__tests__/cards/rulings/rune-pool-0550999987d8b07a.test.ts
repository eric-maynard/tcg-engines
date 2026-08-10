/**
 * Ruling 0550999987d8b07a — (general) Why does the Rune Pool empty after the Draw Phase as well as at end of turn?
 *   (Illustrated with Ahri, Alluring ogn-066-298 "When I hold, you score 1 point." only to get a chain — i.e. a window to use runes — inside
 *   the Beginning Phase.)
 *
 * A: To stop floating: otherwise you could exhaust/recycle runes during the Beginning Phase, have the recycled runes re-channeled in the Channel
 *    Phase, and start the Main Phase with far more than a turn's worth of resources. So the pool empties after the draw step (before the Main
 *    Phase) AND again at end of turn; emptying is automatic and simply discards unspent Energy/Power.
 * Rules: 515.4.d / 516 (pool empties entering the Main Phase), 317.2 step 3e (each player's pool empties at end of turn), 165 (Rune Pools).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI_ALLURING = "ogn-066-298";

/** Turn 3, P2 about to end. P1 holds bf1 with Ahri (her hold trigger opens a chain in P1's Beginning Phase); P1 has 2 ready calm runes, P2 2 fury. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI_ALLURING, "ahri")
    .runes(P1, "calm", 2)
    .runes(P2, "fury", 2);
}

/** P2 ends turn → P1's Beginning Phase with Ahri's trigger on the chain; P1 exhausts one rune (+1 energy) and recycles the other (+1 calm). */
async function floatInBeginning(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
  expect(game.p1.runes()).toHaveLength(2);
  await game.p1.tapRune();
  await game.p1.recycleRune(game.p1.runes({ ready: true })[0]!);
  expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // floating in the Beginning Phase
  expect(game.p1.runes()).toHaveLength(1); // one recycled back into the rune deck
  return game;
}

describe("Ruling 0550999987d8b07a — the Rune Pool empties before the Main Phase and again at end of turn", () => {
  test("resources made during the Beginning Phase do NOT survive into the Main Phase: after the chain, Channel (the recycled rune comes straight back: 1 + 2 = 3 runes) and Draw, P1 opens its Main Phase with an EMPTY pool", async () => {
    const game = await floatInBeginning();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ahri resolves; flow runs scoring → channel → draw → main
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.runes()).toHaveLength(3); // the exploit's premise is real: the recycled rune WAS re-channeled…
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // …but the floated 1 energy + 1 calm are gone
  });

  test("it empties for the opponent too: energy P2 floats in response during P1's Beginning Phase is also gone when the Main Phase starts", async () => {
    const game = await floatInBeginning();
    await game.p1.passPriority();
    await game.p2.tapRune();
    expect(game.p2.energy()).toBe(1);
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("and again at END of turn: energy tapped in the Main Phase and left unspent is emptied by the Expiration Step (trace records P1's pool being emptied of 1 energy); P1 starts the next turn cycle at 0", async () => {
    const game = await floatInBeginning();
    await game.settle();
    expect(game.phase()).toBe("main");
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const passes = game.trace().expiration ?? [];
    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0]!.steps).toContain("empty-pools");
    expect(passes[0]!.poolsEmptied?.[P1]).toMatchObject({ energy: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("emptying is not 'spending': nothing was bought with the lost resources — P1's hand only grew by the normal draw, board unchanged", async () => {
    const game = await floatInBeginning();
    const handBefore = game.p1.hand().length;
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // draw step only
    expect(game.p1.units()).toEqual(["ahri"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});
