/**
 * Ruling 5d33b11b80968ddc — Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · [4] + 1 · Action
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *      Mights to each other."
 *
 * Q: Can you target 2 units already at the same location with Dragon's Rage and make them hit each other?
 * A: No — the first unit has to actually MOVE, and a move requires two different locations, so the pair can only be
 *    formed at the moved unit's (new) destination.
 * Rules: 445–447 (Move = change of location; 447.2 invalid destinations), 359.3 ("Then do this" reflexive follow-up keyed
 *        to the destination).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn with [4] + calm. P2's ONLY units are A (3) and B (3), both at P2's bf1; bf2 is open. So the only place two
 * enemy units share is bf1 — exactly the "make them hit each other where they stand" wish.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "B" }, "b")
    .hand(P1, DRAGONS_RAGE, "rage");
}

async function castOnA(game: Game): Promise<PickD> {
  await game.p1.cast("rage", { targets: "a" });
  let d = game.decision();
  if (d?.kind !== "pick") {
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    d = game.decision();
  }
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).prompt).toMatch(/destination/i);
  return d as PickD;
}

describe("Ruling 5d33b11b80968ddc — two enemy units at the same battlefield cannot be made to fight in place", () => {
  test("Rage on A (at bf1 with B): bf1 is not a destination — only P2's base / the open bf2 are — so 'A stays and fights B' cannot be chosen", async () => {
    const game = await board().build();
    const d = await castOnA(game);
    const offered = d.options.map((o) => o.zone ?? o.key);
    expect(offered).not.toContain("battlefield-bf1");
    expect(offered).toContain("battlefield-bf2");
    expect((await game.p1.try((p) => p.pick("battlefield-bf1"))).ok).toBe(false);
  });

  test("taking the legal move (A → empty bf2): there is no 'other enemy unit at its destination', so no fight happens at all — A moved undamaged, B untouched, spell spent", async () => {
    const game = await board().build();
    await castOnA(game);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      // an (empty / declinable) partner prompt would still not list B — it is not at the destination
      const opts = (game.decision() as PickD).options.map((o) => o.card ?? o.key);
      expect(opts).not.toContain("b");
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // A's arrival at the open bf2 stages a non-combat showdown for P2; let it close.
    for (let i = 0; i < 3 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown"; i++) {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
