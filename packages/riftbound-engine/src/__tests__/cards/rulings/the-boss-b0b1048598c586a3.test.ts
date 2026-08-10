/**
 * Ruling b0b1048598c586a3 — The Boss (OGN-269 → ogn-269-298) · Legend (Sett) · "If a buffed unit you control would die, you may pay
 *   [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] · "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: If a Smoke-Screened unit is saved by Sett's legend, does the Might reduction stay for the turn, or does the save clear debuffs?
 * A: It stays. The recall keeps the same game object (base → still that unit), so temporary +/- Might effects persist until they
 *    expire; "heal" removes damage, not debuffs. Recall is not a move.
 * Rules: 371 (replacement effect), 141.3 (recall isn't a move; same object stays on the board), 145 (Might modifications last
 *        their stated duration), 317.2 (expire at end of turn), 140.4 (heal = remove damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const SMOKE_SCREEN = "ogn-093-298";

/**
 * P2's turn. P1: The Boss (ready), 1 body power for its [rainbow]; buffed 4-Might Brawler (→ 5) holding bf1. P2: Smoke Screen +
 * [2][mind], a 3-Might Raider in base.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 0, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Brawler" }, "brawler", { buffed: true })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P2 Smoke Screens the Brawler (5 → 1), then attacks with the Raider; combat would kill the Brawler → the Boss asks P1. */
async function smokedAndAttacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 5 });
  await game.p2.cast("smoke", { targets: "brawler" });
  await game.settle();
  expect(game.state("brawler")).toMatchObject({ damage: 0, might: 1, mightModifier: -4 });
  await game.p2.move("raider", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  return game;
}

describe("Ruling b0b1048598c586a3 — the Boss's save keeps the unit's Smoke Screen debuff", () => {
  test("P1 accepts: Boss exhausted, [rainbow] paid, buff spent — the Brawler is healed, exhausted and recalled to base instead of dying", async () => {
    const game = await smokedAndAttacked();
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    // The Raider took only the Brawler's 1 and conquers the emptied bf1.
    expect(game.state("raider")).toMatchObject({ zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the -4 [Might] is still on the recalled Brawler (same object): base 4, no buff, the Smoke Screen reduction still applied for the rest of the turn — the save did not 'heal' the debuff", async () => {
    const game = await smokedAndAttacked();
    await game.p1.yes();
    await game.settle();
    expect(game.state("brawler")).toMatchObject({ baseMight: 4, isBuffed: false, mightModifier: -4, zone: "base" });
    // (whether Smoke Screen's "minimum of 1" floor re-clamps after the buff is spent is not part of this ruling)
    expect(game.state("brawler").might).toBeLessThanOrEqual(1);
    expect(game.state("brawler").might).not.toBe(4);
  });

  test("…and it wears off normally at end of turn: on P1's next turn the Brawler is back to 4", async () => {
    const game = await smokedAndAttacked();
    await game.p1.yes();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("brawler")).toMatchObject({ might: 4, mightModifier: 0, zone: "base" });
  });
});
