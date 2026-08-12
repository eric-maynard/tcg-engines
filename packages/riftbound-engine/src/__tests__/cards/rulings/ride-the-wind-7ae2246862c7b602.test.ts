/**
 * Ruling 7ae2246862c7b602 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: My only unit at BF A is charmed away to BF B on my opponent's turn. On my turn I Ride the Wind back to the
 *    now-empty BF A. Do I score a Conquer point there?
 * A: Yes. Scoring is once per battlefield per TURN, and you did not score BF A during your opponent's turn — the
 *    restriction has nothing to bite on, so re-taking BF A on your own turn conquers and scores normally.
 * Rules: 466.5.d (Establishing Control conquers if not yet scored there this turn), 465/468 (once per battlefield
 *        per turn), 446.1 (moves), 344 (arriving where you have no control ⇒ Contested ⇒ showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/** P2's turn. P1 holds BF A with its only unit; BF B is empty and uncontrolled. P2 has Charm. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 4, name: "Windrunner" }, "runner")
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P2, CHARM, "charm")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Pass Focus for whoever holds it until no showdown is waiting on a pass. */
async function closeShowdowns(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      return;
    }
    await game.seat(d.seat).passFocus();
  }
}

/** P2 charms the runner off BF A, which empties and goes uncontrolled. */
async function charmedAway(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { answers: ["bfB"], targets: "runner" });
  await closeShowdowns(game);
  expect(game.locationOf("runner")).toBe("bfB");
  return game;
}

describe("Ruling 7ae2246862c7b602 — Ride the Wind back into a battlefield you never scored this turn does conquer", () => {
  test("Charm drags P1's only unit off BF A during P2's turn; BF A empties and P1 loses control of it", async () => {
    const game = await charmedAway();
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).not.toBe(P1);
  });

  test("Ride the Wind moves it back to the empty BF A and readies it", async () => {
    const game = await charmedAway();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2, playerId: P1, power: { chaos: 1 } });
    await game.p1.cast("rtw", { answers: ["bfA"], targets: "runner" });
    await closeShowdowns(game);
    expect(game.locationOf("runner")).toBe("bfA");
    expect(game.state("runner").isReady).toBe(true);
  });

  test("…and P1 scores the Conquer at BF A: nothing was scored there during the opponent's turn", async () => {
    const game = await charmedAway();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 2, playerId: P1, power: { chaos: 1 } });
    const before = game.p1.points();
    await game.p1.cast("rtw", { answers: ["bfA"], targets: "runner" });
    await closeShowdowns(game);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(before + 1);
    expect(game.violations()).toEqual([]);
  });
});
