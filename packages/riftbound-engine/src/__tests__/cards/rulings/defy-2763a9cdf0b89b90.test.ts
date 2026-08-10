/**
 * Ruling 2763a9cdf0b89b90 — Defy (OGN-045 → ogn-045-298) · Reaction · Calm · [1]+[calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · [2]+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Can Defy counter Falling Star — it costs less than 4 energy but needs TWO power?
 * A: No. Both conditions must hold (energy ≤ 4 AND power ≤ 1). Falling Star passes the energy test but fails the
 *    power test, so it is not a legal Defy target.
 * Rules: 206 (printed cost = energy + power), 355.9 (targeting requirements — "and" = conjunctive), 412 (Counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const FALLING_STAR = "ogn-029-298";
const VOID_SEEKER = "ogn-024-298"; // [3]+[fury] Action — "Deal 4 to a unit at a battlefield. Draw 1." (a legal Defy target: 3 ≤ 4, 1 ≤ 1)

/** P1's turn. P1: Falling Star + Void Seeker in hand, 5 energy + 3 fury. P2: Defy with exactly [1]+[calm]; two P2 units at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 3 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Grunt A" }, "u1")
    .unit(P2, "bf1", { might: 5, name: "Grunt B" }, "u2")
    .hand(P1, FALLING_STAR, "fs")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, DEFY, "defy");
}

function defyTargets(game: Game): string[] {
  const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

describe("Ruling 2763a9cdf0b89b90 — Defy cannot counter Falling Star (two power pips fail the 'no more than [rainbow]' clause)", () => {
  test("Falling Star on the chain (printed [2] + [fury][fury]): P2 holds priority with Defy affordable, yet Falling Star is NOT a legal Defy target — Defy can't be cast at all", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["u1", "u2"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // paid 2 + two fury
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(defyTargets(game)).not.toContain("fs");
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "fs" }));
    expect(r.ok).toBe(false);
    // Falling Star then resolves untouched: 3 + 3.
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("u1").damage).toBe(3);
    expect(game.state("u2").damage).toBe(3);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Defy DOES counter Void Seeker ([3] + one [fury]) — both clauses satisfied", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "u1" });
    await game.p1.passPriority();
    expect(defyTargets(game)).toEqual(["vs"]);
    await game.p2.cast("defy", { targets: "vs" });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("u1").damage).toBe(0);
  });
});
