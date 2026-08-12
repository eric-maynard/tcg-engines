/**
 * Ruling c1e05840717871da — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *   × Cleave (ogn-004-298) — "Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)"
 *
 * Q: If a unit is [Mighty] only because of [Assault], has it lost Mighty by the time Sunken Temple's
 *    effect could be used after conquering?
 * A (this ruling): Yes — "attacker and defender tags are removed in cleanup … before you conquer".
 * A (CR, adjudicated 2026-08-12): NO. The ruling's premise does not exist in the current Core Rules. The
 *    Resolution Step is an ordered sequence: 466.1 Combat Cleanup, 466.2 chain window, 466.3 result,
 *    466.5 Establish Control (466.5.d = the Conquer) and only then 466.7.a "Remove Attacker and Defender
 *    Designation from all Units and Players". The Combat Cleanup (466.1.a) inserts steps 3c/3d only — it
 *    does not strip designations. So at the Conquer the attacker still holds its designation, 807.1.d.1
 *    keeps [Assault] in effect, and the conqueror is [Mighty] (708/710). This ruling and 42b466db3f308240
 *    describe the PRE-Unleashed rules (see f04d5265ef4cdef8: "previously, Assault would have deactivated
 *    before conquer effects resolved"); riftfaq 8bf06d3d8b09e32c cites 466.5.d vs 466.7.a directly.
 * Rules: 466.1.a / 466.1.a.1-2 (what the Combat Cleanup actually inserts), 466.5.d (Conquer) vs 466.7.a
 *        (designations removed, two steps later), 807.1.c / 807.1.d.1 ([Assault] while an attacker),
 *        708 / 710 ([Mighty] = 5+).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const CLEAVE = "ogn-004-298";

/** P1's turn. bf1 IS the Sunken Temple, held by P2 with a stunned 2-Might Guard that dies to the attack. */
function board(attackerMight: number) {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2, def: SUNKEN_TEMPLE, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: attackerMight, name: "Raider" }, "raider");
}

describe("Ruling c1e05840717871da (RULING-CONFLICT) — CR 466.5.d/466.7.a: an [Assault]-only [Mighty] unit is STILL Mighty when Sunken Temple checks", () => {
  test("control: a naturally 5-Might attacker conquers the Temple and IS offered the draw", async () => {
    const game = await board(5).build();
    await game.p1.move("raider", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("bf1");

    const deckBefore = game.p1.deck().length;
    await game.p1.yes();
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1);
    expect(game.p1.points()).toBe(1);
  });

  test("setup: Cleave really does make the 3-Might Raider a 6-Might attacker during the combat", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("raider").might).toBe(6); // 3 + [Assault 3]
  });

  test("supporting fact: once the combat is over the attacker tag is gone and the Raider is a plain 3 Might again", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.state("raider").might).toBe(3); // never [Mighty] outside the attack
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(1);
  });

  // RULING-CONFLICT (adjudicated 2026-08-12 — these two facets PREVIOUSLY asserted the other way, as
  // `test.failing` "the engine still offers the draw" bug markers).
  // riftjudge c1e05840717871da (and 42b466db3f308240, and the FAQ-list twin c1edab45ab8d7f0f) say the
  // attacker/defender tags come off "in cleanup … before you conquer". No CR step does that: the Combat
  // Cleanup is 466.1 and inserts only "3c. Heal all Units" / "3d. Recall Attackers …" (466.1.a.1-2); the
  // Conquer is 466.5.d; the designations are removed at 466.7.a, TWO steps after the Conquer. [Assault]
  // therefore still applies at 466.5.d (807.1.d.1 — "remains in effect as long as the Unit maintains the
  // Attacker designation"), so the 6-Might Raider is [Mighty] (708/710) and the Temple asks.
  // The three stripping rulings all describe the pre-Unleashed rules, where combat Might was modulated for
  // the damage step only (2025-06-02 CR 625.1.b / 627); f04d5265ef4cdef8 states the change explicitly and
  // riftfaq 8bf06d3d8b09e32c cites 466.5.d vs 466.7.a. The engine follows the CR.
  test("RULING-CONFLICT c1e05840717871da — the [Assault]-only Mighty attacker DOES enable Sunken Temple: the draw is offered", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    await game.p1.move("raider", "bf1");
    const stop = await game.settle();

    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("bf1");
  });

  test("RULING-CONFLICT c1e05840717871da — and paying the Temple's [1] after such a conquer really draws", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    const deckBefore = game.p1.deck().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
