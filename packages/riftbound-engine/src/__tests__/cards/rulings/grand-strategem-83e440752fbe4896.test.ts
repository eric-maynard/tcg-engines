/**
 * Ruling 83e440752fbe4896 — Grand Strategem (OGN-233 → ogn-233-298) · Spell · 6 + [order][order][order]
 *   "[Action] Give friendly units +5 [Might] this turn."
 *
 * Q: Is that a one-shot snapshot when it resolves, or a standing buff that also catches later units?
 * A: A snapshot. Only the friendly units on the board at the moment it RESOLVES get +5; anything that
 *    arrives afterwards gets nothing.
 * Rules: 355.10.d (a programmatic "friendly units" set), 359.3 (a spell's instructions execute once as
 *    it resolves), 317.2 (the +5 expires in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRAND_STRATEGEM = "ogn-233-298";

/** P1's turn: two friendly units already out (one in base, one at a battlefield), a third in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 3, name: "Frontliner" }, "front")
    .unit(P2, "base", { might: 4, name: "Enemy" }, "enemy")
    .hand(P1, GRAND_STRATEGEM, "gs")
    .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Latecomer" }, "late");
}

async function resolveGS(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("gs");
  expect(game.chain().map((c) => c.cardId)).toEqual(["gs"]);
  expect(game.state("home").might).toBe(2); // nothing yet — it is only on the chain
  await game.settle();
  expect(game.zoneOf("gs")).toBe("trash");
  return game;
}

describe("Ruling 83e440752fbe4896 — Grand Strategem is a snapshot at resolution, not a standing aura", () => {
  test("every friendly unit on the board at resolution gets +5, wherever it stands; enemies get nothing", async () => {
    const game = await resolveGS();
    expect(game.state("home").might).toBe(7); // 2 + 5
    expect(game.state("front").might).toBe(8); // 3 + 5
    expect(game.state("enemy").might).toBe(4);
  });

  test("a unit played AFTER it resolved does not get the +5", async () => {
    const game = await resolveGS();
    await game.p1.play("late");
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late")).toMatchObject({ baseMight: 1, might: 1, mightModifier: 0 });
    expect(game.state("home").might).toBe(7); // the ones it did catch are unaffected by the newcomer
  });

  test("the newcomer stays at its printed Might for the rest of the turn — nothing re-applies", async () => {
    const game = await resolveGS();
    await game.p1.play("late");
    await game.settle();
    await game.p1.move("home", "bf1"); // more board activity; still no retro-buff
    await game.settle();
    expect(game.state("late").might).toBe(1);
  });

  test("the +5 the snapshot did hand out lasts exactly this turn", async () => {
    const game = await resolveGS();
    expect(game.state("front").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("front")).toMatchObject({ mightModifier: 0, might: 3 });
    expect(game.state("home").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
