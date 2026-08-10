/**
 * Ruling 963bd3f5faffd125 — Defiant Dance (SFD-196 → sfd-196-221) · Spell · Calm/Chaos · 1+[C] · [Reaction]
 *     "Give a unit +2 [Might] this turn and another unit -2 [Might] this turn."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can I play Defiant Dance if my opponent's only unit is Ruin Runner?
 * A: Yes — provided you have two units of your OWN to name (it needs two distinct unit targets and Ruin Runner can't be
 *    one of them). With fewer than two other legal units, it can't be played at all.
 * Rules: 355.5/355.6 (all required targets must be legal to play), "another unit" = a second distinct target,
 *        Ruin Runner's can't-be-chosen.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFIANT_DANCE = "sfd-196-221";
const RUIN_RUNNER = "sfd-105-221";

/** P1's turn with exactly 1+[calm]; P2's only unit is Ruin Runner; P1 has `own` vanilla 2-Might units. */
function board(own: 0 | 1 | 2) {
  let s = scenario().resources(P1, { energy: 1, power: { calm: 1 } }).unit(P2, "base", RUIN_RUNNER, "runner").hand(P1, DEFIANT_DANCE, "dd");
  if (own >= 1) {
    s = s.unit(P1, "base", { might: 2, name: "A" }, "a");
  }
  if (own >= 2) {
    s = s.unit(P1, "base", { might: 2, name: "B" }, "b");
  }
  return s;
}

describe("Ruling 963bd3f5faffd125 — Defiant Dance vs a lone Ruin Runner needs two of your own units", () => {
  test("two own units (A, B) + enemy Ruin Runner: playable; the offered target pairs are only {A, B} — Ruin Runner is never a choice", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "dd")).toBe(true);
    const field = game.p1.option("cast", "dd")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 2, min: 2 });
    const offered = new Set((field?.options ?? []).flat() as string[]);
    expect(offered).toEqual(new Set(["a", "b"]));
    const r = await game.p1.try((p) => p.cast("dd", { targets: ["a", "runner"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dd")).toBe("hand");
  });

  test("…and it resolves on your own two: A +2 (→ 4), B -2 (→ 0), Ruin Runner untouched at 5", async () => {
    const game = await board(2).build();
    await game.p1.cast("dd", { targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.state("a").might).toBe(4);
    expect(game.state("b").might).toBe(0);
    expect(game.state("runner").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("only ONE own unit + Ruin Runner: no second legal target → Defiant Dance cannot be played", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "dd")).toBe(false);
    const r = await game.p1.try((p) => p.cast("dd", { targets: ["a", "runner"] }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("no own units at all (Ruin Runner alone on the board): not playable", async () => {
    const game = await board(0).build();
    expect(game.p1.can("cast", "dd")).toBe(false);
  });
});
