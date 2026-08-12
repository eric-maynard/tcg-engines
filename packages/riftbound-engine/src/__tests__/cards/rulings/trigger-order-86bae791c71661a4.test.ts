/**
 * Ruling 86bae791c71661a4 — (general simultaneous triggers; exercised with)
 *   Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   × Honest Broker (SFD-155 → sfd-155-221) · 2 Might · "[Deathknell] — Play a Gold gear token exhausted."
 *
 * Q: What happens if two "when you play" (Play Effect) abilities trigger at the same time?
 * A: Their CONTROLLER orders them on the chain. If several players control triggers that fired together, the
 *    turn player places theirs first, then the next player in turn order — each ordering only their own. The
 *    chain then resolves last-in-first-out, so the non-turn player's item (placed later, on top) resolves first.
 * Rules: 376.3.b / 383.3.d (the controller orders simultaneous triggers; turn player first),
 *        376.4.a (play effects are triggered abilities), 340 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUDENT = "ogn-103-298"; // "When you play a spell, give me +1 [Might] this turn."
const BROKER = "sfd-155-221"; // 2 Might · "[Deathknell] — Play a Gold gear token exhausted."

/** [Action] "Draw 1." — a spell with no board effect, so only the watchers react to it. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Ponder",
  rulesText: "[Action] Draw 1.",
  timing: "action",
} as const;

/** [Action] "Kill all units." — one event, two simultaneous Deathknells. */
const WIPE = {
  abilities: [{ effect: { target: { quantity: "all", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Wipe",
  rulesText: "[Action] Kill all units.",
  timing: "action",
} as const;

/** P1's turn: two Ravenbloom Students of P1's, and a spell to set both off at once. */
async function twoOwnTriggers(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 4, power: { mind: 2 } })
    .unit(P1, "base", STUDENT, "s1")
    .unit(P1, "base", STUDENT, "s2")
    .hand(P1, PONDER, "ponder")
    .build();
  await game.p1.cast("ponder");
  // 419.4.a — "when you play a spell" keys on the play, and the watchers see it as the spell RESOLVES.
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 86bae791c71661a4 — simultaneous triggers are ordered by their controller, turn player first", () => {
  test("two of MY play-triggers fire off one spell: both are chain items I control, and the ordering is offered to ME", async () => {
    const game = await twoOwnTriggers();
    const triggered = game.chain().filter((c) => c.triggered);
    expect(triggered.map((c) => c.cardId).sort()).toEqual(["s1", "s2"]);
    expect(triggered.every((c) => c.controller === P1)).toBe(true);
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      expect(d.items.map((i) => i.card ?? i.key).sort()).toEqual(["s1", "s2"]);
    }
  });

  test("the order I name is the order they sit in — last named is on top of the chain and resolves first", async () => {
    const game = await twoOwnTriggers();
    const d = game.decision();
    if (d?.kind === "order") {
      await game.p1.order(["s1", "s2"]);
      const triggered = game.chain().filter((c) => c.triggered);
      expect(triggered.map((c) => c.cardId)).toEqual(["s1", "s2"]);
    }
    await game.settle();
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(3);
  });

  test("nobody is blocked on the offer: settling without answering it takes the listed order and both resolve", async () => {
    const game = await twoOwnTriggers();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("triggers of DIFFERENT controllers: the turn player's goes on the chain first, so the non-turn player's sits on top and resolves first", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .unit(P1, "base", BROKER, "mine")
      .unit(P2, "base", BROKER, "theirs")
      .hand(P1, WIPE, "wipe")
      .build();
    await game.p1.cast("wipe");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the wipe resolves; both Deathknells trigger together
    const knells = game.chain().filter((c) => c.triggered);
    expect(knells.map((c) => c.controller)).toEqual([P1, P2]); // turn player placed first ⇒ bottom
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    // Both Deathknells resolved — each controller got their Gold.
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.p2.gear()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
