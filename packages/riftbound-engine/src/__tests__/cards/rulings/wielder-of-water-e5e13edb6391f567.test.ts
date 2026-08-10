/**
 * Ruling e5e13edb6391f567 — Wielder of Water (OGN-055 → ogn-055-298) · 2 Might · "While I'm attacking or defending alone,
 *   I have +2 [Might]."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] · 2+[mind] · "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   (+ Ride the Wind ogn-173-298 to end the first combat without damage so the Wielder survives into a second one.)
 *
 * Q: Wielder defends alone (4), gets Smoke Screened (→ 1), the combat ends and the +2 drops — what is its Might? And if
 *    attacked again this turn while still alone?
 * A: Smoke Screen SNAPSHOTS the reduction needed to reach the minimum (4 → 1 = −3) and that −3 persists this turn. After
 *    combat: 2 − 3 = −1, treated as 0. Next combat defending alone: 2 + 2 − 3 = 1.
 * Rules: 432 (Might arithmetic — increases before reductions; negative treated as 0), "to a minimum of" is evaluated once
 *        on application (a fixed modifier for the duration), Wielder's conditional static (522).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIELDER_OF_WATER = "ogn-055-298";
const SMOKE_SCREEN = "ogn-093-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1's Wielder holds bf1 ALONE. P2: attackers A and B (3 each) in base, Smoke Screen + Ride the Wind, [4] + mind + chaos. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { chaos: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WIELDER_OF_WATER, "wielder")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "a")
    .unit(P2, "base", { might: 3, name: "Attacker B" }, "b")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P2, RIDE_THE_WIND, "ride");
}

/** A attacks; P2 Smoke Screens the lone-defending Wielder and it resolves. P2 keeps Focus. */
async function smokedInCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wielder").might).toBe(2); // idle: no bonus
  await game.p2.move("a", "bf1");
  expect(game.state("wielder")).toMatchObject({ combatRole: "defender", might: 4 }); // 2 + 2 defending alone
  await game.p2.cast("smoke", { targets: "wielder" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

/** P2 Rides A back to base: no attacker left, the combat ends with no damage dealt. */
async function endFirstCombat(game: Game): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passFocus();
  }
  await game.p2.cast("ride", { targets: "a" });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
    await game.p2.pick("base");
    await game.settle();
  }
  expect(game.zoneOf("a")).toBe("base");
  expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  expect(game.state("wielder").combatRole).toBeNull();
}

describe("Ruling e5e13edb6391f567 — Smoke Screen's snapshotted −3 on a lone-defending Wielder of Water", () => {
  test("in combat: 4 (2 base + 2 alone) → Smoke Screen takes it to the minimum 1, recorded as a −3 modifier", async () => {
    const game = await smokedInCombat();
    expect(game.state("wielder")).toMatchObject({ baseMight: 2, might: 1, mightModifier: -3, zone: "battlefield-bf1" });
  });

  test("after that combat ends the +2 switches off but the −3 stays: 2 − 3 = −1, shown/treated as 0 — the Wielder is still on the board", async () => {
    const game = await smokedInCombat();
    await endFirstCombat(game);
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1");
    expect(game.state("wielder")).toMatchObject({ baseMight: 2, damage: 0, might: 0, mightModifier: -3 });
  });

  test("attacked AGAIN this turn while still alone: the passive re-applies before the reduction — 2 + 2 − 3 = 1 Might as a defender", async () => {
    const game = await smokedInCombat();
    await endFirstCombat(game);
    await game.p2.move("b", "bf1");
    expect(game.state("wielder")).toMatchObject({ combatRole: "defender", might: 1, mightModifier: -3 });
    expect(game.state("b").combatRole).toBe("attacker");
    await game.settle(); // 3 into 1: the Wielder dies this time, B conquers
    expect(game.zoneOf("wielder")).toBe("trash");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("the −3 is 'this turn': on P1's next turn the untouched Wielder reads its printed 2 again", async () => {
    const game = await smokedInCombat();
    await endFirstCombat(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("wielder")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
