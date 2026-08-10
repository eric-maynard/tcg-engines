/**
 * Ruling 279f582262c31015 — Retreat (OGN-104 → ogn-104-298, Reaction, 1) "Return a friendly unit to its owner's hand. Its
 *   owner channels 1 rune exhausted."
 *   × Falling Star (ogn-029-298, 2 + [fury][fury]) "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Opponent aims Falling Star at my only unit; I Retreat it in response. The opponent still has units — must Falling
 *    Star now be pointed at THEIR OWN units?
 * A (riftjudge): Yes — the caster must re-aim at whatever legal targets remain, even their own units.
 *
 * RULING-CONFLICT: riftjudge 279f582262c31015 says Falling Star is re-aimed at the caster's own units; CR 355.8/355.15
 * (targets are chosen to put the spell on the chain and cannot be changed afterwards) and 359.3.e.5/359.3.e.7 (an
 * instruction whose target became illegal is simply ignored, no substitute is chosen) say each instance is dropped —
 * the engine follows the CR. Both of Falling Star's instructions named Lonely, so both are ignored and nobody is dealt
 * damage.
 * Rules: 355.8/355.15 (targets locked on play), 359.3.e.5/.7 (illegal target ⇒ instruction ignored), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const FALLING_STAR = "ogn-029-298";

/**
 * P2's turn. P1's only unit, Lonely (5), holds P1's bf1; P1 has Retreat + exactly 1 energy. P2 has two 7-Might units in
 * base (big enough to survive a 3) and Falling Star with exactly 2 + [fury][fury].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Lonely" }, "lonely")
    .unit(P2, "base", { might: 7, name: "Own A" }, "ownA")
    .unit(P2, "base", { might: 7, name: "Own B" }, "ownB")
    .hand(P2, FALLING_STAR, "fs")
    .hand(P1, RETREAT, "retreat");
}

/** P2 casts Falling Star (both instances at Lonely); P1 answers with Retreat on Lonely; Retreat resolves. */
async function starThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fs", { targets: ["lonely", "lonely"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "retreat")).toBe(true);
  await game.p1.cast("retreat", { targets: "lonely" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fs", "retreat"]);
  const runesBefore = game.p1.runes().length;
  await game.p1.passPriority();
  await game.p2.passPriority(); // Retreat resolves first
  expect(game.zoneOf("lonely")).toBe("hand");
  expect(game.p1.units()).toEqual([]); // P1 has no characters left on the board
  expect(game.p1.runes()).toHaveLength(runesBefore + 1); // "its owner channels 1 rune exhausted"
  expect(game.p1.runes({ ready: false })).toHaveLength(1);
  expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
  return game;
}

describe("Ruling 279f582262c31015 — after Retreat empties my board, Falling Star is NOT re-aimed (CR 355.15 / 359.3.e.5)", () => {
  test("Retreat in response: Lonely returns to hand (P1 channels an exhausted rune) while Falling Star still waits on the chain", async () => {
    await starThenRetreat();
  });

  test("no fresh choice is offered when Falling Star resolves — its locked picks are gone and nobody is asked to re-aim", async () => {
    const game = await starThenRetreat();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Falling Star resolves
    await game.settle();
    expect(game.decision()).not.toMatchObject({ kind: "pick", seat: P2 });
  });

  test("both instances are ignored: P2's own units take nothing; Falling Star → trash", async () => {
    const game = await starThenRetreat();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("ownA").damage).toBe(0);
    expect(game.state("ownB").damage).toBe(0);
    expect(game.zoneOf("lonely")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
