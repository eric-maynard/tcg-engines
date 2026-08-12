/**
 * Ruling 2c049029fc2eb38f — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Does the Student trigger when a spell is put on the chain, or only when it resolves?
 * A: On resolution. A card is not "played" until the whole play process finishes — i.e. until it
 *    resolves and leaves the chain. Putting a spell on the chain does nothing for the Student; the
 *    trigger only goes on the chain after the spell resolves, and resolves after that.
 * Rules: 350.1 (a card is played once the play process finished), 419.4.a (play triggers fire on
 *        resolution), 425.1.b (a countered card was never played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn: Student (2) + Runner in base, Blood Rush + [1]; P2 has a spare unit so nothing else moves. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, BLOOD_RUSH, "rush");
}

describe("Ruling 2c049029fc2eb38f — the Student triggers when the spell RESOLVES, not when it hits the chain", () => {
  test("while Blood Rush is still sitting on the chain the Student has NOT triggered and is still 2 Might", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    expect(game.zoneOf("rush")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rush", triggered: false })]);
    expect(game.chain().filter((c) => c.cardId === "student")).toHaveLength(0);
    expect(game.state("student").might).toBe(2);
  });

  test("once the spell resolves the Student's trigger goes on the chain, and only then does it grant +1", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blood Rush resolves
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.state("runner").grantedKeywords).toHaveLength(1); // the spell's own effect already happened
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.state("student").might).toBe(2); // the trigger has not resolved yet

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
