/**
 * Ruling 6e419f462e5ca21d — Mystic Reversal (OGN-080 → ogn-080-298) · Reaction · Calm · [4][calm][calm][calm]
 *   "Gain control of a spell. You may make new choices for it."
 *   × Void Seeker (ogn-024-298, "Deal 4 to a unit at a battlefield. Draw 1.") as "an opponent's damage spell";
 *     Singularity (OGN-105 → ogn-105-298, "Deal 6 to each of up to two units.") for the "up to" nuance.
 *
 * Q: Reversing an opponent's damage spell, can I choose to have it fizzle / choose no target?
 * A: No. If legal targets exist you must choose among them (or keep the existing choice) — there is no "no target"
 *    option. Only a spell worded "up to N" (e.g. Singularity) lets you choose zero targets.
 * Rules: 355.10 (must choose legal targets when they exist), 355.13 ("up to" may choose zero), Mystic Reversal's
 *        "may make new choices".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const VOID_SEEKER = "ogn-024-298";
const SINGULARITY = "ogn-105-298";

/**
 * P2's turn. At P1's bf1: P1's Mine (7) and P2's Theirs (7); P2's Home (7) sits in P2's base (not "at a battlefield").
 * P2 holds the damage spell with [6] + fury + 2 mind; P1 holds Mystic Reversal with exactly [4] + 3 calm.
 */
function board(spell: string) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 7, name: "Theirs" }, "theirs")
    .unit(P2, "base", { might: 7, name: "Home" }, "home")
    .hand(P2, spell, "spell")
    .resources(P2, { energy: 6, power: { fury: 1, mind: 2 } })
    .hand(P1, MYSTIC_REVERSAL, "reversal")
    .resources(P1, { energy: 4, power: { calm: 3 } })
    .deck(P1, ["ogn-175-298"], ["p1d1"]);
}

/** P2 casts the spell at Mine; P1 answers with Mystic Reversal; Reversal resolves → P1 controls the spell and is asked about new choices. */
async function reversed(spell: string): Promise<Game> {
  const game = await board(spell).build();
  await game.p2.cast("spell", { targets: ["mine"] });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.p1.can("cast", "reversal")).toBe(true);
  await game.p1.cast("reversal", { targets: "spell" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "reversal"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Mystic Reversal resolves
  expect(game.chain().filter((c) => c.cardId === "spell")).toEqual([expect.objectContaining({ cardId: "spell", controller: P1 })]); // P1 now controls it
  // "You may make new choices": P1 is asked.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "spell" } });
  return game;
}

describe("Ruling 6e419f462e5ca21d — a reversed spell can't be made to fizzle: new choices must be legal targets (unless the spell says 'up to')", () => {
  test("Void Seeker reversed: the new-choice prompt offers ONLY legal targets (units at a battlefield: Mine, Theirs — not Home in base) and no 'no target' option", async () => {
    const game = await reversed(VOID_SEEKER);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["mine", "theirs"]);
    expect(offered.every((k) => k === "mine" || k === "theirs")).toBe(true); // nothing like "none"
    expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
  });

  test("re-choosing: P1 points Void Seeker at Theirs — it resolves for 4 on Theirs, Mine untouched, and P1 (now the controller) draws 1", async () => {
    const game = await reversed(VOID_SEEKER);
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("theirs").damage).toBe(4);
    expect(game.state("mine").damage).toBe(0);
    expect(game.p1.hand()).toEqual(["p1d1"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("declining to make new choices does NOT fizzle it either: the spell keeps its existing legal target and still deals 4 (to Mine)", async () => {
    const game = await reversed(VOID_SEEKER);
    await game.p1.decline();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("mine").damage + game.state("theirs").damage).toBe(4); // somebody legal took it — it did not fizzle
    expect(game.state("mine").damage).toBe(4);
  });

  // Singularity says "up to two units", so after reversing it P1 may choose ZERO targets — nobody takes 6.
  test("ruling 6e419f462e5ca21d — a reversed 'up to' spell may be re-chosen onto ZERO targets (Singularity hits nobody)", async () => {
    const game = await reversed(SINGULARITY);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.min : -1).toBe(0); // zero is a legal count for "up to two"
    await game.p1.answer({ keys: [], kind: "pick" }); // choose no units
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("theirs").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });
});
