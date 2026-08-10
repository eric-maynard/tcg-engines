/**
 * Ruling 843742fac175f472 — Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] "[Hidden] Kill a unit at a battlefield. Its controller
 *   draws 2." × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it,
 *   and recall it." × Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: If Hidden Blade's target becomes invalid before resolution (e.g. moved to base), does its controller still draw 2?
 * A: No. The target must still be "a unit at a battlefield" on resolution; if not, no kill is attempted and "its controller" is
 *    null → nobody draws. Nuances: if the unit is instead SAVED by a replacement (Zhonya's) while still a legal target, its
 *    controller does draw 2; and Void Seeker's "Draw 1" doesn't reference the target, so it draws even when the target is gone.
 * Rules: 359.3.e (illegal target → tied instructions skipped), 359.3.e.14 (linked "its" references), 369–372 (replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";
const FLASH = "ogs-011-024"; // Reaction · [2] "Move up to 2 friendly units to base." — makes the target "not at a battlefield"

/** P1's turn: Hidden Blade + Void Seeker with [5][order][fury]. P2 holds bf1 with Victim (3) and has Flash + [2]. Optionally Zhonya's face up in P2's base. */
function board(withZhonyas = false) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { fury: 1, order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1 })
    .unit(P2, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, FLASH, "flash");
  return withZhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** P1 casts `spell` at the Victim and passes; P2 Flashes the Victim to base; Flash resolves; the spell still waits. */
async function castThenFlashVictimHome(spell: "blade" | "seeker"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast(spell, { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: spell, controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["victim"] });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash resolves
  expect(game.zoneOf("victim")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: spell, targets: ["victim"] })]);
  return game;
}

describe("Ruling 843742fac175f472 — Hidden Blade with an invalid target: no kill and NO draw", () => {
  test("control: unanswered, Hidden Blade kills the Victim and ITS CONTROLLER (P2) draws 2", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });

  test("Victim Flashed to base before resolution: it is no longer 'a unit at a battlefield' → invalid → no kill attempt AND nobody draws (P2's hand: −Flash, +0)", async () => {
    const game = await castThenFlashVictimHome("blade");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length; // after Flash left the hand
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 1, zone: "base" }); // untouched
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw for "its controller"
    expect(game.p1.hand()).toHaveLength(p1Hand); // and certainly none for the caster
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Void Seeker's 'Draw 1' does not reference the target: Victim Flashed away → no damage, but P1 STILL draws 1", async () => {
    const game = await castThenFlashVictimHome("seeker");
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 1, zone: "base" });
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
  });

  test("nuance — saved by a replacement while still a LEGAL target (Zhonya's in P2's base): the kill is replaced (Zhonya's dies; Victim healed, exhausted, recalled) yet P2 still draws 2", async () => {
    const game = await board(true).build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.violations()).toEqual([]);
  });
});
