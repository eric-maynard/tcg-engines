/**
 * Ruling 13c980dd6fd72d19 — Stormbringer (OGN-250 → ogn-250-298) · Spell · Fury/Body · 6 + 2 pips
 *   "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield,
 *    then move your unit there."
 *   × Lee Sin, Centered (ogn-151-298) · 6 Might · "Other buffed friendly units at my battlefield have +2 [Might]."
 *
 * Q: Stormbringer's simultaneous damage kills Lee Sin and also hits a unit he is pumping. Does that unit lose
 *    Lee Sin's +2 before or after taking the damage?
 * A: After. It takes the damage with the +2 still on; Lee Sin then dies; the +2 goes away; THEN it is checked
 *    for lethal damage at its new, lower Might — so it can survive the hit and still die to the lost bonus when
 *    the damage falls between its unbuffed and buffed Might.
 * Rules: 437 (damage is dealt simultaneously), 323.3–323.5 (cleanup: kill units with lethal damage; statics
 *        re-evaluated as the board changes), 142.4 (lethal = damage ≥ current Might), 364 (passive bonuses end
 *        when their source leaves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const LEE_SIN = "ogn-151-298";

/**
 * P2 holds bf1 with Lee Sin (6) and a BUFFED Monk (base `monkBase` +1 buff, +2 from Lee Sin while he lives).
 * P1's Storm Caller in base has 6 Might → Stormbringer deals exactly 6 to every enemy unit at bf1.
 */
function board(monkBase: number) {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Storm Caller" }, "caller")
    .unit(P2, "bf1", LEE_SIN, "leesin")
    .unit(P2, "bf1", { might: monkBase, name: "Monk" }, "monk", { buffed: true })
    .hand(P1, STORMBRINGER, "sb");
}

async function resolveStormbringer(game: Game): Promise<void> {
  await game.p1.cast("sb", { targets: ["caller", "bf1"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "sb"); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.zoneOf("sb")).toBe("trash");
}

describe("Ruling 13c980dd6fd72d19 — Stormbringer kills Lee Sin; his +2 leaves AFTER damage is dealt, BEFORE the survivor's death check", () => {
  test("setup: buffed Monk (5 base) reads 8 next to Lee Sin — 5 + 1 (buff) + 2 (Lee Sin); Lee Sin is 6", async () => {
    const game = await board(5).build();
    expect(game.state("leesin").might).toBe(6);
    expect(game.state("monk")).toMatchObject({ isBuffed: true, might: 8, staticMightBonus: 2 });
  });

  test("ruling 13c980dd6fd72d19 — 6 damage to both: Lee Sin (6) dies; Monk took 6 at 8 Might (survivable) but drops to 6 without Lee Sin → 6 ≥ 6, Monk dies too; Storm Caller walks into the emptied bf1 and conquers", async () => {
    const game = await board(5).build();
    await resolveStormbringer(game);
    expect(game.zoneOf("leesin")).toBe("trash");
    expect(game.zoneOf("monk")).toBe("trash"); // died to the LOST bonus, not to the raw hit
    expect(game.locationOf("caller")).toBe("bf1");
    // The emptied battlefield opens a (non-combat) showdown; settle() hands an auto-begun showdown back once.
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Monk with 6 base (9 with Lee Sin, 7 without): takes the same 6, loses the +2, and SURVIVES at 7 Might with 6 damage marked — proving damage was dealt first and only then re-checked", async () => {
    const game = await board(6).build();
    expect(game.state("monk").might).toBe(9);
    await resolveStormbringer(game);
    expect(game.zoneOf("leesin")).toBe("trash");
    expect(game.state("monk")).toMatchObject({ damage: 6, isBuffed: true, might: 7, staticMightBonus: 0, zone: "battlefield-bf1" });
    // Storm Caller still moves in — now it's a real combat (6 into a 7-Might Monk carrying 6 damage).
    expect(game.locationOf("caller")).toBe("bf1");
    expect(game.state("caller").combatRole).toBe("attacker");
    expect(game.state("monk").combatRole).toBe("defender");
  });
});
