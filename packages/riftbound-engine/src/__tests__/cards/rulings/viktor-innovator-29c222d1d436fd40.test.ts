/**
 * Ruling 29c222d1d436fd40 — Viktor, Innovator (OGN-117 → ogn-117-298) · Mind champion · [4] · 3 Might
 *   "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × [Legion] — "get the effect if you've played another card this turn", on Noxian Guillotine (ogn-254-298).
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: A countered card doesn't count as played for Legion — and it doesn't for Viktor either, right?
 * A: Half. Viktor's "when you play a card" TRIGGER does not fire (419.4.a.1) — but Legion is not a
 *    triggered ability: 419.4.b makes 425.1.b apply only to play-TRIGGERS and has non-triggered checks
 *    read Finalization, naming a Defy-countered spell + Legion in its own example. So Legion IS on.
 * Rules: 419.4.a.1 + 425.1.b (a countered card fires no play-trigger), 419.4.b (non-triggered checks
 *        read Finalization — countered cards still count), 812.1.c (Legion = "Finalized by you this turn").
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

describe("Ruling 29c222d1d436fd40 (Legion half) — a countered card was still Finalized, so it DOES satisfy Legion (419.4.b)", () => {
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

  // RULING-CONFLICT: riftjudge 29c222d1d436fd40 says the countered Ray also fails to satisfy Legion;
  // CR 419.4.b says 425.1.b scopes ONLY to abilities that TRIGGER on cards being played, and that
  // non-triggered checks read whether the card was FINALIZED — its first example is literally "A
  // player plays a spell, which is countered by Defy. Any Legion abilities of game objects
  // controlled by that same player will be active." 812.1.c repeats it for Legion ("Finalized by
  // you on the same turn"). Engine follows CR: the Ray counts, Legion is on, the Colossus dies now.
  // The ruling's OTHER half — Viktor's "when you play a card" TRIGGER does not fire — is CR-correct
  // (419.4.a.1) and is the second describe block below.
  test("the countered Ray was Finalized, so Legion IS satisfied and the Guillotine kills the Colossus at once (419.4.b / 812.1.c)", async () => {
    const game = await defiedRay();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    await game.p1.cast("guillotine", { targets: "colossus" });
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash"); // Legion branch: killed on resolution
    expect(game.zoneOf("guillotine")).toBe("trash");
  });
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
