/**
 * Ruling 93ab1d8fc6a4065b — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · [5][calm] 5 Might [Tank] "When you play me to a battlefield,
 *     you may move an enemy unit to here. …"
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Blitzcrank pulls my only unit off a battlefield I control (emptying it). During that same opponent's turn I Ride the Wind a
 *    unit back onto the now-empty battlefield — do I score for conquering it?
 * A: Yes. Scoring asks only whether you have already scored at THAT battlefield THIS turn — not whether you controlled it at the
 *    start of the turn. You lost control when it emptied, you re-take it, you haven't scored there this turn ⇒ conquer, 1 point.
 * Rules: 187.4.c (empty battlefield in an Open state ⇒ control lost at Cleanup), 442–444 (Conquer / one score per battlefield per
 *        turn), 341 (Focus lets the non-turn player play an Action spell in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * Turn 4, P2's turn. P1 (2 points) controls bf1 with a lone Sentinel (2) and keeps Runner (3) in base with Ride the Wind + [2][chaos].
 * P2 (1 point) controls bf2 with Holder (2) and has Blitzcrank + [5][calm].
 */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .points(P1, 2)
    .points(P2, 1)
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P2, BLITZCRANK, "blitz")
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** P2 plays Blitzcrank to bf2 and pulls P1's Sentinel there; the trigger resolves; stops at the resulting showdown at bf2 with P1 on Focus. */
async function blitzEmptiesBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("blitz", { to: "bf2" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "blitz" } });
  await game.p2.yes();
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P2 });
  if (pick?.kind === "pick") {
    expect(pick.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["runner", "sentinel"]);
  }
  await game.p2.pick("sentinel");
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.locationOf("sentinel")).toBe("bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Sentinel arrived at P2's bf2 ⇒ P1 attacks, has Focus
  return game;
}

describe("Ruling 93ab1d8fc6a4065b — re-taking a battlefield Blitzcrank emptied, on the opponent's turn, is a scoring conquer", () => {
  test("Blitzcrank's pull empties bf1: with the chain empty (Open state) P1 LOSES control of bf1 — and P1 has not scored bf1 this turn", async () => {
    const game = await blitzEmptiesBf1();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).not.toContain("bf1");
    expect(game.p1.points()).toBe(2);
  });

  test("with Focus in the bf2 showdown P1 Rides the Wind: Runner → the empty bf1; once the showdowns close P1 controls bf1 again and SCORES the conquer (2 → 3) even though P1 held bf1 when the turn began", async () => {
    const game = await blitzEmptiesBf1();
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { answers: ["bf1"], targets: "runner" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1")) {
        await game.p1.pick("battlefield-bf1");
      } else {
        const r = await game.settle({ maxSteps: 1 });
        if (r.reason === "unanswered") {
          break;
        }
      }
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain("bf1");
    expect(game.p1.points()).toBe(3); // the conquer point
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
