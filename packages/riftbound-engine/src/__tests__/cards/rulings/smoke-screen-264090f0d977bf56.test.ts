/**
 * Ruling 264090f0d977bf56 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: A +Might spell is played first and Smoke Screen is used in response — what is the final Might? Does the
 *    decrease negate the increase or are they calculated separately?
 * A: Each effect is snapshotted when it resolves; Might = base + all increases − all decreases. A "to a minimum
 *    of 1" decrease that hits the floor when it resolves is locked to the amount it actually took. Example: 3-Might
 *    unit, Smoke Screen resolves first (→ 1, i.e. −2), then Discipline +2 → 3. A decrease that fits fully is not
 *    reduced and keeps applying its full value.
 * Rules: 336 (LIFO resolution), layer arithmetic for temporary Might modifications.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. P1: a `might`-Might Target in base, Discipline in hand, [2]. P2: Smoke Screen in hand, [2] + 1 mind. */
function board(might: number) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might, name: "Target" }, "target")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { mind: 1 } });
}

describe("Ruling 264090f0d977bf56 — Might changes are snapshotted per effect; a floored Smoke Screen only keeps what it took", () => {
  test("the ruling's example: 3-Might unit, Discipline played first, Smoke Screen in response → Smoke resolves first: 3 → 1 (−2 snapshotted)", async () => {
    const game = await board(3).build();
    await game.p1.cast("discipline", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "target" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline", "smoke"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves (LIFO)
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    expect(game.state("target").might).toBe(1);
    expect(game.state("target").mightModifier).toBe(-2);
  });

  test("…then Discipline resolves: 3 base − 2 (snapshotted) + 2 = 3 — the decrease does NOT re-expand to −4", async () => {
    const game = await board(3).build();
    const hand = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("target").might).toBe(3);
    expect(game.state("target").mightModifier).toBe(0); // −2 + 2
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Discipline drew 1
    expect(game.violations()).toEqual([]);
  });

  test("order matters: if Discipline resolves FIRST (3 → 5) and Smoke Screen after, the full −4 fits → 1", async () => {
    // P2 has no window on an empty chain during P1's turn, so P1 holds this Smoke Screen copy ([2]+mind more).
    const game = await board(3)
      .hand(P1, SMOKE_SCREEN, "smokeP1")
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .build();
    await game.p1.cast("discipline", { targets: "target" });
    await game.settle(); // resolves uncontested
    expect(game.state("target").might).toBe(5);
    await game.p1.cast("smokeP1", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("smokeP1")).toBe("trash");
    expect(game.state("target").mightModifier).toBe(-2); // +2 − 4
    expect(game.state("target").might).toBe(1);
  });

  test("a decrease that applies in full is not trimmed: 5-Might unit, Smoke first (5 → 1, full −4), then Discipline +2 → 3", async () => {
    const game = await board(5).build();
    await game.p1.cast("discipline", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "target" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke resolves: 5 → 1
    expect(game.state("target").might).toBe(1);
    expect(game.state("target").mightModifier).toBe(-4);
    await game.settle(); // Discipline resolves
    expect(game.state("target").might).toBe(3); // 5 − 4 + 2
    expect(game.state("target").mightModifier).toBe(-2);
    expect(game.violations()).toEqual([]);
  });
});
