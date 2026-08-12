/**
 * Ruling 8220234f83d39e44 — Facebreaker (OGN-220 → ogn-220-298) · Spell · Order · [2] · [Hidden] [Action]
 *   "Stun a friendly unit and an enemy unit at the same battlefield."
 *   × Eclipse Herald (OGN-059 → ogn-059-298) · 7 Might · "When you stun an enemy unit, ready me and give me
 *     +1 [Might] this turn." (the "stun-related effect" the question calls Leona)
 *
 * Q: Can Facebreaker target an ALREADY stunned unit in order to set off stun-triggered effects?
 * A: Yes, it is a legal target — but re-stunning something already stunned is not it BECOMING stunned, so an
 *    ability that watches for that does not fire. (And you may Facebreaker repeatedly to stun several different
 *    attackers.)
 * Rules: 359.2 (targeting legality is about the descriptor, not about a status changing), 391 (event triggers need
 *        the event to actually happen), 465.2 (stunned = deals no combat damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const ECLIPSE_HERALD = "ogn-059-298";

/** P1's turn. P1 defends bf1 with a Guard and an EXHAUSTED Eclipse Herald watching for stuns; P2 has two attackers. */
function board(firstIsStunned: boolean) {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", ECLIPSE_HERALD, "herald", { exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "Raider A" }, "raiderA", { stunned: firstIsStunned })
    .unit(P2, "bf1", { might: 3, name: "Raider B" }, "raiderB")
    .hand(P1, FACEBREAKER, "fb1")
    .hand(P1, FACEBREAKER, "fb2");
}

describe("Ruling 8220234f83d39e44 — Facebreaker may name an already-stunned unit, but that is not 'becomes stunned'", () => {
  test("an already-stunned enemy IS an offered target for Facebreaker", async () => {
    const game = await board(true).build();
    expect(game.state("raiderA").isStunned).toBe(true);
    const targets = game.p1.option("cast", "fb1")?.fields.find((f) => f.arg === "targets");
    const offered = [...new Set((targets?.options ?? []).flatMap((o) => (Array.isArray(o) ? o : [o]) as string[]))];
    expect(offered).toContain("raiderA");
    expect((await game.p1.try((p) => p.cast("fb1", { targets: ["guard", "raiderA"] }))).ok).toBe(true);
  });

  test("…and re-stunning it fires NOTHING: the Herald stays exhausted at 7 Might, no trigger went on the chain", async () => {
    const game = await board(true).build();
    await game.p1.cast("fb1", { targets: ["guard", "raiderA"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raiderA").isStunned).toBe(true); // still stunned, unchanged
    expect(game.chain()).toEqual([]);
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 7, mightModifier: 0 });
  });

  test("control — stunning a unit that was NOT stunned does fire it: the Herald readies and goes to 8", async () => {
    const game = await board(false).build();
    await game.p1.cast("fb1", { targets: ["guard", "raiderA"] });
    await game.settle();
    expect(game.state("raiderA").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isExhausted: false, might: 8, mightModifier: 1 });
  });

  test("nuance — a second Facebreaker stuns a DIFFERENT attacker; both enemies end up stunned", async () => {
    const game = await board(false).build();
    await game.p1.cast("fb1", { targets: ["guard", "raiderA"] });
    await game.settle();
    await game.p1.cast("fb2", { targets: ["guard", "raiderB"] });
    await game.settle();
    expect(game.state("raiderA").isStunned).toBe(true);
    expect(game.state("raiderB").isStunned).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
