/**
 * Ruling 46fcfcbeb4b89bed — Daring Poro (OGN-210 → ogn-210-298, 2 Might, [Assault]) × Flash
 *   (OGS-011 → ogs-011-024, "[Reaction] Move up to 2 friendly units to base").
 *
 * Q: A unit with [Assault] has marked damage that is lethal for its BASE Might but not for its
 *    Assault-boosted Might. Does it die when the Assault bonus goes away?
 * A: Yes — losing the attacker designation drops the bonus, another cleanup runs and the unit now has
 *    damage ≥ Might, so it dies. But a unit that STAYS at the battlefield and survives the combat does
 *    NOT die: the Combat Cleanup heals every unit (step 3c) before the designations come off.
 * Rules: 807.1 ([Assault] applies while the unit is an attacker), 466.1.a.1 (Combat Cleanup heals all
 *        units), 466.7.a (designations removed only when combat ends — two steps after the heal),
 *        320 / 323 (state-based checks: damage ≥ Might ⇒ dies at the next cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARING_PORO = "ogn-210-298"; // 2 Might · [Assault] (+1 while attacking)
const FLASH = "ogs-011-024"; // [Reaction] · 2 energy · Move up to 2 friendly units to base

/** [Action] "Deal 2 to a unit." */
const BOLT2 = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/** bf1 is P2's, guarded by a STUNNED 1-Might Sentry so combat damage never muddies the picture. */
const board = () =>
  scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry", { stunned: true })
    .unit(P1, "base", DARING_PORO, "poro")
    .hand(P1, BOLT2, "bolt")
    .hand(P1, FLASH, "flash");

/** Poro attacks (2 → 3 Might) and takes exactly 2 damage — lethal for its base Might, not for 3. */
async function attackAndDamage(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("poro", "bf1");
  expect(game.state("poro")).toMatchObject({ combatRole: "attacker", might: 3 });
  await game.p1.cast("bolt", { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("poro")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
  return game;
}

describe("Ruling 46fcfcbeb4b89bed — damage that only the [Assault] bonus is holding back becomes lethal when the bonus goes", () => {
  test("2 damage on a 2-Might Poro is survivable only while it is an attacker", async () => {
    const game = await attackAndDamage();
    expect(game.state("poro").baseMight).toBe(2);
    expect(game.state("poro").might).toBe(3); // 2 + [Assault]
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });

  test("Flashing it home strips the attacker designation → Might back to 2 with 2 damage marked → it dies", async () => {
    const game = await attackAndDamage();
    await game.p2.passFocus(); // focus came to P2 when the bolt chain emptied; it comes back
    await game.p1.cast("flash", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("staying put is the opposite: the Combat Cleanup heals it (3c) BEFORE the designation is removed (466.7.a), so it survives at 2 Might with no damage", async () => {
    const game = await attackAndDamage();
    await game.p2.passFocus();
    await game.p1.passFocus(); // two passes in succession → the showdown closes and combat resolves
    await game.settle();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro")).toMatchObject({ damage: 0, might: 2 }); // healed, then the bonus fell off
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
