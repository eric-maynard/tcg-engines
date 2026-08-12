/**
 * Ruling 27269f34e1922a1e — Piercing Light (SFD-023 → sfd-023-221) · Fury · 2 + [fury] · [Action] [Repeat] [2][fury]
 *     "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *
 * Q: Can Piercing Light target the same unit, or must they be two different units?
 * A: Two different units. The second instruction says "one OTHER unit", so the unit already chosen for the
 *    first instruction can never be chosen again for the second — "up to one" only lets you choose NO second
 *    unit at all. Paying [Repeat] runs the whole instruction again and chooses afresh; the "other"
 *    restriction only binds within one execution.
 * Rules: 355.12 (a target set names distinct objects where the text says "other"), 355.13 ("up to one" may be
 *        zero), 355.16 (a choice that would lead to an illegal state is never offered), 820.2.a ([Repeat]
 *        executions choose their own targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";

/** P1 with enough for the spell AND its [Repeat]. P2: Front (9) at bf1, Back (9) in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Front" }, "front")
    .unit(P2, "base", { might: 9, name: "Back" }, "back")
    .hand(P1, PIERCING_LIGHT, "pl");
}

/**
 * The target lists offered for a given [Repeat] count. Scoping by repeatCount is
 * the whole point of this ruling: within ONE execution the two damage instances
 * must name different units, but a paid [Repeat] runs the instruction again and
 * chooses afresh (820.2.a), so the same unit legitimately appears in both slots
 * of a repeat line — that is ruling 48f43ad476d48972, which this file must not
 * contradict.
 */
function targetTuples(
  game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>,
  repeatCount = 0,
): string[][] {
  return (game.p1.option("cast", "pl")?.variants ?? [])
    .filter((v) => ((v.params as { repeatCount?: number }).repeatCount ?? 0) === repeatCount)
    .map((v) => ((v.params as { targets?: string[] }).targets ?? []).map(String));
}

describe("Ruling 27269f34e1922a1e — Piercing Light's two damage instances need two different units", () => {
  // rule 355.16 — an illegal set is never OFFERED (not offered and then rejected), so the
  // "one OTHER unit" restriction has to bite in the enumerator. It binds WITHIN an execution:
  // the unpaid play may never name one unit for both damage instances.
  test("ruling 27269f34e1922a1e — within one execution no offered target tuple names the same unit twice (355.16 / 355.12)", async () => {
    const game = await board().build();
    const tuples = targetTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.filter((t) => new Set(t).size !== t.length)).toEqual([]);
    expect(tuples.map((t) => t.join(">"))).toContain("front>back");
  });

  // The other half of the same ruling, and the reason the assertion above is scoped to one
  // execution: "Paying [Repeat] runs the whole instruction again and chooses afresh; the 'other'
  // restriction only binds within one execution." So the same unit IS offered for both
  // executions of a repeated play (820.2.a) — this is ruling 48f43ad476d48972, and asserting
  // distinctness across ALL offered tuples would contradict it.
  test("rule 820.2.a — ACROSS executions the same unit may be named twice, so a repeat line offers it", async () => {
    const game = await board().build();
    const repeated = targetTuples(game, 1);
    expect(repeated).toContainEqual(["front", "front"]);
    // …and the within-execution restriction still holds for the pair slots of that same line.
    expect(repeated).toContainEqual(["front", "back"]);
  });

  test("the legal pair deals 2 and 2 to the two different units", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front", "back"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("back").damage).toBe(2);
  });

  test("rule 355.13 — the second instruction may be declined: the battlefield unit takes 2 and nothing else does", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("back").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("rule 820.2.a — paying [Repeat] runs the instruction again, so the same unit may be named by both executions (2 + 2 = 4)", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { repeat: 1, targets: ["front"] });
    await game.settle();
    expect(game.state("front").damage).toBe(4);
    expect(game.state("back").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
