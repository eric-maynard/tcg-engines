/**
 * Ruling b079ceb5357870ef — Riposte (SFD-206 → sfd-206-221) · Reaction [2] "Choose a friendly unit and a spell. Counter that spell and give
 *     that unit +Might equal to that spell's Energy cost this turn."
 *   × Thwonk! (SFD-040 → sfd-040-221) · [2][calm] Action · [Repeat][2] "Stun an attacking unit."
 *
 * Q: If I Riposte a Thwonk! whose Repeat was paid, do I counter both stuns or only one?
 * A: Both. Repeat does not create a second spell — it is one chain object that would execute its effect twice. Countering "a spell"
 *    removes that whole object: neither the first nor the repeated stun happens.
 * Rules: 820 (Repeat = additional cost, same spell), 425.1 / 412.1.a (countered spell → trash, no effect), 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const THWONK = "sfd-040-221";

/**
 * P2's turn. P1 holds bf1 with a Defender (6) and has Thwonk! + [4] (2 + Repeat 2) + calm. P2: attackers A (3) and B (3) in base,
 * Riposte + [2] with power for either domain reading.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 6, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "a")
    .unit(P2, "base", { might: 3, name: "Attacker B" }, "b")
    .hand(P1, THWONK, "thwonk")
    .hand(P2, RIPOSTE, "riposte");
}

/** A and B attack bf1; P2 passes Focus; P1 casts Thwonk! with Repeat paid — stun A, then stun B — and passes priority. */
async function repeatedThwonkOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["a", "b"], "bf1");
  expect(game.state("a").combatRole).toBe("attacker");
  expect(game.state("b").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("thwonk", { repeat: 1, targets: ["a", "b"] });
  expect(game.p1.energy()).toBe(0); // 2 + the Repeat [2]
  // Repeat is NOT a second spell: exactly one Thwonk! object on the chain.
  expect(game.chain().filter((c) => c.cardId === "thwonk")).toHaveLength(1);
  expect(game.chain()).toHaveLength(1);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling b079ceb5357870ef — Riposte on a Repeated Thwonk! counters the single spell: no stun at all", () => {
  test("control: unanswered, the repeated Thwonk! stuns BOTH attackers", async () => {
    const game = await repeatedThwonkOnTheChain();
    await game.p2.passPriority(); // resolves
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.state("a").isStunned).toBe(true);
    expect(game.state("b").isStunned).toBe(true);
  });

  test("P2 Ripostes it (friendly unit A + the Thwonk!): Riposte resolves first and counters the WHOLE spell — Thwonk! to trash, neither A nor B is stunned, A gets the +Might", async () => {
    const game = await repeatedThwonkOnTheChain();
    expect(game.p2.can("cast", "riposte")).toBe(true);
    await game.p2.cast("riposte", { targets: "a" }); // the lone spell on the chain is the forced spell choice
    expect(game.chain().map((c) => c.cardId)).toEqual(["thwonk", "riposte"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Riposte resolves → Thwonk! countered
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.zoneOf("thwonk")).toBe("trash"); // countered → trash
    expect(game.state("a").isStunned).toBe(false); // first stun negated
    expect(game.state("b").isStunned).toBe(false); // repeated stun negated too
    expect(game.state("a").mightModifier).toBeGreaterThanOrEqual(2); // + Thwonk!'s Energy cost
    expect(game.p1.energy()).toBe(0); // nothing refunded, Repeat cost included
    expect(game.violations()).toEqual([]);
  });

  test("and combat then runs with both attackers dealing damage normally (nobody stunned): 3 + 3(+bonus) into the 6-Might Defender kills it", async () => {
    const game = await repeatedThwonkOnTheChain();
    await game.p2.cast("riposte", { targets: "a" });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // had either stun stuck, at most 3(+2) < 6 would have reached it
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
