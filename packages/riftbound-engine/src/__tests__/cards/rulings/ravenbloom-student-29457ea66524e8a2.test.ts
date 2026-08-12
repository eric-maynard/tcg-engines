/**
 * Ruling 29457ea66524e8a2 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Blood Rush (SFD-003 → sfd-003-221) · [1] Action, "[Repeat] [1] … Give a unit [Assault 2] this turn."
 *
 * Q: Ravenbloom Student and spell [Repeat] — does the Student trigger twice / get +2?
 * A: No. Paying [Repeat] executes the spell's instructions a second time but the spell is still PLAYED
 *    only once, so "when you play a spell" fires exactly once: +1 Might, not +2.
 * Rules: 746.3.a / 820 (Repeat re-executes the effect; the spell is played once), 383.1 (one trigger per event).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn: Student (2) and a Runner in base, Blood Rush in hand, `energy` available. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, BLOOD_RUSH, "rush");
}

describe("Ruling 29457ea66524e8a2 — a [Repeat]ed spell is still played once: Ravenbloom Student gains +1, not +2", () => {
  test("control: Blood Rush without Repeat — exactly one Student trigger, Might 2 → 3", async () => {
    const game = await board(1).build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.state("runner").grantedKeywords).toHaveLength(1);
  });

  test("ruling: with [Repeat] paid ([1]+[1]) there is ONE spell object, and its resolution puts ONE Student trigger up", async () => {
    const game = await board(2).build();
    await game.p1.cast("rush", { repeat: 1, targets: ["runner"] });
    expect(game.p1.energy()).toBe(0); // base + repeat both paid
    expect(game.chain().filter((c) => c.cardId === "rush")).toHaveLength(1); // one spell object
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blood Rush (both executions) resolves
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.chain().filter((c) => c.cardId === "student" && c.triggered)).toHaveLength(1);
  });

  test("ruling: after everything resolves the Student is at 3 Might (+1), while the spell's effect DID run twice", async () => {
    const game = await board(2).build();
    await game.p1.cast("rush", { repeat: 1, targets: ["runner"] });
    await game.settle();
    expect(game.state("student").might).toBe(3); // NOT 4
    expect(game.state("runner").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 2 },
      { duration: "turn", keyword: "Assault", value: 2 },
    ]);
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
