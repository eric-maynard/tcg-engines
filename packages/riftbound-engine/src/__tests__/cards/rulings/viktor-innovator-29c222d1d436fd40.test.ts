/**
 * Ruling 29c222d1d436fd40 — Viktor, Innovator (OGN-117 → ogn-117-298) · Mind champion · [4] · 3 Might
 *   "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × [Legion] — "get the effect if you've played another card this turn", on Noxian Guillotine (ogn-254-298).
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: A countered card doesn't count as played for Legion — and it doesn't for Viktor either, right?
 * A: Right, both. A countered card is never considered to have been played, so neither Legion's "you've played
 *    another card this turn" nor Viktor's "when you play a card" is satisfied by it.
 * Rules: 425.1.b (a countered card was not played), 812.1.b.1 (Legion), 419.4.a ("when you play a card"
 *        triggers fire after that card resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-117-298";
const NOXIAN_GUILLOTINE = "ogn-254-298";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — the card P2 will counter
const SMOKE_SCREEN = "ogn-093-298"; // [2][mind] Reaction — P1's card on P2's turn

// ── Legion ──────────────────────────────────────────────────────────────────────────────────────

/** P1's turn: Hextech Ray then Noxian Guillotine, with P2 holding Defy. P2's Colossus is the Guillotine target. */
function legionBoard() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, rainbow: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 12, name: "Colossus" }, "colossus")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, NOXIAN_GUILLOTINE, "guillotine")
    .hand(P2, DEFY, "defy");
}

/** P1 casts the Ray at the Colossus; P2 answers with Defy and the counter resolves. */
async function defiedRay(): Promise<Game> {
  const game = await legionBoard().build();
  await game.p1.cast("ray", { targets: "colossus" });
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "ray" });
  await game.settle();
  return game;
}

describe("Ruling 29c222d1d436fd40 (Legion half) — a countered card does not satisfy 'you've played another card this turn'", () => {
  test("control: an uncountered Hextech Ray counts, so the following Guillotine gets Legion and kills the Colossus NOW", async () => {
    const game = await legionBoard().build();
    await game.p1.cast("ray", { targets: "colossus" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.p1.cast("guillotine", { targets: "colossus" });
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash"); // Legion branch: killed on resolution
  });

  test("P2 counters the Ray: it is trashed without dealing its 3", async () => {
    const game = await defiedRay();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("colossus").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Expected (425.1.b / 812.1.b.1): the countered Ray was never played, so Legion is unsatisfied and the
  // Guillotine takes its "kill it the next time it takes damage" branch, leaving the Colossus alive.
  // Actual: the engine tallies `cardsPlayedThisTurn` when a spell goes ON the chain, so the countered Ray
  // still counts — Legion fires and the Colossus is killed on resolution.
  test.failing(
    "BUG: ruling 29c222d1d436fd40 — a countered card still counts as played, so Legion is wrongly satisfied and the Guillotine kills the Colossus at once",
    async () => {
      const game = await defiedRay();
      expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
      await game.p1.cast("guillotine", { targets: "colossus" });
      await game.settle();
      expect(game.zoneOf("colossus")).toBe("battlefield-bf1"); // NOT killed now — the non-Legion branch
      expect(game.zoneOf("guillotine")).toBe("trash");
    },
  );
});

// ── Viktor ──────────────────────────────────────────────────────────────────────────────────────

/** P2's turn. P1 controls Viktor and answers P2's Hextech Ray with a Smoke Screen; P2 may counter it. */
function viktorBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 1, calm: 1 } })
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Squire" }, "squire")
    .unit(P1, "base", VIKTOR, "viktor")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P2, DEFY, "defy")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

/** P2 casts the Ray at the Squire; P1 answers with Smoke Screen (a card played on the opponent's turn). */
async function smokeOnOpponentsTurn(): Promise<Game> {
  const game = await viktorBoard().build();
  expect(game.p1.units("base")).toEqual(["viktor"]); // no Recruit yet
  await game.p2.cast("ray", { targets: "squire" });
  await game.p2.passPriority();
  await game.p1.cast("smoke", { targets: "squire" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "smoke"]);
  return game;
}

describe("Ruling 29c222d1d436fd40 (Viktor half) — a countered card never fires 'when you play a card'", () => {
  test("control: the Smoke Screen resolves, so Viktor triggers and P1 gets a Recruit token in base", async () => {
    const game = await smokeOnOpponentsTurn();
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    const base = game.p1.units("base");
    expect(base).toHaveLength(2);
    expect(base).toContain("viktor");
    expect(game.state(base.find((c) => c !== "viktor") as string)).toMatchObject({ isToken: true, might: 1 });
  });

  test("ruling: P2 counters the Smoke Screen with Defy — Viktor does NOT trigger and no Recruit appears", async () => {
    const game = await smokeOnOpponentsTurn();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "smoke" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("squire").might).toBe(5); // countered: the -4 never applied
    expect(game.p1.units("base")).toEqual(["viktor"]); // no token
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
