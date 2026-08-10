/**
 * Ruling d518a352b0d94e97 — Dune Drake (OGN-131 → ogn-131-298) · Unit · Body · [5] · 5 Might
 *     "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here."
 *
 * Q: Does Riftbound have an "intervening if" rule, and does Dune Drake trigger on attack regardless of conditions?
 * A: No intervening-if rule. Dune Drake triggers whenever it attacks; the trailing "if there is a ready enemy unit here"
 *    belongs to the effect and is checked as it resolves — a conditional Assault 2, in effect.
 * Rules: 383.4.e.2 (attack triggers), 383.2.a.1 (only an "if" right after the trigger condition is part of the condition;
 *        a trailing "if" is part of the effect, evaluated on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DUNE_DRAKE = "ogn-131-298";

/** P2's [0] Reactions: exhaust a unit / ready a unit (inline, to change the condition while the trigger waits). */
const NAP = {
  abilities: [{ effect: { target: { type: "unit" }, type: "exhaust" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Nap",
  timing: "reaction",
} as const;
const WAKE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "ready" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Wake",
  timing: "reaction",
} as const;

/** P1's turn. P2 holds bf1 with a 6-Might Wall (ready unless `exhausted`); Dune Drake ready in P1's base; P2 holds Nap + Wake. */
function board(exhausted: boolean) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall", { exhausted })
    .unit(P1, "base", DUNE_DRAKE, "drake")
    .hand(P2, NAP, "nap")
    .hand(P2, WAKE, "wake");
}

describe("Ruling d518a352b0d94e97 — Dune Drake ALWAYS triggers on attack; the 'if a ready enemy is here' is checked on resolution", () => {
  test("ready enemy here: the attack trigger goes on the chain and resolves for +2 (5 → 7)", async () => {
    const game = await board(false).build();
    await game.p1.move("drake", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("drake")).toMatchObject({ might: 7, mightModifier: 2 });
  });

  test("only an EXHAUSTED enemy here: the trigger STILL goes on the chain (no intervening-if gate) — it just resolves for no bonus (stays 5)", async () => {
    const game = await board(true).build();
    await game.p1.move("drake", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("drake")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("checked on resolution, not when it triggered: ready Wall, but P2 exhausts it in response → the trigger resolves to nothing (Drake stays 5)", async () => {
    const game = await board(false).build();
    await game.p1.move("drake", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("nap", { targets: "wall" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["drake", "nap"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Nap resolves: Wall exhausted
    expect(game.state("wall").isExhausted).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Drake's trigger resolves: no ready enemy here now
    expect(game.chain()).toEqual([]);
    expect(game.state("drake")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("…and the reverse: exhausted Wall, P2 readies it in response → on resolution a ready enemy IS here → +2 (7)", async () => {
    const game = await board(true).build();
    await game.p1.move("drake", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("wake", { targets: "wall" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Wake resolves
    expect(game.state("wall").isReady).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Drake's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("drake")).toMatchObject({ might: 7, mightModifier: 2 });
    expect(game.violations()).toEqual([]);
  });
});
