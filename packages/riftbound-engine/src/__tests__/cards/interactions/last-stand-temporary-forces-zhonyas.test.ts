/**
 * Interaction: Last Stand (ogn-069-298) × Zhonya's Hourglass (ogn-077-298)
 *
 *   Last Stand — Spell · Calm · 3 + [calm] · [Action]
 *     "Double a friendly unit's Might this turn. Give it [Temporary]. (Kill it at the start of
 *      its controller's Beginning Phase, before scoring.)"
 *   Zhonya's Hourglass — Gear · Calm · 2
 *     "[Hidden] … If a friendly unit would die, kill this instead. Heal that unit, exhaust it,
 *      and recall it."
 *
 * Question: On her turn P2 casts Last Stand on her 4-Might unit that is alone holding bf1,
 * with a face-up Zhonya's in base. At the start of P2's NEXT Beginning Phase the Temporary
 * trigger resolves. Is Zhonya's forced? Does the unit keep Temporary, is it ready or
 * exhausted, and does P2 still score the hold?
 *
 * Expected (rules):
 *  - Temporary = "At the start of this permanent's controller's Beginning Phase, before
 *    scoring, kill this" (816.1.b). The grant has no duration; only the doubling is "this turn".
 *  - Zhonya's replacement has no "may" → it MUST apply (370.1, 371.2 a contrario): Zhonya's is
 *    killed instead; the unit is healed, exhausted and recalled to base.
 *  - Awaken (ready all, 315.1 / 415.3.a) already happened → the unit stays exhausted this turn.
 *  - Recall is board→board, so temporary modifications are NOT cleared (124.1) → it still has
 *    Temporary and dies for real at the start of the following Beginning Phase.
 *  - The kill/recall is "before scoring" → no unit at bf1 when Hold is checked (469.2) → no point.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LAST_STAND = "ogn-069-298";
const ZHONYAS = "ogn-077-298";

/** P2's turn 2. P2's lone 4-Might "holder" holds bf1; Zhonya's face up in P2's base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
    .gear(P2, ZHONYAS, "zh")
    .hand(P2, LAST_STAND, "ls");
}

/** Cast Last Stand on holder, then pass through P1's turn to the moment P2's next turn opens. */
async function castAndComeBackAround() {
  const game = await board().build();
  await game.p2.cast("ls", { targets: "holder" });
  await game.settle();
  await game.advanceTurn(); // → P1's turn
  expect(game.turnPlayer()).toBe(P1);
  await game.advanceTurn(); // → P2's turn: Awaken, then Beginning (Temporary trigger, then scoring)
  expect(game.turnPlayer()).toBe(P2);
  return game;
}

describe("Last Stand × Zhonya's Hourglass — Temporary death is replaced (forced), before scoring", () => {
  test("setup sanity: Last Stand resolves on the friendly holder (Temporary granted) and P2 keeps holding bf1 through P1's turn", async () => {
    const game = await board().build();
    expect(game.p2.can("cast", "ls")).toBe(true);
    await game.p2.cast("ls", { targets: "holder" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("ls")).toBe("trash");
    expect(game.state("holder").keywords).toContain("Temporary");
    await game.advanceTurn(); // P1's turn — not the controller's Beginning Phase, nothing happens
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // Expected: 4 → 8 this turn (432.1.a "double"), back to 4 next turn. Actual: no Might change at all.
  test("Last Stand doubles the holder's Might this turn only (4 → 8, then 4 again on P1's turn)", async () => {
    const game = await board().build();
    await game.p2.cast("ls", { targets: "holder" });
    await game.settle();
    expect(game.state("holder").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("holder").might).toBe(4);
    expect(game.state("holder").keywords).toContain("Temporary"); // the keyword grant is NOT "this turn"
  });

  // Expected: at P2's next Beginning Phase the Temporary kill is replaced by Zhonya's with no
  // prompt (no "may"): Zhonya's → trash, holder healed/exhausted/recalled to base.
  // Actual: Temporary is granted with duration "turn" and expires; nothing happens, Zhonya's stays.
  test.failing("BUG: at P2's next Beginning Phase Zhonya's is FORCED to replace the Temporary death — no yes/no prompt, Hourglass killed, holder recalled to base (816.1.b, 370.1, 371.2)", async () => {
    const game = await castAndComeBackAround();
    // No optional-replacement prompt was raised on the way: we are sitting in P2's open main phase.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2, context: "main" });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.state("holder").damage).toBe(0);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // Expected: Awaken readied everything BEFORE the Beginning Phase; Zhonya's then exhausts the
  // unit, so it is exhausted for this turn. Actual: unit never recalled; it sits ready at bf1.
  test.failing("BUG: the saved unit is EXHAUSTED in base this turn (Awaken 315.1/415.3.a precedes the Beginning-Phase exhaust)", async () => {
    const game = await castAndComeBackAround();
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.state("holder").isExhausted).toBe(true);
  });

  // Expected: recall is not a move to a non-board zone, so the (duration-less) Temporary grant
  // survives (124.1). Actual: Temporary was granted "this turn" and is already gone.
  test.failing("BUG: after the Zhonya's recall the unit STILL has Temporary (124.1: board→board keeps temporary modifications)", async () => {
    const game = await castAndComeBackAround();
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.state("holder").keywords).toContain("Temporary");
  });

  // Expected: the kill (→ recall) happens "before scoring", so P2 has no unit at bf1 when Hold is
  // checked and scores nothing (469.2). Actual: the unit never leaves and P2 scores the hold (1 pt).
  test.failing("BUG: P2 does NOT score the hold on bf1 that turn — the unit left 'before scoring' (816.1.b, 469.2)", async () => {
    const game = await castAndComeBackAround();
    expect(game.p2.points()).toBe(0);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // Expected: one more round later Temporary triggers again with no Hourglass left → the unit
  // dies for real. Actual: the unit lives on at bf1 indefinitely.
  test.failing("BUG: at P2's FOLLOWING Beginning Phase Temporary kills the unit for good (Zhonya's already spent)", async () => {
    const game = await castAndComeBackAround();
    expect(game.zoneOf("zh")).toBe("trash");
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("holder")).toBe("trash");
  });
});
