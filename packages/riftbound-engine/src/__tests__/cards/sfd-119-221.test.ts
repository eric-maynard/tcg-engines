/**
 * Jax, Unrelenting — sfd-119-221 · Unit · Body · 4 energy · 3 might
 *
 *   [Weaponmaster]
 *   When you attach an Equipment to me, you may pay [1] to draw 1.
 *
 * rule-id: sfd-119-221 — the "pay [1]" is a real cost: accepting the opt-in
 * deducts 1 energy, and accepting is not offered when it can't be paid.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const JAX = "sfd-119-221";
const SERRATED_DIRK = "sfd-009-221"; // Equipment, [Equip] [fury]

function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { body: 1, fury: 1 } })
    .gear(P1, SERRATED_DIRK, "dirk")
    .hand(P1, JAX, "jax");
}

describe("Jax, Unrelenting (sfd-119-221)", () => {
  test("attach trigger: accepting pays [1] then draws 1", async () => {
    const game = await board(6).build();
    const handBefore = game.p1.hand().length;
    // Play Jax (4) → Weaponmaster prompt: pick the Dirk → attach fires the trigger.
    await game.p1.play("jax", { answers: ["dirk"] });
    // rule 383.3.b / 204.3.b: the pick finalizes the [Weaponmaster] trigger, but
    // "Pay … to attach it" is a cost in a LATER instruction — it is paid, and the
    // attach happens, only once the trigger resolves off the chain.
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("jax");
    const d = game.decision();
    expect(d?.kind).toBe("yes-no");
    expect(d?.kind === "yes-no" && d.prompt).toContain("Pay [1]");
    const energyBefore = game.p1.energy();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(energyBefore - 1);
    // Jax left hand (-1), drew 1 (+1).
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
  });

  test("attach trigger: declining costs nothing and draws nothing", async () => {
    const game = await board(6).build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("jax", { answers: ["dirk"] });
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    const energyBefore = game.p1.energy();
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(energyBefore);
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });

  test("attach trigger: with no energy left, accepting is not legal (no free draw)", async () => {
    const game = await board(4).build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("jax", { answers: ["dirk"] });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()?.kind).toBe("yes-no");
    const t = await game.p1.try((p) => p.yes());
    expect(t.ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });
});
