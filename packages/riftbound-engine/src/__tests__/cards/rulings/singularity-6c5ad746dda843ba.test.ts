/**
 * Ruling 6c5ad746dda843ba — Singularity (OGN-105 → ogn-105-298) · Spell · [6][mind][mind] · "Deal 6 to each of up to two units."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · [2][mind] · "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Deadbloom Predator (ogn-161-298) · 8 Might · [Deflect] — here buffed to 9.
 *
 * Q: Deadbloom is 9 (8 + buff). Opponent Singularities it (6 marked), then Smoke Screens it (−4). Dead, or alive on 1?
 * A: Dead. Singularity marks 6; Smoke Screen drops Might 9 → 5; marked damage 6 ≥ 5 → Deadbloom dies. (Damage is marked, not
 *    subtracted from Might; a later Might reduction can make existing damage lethal.)
 * Rules: 428 (damage ≥ Might → killed at the next cleanup), 703 (buff = +1 Might), 160 (damage is marked on the unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const SMOKE_SCREEN = "ogn-093-298";
const DEADBLOOM = "ogn-161-298";

/** P2's turn. P1's BUFFED Deadbloom (9) holds bf1. P2: Singularity + Smoke Screen, [8] + mind×5 (incl. Deflect surcharges). */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { mind: 5 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DEADBLOOM, "deadbloom", { buffed: true })
    .hand(P2, SINGULARITY, "sing")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

async function singularityResolves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("deadbloom")).toMatchObject({ baseMight: 8, isBuffed: true, might: 9 });
  await game.p2.cast("sing", { targets: ["deadbloom"] });
  await game.settle();
  expect(game.zoneOf("sing")).toBe("trash");
  return game;
}

describe("Ruling 6c5ad746dda843ba — Singularity's 6 marked damage becomes lethal once Smoke Screen drops the 9-Might Deadbloom to 5", () => {
  test("step 1: Singularity marks 6 on the 9-Might Deadbloom — it survives, still 9 Might (damage does not lower Might)", async () => {
    const game = await singularityResolves();
    expect(game.state("deadbloom")).toMatchObject({ damage: 6, isBuffed: true, might: 9, zone: "battlefield-bf1" });
  });

  test("step 2: Smoke Screen (−4) → Might 5 with 6 marked → Deadbloom DIES (not 'alive on 1')", async () => {
    const game = await singularityResolves();
    await game.p2.cast("smoke", { targets: "deadbloom" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("deadbloom")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Smoke Screen alone (no damage marked) just leaves Deadbloom at 5 Might for the turn", async () => {
    const game = await board().build();
    await game.p2.cast("smoke", { targets: "deadbloom" });
    await game.settle();
    expect(game.state("deadbloom")).toMatchObject({ damage: 0, might: 5, mightModifier: -4, zone: "battlefield-bf1" });
  });
});
