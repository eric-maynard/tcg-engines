/**
 * Ruling 95293baff70ed4c7 — Smoke Screen (OGN-093 → ogn-093-298) × Call to Glory (OGN-207 → ogn-207-298)
 *
 *   Smoke Screen — Reaction [2]: "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   Call to Glory — Reaction [3]: "As you play this, you may spend a buff as an additional cost. If you do, ignore this
 *     spell's cost. Give a unit +3 [Might] this turn."
 *
 * Q: A buffed unit (4 + 1 buff = 5) is Smoke Screened to 1; then Call to Glory is played by spending THAT buff, taking it
 *    to 0 Might. Does it die before Call to Glory resolves?
 * A: No. Units may sit at 0 (or less) Might; they only die with non-zero damage ≥ their Might. 5 → 1 → (buff spent) 0,
 *    survives the cleanup (no damage), Call to Glory resolves → 3. Nuance: a buffed 4-Might unit carrying 3 damage
 *    that spends its buff (→ 3 Might, 3 damage) DOES die in the cleanup, before Call to Glory resolves.
 * Rules: 142.4 (lethal = damage ≥ Might, damage must be non-zero), 322/323 (cleanup after costs are paid), 356 (costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const CALL_TO_GLORY = "ogn-207-298";

/**
 * P1's turn. P1's Bruiser (4, buffed → 5) walks onto empty bf1 to open a showdown where both Reactions can be played.
 * P2: Smoke Screen + [2][mind]. P1: Call to Glory, NO energy (it must be paid by spending the buff).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "ctg")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** Bruiser onto bf1; P1 passes Focus; P2 Smoke Screens it and it resolves; Focus back with P1. */
async function smoked(game: Game): Promise<void> {
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 5 });
  await game.p1.move("bruiser", "bf1");
  await game.p1.passFocus();
  await game.p2.cast("smoke", { targets: "bruiser" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smoke Screen resolves
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 1, mightModifier: -4 });
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling 95293baff70ed4c7 — a 0-Might unit with no damage does not die", () => {
  test("Smoke Screen: 5 (4 + buff) → 1", async () => {
    const game = await board().build();
    await smoked(game);
  });

  test("Call to Glory paid by spending Bruiser's own buff: as the cost is paid Bruiser drops to 0 Might — and stays on the board (no damage) with the spell on the chain", async () => {
    const game = await board().build();
    await smoked(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "ctg")).toBe(true); // only via the spend-a-buff alternative
    await game.p1.cast("ctg", { payOptional: true, targets: "bruiser" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctg"]);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, might: 0 });
  });

  test("Call to Glory then resolves: 0 + 3 → Bruiser ends the sequence alive at 3 Might", async () => {
    const game = await board().build();
    await smoked(game);
    await game.p1.cast("ctg", { payOptional: true, targets: "bruiser" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  });

  // Wounded (3 + buff = 4 Might, 3 damage) spends its buff for Call to Glory → 3 Might with 3 damage → it
  // dies in the cleanup right after the cost is paid, before Call to Glory resolves (which then does nothing).
  test.failing("BUG: ruling 95293baff70ed4c7 — a damaged unit made lethal by spending its buff as a cost dies before the spell resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Wounded" }, "wounded", { buffed: true, damage: 3 })
      .hand(P1, CALL_TO_GLORY, "ctg")
      .build();
    expect(game.state("wounded")).toMatchObject({ damage: 3, might: 4 });
    await game.p1.cast("ctg", { payOptional: true, targets: "wounded" });
    // Cost paid → 3 Might, 3 damage → lethal → cleaned up before anything resolves.
    expect(game.zoneOf("wounded")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("ctg")).toBe("trash");
  });
});
