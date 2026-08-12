/**
 * Ruling 7be90e3c5551d8fa — Stand United (OGN-053 → ogn-053-298) · Spell · Calm · [3] · [Hidden] [Action]
 *   "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn."
 *
 * Q: Does Stand United raise every Buff from +1 to +2 Might for the turn, and do they drop back to +1 when the
 *    turn ends?
 * A: Yes to both. It first buffs the chosen unit (if it had none) and then, for this turn only, every Buff you
 *    control is worth +2 instead of +1 — including buffs that were already on the board. At end of turn the
 *    turn-scoped rider expires and Buffs are back to +1.
 * Rules: 364.3 / 517.2.b (turn-scoped continuous effect), 703 (a Buff counter is +1 [Might]),
 *        426.1 (Buff = give a +1 [Might] buff if it does not already have one), 317.2 (Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";

/** P1's turn with exactly [3]. "Veteran" already carries a Buff; "Rookie" has none; P2's body is untouched. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 3, name: "Veteran" }, "veteran", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Rookie" }, "rookie")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe", { buffed: true })
    .hand(P1, STAND_UNITED, "su");
}

async function cast(): Promise<Game> {
  const game = await board().build();
  expect(game.state("veteran")).toMatchObject({ isBuffed: true, might: 4 }); // 3 + the +1 Buff
  expect(game.state("rookie")).toMatchObject({ isBuffed: false, might: 3 });
  await game.p1.cast("su", { targets: "rookie" });
  await game.settle();
  return game;
}

describe("Ruling 7be90e3c5551d8fa — Stand United buffs one unit and makes every friendly Buff +2 for the turn", () => {
  test("the named unit gains a Buff", async () => {
    const game = await cast();
    expect(game.state("rookie").isBuffed).toBe(true);
    expect(game.zoneOf("su")).toBe("trash");
  });

  test("both friendly Buffs are now worth +2: the freshly buffed Rookie AND the already-buffed Veteran sit at 5", async () => {
    const game = await cast();
    expect(game.state("rookie").might).toBe(5); // 3 + 1 (Buff) + 1 (rider)
    expect(game.state("veteran").might).toBe(5); // the pre-existing Buff is upgraded too
  });

  test("the rider is friendly-only — the opponent's buffed unit stays at +1", async () => {
    const game = await cast();
    expect(game.state("foe")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("when the turn ends the rider expires: the Buffs remain but are back to +1 each", async () => {
    const game = await cast();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("rookie")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("veteran")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
