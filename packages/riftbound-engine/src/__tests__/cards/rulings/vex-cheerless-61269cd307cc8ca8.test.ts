/**
 * Ruling 61269cd307cc8ca8 — Vex, Cheerless (SFD-146 → sfd-146-221) · Champion Unit · Chaos · 5 · 5 Might
 *   "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells
 *    cost [1][rainbow] more."
 *   × Hidden Blade (ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *     — a Hidden spell the opponent flips from facedown.
 *
 * Q: Do opponents have to pay to play cards from Hidden (facedown) while Vex is in combat?
 * A: Yes — [1][rainbow]. Playing from facedown "ignores its base cost" (base → 0, 356.1), then cost
 *    INCREASES are applied (356.3): Vex adds [1][rainbow]; no discounts apply (356.4). Total: [1][rainbow].
 * Rules: 811.1.b, 356.1, 356.3, 356.4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "sfd-146-221";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * Turn 3, P1 to act. P2 controls bf1 with a 2-might Defender and hid Hidden Blade there on an earlier
 * turn. P1's Vex waits in base; `move("vex","bf1")` opens the combat showdown with Vex attacking
 * ("in combat"). P1 passes Focus so P2 may react by flipping the Blade.
 */
function vexAttacks(p2: { energy: number; rainbow?: number }) {
  return scenario()
    .turn(3)
    .resources(P2, { energy: p2.energy, power: { rainbow: p2.rainbow ?? 0 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", VEX, "vex");
}

/** Same board but the attacker is a vanilla 5-might Brute (no Vex anywhere in combat). */
function bruteAttacks(p2: { energy: number; rainbow?: number }) {
  return scenario()
    .turn(3)
    .resources(P2, { energy: p2.energy, power: { rainbow: p2.rainbow ?? 0 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", VEX, "vex"); // Vex on the board but NOT in combat
}

describe("Ruling 61269cd307cc8ca8 — Hidden cards flipped against a Vex in combat cost [1][rainbow]", () => {
  test("setup: moving Vex into P2's bf1 opens a combat showdown with Vex as attacker; after P1 passes Focus, P2 may flip the hidden Blade", async () => {
    const game = await vexAttacks({ energy: 1, rainbow: 1 }).build();
    await game.p1.move("vex", "bf1");
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "blade")).toBe(true);
  });

  test("control (no Vex in combat): flipping Hidden Blade from facedown ignores its base cost — P2 pays nothing (811.1.b, 356.1)", async () => {
    const game = await bruteAttacks({ energy: 1, rainbow: 1 }).build();
    await game.p1.move("brute", "bf1");
    expect(game.state("vex").combatRole).toBeNull();
    await game.p1.passFocus();
    await game.p2.reveal("blade");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test("control (Vex on the board but not in combat, P2's own turn): the flip is still free", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
      .unit(P1, "base", VEX, "vex")
      .build();
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  // Expected (356.1 → 356.3): base cost ignored (0), then Vex's +[1][rainbow] increase applies → the flip
  // costs exactly 1 energy + 1 power; P2's 1E/1R pool is drained to 0/0 when the Blade hits the chain.
  // Actual: the engine plays hidden cards for a flat 0 and never applies Vex's enemy-spell surcharge.
  test("enemy Vex attacking: flipping Hidden Blade costs [1][rainbow]; P2's 1E/1R pool is drained", async () => {
    const game = await vexAttacks({ energy: 1, rainbow: 1 }).build();
    await game.p1.move("vex", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("blade");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // Expected: with an empty pool P2 cannot afford the [1][rainbow] surcharge, so the flip is not legal
  // and the Blade stays facedown. Actual: the reveal is offered and succeeds for free.
  test("enemy Vex attacking: with 0 energy / 0 power P2 CANNOT flip the hidden Blade at all", async () => {
    const game = await vexAttacks({ energy: 0 }).build();
    await game.p1.move("vex", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "blade")).toBe(false);
    const r = await game.p2.try((p) => p.reveal("blade"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
  });

  // Expected: with a larger pool only the surcharge is taken — 3E/2R → 2E/1R (no discount step applies,
  // 356.4). Actual: nothing is deducted.
  test("enemy Vex attacking: from 3E/2R exactly [1] and 1 power are taken (→ 2E/1R)", async () => {
    const game = await vexAttacks({ energy: 3, rainbow: 2 }).build();
    await game.p1.move("vex", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("blade");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
  });
});
