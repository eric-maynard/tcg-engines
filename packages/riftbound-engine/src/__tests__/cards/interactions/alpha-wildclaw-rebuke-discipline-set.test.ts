/**
 * Interaction: Alpha Wildclaw (unl-057-219) · Unit · Calm · 6+[calm][calm] · 7 Might
 *     "[Tank] Your units here with less Might than me can't be chosen by enemy spells and abilities."
 *   × Rebuke     (ogn-172-298) · Spell · Chaos · 2+[chaos][chaos] · Action
 *     "Return a unit at a battlefield to its owner's hand."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 757 / 757.1 (untargetable), 758 (not a legal target), 758.1 (becoming untargetable after
 * being chosen → mistarget on resolution), 758.2.a (the protected SET is re-evaluated live —
 * the Alpha Wildclaw / Vilemaw example), 355.8 / 355.9.b (only valid choices may be made when the
 * spell is put on the chain), 359.3.e.5 (illegal target is unaffected; spell still resolves).
 *
 * Question: P1 has Wildclaw (7), a 2-Might ally and a 7-Might ally at bf1. P2 holds Rebuke.
 *   (a) Which of P1's units may the ENEMY Rebuke choose?  → 7-Might ally and Wildclaw; NOT the 2.
 *   (b) May P1's OWN Discipline choose the 2-Might ally?  → yes (restriction is enemy-only).
 *   (c) P2 Rebukes the 7-Might ally; in response P1 Disciplines Wildclaw (→ 9). Rebuke now
 *       mistargets (7 < 9): the ally stays, Rebuke goes to trash.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const ALPHA_WILDCLAW = "unl-057-219";
const REBUKE = "ogn-172-298";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of `seat`'s cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P2's turn (Rebuke is an Action). P1 holds the Reaction Discipline. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ALPHA_WILDCLAW, "wildclaw")
    .unit(P1, "bf1", { might: 2, name: "Small Cub" }, "small")
    .unit(P1, "bf1", { might: 7, name: "Big Bear" }, "big")
    .hand(P2, REBUKE, "rebuke")
    .hand(P1, DISCIPLINE, "discipline");
}

describe("Alpha Wildclaw × Rebuke / Discipline — protected set is 'less Might than me', enemy-only, evaluated live", () => {
  test("sanity: Wildclaw is 7 Might, allies are 2 and 7, all at bf1", async () => {
    const game = await board().build();
    expect(game.state("wildclaw").might).toBe(7);
    expect(game.state("small").might).toBe(2);
    expect(game.state("big").might).toBe(7);
    expect(game.p1.units("bf1").sort()).toEqual(["big", "small", "wildclaw"]);
    expect(game.p2.can("cast", "rebuke")).toBe(true);
  });

  // Expected: "small" (2 < 7) is untargetable by the enemy Rebuke, so it is not offered and a cast at it
  // is rejected. Actual: Wildclaw's static `untargetable-by-enemy-spells-abilities` restriction is not
  // consulted at target enumeration — Rebuke offers all three P1 units and returns "small" to hand.
  test("enemy Rebuke must NOT be offered the 2-Might ally under Alpha Wildclaw (2 < 7) and casting at it must be rejected (757/758, 355.9.b)", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, P2, "rebuke");
    expect(offered).not.toContain("small");
    await expect(game.p2.cast("rebuke", { targets: "small" })).rejects.toThrow();
    expect(game.zoneOf("rebuke")).toBe("hand");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
  });

  // The enemy spell here is Discipline, whose effect is a `sequence` (buff, then draw) and so
  // carries no single top-level `target` descriptor: play-spell's per-target pool check is skipped
  // for it, leaving the explicit-target loop as the only gate. It must reject the protected ally.
  test("an ENEMY sequence-effect spell (Discipline: buff then draw) must not be castable at the protected 2-Might ally either (757/758, 355.9.b)", async () => {
    const game = await board()
      .resources(P2, { energy: 4, power: { chaos: 2 } })
      .hand(P2, DISCIPLINE, "enemyDiscipline")
      .build();
    const offered = targetsOffered(game, P2, "enemyDiscipline");
    expect(offered).not.toContain("small");
    expect(offered).toContain("big");
    await expect(game.p2.cast("enemyDiscipline", { targets: "small" })).rejects.toThrow();
    expect(game.zoneOf("enemyDiscipline")).toBe("hand");
    expect(game.state("small").might).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  test("(a) enemy Rebuke IS offered the other 7-Might ally (7 is not less than 7) and Wildclaw itself", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, P2, "rebuke");
    expect(offered).toContain("big");
    expect(offered).toContain("wildclaw");
  });

  test("(a) Rebuke on the equal-Might ally resolves normally: ally returns to P1's hand", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.p1.hand()).toContain("big");
    expect(game.zoneOf("rebuke")).toBe("trash");
  });

  test("(a) Rebuke on Alpha Wildclaw itself resolves normally: Wildclaw returns to P1's hand", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "wildclaw" });
    await game.settle();
    expect(game.zoneOf("wildclaw")).toBe("hand");
    expect(game.zoneOf("rebuke")).toBe("trash");
  });

  test("(b) P1's own Discipline may choose the protected 2-Might ally (restriction is against ENEMY spells only)", async () => {
    const game = await board().build();
    // rule 316.5.b: P1's Reaction needs a Closed State on P2's turn — P2 opens a chain first.
    await game.p2.cast("rebuke", { targets: "big" });
    await game.p2.passPriority();
    const offered = targetsOffered(game, P1, "discipline");
    expect(offered).toContain("small");
    expect(offered).toContain("big");
    expect(offered).toContain("wildclaw");
    const hand0 = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "small" });
    await game.settle();
    expect(game.state("small").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1 + 1); // Discipline spent, drew 1, Rebuke returned big
    expect(game.zoneOf("discipline")).toBe("trash");
  });

  test("(c) Rebuke → big (legal), respond Discipline → Wildclaw (9): Discipline resolves first (LIFO)", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "big" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rebuke"]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "discipline")).toBe(true);
    await game.p1.cast("discipline", { targets: "wildclaw" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rebuke", "discipline"]);
    // Resolve only the top item: both pass once → Discipline resolves, Rebuke still pending.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wildclaw").might).toBe(9);
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["rebuke"]);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });

  // Expected: after Discipline makes Wildclaw 9, "big" (7 < 9) joins the protected set, so the enemy
  // Rebuke mistargets on resolution and "big" stays at bf1. Actual: the restriction is never re-checked
  // at resolution (nor at play time) — Rebuke returns "big" to hand.
  test("after Discipline → Wildclaw (9) the pending enemy Rebuke on the 7-Might ally must mistarget — ally stays on bf1, Rebuke to trash (758.1, 758.2.a, 359.3.e.5)", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "big" });
    await game.p2.passPriority();
    await game.p1.cast("discipline", { targets: "wildclaw" });
    await game.settle();
    expect(game.state("wildclaw").might).toBe(9);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.p1.hand()).not.toContain("big");
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // cost stays paid
  });

  test("(c) contrast: without the Discipline response, the same Rebuke returns big to hand", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("hand");
  });

  test("(c) contrast: Discipline on the TARGET instead (big → 9) does not protect it — 9 is not less than 7", async () => {
    const game = await board().build();
    await game.p2.cast("rebuke", { targets: "big" });
    await game.p2.passPriority();
    await game.p1.cast("discipline", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.zoneOf("rebuke")).toBe("trash");
  });
});
