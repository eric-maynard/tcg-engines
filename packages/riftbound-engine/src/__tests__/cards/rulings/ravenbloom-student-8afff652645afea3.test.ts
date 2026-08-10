/**
 * Ruling 8afff652645afea3 — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · Mind · 2 · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   × Cleave (ogn-004-298, [1] Action "Give a unit [Assault 3] this turn") × Discipline (ogn-058-298, [2] Reaction)
 *   × Defy (OGN-045 → ogn-045-298, [1][calm] Reaction "Counter a spell that costs no more than [4] …")
 *
 * Q: In a showdown, A (Focus) plays an Action — does priority stay with A? Who gets Focus after the chain? When does
 *    Ravenbloom Student trigger, is it a chain item, and does it trigger if the spell is countered?
 * A: A keeps priority after playing (may keep playing reaction-speed cards) until A passes; then players alternate.
 *    When the last item resolves Focus passes to the next player. The Student triggers only after the spell has fully
 *    resolved, puts its +1 on the chain (its owner gets priority first). A countered spell never resolved / was never
 *    "played" → no Student trigger.
 * Rules: 313.2–313.4, 336–340 (priority after adding an item stays with that player), 346/347.1.b (Focus passes to the
 *        next player when the chain closes), 419.4.a + 350.1 (play triggers fire on completion), 425.1 (countered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const CLEAVE = "ogn-004-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

/**
 * P1's turn. P2's Wall (8) holds bf1. P1: Student in base, Cleave + Discipline in hand, 3 energy (1 + 2).
 * P2: Defy with exactly [1][calm]. The Student attacks alone → combat showdown, P1 (attacker) has Focus.
 */
async function studentAttacks(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .build();
  await game.p1.move("student", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("student")).toMatchObject({ combatRole: "attacker", might: 2 });
  return game;
}

describe("Ruling 8afff652645afea3 — showdown priority/focus flow and when Ravenbloom Student triggers", () => {
  test("A (Focus) plays an Action: the spell is the only chain item (no Student trigger yet — it hasn't resolved) and PRIORITY STAYS WITH A, who could still play the Reaction Discipline", async () => {
    const game = await studentAttacks();
    await game.p1.cast("cleave", { targets: "student" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1, triggered: false })]);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    expect(game.state("student").might).toBe(2); // nothing applied on merely playing from hand
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.can("passPriority")).toBe(true);
  });

  test("A passes → B gets priority (and could Defy); B passes → Cleave resolves; ONLY THEN the Student's trigger interjects onto the chain as a triggered item, with priority to its owner P1 first", async () => {
    const game = await studentAttacks();
    await game.p1.cast("cleave", { targets: "student" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.passPriority(); // both passed in succession → Cleave resolves
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("student").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const before = game.state("student").might; // 2 + Assault 3 while attacking
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves: +1 Might this turn
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(before + 1);
    expect(game.state("student").mightModifier).toBe(1);
  });

  test("when the last item on that chain resolves, Focus passes: the NEXT player (P2, who did not start the chain) now has Focus + priority in the showdown", async () => {
    const game = await studentAttacks();
    await game.p1.cast("cleave", { targets: "student" });
    for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("passFocus")).toBe(true);
  });

  test("countered: B answers Cleave with Defy; Defy resolves first and counters it — Cleave goes to the trash unresolved (no Assault) and the Student NEVER triggers (no chain item, Might stays 2)", async () => {
    const game = await studentAttacks();
    await game.p1.cast("cleave", { targets: "student" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "defy"]);
    let sawStudentTrigger = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      sawStudentTrigger ||= game.chain().some((c) => c.cardId === "student");
      await game.seat(d.seat).passPriority();
    }
    expect(sawStudentTrigger).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("student").grantedKeywords).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} }); // Cleave's [1] not refunded
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
