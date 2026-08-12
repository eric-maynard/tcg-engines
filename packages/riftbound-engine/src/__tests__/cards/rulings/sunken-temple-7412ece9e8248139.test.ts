/**
 * Ruling 7412ece9e8248139 — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *   × Laurent Duelist (sfd-156-221) 3 Might, [Assault 2] — 5 Might only while an attacker.
 *   × Petty Officer (ogn-215-298) 5 Might, [Assault] — [Mighty] on its printed Might alone.
 *
 * Q: If I conquer Sunken Temple with a unit that only reaches 5 Might thanks to Assault, may I draw?
 * A (ruling): No — it claims the designations, and with them the Assault bonus, are gone before the conquer.
 * A (engine, CR): Yes. 466.5/466.5.d Establish Control + Conquer run first and 466.7.a removes the
 *    designations only when the combat ENDS afterwards, so 807.1.d.1 still has [Assault] live at the
 *    conquer. See the RULING-CONFLICT note on the test below.
 * Rules: 466.5 / 466.5.d (Establish Control, Conquer), 466.7.a (designations removed when combat ends),
 *        140 ([Mighty] = 5+ Might), 807.1.d.1 ([Assault] lasts as long as the Attacker designation).
 * SETTLED — do not re-litigate: DESIGN.md § "Combat Resolution Step (466) — two settled adjudications".
 *        Four riftjudge answers strip the designation before the Conquer (this one, 42b466db3f308240,
 *        c1e05840717871da, c1edab45ab8d7f0f) and all describe the pre-Unleashed rules; riftfaq
 *        8bf06d3d8b09e32c (citing 466.5.d vs 466.7.a), f04d5265ef4cdef8 and 211635a4cca0ac5a state the
 *        current one. Every one of those tests now asserts the CR reading.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const LAURENT_DUELIST = "sfd-156-221"; // 3 Might, [Assault 2]
const PETTY_OFFICER = "ogn-215-298"; // 5 Might, [Assault]

/** P1's turn. bf1 IS the Sunken Temple (abilities live), held by P2 with a 2-Might Guard. */
function board(attacker: string) {
  return scenario()
    .resources(P1, { energy: 1 }) // enough to pay the temple's [1], so payability is never the reason
    .battlefield("bf1", { controller: P2, def: SUNKEN_TEMPLE, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", attacker, "hero");
}

describe("Ruling 7412ece9e8248139 — Sunken Temple: an Assault-only 5 Might should be gone by the time the conquer is checked", () => {
  test("setup: while attacking, Laurent Duelist really is at 5 Might (printed 3 + [Assault 2]) and wins the battlefield", async () => {
    const game = await board(LAURENT_DUELIST).build();
    expect(game.state("hero").baseMight).toBe(3);
    expect(game.state("hero").keywords).toContain("Assault");
    await game.p1.move("hero", "bf1");
    expect(game.state("hero").combatRole).toBe("attacker");
    expect(game.state("hero").might).toBe(5); // Assault applies while it holds the Attacker designation
    await game.settle({ maxSteps: 200 });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  // RULING-CONFLICT: riftjudge 7412ece9e8248139 says the Attacker designation (and so [Assault 2]) is
  // stripped in the Combat Cleanup BEFORE the conquer, so an Assault-only 5 Might is not [Mighty] when
  // the temple checks; the Core Rules order the Resolution Step the other way round — 466.5/466.5.d
  // Establish Control and Conquer come FIRST and only 466.7.a "Remove Attacker and Defender Designation"
  // ends the combat afterwards, with 807.1.d.1 keeping [Assault] real for exactly as long as the
  // designation lasts (and riftjudge 211635a4cca0ac5a, tested in void-burrower-211635a4cca0ac5a, relies
  // on that: the Assault-Mighty attacker is still [Mighty] while the conquer trigger sits on the chain).
  // Engine follows the CR: the Duelist is 5 Might at the conquer, so the temple triggers and offers the draw.
  test("ruling 7412ece9e8248139 — CR order: the Assault 5 Might is still live at the conquer, so the temple offers the draw", async () => {
    const game = await board(LAURENT_DUELIST).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("hero", "bf1");
    const stop = await game.settle({ maxSteps: 200 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("hero").might).toBe(5); // 466.7.a has not run yet — 807.1.d.1 keeps [Assault] real
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle({ maxSteps: 200 });
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.energy()).toBe(0);
    // 466.7.a — once the combat has ended the designation (and the Assault Might) is gone.
    expect(game.state("hero").combatRole).toBeNull();
    expect(game.state("hero").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("control — a printed 5-Might Petty Officer IS [Mighty] on its own, so the temple asks and the draw happens", async () => {
    const game = await board(PETTY_OFFICER).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("hero", "bf1");
    const stop = await game.settle({ maxSteps: 200 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle({ maxSteps: 200 });
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
