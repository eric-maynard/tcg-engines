/**
 * Ruling e1f8ad44a855d896 — Imperial Decree (OGN-221 → ogn-221-298)
 *   "[Action] When any unit takes damage this turn, kill it."
 *
 * Q: When several units assign combat damage, may each attacker pick its own victim and spread the
 *    damage freely, or must lethal be assigned to one unit before moving on?
 * A: All Might on your side is combined into ONE pool. You must assign lethal to one defender before
 *    any of the pool may go to the next; free spreading is illegal. The Imperial Decree nuance —
 *    since ANY damage then kills, sending units in one at a time maximises death triggers — does not
 *    change the assignment rule: the lethal threshold shown is still the unit's Might.
 * Rules: 465.2.c (combat damage assignment, lethal-before-next), 465.2.c.4.a (lethal amount).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 attacks bf1 with a 3-Might and a 2-Might unit; P2 defends with two 3-Might units. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Vanguard" }, "a1")
    .unit(P1, "base", { might: 2, name: "Skirmisher" }, "a2")
    .unit(P2, "bf1", { might: 3, name: "Sentry A" }, "d1")
    .unit(P2, "bf1", { might: 3, name: "Sentry B" }, "d2")
    .hand(P1, IMPERIAL_DECREE, "decree");
}

/** Move both attackers in and pass focus twice so combat damage assignment is asked. */
async function toAssignment(game: Game): Promise<Extract<Decision, { kind: "distribute" }>> {
  await game.p1.move(["a1", "a2"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P1 });
  return d as Extract<Decision, { kind: "distribute" }>;
}

const legalAllocations = (game: Game) =>
  (game.p1.decision() as Extract<Decision, { kind: "distribute" }>).buckets.map((b) => b.key).sort();

describe("Ruling e1f8ad44a855d896 — combat damage is one combined pool assigned lethal-first", () => {
  test("the attackers' Might is COMBINED into one 5-point pool the attacker assigns, and each defender's lethal amount is its Might", async () => {
    const game = await board().build();
    const d = await toAssignment(game);
    expect(d.total).toBe(3 + 2); // combined, not two separate 3 / 2 assignments
    expect(legalAllocations(game)).toEqual(["d1", "d2"]);
    expect(d.buckets.map((b) => b.lethal)).toEqual([3, 3]);
    // The offered default is itself lethal-first.
    expect(d.defaultAllocation).toEqual({ d1: 3, d2: 2 });
  });

  test("damage may NOT be spread freely: 1/4 and 4/1 are refused; only 'lethal to one, remainder to the other' is legal", async () => {
    const game = await board().build();
    await toAssignment(game);
    const spread = await game.p1.try((p) => p.distribute({ d1: 1, d2: 4 }));
    expect(spread.ok).toBe(false);
    const spread2 = await game.p1.try((p) => p.distribute({ d1: 4, d2: 1 }));
    expect(spread2.ok).toBe(false);
    // Nothing has happened yet — still the same assignment prompt.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    const ok = await game.p1.try((p) => p.distribute({ d1: 3, d2: 2 }));
    expect(ok.ok).toBe(true);
  });

  test("lethal-first assignment: the 3 kills Sentry A outright, the leftover 2 is only then assignable to Sentry B (which survives at 2 damage)", async () => {
    const game = await board().build();
    await toAssignment(game);
    await game.p1.distribute({ d1: 3, d2: 2 });
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("battlefield-bf1"); // 2 < 3: survived, then healed by combat cleanup
    expect(game.state("d2").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: with Imperial Decree resolved, the leftover 2 kills Sentry B too — but the ASSIGNMENT rule is unchanged (lethal is still shown as 3)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    const d = await toAssignment(game);
    // Imperial Decree is a delayed trigger, not a lethality modifier: the prompt still asks for 3.
    expect(d.buckets.map((b) => b.lethal)).toEqual([3, 3]);
    await game.p1.distribute({ d1: 3, d2: 2 });
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash"); // 2 damage was "any amount" — Decree kills it
    expect(game.violations()).toEqual([]);
  });
});
