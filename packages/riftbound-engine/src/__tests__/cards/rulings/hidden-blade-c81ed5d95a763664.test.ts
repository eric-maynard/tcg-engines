/**
 * Ruling c81ed5d95a763664 — Hidden Blade (ogn-213-298) × Flash (ogs-011-024) × Zhonya's Hourglass (ogn-077-298)
 *   Hidden Blade — [Hidden][Action] · [2][order]: "Kill a unit at a battlefield. Its controller draws 2."
 *   Flash — [Reaction] · [2]: "Move up to 2 friendly units to base."
 *   Zhonya's Hourglass — Gear: "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, recall it."
 *
 * Q: The unit targeted by Hidden Blade Flashes back to base before the Blade resolves — does it die, does its
 *    controller draw 2?
 * A: No and no. Off the battlefield it is an invalid target, so no kill happens and "its controller" has nothing to
 *    reference — nobody draws. Contrast: a REPLACEMENT of the kill (Zhonya's) happens while the target is valid during
 *    resolution, so there the controller still draws 2.
 * Rules: 355.7 / 355.9 (targets locked, rechecked on resolution), 359.3.e.14 (linked "its controller"), 369.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const ZHONYAS = "ogn-077-298";

/** P1's turn 3 with exactly [2][order] + Hidden Blade in hand. P2's Victim at bf1; P2 holds Flash + [2]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 2, name: "Other" }, "other")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

async function bladeThenFlash(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: "victim" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
}

describe("Ruling c81ed5d95a763664 — Flash the target home: Hidden Blade kills nothing and nobody draws", () => {
  test("control: unanswered, Hidden Blade kills the Victim at bf1 and its controller P2 draws 2 (P1 draws nothing)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  test("Flash resolves first (LIFO): the Victim is in P2's base while Hidden Blade still sits on the chain aimed at it", async () => {
    const game = await board().build();
    await bladeThenFlash(game);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  });

  test("Hidden Blade then resolves on an invalid target: the Victim does NOT die, the Other unit is not substituted, and NEITHER player draws", async () => {
    const game = await board().build();
    await bladeThenFlash(game);
    const p1Hand = game.p1.hand().length; // blade already left
    const p2Hand = game.p2.hand().length; // flash already left
    const p2Deck = game.p2.deck().length;
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action"); // never a re-target prompt
      await game.acting().pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("other")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a replacement (Zhonya's Hourglass in P2's base) is different: the kill is replaced during resolution while the target is valid, so the Victim survives in base AND P2 still draws 2", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1 })
      .gear(P2, ZHONYAS, "zh")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.zoneOf("victim")).toBe("base"); // recalled, not dead
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
