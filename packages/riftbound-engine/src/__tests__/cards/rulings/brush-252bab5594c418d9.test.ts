/**
 * Ruling 252bab5594c418d9 — Brush (unl-t03) · Battlefield token "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
 *   When you score here, you may replace this with the battlefield it replaced."
 *   × Trapping Grounds (UNL-217 → unl-217-219) · Battlefield "When you conquer here, if you assigned 3 or more excess
 *     damage, play a 1 [Might] Bird unit token with [Deflect]."
 *
 * Q: I attack a Brush (which replaced a Trapping Grounds) and conquer with 3+ excess damage. When I score, can I swap
 *    Brush back to Trapping Grounds and get its conquer effect in that same combat?
 * A: No. Brush's swap happens after the score has been processed; the conquer/score event already happened while the
 *    battlefield was Brush, and a battlefield can only be scored once per turn — Trapping Grounds' "When you conquer
 *    here" does not trigger retroactively.
 * Rules: 465 (score once per battlefield per turn), 466.2.c (conquer/hold abilities trigger on the score), 383.4.c, 438.7 (swap back).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRUSH = "unl-t03";
const TRAPPING_GROUNDS = "unl-217-219";

const birds = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Bird");

/**
 * P1's turn. bf1 is a live Brush token held by P2's 1-Might Defender; the Trapping Grounds it replaced waits in
 * Banishment (438.5). P1's 6-Might Bruiser in base will win 6 vs 1 → 5 excess damage.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: BRUSH, inert: false })
    .battlefield("bf2", { controller: null })
    .banishment(P1, TRAPPING_GROUNDS, "grounds")
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser");
}

/** Bruiser attacks the Brush; both pass Focus; combat resolves (5 excess) → P1 conquers and scores → Brush's opt-in is asked. */
async function conquerBrush(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bf1").name).toBe("Brush");
  expect(game.zoneOf("grounds")).toBe("banishment");
  await game.p1.move("bruiser", "bf1");
  const r = await game.settle();
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1); // 2. the conquer point is already scored…
  expect(r.reason).toBe("unanswered");
  // 3. …before Brush's "you may replace this" is even asked.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf1" } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", name: "Brush", triggered: true })]);
  return game;
}

describe("Ruling 252bab5594c418d9 — swapping Brush back to Trapping Grounds on score does not retro-trigger its conquer effect", () => {
  test("the score (1 point, bf1 conquered+scored this turn) is fully processed while the battlefield is still Brush; no Trapping Grounds trigger is on the chain", async () => {
    const game = await conquerBrush();
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.chain().some((c) => c.name === "Trapping Grounds")).toBe(false);
    expect(birds(game)).toEqual([]);
  });

  test("'yes': Brush is replaced by Trapping Grounds in the same slot (Bruiser stays there, P1 controls it) — and NO Bird token is played, no extra point", async () => {
    const game = await conquerBrush();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("grounds")).toBe("battlefieldRow");
    expect(game.state("grounds").name).toBe("Trapping Grounds");
    expect(game.locationOf("bruiser")).toBe("grounds");
    expect(game.gameState.battlefields.grounds?.controller).toBe(P1);
    expect(game.has("bf1") ? game.zoneOf("bf1") : "gone").toBe("gone"); // the Brush token ceased to exist
    // 4. the conquest is not re-evaluated for the newly placed Trapping Grounds.
    expect(birds(game)).toEqual([]);
    expect(game.p1.units()).toEqual(["bruiser"]);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // (cardConservation may report the seeded "bf1" vanishing: the scenario placed Brush as a plain battlefield card
    //  rather than a rules-created token, so its 186.1 disappearance looks like a lost card to the invariant.)
    expect(game.violations().filter((v) => !(v.invariant === "cardConservation" && v.message.includes("bf1")))).toEqual([]);
  });

  test("nor does it trigger later this turn: through P1's end of turn still no Bird and still 1 point", async () => {
    const game = await conquerBrush();
    await game.p1.yes();
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(birds(game)).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("control: conquering an actual Trapping Grounds with 5 excess damage DOES play the Deflect Bird token", async () => {
    const game = await scenario()
      .battlefield("tg", { controller: P2, def: TRAPPING_GROUNDS, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P2, "tg", { might: 1, name: "Defender" }, "def")
      .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "tg");
    await game.settle({ policy: "first" });
    expect(game.gameState.battlefields.tg?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const b = birds(game);
    expect(b).toHaveLength(1);
    expect(game.state(b[0] as string)).toMatchObject({ isToken: true, might: 1 });
    expect(game.state(b[0] as string).keywords).toContain("Deflect");
  });
});
