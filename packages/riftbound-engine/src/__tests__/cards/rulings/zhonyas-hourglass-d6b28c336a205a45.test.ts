/**
 * Ruling d6b28c336a205a45 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: When Hourglass saves a dying unit, is it fully healed? What happens to damage vs. stat modifications?
 * A: Fully healed and recalled to base (else it would still be dead) — immediately, whether the lethal damage was combat
 *    or ability damage (e.g. Void Seeker). Non-damage stat modifications such as Smoke Screen's -X Might REMAIN applied.
 * Rules: 372/373 (replacement effects), Zhonya's errata'd text (heal + exhaust + recall), 432 (damage vs. Might modifiers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SMOKE_SCREEN = "ogn-093-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn. P1 holds bf1 with a 4-Might Guard and has a face-up Zhonya's in base. P2: Void Seeker + Smoke Screen with [5][fury][mind], and a 6-Might Crusher in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .gear(P1, ZHONYAS, "zh")
    .unit(P2, "base", { might: 6, name: "Crusher" }, "crusher")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

describe("Ruling d6b28c336a205a45 — a unit saved by Zhonya's is fully healed and recalled; -Might modifiers stay", () => {
  test("ABILITY damage (Void Seeker's 4 on the 4-Might Guard): Zhonya's is killed instead; the Guard is in base, exhausted, with 0 damage — cleared at once, mid-turn", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, might: 4 });
    expect(game.turnPlayer()).toBe(P2); // healed now, not at end of turn
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("COMBAT damage works the same: the Crusher (6) attacks the Guard (4) — Zhonya's dies instead, the Guard is recalled to base healed (0 damage) and exhausted; P2 takes bf1", async () => {
    const game = await board().build();
    await game.p2.move("crusher", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).not.toContain("guard");
    expect(game.locationOf("crusher")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Smoke Screen first (4 → 1 Might, min 1), then Void Seeker: saved, damage healed to 0 — but the -Might modifier REMAINS (still 1 Might in base) until it expires at end of turn", async () => {
    const game = await board().build();
    await game.p2.cast("smoke", { targets: "guard" });
    await game.settle();
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 1 });
    await game.p2.cast("seeker", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ baseMight: 4, damage: 0, isExhausted: true, might: 1 });
    expect(game.state("guard").mightModifier).toBeLessThan(0);
    await game.advanceTurn(); // → P1: "this turn" modifier gone
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 4, mightModifier: 0 });
  });
});
