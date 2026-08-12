/**
 * Ruling f980670c0cc7bb38 — Darius, Trifarian (OGN-027 → ogn-027-298) · 5 [Might] · [5][fury]
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · [1][calm] · "Counter a spell that costs no more than [4] …"
 *
 * Q: Does Darius count a spell that got countered?
 * A: No. A countered card never resolves and is not considered to have been played, so it does not advance the
 *    "second card this turn" count and Darius neither grows nor readies.
 * Rules: 425.1.b (a countered card was not played), 383 ("when you play" triggers on a successful play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const CLEAVE = "ogn-004-298";
const DEFY = "ogn-045-298";

/** P1's turn. Darius is on the board EXHAUSTED so "ready me" would be visible; P1 holds two Cleaves. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .hand(P1, CLEAVE, "cleave1")
    .hand(P1, CLEAVE, "cleave2")
    .hand(P2, DEFY, "defy")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } });
}

/** P1 plays the FIRST card of the turn and lets it resolve. */
async function afterFirstCard(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave1", { targets: "darius" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.zoneOf("cleave1")).toBe("trash");
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  return game;
}

describe("Ruling f980670c0cc7bb38 — a countered spell is not 'played', so Darius does not trigger", () => {
  test("baseline: when the second card RESOLVES, Darius gets +2 Might and readies", async () => {
    const game = await afterFirstCard();
    await game.p1.cast("cleave2", { targets: "darius" });
    await game.settle();
    expect(game.zoneOf("cleave2")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ isExhausted: false, isReady: true, might: 7 });
  });

  test("countered second card: Defy sends Cleave to the trash without resolving", async () => {
    const game = await afterFirstCard();
    await game.p1.cast("cleave2", { targets: "darius" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave2" });
    await game.settle();
    expect(game.zoneOf("cleave2")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    // Cleave never resolved: Darius carries only the ONE Assault grant from the first Cleave.
    expect(game.state("darius").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  test("and Darius does NOT trigger — no +2 Might and he stays exhausted", async () => {
    const game = await afterFirstCard();
    await game.p1.cast("cleave2", { targets: "darius" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave2" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, isReady: false, might: 5 });
    expect(game.state("darius").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the count is not merely delayed: the NEXT card played this turn is still only the second successful one", async () => {
    const game = await afterFirstCard();
    await game.p1.cast("cleave2", { targets: "darius" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave2" });
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true);
  });
});
