/**
 * Ruling dd271dd76b388b09 — Convergent Mutation (OGN-108 → ogn-108-298) · [Reaction] · [2]+[mind]
 *     "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Targeting Ravenbloom Student (or raising another unit to the Student's Might): does the Student's "+1 when you play
 *    a spell" apply before or after the Mutation, and what is the final Might?
 * A: A spell counts as played only after it fully resolves, so the Student triggers AFTER the Mutation: Student copying a
 *    5-Might unit → 5, then +1 → 6. Raising another unit to the Student's Might copies the Student's CURRENT (pre-trigger)
 *    value; that unit stays there while the Student then goes +1. Countered ⇒ not played ⇒ no trigger. Lasts this turn only.
 * Rules: 419.4.a / 359.3.e.10 ("when you play" fires on resolution), 419.4.a.1 (countered ⇒ not played), 317.2 (expiry).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const WIND_WALL = "ogn-064-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P1, "base", { might: 1, name: "Tiny" }, "tiny")
    .hand(P1, CONVERGENT_MUTATION, "cm")
    .hand(P2, WIND_WALL, "ww");
}

describe("Ruling dd271dd76b388b09 — Ravenbloom Student triggers only after Convergent Mutation has fully resolved", () => {
  test("Student chosen to copy Big (5): while the spell is on the chain nothing has changed and no trigger exists; on resolution Student becomes 5, THEN its trigger resolves → 6", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("cm", { targets: ["student", "big"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cm", targets: ["student", "big"] })]);
    expect(game.chain().some((c) => c.triggered)).toBe(false); // not "played" yet ⇒ no Student trigger on the chain
    expect(game.state("student").might).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mutation resolves
    expect(game.zoneOf("cm")).toBe("trash");
    // Intermediate fact: the Student's trigger is a separate, later chain item (or already resolved) — never before the copy.
    if (game.chain().length > 0) {
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", triggered: true })]);
      expect(game.state("student").might).toBe(5);
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(6);
    expect(game.state("big").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("Tiny (1) raised to the Student's Might copies the Student's CURRENT 2; afterwards the Student triggers to 3 while Tiny stays 2", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["tiny", "student"] });
    await game.settle();
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("tiny").might).toBe(2);
    expect(game.state("student").might).toBe(3);
  });

  test("countered by Wind Wall: the Mutation is not 'played' — no Student trigger, everyone keeps printed Might", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["student", "big"] });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "cm" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").mightModifier).toBe(0);
    expect(game.state("big").might).toBe(5);
  });

  test("errata: the increase lasts only this turn — after the turn ends Student is back to 2", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["student", "big"] });
    await game.settle();
    expect(game.state("student").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});
