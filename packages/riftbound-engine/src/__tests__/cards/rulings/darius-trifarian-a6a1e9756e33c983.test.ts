/**
 * Ruling a6a1e9756e33c983 — Darius, Trifarian (OGN-027 → ogn-027-298) · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 Might this turn and ready me."
 *   × Challenge (OGN-128 → ogn-128-298) · [2][body] Action "Choose a friendly unit and an enemy unit. They deal damage equal to
 *     their Mights to each other."
 *
 * Q: My first card is Darius himself; then I play a spell. Does Darius trigger immediately, before anyone gets priority?
 * A: No. "When you play" triggers only once the spell has RESOLVED (419.4.a): spell on the chain → priority passes → spell
 *    resolves → NOW Darius's trigger goes on the chain and players may respond to it → +2 and ready. If the spell is
 *    countered it never resolved, so Darius does not trigger at all (419.4.a.1).
 * Rules: 419.4.a, 419.4.a.1, 425 (counter), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const CHALLENGE = "ogn-128-298";
const DEFY = "ogn-045-298"; // [1][calm] Reaction — "Counter a spell that costs no more than [4] and no more than [rainbow]."

/** P1's turn with Darius + Challenge in hand and [7] + fury + body. P2: a 3-Might Foe in base, Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1, body: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, DARIUS, "darius")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, DEFY, "defy");
}

/** First card: Darius (enters exhausted, no trigger). Second card: Challenge [Darius ↔ Foe] goes on the chain; P1 keeps priority. */
async function dariusThenChallenge(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("darius");
  await game.settle();
  expect(game.zoneOf("darius")).toBe("base");
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
  await game.p1.cast("challenge", { targets: ["darius", "foe"] });
  return game;
}

describe("Ruling a6a1e9756e33c983 — Darius's 'second card' trigger waits for the spell to resolve", () => {
  test("step 1: the spell is on the chain and players have priority — Darius has NOT triggered (no Darius item, still 5 and exhausted)", async () => {
    const game = await dariusThenChallenge();
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may respond; still no trigger
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
  });

  test("steps 2–3: both pass → Challenge resolves at Darius's CURRENT 5 Might (Foe takes 5, Darius takes 3); only then does Darius's trigger go on the chain, with priority to respond", async () => {
    const game = await dariusThenChallenge();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Challenge resolves
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash"); // 5 ≥ 3
    expect(game.state("darius").damage).toBe(3);
    expect(game.state("darius").might).toBe(5); // the +2 has not happened yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("step 4: the trigger resolves → Darius +2 (→ 7) this turn and readied", async () => {
    const game = await dariusThenChallenge();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("countered instead (P2 Defies the Challenge): the spell never resolves — no damage exchanged — and Darius does NOT trigger at all: still 5, still exhausted, chain empty", async () => {
    const game = await dariusThenChallenge();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "challenge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("darius")).toMatchObject({ damage: 0, isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
