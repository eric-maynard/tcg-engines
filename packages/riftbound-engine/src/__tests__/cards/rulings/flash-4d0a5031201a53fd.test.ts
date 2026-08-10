/**
 * Ruling 4d0a5031201a53fd — Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · "If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *
 * Q: If Flash moves the unit targeted by Hidden Blade back to base, does its controller still draw 2?
 * A: No. Flash resolves first; when Hidden Blade resolves the unit is no longer "at a battlefield", so the target
 *    is illegal, nothing is killed and "its controller" draws nothing. Contrast Zhonya's: Hidden Blade does start
 *    resolving on a legal target — the death is replaced (unit saved to base) and the controller still draws 2.
 * Rules: 359.3.e.5 (targets re-checked on resolution; illegal ⇒ that instruction fails), 372 (replacement),
 *        LIFO chain order.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn with [2][order]; P2 holds bf1 with a 3-Might Runner and has Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

describe("Ruling 4d0a5031201a53fd — Flash in response to Hidden Blade: no kill, no draw", () => {
  test("P1 Hidden-Blades the Runner; P2 responds with Flash on it; Flash (top) resolves first and the Runner is in base while Hidden Blade is still pending", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "runner" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["runner"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["runner"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("Hidden Blade then resolves against a unit no longer at a battlefield: it fizzles — the Runner lives in base and P2 (its controller) draws NOTHING", async () => {
    const game = await board().build();
    const p2HandAfterFlash = game.p2.hand().length - 1;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["runner"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2HandAfterFlash); // no "draws 2"
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.hand()).toEqual([]); // and certainly not P1
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // the Blade was still paid for
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Zhonya's Hourglass: Hidden Blade resolves on a legal target, the death is replaced (Zhonya's dies; Runner healed, exhausted, recalled) and P2 STILL draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
      .gear(P2, ZHONYAS, "zhonya")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").isExhausted).toBe(true);
    expect(game.state("runner").damage).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });
});
