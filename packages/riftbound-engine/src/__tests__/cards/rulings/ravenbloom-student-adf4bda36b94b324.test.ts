/**
 * Ruling adf4bda36b94b324 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might "When you play a spell, give me +1 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) [Reaction] [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Does the Student's ability trigger if the spell gets countered?
 * A: No. A countered spell never resolves and is not considered "played"; "When you play a spell" only triggers off a spell that
 *    successfully resolves, so the Student gets nothing.
 * Rules: 425.1.b / 419.4.a.1 (a countered card is not 'played' for TRIGGERED abilities; 419.4.b: non-triggered checks such as Legion
 *        still see the finalized play), 383.4.a (play triggers), 340 (LIFO — the counter resolves first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";
const CLEAVE = "ogn-004-298"; // [1] Action "Give a unit [Assault 3] this turn." — a cheap Defy-able spell

/** P1's turn. P1: Student (2) in base, a Target dummy (3) in base, Cleave + [1]. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 3, name: "Dummy" }, "dummy")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy");
}

/** Resolve the whole chain, reporting whether a Student item ever appeared on it. */
async function drainWatchingStudent(game: Game): Promise<boolean> {
  let seen = false;
  for (let i = 0; i < 10; i++) {
    seen ||= game.chain().some((c) => c.cardId === "student");
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  seen ||= game.chain().some((c) => c.cardId === "student");
  return seen;
}

describe("Ruling adf4bda36b94b324 — a Defied spell does not trigger Ravenbloom Student", () => {
  test("casting Cleave puts only Cleave on the chain — the Student has not triggered yet (nothing is 'played' until it resolves)", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("P2 Defies it: Defy resolves first, Cleave is countered to the trash without resolving → the Student NEVER triggers and stays at 2; the Dummy gets no Assault; no refund", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dummy" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "cleave" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "defy"]);
    const studentTriggered = await drainWatchingStudent(game);
    expect(studentTriggered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("dummy").grantedKeywords).toEqual([]); // countered: no effect
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.p1.energy()).toBe(0);
    // 419.4.b: the finalized-then-countered play still counts for NON-triggered "played a card" checks (Legion) — only triggers skip it.
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control: unopposed, Cleave resolves (is 'played') → the Student triggers and ends at 3 Might this turn", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dummy" });
    const studentTriggered = await drainWatchingStudent(game);
    await game.settle();
    expect(game.state("dummy").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(studentTriggered || game.state("student").mightModifier === 1).toBe(true);
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });
});
