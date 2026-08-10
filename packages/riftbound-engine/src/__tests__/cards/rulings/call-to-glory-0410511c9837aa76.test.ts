/**
 * Ruling 0410511c9837aa76 — Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3] · "Give a unit +3 [Might] this turn."
 *   × Falling Star (OGN-029 → ogn-029-298) · [2]+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · [2]+[mind] · "Give a unit -4 [Might] this turn, to a minimum of 1."
 *   (Sett = Sett, Kingpin ogn-240-298, 5 Might.)
 *
 * Q: Sett is buffed to 8 Might with Call to Glory and takes 6 damage from Falling Star; then Smoke Screen
 *    reduces his Might by 4. Does Sett die?
 * A: Yes. Damage and Might are tracked separately: Sett carries 6 damage at 8 Might (alive), Smoke Screen
 *    drops him to 4 Might, and since damage (6) ≥ Might (4) he dies. Damage never reduces Might.
 * Rules: 140 (Might), 141/430 (damage marked on units; lethal when damage ≥ Might), state-based cleanup.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_GLORY = "ogn-207-298";
const FALLING_STAR = "ogn-029-298";
const SMOKE_SCREEN = "ogn-093-298";
const SETT_KINGPIN = "ogn-240-298";

/** P2's turn. P1's Sett, Kingpin (5) holds bf1; P1 has exactly [3] for Call to Glory. P2 has exactly [4] + 2 fury + 1 mind. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 4, power: { fury: 2, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT_KINGPIN, "sett")
    .hand(P1, CALL_TO_GLORY, "glory")
    .hand(P2, FALLING_STAR, "star")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P2 aims both Falling Star hits at Sett; P1 answers with Call to Glory; everything resolves. */
async function gloryThenStar(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett").might).toBe(5);
  await game.p2.cast("star", { targets: ["sett", "sett"] });
  expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 0, mind: 1 } });
  await game.p2.passPriority();
  await game.p1.cast("glory", { targets: "sett" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "glory"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Call to Glory resolves first (LIFO)
  expect(game.state("sett").might).toBe(8);
  expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
  await game.settle(); // Falling Star resolves: 3 + 3
  return game;
}

describe("Ruling 0410511c9837aa76 — damage and Might are separate; Might dropping below marked damage kills Sett", () => {
  test("Call to Glory (+3 → 8) lets Sett survive both Falling Star hits: he sits at 8 Might carrying 6 damage — damage does not reduce Might", async () => {
    const game = await gloryThenStar();
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").might).toBe(8);
    expect(game.state("sett").damage).toBe(6);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("glory")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("Smoke Screen then gives Sett -4 (8 → 4 Might) while he still carries 6 damage ⇒ 6 ≥ 4, Sett dies", async () => {
    const game = await gloryThenStar();
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "sett" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Smoke Screen on an UNDAMAGED 8-Might Sett just leaves him at 4 Might, alive — it is the marked damage that kills", async () => {
    const game = await board().build();
    // P2 opens with Smoke Screen, P1 answers with Call to Glory: LIFO → +3 then -4 → 5+3-4 = 4, no damage marked.
    await game.p2.cast("smoke", { targets: "sett" });
    await game.p2.passPriority();
    await game.p1.cast("glory", { targets: "sett" });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").might).toBe(4);
    expect(game.state("sett").damage).toBe(0);
  });
});
