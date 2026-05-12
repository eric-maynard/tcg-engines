/**
 * Rules Audit: damage-vs-Might death uses *effective* Might (CR 2026-03-30).
 *
 * Covers:
 *   - Rule 323.5 (Cleanup, step 3b): "All Units that have non-zero Damage
 *     marked on them equalling or exceeding their Might are killed and placed
 *     in their owners' Trash." — the comparison is against the unit's *current*
 *     (effective) Might, not its printed base Might.
 *   - Rule 140.x / 703 / 710: a unit's current Might includes the [+1] buff
 *     counter, runtime ±Might modifiers, static-ability Might bonuses, and
 *     attached-equipment Might bonuses. The Cleanup death check (and the engine
 *     state-based-checks pass) must use that full value.
 *   - Rule 143.2.b: a unit whose Might has been reduced below 0 is treated as
 *     0 → any non-zero damage is lethal.
 *
 * Regression target: the state-based-checks pass previously read `def.might`
 * (base only), so a buffed unit at base-lethal damage was wrongly killed and a
 * Might-reduced unit at reduced-lethal damage was wrongly spared.
 *
 * Methodology: minimal state -> seed damage + a Might modifier on a unit ->
 * run the cleanup pass -> assert whether the unit was killed.
 */

import { describe, expect, it } from "bun:test";
import { P1, createBattlefield, createCard, createMinimalGameState, getCardsInZone, runCleanup } from "./helpers";

describe("Rule 323.5 / 140.x: Cleanup kills units by *effective* Might, not base", () => {
  it("a unit at base-lethal damage SURVIVES if a [+1] buff lifts effective Might above the damage", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Base Might 2, +1 buff → effective 3. 2 damage < 3 → survives.
    createCard(engine, "bruiser", {
      cardType: "unit",
      meta: { buffed: true, damage: 2 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = runCleanup(engine);

    expect(result.killed).not.toContain("bruiser");
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("bruiser");
    expect(getCardsInZone(engine, "trash", P1)).not.toContain("bruiser");
  });

  it("a unit at effective-lethal damage IS killed (buff present but damage still meets effective Might)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Base Might 2, +1 buff → effective 3. 3 damage >= 3 → killed.
    createCard(engine, "doomed", {
      cardType: "unit",
      meta: { buffed: true, damage: 3 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = runCleanup(engine);

    expect(result.killed).toContain("doomed");
    expect(getCardsInZone(engine, "trash", P1)).toContain("doomed");
  });

  it("a Might-REDUCED unit IS killed when damage meets its reduced effective Might", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Base Might 3, mightModifier -2 → effective 1. 1 damage >= 1 → killed.
    // (Reading base Might 3 would have wrongly spared it.)
    createCard(engine, "withered", {
      cardType: "unit",
      meta: { damage: 1, mightModifier: -2 },
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = runCleanup(engine);

    expect(result.killed).toContain("withered");
    expect(getCardsInZone(engine, "trash", P1)).toContain("withered");
  });

  it("a unit reduced BELOW 0 Might is treated as 0 (rule 143.2.b) → any non-zero damage is lethal", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Base Might 2, mightModifier -5 → effective clamps to 0. 1 damage > 0 → killed.
    createCard(engine, "voidtouched", {
      cardType: "unit",
      meta: { damage: 1, mightModifier: -5 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = runCleanup(engine);

    expect(result.killed).toContain("voidtouched");
    expect(getCardsInZone(engine, "trash", P1)).toContain("voidtouched");
  });

  it("an undamaged 0-effective-Might unit is NOT killed (rule 323.5 requires non-zero Damage)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "ghostly", {
      cardType: "unit",
      meta: { damage: 0, mightModifier: -5 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = runCleanup(engine);

    expect(result.killed).not.toContain("ghostly");
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("ghostly");
  });

  it("a non-unit card (no base Might) at high damage is never killed by the rule-323.5 check", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // Gear has no base Might; even with damage marked it must not be reaped here.
    createCard(engine, "trinket", {
      cardType: "gear",
      meta: { attachedTo: undefined, damage: 99 },
      owner: P1,
      zone: "base",
    });

    const result = runCleanup(engine);

    expect(result.killed).not.toContain("trinket");
  });
});
