/**
 * Ruling 4377708e7afc628c — Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with
 *   3 [Might] or less to its owner's hand."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   (buff used by the opponent: Call to Glory ogn-207-298 · Reaction · "Give a unit +3 [Might] this turn.")
 *
 * Q: I Gust an enemy unit; in response its controller buffs it above 3 Might. Does Gust still count as played
 *    and trigger my Ravenbloom Student?
 * A: Yes. The buff resolves first (LIFO); Gust then resolves, finds its target no longer "3 or less" and its
 *    return instruction is ignored — but a spell whose only instruction mistargets is still played, so the
 *    Student's "when you play a spell" triggers as Gust resolves and gives it +1 Might.
 * Rules: 359.3.e.2 / 359.3.e.5 (illegal target unaffected), 359.3.e.10 (no-effect spell still played), 336 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const CALL_TO_GLORY = "ogn-207-298";

/** P1's turn. Student (2) in P1's base, Gust + [1]. P2 holds bf1 with a 3-Might Target and has Call to Glory + [3]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .hand(P1, GUST, "gust")
    .hand(P2, CALL_TO_GLORY, "ctg");
}

/** P1 Gusts the Target; P2 answers with Call to Glory on it. Chain = [gust, ctg]. */
async function gustThenBuff(): Promise<Game> {
  const game = await board().build();
  expect(game.state("student").might).toBe(2);
  await game.p1.cast("gust", { targets: "target" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("ctg", { targets: "target" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "ctg"]);
  return game;
}

describe("Ruling 4377708e7afc628c — a Gust that mistargets is still played and still triggers Ravenbloom Student", () => {
  test("step 1–2: Gust goes on the chain targeting the 3-Might unit; the buff lands on top and resolves first — Target is now 6, Gust still waiting", async () => {
    const game = await gustThenBuff();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Call to Glory resolves (LIFO)
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("target").might).toBe(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
    // The Student has not been pumped yet: "when you play a spell" fires as the spell RESOLVES (359.3.e.10).
    expect(game.state("student").might).toBe(2);
  });

  test("step 3: Gust resolves and its only instruction is ignored — the 6-Might Target stays at bf1, Gust goes to trash", async () => {
    const game = await gustThenBuff();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.p2.hand()).not.toContain("target");
    expect(game.state("target").might).toBe(6);
  });

  test("step 4: Gust still counts as played — Ravenbloom Student's trigger fires and it is 3 Might this turn; P1's played-card count went up", async () => {
    const game = await gustThenBuff();
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.state("student").mightModifier).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });

  test("control: with no response Gust returns the 3-Might Target to P2's hand and the Student is likewise pumped to 3", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("target")).toBe("hand");
    expect(game.state("student").might).toBe(3);
  });
});
