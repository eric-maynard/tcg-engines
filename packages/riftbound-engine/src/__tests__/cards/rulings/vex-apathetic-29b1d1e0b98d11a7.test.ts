/**
 * Ruling 29b1d1e0b98d11a7 — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might
 *   "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *
 * Q: Can I still play my units onto a battlefield I control while the enemy Vex sits on THEIR battlefield?
 * A: Yes — the play is legal and the unit arrives. But Vex triggers on it: the new unit is stunned and
 *    cannot be moved this turn. Vex does not TARGET (it picks the unit you just played programmatically),
 *    so untargetable/Deflect-style protection does not save it, and nothing is chosen when the trigger fires.
 * Rules: 383 (triggered ability on "when an opponent plays a unit"), 355.9 (targets are only what a card
 *        says it chooses), 815 ([Stun] = deals no combat damage this turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX_APATHETIC = "unl-150-219";

/** P1's turn. P1 controls bf1 (a Holder is there); P2's Vex sits on P2's bf2. P1 has a 3-Might recruit + [3]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", VEX_APATHETIC, "vex")
    .hand(P1, { energyCost: 3, might: 3, name: "Recruit" }, "recruit");
}

describe("Ruling 29b1d1e0b98d11a7 — the play is legal, but Vex stuns the arriving unit and locks it down", () => {
  test("ruling: playing a unit to a battlefield P1 controls is legal even with the enemy Vex out", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "recruit")).toBe(true);
    await game.p1.play("recruit", { to: "bf1" });
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("ruling: Vex's trigger goes on the chain and nothing is CHOSEN — it is not a targeting ability", async () => {
    const game = await board().build();
    await game.p1.play("recruit", { to: "bf1" });
    expect(game.chain().filter((c) => c.cardId === "vex" && c.triggered)).toHaveLength(1);
    expect(game.decision()?.kind).not.toBe("pick"); // no "choose a unit" prompt for either seat
  });

  test("ruling: once it resolves the freshly played unit is [Stunned] and cannot be moved this turn", async () => {
    const game = await board().build();
    await game.p1.play("recruit", { to: "bf1" });
    await game.settle();
    expect(game.state("recruit").isStunned).toBe(true);
    expect(game.state("recruit").grantedKeywords).toEqual([{ duration: "turn", keyword: "NoMove" }]);
    const moved = await game.p1.try((p) => p.move("recruit", "bf2"));
    expect(moved.ok).toBe(false);
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control: with Vex in BASE instead of at a battlefield the trigger does not fire at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", VEX_APATHETIC, "vex")
      .hand(P1, { energyCost: 3, might: 3, name: "Recruit" }, "recruit")
      .build();
    await game.p1.play("recruit", { to: "bf1" });
    expect(game.chain().filter((c) => c.cardId === "vex" && c.triggered)).toHaveLength(0);
    await game.settle();
    expect(game.state("recruit").isStunned).toBe(false);
  });
});
