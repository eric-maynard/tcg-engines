/**
 * Ruling 306f371578114d5d — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · Mind · 2 · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · Unit · 4 · 6 Might "As an additional cost to play me, kill a friendly unit."
 *
 * Q: What counts as "playing a spell" for triggers like Ravenbloom Student? Does a spell countered by Defy count?
 * A: Play triggers only happen after the card resolves; a countered spell was never "played", so the Student
 *    gets nothing. Nuance: Cruel Patron cannot kill himself for his own additional cost (costs are paid before
 *    he is on the board).
 * Rules: 419.4.a (a spell is "played" when it resolves), 346 (counter), 355 / 356 (additional costs paid while playing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";
const CRUEL_PATRON = "ogn-208-298";
const DISCIPLINE = "ogn-058-298"; // Reaction [2]: "Give a unit +2 [Might] this turn. Draw 1." — a Defy-able spell

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 1, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, DEFY, "defy");
}

async function passUntilChainEmpty(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling 306f371578114d5d — a Defied spell was never 'played': Ravenbloom Student does not trigger", () => {
  test("P1 casts Discipline, P2 Defies it: Discipline is countered, no Student trigger ever appears, Student stays 2, no draw", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "ally" });
    // The Student has NOT triggered on the cast itself (419.4.a) — only Discipline is on the chain.
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("defy", { targets: "discipline" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline", "defy"]);
    let sawStudentTrigger = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      sawStudentTrigger ||= game.chain().some((c) => c.cardId === "student");
      await game.acting().passPriority();
    }
    sawStudentTrigger ||= game.chain().some((c) => c.cardId === "student");
    expect(sawStudentTrigger).toBe(false);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("ally").might).toBe(1); // countered: no +2
    expect(game.p1.hand().length).toBe(handBefore - 1); // countered: no draw
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — uncountered: Discipline resolves, THEN the Student's trigger goes on the chain and gives it +1 (→ 3)", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    // Resolve Discipline only.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "discipline"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("ally").might).toBe(3);
    // Now the play trigger exists.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await passUntilChainEmpty(game);
    expect(game.state("student").might).toBe(3);
  });

  test("nuance — Cruel Patron can't kill himself for his own cost: alone he is unplayable; with an ally only the ally is a legal sacrifice", async () => {
    const alone = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(alone.p1.can("play", "patron")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(game.p1.can("play", "patron")).toBe(true);
    const sacrifices = (game.p1.option("play", "patron")?.variants ?? []).map((v) => v.params.sacrificeId);
    expect(sacrifices).toEqual(["pawn"]); // never "patron"
    expect((await game.p1.try((p) => p.play("patron", { sacrifice: "patron" }))).ok).toBe(false);
    await game.p1.play("patron", { sacrifice: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
  });
});
