/**
 * Ruling 23da00b34b30d750 — Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] · Mind · [2][mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Action] · "Move a unit from a battlefield to its base."
 *   × En Garde (OGN-046 → ogn-046-298) · [Reaction] · "+1 [Might] this turn (+1 more if it's alone there)."
 *
 * Q: How does the "to a minimum of 1" clamp interact with later Might changes?
 * A: The reduction SNAPSHOTS at resolution: a -4 on a 2-Might unit is recorded as -1 (only as much as the
 *    clamp allowed) and that -1 then applies for the rest of the turn in the ordinary arithmetic. So if the
 *    unit later loses a static +1 it drops to 0 (a 0-Might unit is not dead unless it has damage ≥ its
 *    Might), and later buffs add on top of the current value.
 * Rules: 611 (continuous Might modification), 359 (values fixed on resolution), 465 (0-Might is not lethal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const WAR_CAMP = "ogn-294-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const EN_GARDE = "ogn-046-298";

/** P1 holds the live Trifarian War Camp with a 1-Might Pawn standing on it (so it shows 2 Might). */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1, calm: 1 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "camp", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, EN_GARDE, "engarde");
}

/** Smoke Screen the 2-Might Pawn: -4 clamped at 1, so only -1 is actually recorded. */
async function smoked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("pawn").might).toBe(2); // 1 printed + 1 from the War Camp
  await game.p1.cast("smoke", { targets: "pawn" });
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  return game;
}

describe("Ruling 23da00b34b30d750 — Smoke Screen's 'minimum 1' snapshots how much of the -4 actually applied", () => {
  test("a -4 on a 2-Might unit lands it on 1, not below", async () => {
    const game = await smoked();
    expect(game.state("pawn").might).toBe(1);
  });

  test("ruling: only -1 was snapshotted — losing the War Camp's static +1 drops the Pawn to 0, not back to 1", async () => {
    const game = await smoked();
    await game.p1.cast("fof", { targets: "pawn" });
    await game.settle();
    expect(game.locationOf("pawn")).toBe("base");
    expect(game.state("pawn").might).toBe(0);
    expect(game.zoneOf("pawn")).toBe("base"); // 0 Might with 0 damage is NOT dead
    expect(game.violations()).toEqual([]);
  });

  test("ruling: a later buff adds to the current value (0 → +2 from En Garde → 2)", async () => {
    const game = await smoked();
    await game.p1.cast("fof", { targets: "pawn" });
    await game.settle();
    expect(game.state("pawn").might).toBe(0);
    await game.p1.cast("engarde", { targets: "pawn" });
    await game.settle();
    expect(game.state("pawn").might).toBe(2);
  });

  test("the whole reduction is a 'this turn' effect — next turn the Pawn is back to its printed 1", async () => {
    const game = await smoked();
    await game.advanceTurn();
    expect(game.state("pawn").might).toBe(2); // 1 printed + War Camp again
  });
});
