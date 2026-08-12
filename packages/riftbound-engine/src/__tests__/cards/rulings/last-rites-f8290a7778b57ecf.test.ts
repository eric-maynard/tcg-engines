/**
 * Ruling f8290a7778b57ecf — Last Rites (SFD-150 → sfd-150-221) · Equipment [3], +2 [Might]
 *   "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *
 * Q: Does the "hold" half fire during the ABCD (Awaken / Begin / Channel / Draw) opening of my turn?
 * A: Yes. Holding is scored in the Beginning Phase — the "B" of ABCD — so the hold trigger goes on the chain
 *    there, right after the point is scored and before the Channel and Draw phases.
 * Rules: 376.4.c (hold effects trigger with the Beginning-Phase hold scoring), 315 (turn structure), FAQ #7779.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const TRASH_UNIT = { cardType: "unit", energyCost: 2, might: 2, name: "Revenant" } as const;

/**
 * P2's turn, about to end. P1 holds bf1 with a Bearer wearing Last Rites, has a 2-cost unit in the trash and two
 * channelled runes (pools empty across the turn change, so the [2] is tapped inside the trigger's own window).
 */
function board() {
  return scenario()
    .active(P2)
    .runes(P1, "chaos", 3)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "battlefield-bf1" })
    .trash(P1, TRASH_UNIT, "revenant");
}

/** End P2's turn and land in P1's Beginning Phase with the hold trigger live. */
async function toHoldTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bearer").might).toBe(5); // 3 + the Equipment's +2 — it really is attached
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling f8290a7778b57ecf — Last Rites' hold trigger fires inside the Beginning Phase (the 'B' of ABCD)", () => {
  test("the hold point is scored in the BEGINNING phase and Last Rites offers itself right there", async () => {
    const game = await toHoldTrigger();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold scored
    const d = game.decision();
    expect(d).toMatchObject({ seat: P1 });
    expect(["yes-no", "pick"]).toContain(d?.kind);
  });

  test("declining leaves the trash untouched and the turn continues into Channel/Draw", async () => {
    const game = await toHoldTrigger();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("revenant")).toBe("trash");
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("accepting plays the Revenant out of the trash — still inside the Beginning Phase, paying its [2]", async () => {
    const game = await toHoldTrigger();
    await game.p1.yes();
    expect(game.phase()).toBe("beginning"); // the whole thing happens in ABCD's "B"
    await game.p1.tapRunes(2); // the unit's cost is still paid in full
    await game.settle();
    for (let i = 0; i < 6 && game.zoneOf("revenant") === "trash"; i++) {
      const d = game.decision();
      if (!d || d.kind !== "pick") break;
      await game.seat(d.seat).pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.zoneOf("revenant")).not.toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
