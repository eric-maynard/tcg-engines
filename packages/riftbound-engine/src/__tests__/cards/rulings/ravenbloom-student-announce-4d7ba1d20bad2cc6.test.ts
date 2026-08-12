/**
 * Ruling 4d7ba1d20bad2cc6 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might ·
 *   "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: In a higher-level tournament, must you announce the Ravenbloom trigger for every single spell?
 * A: A communication/shortcut point: you only have to announce the Might change when it matters to the board
 *    state (damage, combat); players may agree a shortcut for the rest. The announcement policy itself is a
 *    tournament-floor matter and is NOT modelled by the engine. What IS modelled — and asserted here — is
 *    that the trigger really does fire on EVERY spell, each firing is its own chain item, the +1s accumulate,
 *    and the total is exactly what combat reads.
 * Rules: 383.4 (a triggered ability fires each time its event happens), 337.1 (each firing is its own chain
 *        item), 465.2 (combat uses CURRENT Might), 317.2 ("this turn" effects lapse in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUDENT = "ogn-103-298";

/** [Action] "Give a unit +0 [Might] this turn." — a do-nothing spell, so only the Student's trigger moves Might. */
const CANTRIP = {
  abilities: [
    { effect: { amount: 0, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Cantrip",
  rulesText: "[Action] Give a unit +0 [Might] this turn.",
  timing: "action",
} as const;

function board(spells: number) {
  let s = scenario().unit(P1, "base", STUDENT, "student");
  for (let i = 0; i < spells; i++) {
    s = s.hand(P1, CANTRIP, `c${i}`);
  }
  return s;
}

describe("Ruling 4d7ba1d20bad2cc6 — the Student's trigger fires on every spell and the Might really accumulates", () => {
  test("each spell fires the trigger once more and adds exactly +1 — and the +1 is not instant, it resolves like any effect", async () => {
    const game = await board(3).build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("c0", { targets: "student" });
    expect(game.state("student").might).toBe(2); // still nothing while the chain is live
    await game.settle();
    expect(game.state("student").might).toBe(3);
    await game.p1.cast("c1", { targets: "student" });
    await game.settle();
    expect(game.state("student").might).toBe(4);
    await game.p1.cast("c2", { targets: "student" });
    await game.settle();
    expect(game.state("student").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("this is exactly where announcing matters: the accumulated Might is what combat reads", async () => {
    const game = await board(2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .build();
    await game.p1.cast("c0", { targets: "student" });
    await game.settle();
    await game.p1.cast("c1", { targets: "student" });
    await game.settle();
    expect(game.state("student").might).toBe(4); // 2 + 1 + 1
    await game.p1.move("student", "bf1");
    await game.settle();
    // 4 vs 4: both die. With one spell fewer the Student would simply have died alone.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("student")).toBe("trash");
  });

  test("…and it is only 'this turn': the accumulated Might is gone by the next turn", async () => {
    const game = await board(2).build();
    await game.p1.cast("c0", { targets: "student" });
    await game.settle();
    await game.p1.cast("c1", { targets: "student" });
    await game.settle();
    expect(game.state("student").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});
