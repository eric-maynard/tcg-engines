/**
 * Ruling 5807cc9df8627167 — Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · Fury · [5][fury] · 5 Might
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Does Darius trigger when the second card played that turn (Stupefy) is countered by Defy?
 * A: No. A countered spell is not "played" for effects like Darius/Legion. First card counts; the countered
 *    Stupefy does not; the NEXT card played is then the second card of the turn and Darius triggers on it.
 * Rules: 412 (Counter — the spell never resolves and is not considered played), 383 (trigger conditions),
 *        Legion-style "cards played this turn" bookkeeping.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const STUPEFY = "ogn-095-298";
const DEFY = "ogn-045-298";

const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/**
 * P1's turn with [3]: unit A (1), Stupefy (1), unit B (1). Darius is already on the board, EXHAUSTED (so "ready me"
 * is observable). P2 holds bf1 with a 3-Might Foe and has Defy + [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, cheap("A"), "a")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, cheap("B"), "b")
    .hand(P2, DEFY, "defy");
}

/** P1 plays A (first card), then casts Stupefy at the Foe and passes; P2 Defies it; the chain resolves. */
async function firstCardThenCounteredStupefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("a");
  await game.settle();
  expect(game.zoneOf("a")).toBe("base");
  expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
  expect(game.state("darius").might).toBe(5); // first card: no trigger
  await game.p1.cast("stupefy", { targets: "foe" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "stupefy" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "defy"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Defy resolves → Stupefy countered
  await game.settle();
  return game;
}

describe("Ruling 5807cc9df8627167 — a Defied Stupefy is not P1's 'second card'; the next card is", () => {
  test("control (no Defy): A then Stupefy — Stupefy resolving IS the second card: Darius triggers, +2 (→ 7) and readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, cheap("A"), "a")
      .hand(P1, STUPEFY, "stupefy")
      .build();
    await game.p1.play("a");
    await game.settle();
    await game.p1.cast("stupefy", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stupefy resolves
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").isReady).toBe(true);
  });

  test("Stupefy countered by Defy: it goes to the trash unresolved (Foe keeps 3 Might, P1 draws nothing) and Darius does NOT trigger — still 5 Might, still exhausted, empty chain", async () => {
    const game = await firstCardThenCounteredStupefy();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("foe").might).toBe(3);
    expect(game.p1.hand()).toEqual(["b"]); // no Stupefy draw
    expect(game.chain()).toEqual([]);
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: the countered Stupefy does not count as a card played — P1's played-count is back to/still 1, so
  // playing B is the SECOND card: Darius's trigger goes on the chain and resolves for +2 (→ 7) and readies him.
  // Actual: the engine keeps counting the countered Stupefy (cardsPlayedThisTurn stays 2), so B is the "third"
  // card and Darius never triggers this turn.
  test("ruling 5807cc9df8627167 — after the countered Stupefy, B should be the second card played and trigger Darius; engine still counts the countered spell", async () => {
    const game = await firstCardThenCounteredStupefy();
    // rule 419.4.b — the countered Stupefy still COUNTS as a card played (Legion, "played another
    // spell this turn" — see legion-active-after-countered-spell); what it loses is its ORDINAL for
    // "when you play your second card in a turn", so B takes that slot below.
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    await game.p1.play("b");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 3 });
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").isReady).toBe(true);
  });
});
