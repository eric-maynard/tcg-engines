/**
 * Ruling 51963a4ab9fc983b — (no specific card) does paying [Repeat] count as playing the card twice?
 *   Exercised with Feral Strength (SFD-034 → sfd-034-221) · [2] · "[Reaction] [Repeat] [2] — Give a unit
 *   +2 [Might] this turn." and Ravenbloom Student (OGN-103 → ogn-103-298) · "When you play a spell, give
 *   me +1 [Might] this turn."
 *
 * Q: Does activating Repeat on a card count as playing it twice?
 * A: No. Repeat is an additional cost that executes the spell's instructions an extra time inside the SAME
 *    chain item; the card is played once, so "when you play a card/spell" effects trigger once.
 * Rules: 820 [Repeat] (an optional additional cost; the instructions are executed once more — the spell is
 *        played only once), 349 (additional costs are part of the one play), 383.4 (a "when you play …"
 *        trigger keys on the play event, of which there is exactly one).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const FERAL = "sfd-034-221"; // [Reaction] · [2] · [Repeat] [2] · "Give a unit +2 [Might] this turn."
const STUDENT = "ogn-103-298"; // 2 Might · "When you play a spell, give me +1 [Might] this turn."

/** P1's turn with a Ravenbloom Student as the "played a spell" counter and a 3-Might dummy to buff. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", STUDENT, "student")
    .unit(P1, "base", { might: 3, name: "Dummy" }, "dummy")
    .hand(P1, FERAL, "feral");
}

describe("Ruling 51963a4ab9fc983b — [Repeat] repeats the effect, not the play", () => {
  test("without Repeat: the effect runs once (+2) and the Student's play trigger fires once (+1)", async () => {
    const game = await board(2).build();
    await game.p1.cast("feral", { targets: "dummy" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("dummy").might).toBe(5); // 3 + 2
    expect(game.state("student").might).toBe(3); // 2 + 1 — one play
    expect(game.zoneOf("feral")).toBe("trash");
  });

  test("with Repeat paid: the EFFECT happens twice (+2 +2) but the card was played ONCE, so the Student gains only +1", async () => {
    const game = await board(4).build();
    await game.p1.cast("feral", { repeat: 1, targets: "dummy" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // [2] base + [2] Repeat, one play
    expect(game.state("dummy").might).toBe(7); // 3 + 2 + 2
    expect(game.state("student").might).toBe(3); // 2 + 1 — NOT +2
    expect(game.zoneOf("feral")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the contrast that makes it visible: playing two separate copies of the spell DOES trigger the Student twice", async () => {
    const game = await board(4).hand(P1, FERAL, "feral2").build();
    await game.p1.cast("feral", { targets: "dummy" });
    await game.settle();
    await game.p1.cast("feral2", { targets: "dummy" });
    await game.settle();
    expect(game.state("dummy").might).toBe(7); // same +4 as the repeated spell…
    expect(game.state("student").might).toBe(4); // …but two plays ⇒ 2 + 1 + 1
  });

  test("only one chain item exists while the repeated spell is waiting to resolve", async () => {
    const game = await board(4).build();
    await game.p1.cast("feral", { repeat: 1, targets: "dummy" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["feral"]);
    await game.settle();
    expect(game.state("dummy").might).toBe(7);
  });
});
