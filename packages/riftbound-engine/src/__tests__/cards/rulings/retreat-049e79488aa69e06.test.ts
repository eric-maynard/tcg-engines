/**
 * Ruling 049e79488aa69e06 — Retreat (OGN-104 → ogn-104-298) · Mind Reaction spell · [1]
 *   "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Hidden Blade (OGN-213 → ogn-213-298) "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."
 *
 * Q: If you Retreat your unit in response to an opponent's Hidden Blade, does the Blade's controller (or
 *    anyone) still draw 2?
 * A: No. Retreat resolves first and the unit leaves the battlefield, so Hidden Blade has no valid target;
 *    "its controller" cannot be determined and nobody draws. Same if the unit is merely moved to base
 *    (Flash). If instead the death is REPLACED (Zhonya's) the unit was a valid target at resolution, so its
 *    controller still draws 2.
 * Rules: 359.3.e.2 / 359.3.e.5 (illegal target ⇒ unaffected), 359.3.e.14.a (linked draw ignored),
 *        359.3.e.14.b (replaced kill does not stop the linked draw).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const ZHONYAS = "ogn-077-298";

/** P1's turn. P2's 3-Might Scout at P2's bf1. P1: Hidden Blade + exactly [2][order]. P2: [2] and the given response card. */
function board(response?: string) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .hand(P1, HIDDEN_BLADE, "blade");
  return response ? s.hand(P2, response, "resp") : s;
}

interface Counts {
  p1Hand: number;
  p2Hand: number;
  p1Deck: number;
  p2Deck: number;
  p2Runes: number;
}
function counts(game: Game): Counts {
  return {
    p1Deck: game.p1.deck().length,
    p1Hand: game.p1.hand().length,
    p2Deck: game.p2.deck().length,
    p2Hand: game.p2.hand().length,
    p2Runes: game.p2.runes().length,
  };
}

/** P1 casts Hidden Blade at the Scout and passes; P2 now holds priority. */
async function bladeAtScout(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

describe("Ruling 049e79488aa69e06 — Retreat (or any move off the battlefield) in response to Hidden Blade: no kill, no draw", () => {
  test("control: unanswered, Hidden Blade kills the Scout and its controller (P2) draws 2", async () => {
    const game = await board().build();
    const before = counts(game);
    await bladeAtScout(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(before.p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(before.p1Hand - 1);
  });

  test("Retreat is a legal Reaction response for P2; it goes on top of the Blade and resolves first — Scout returns to P2's hand and P2 channels 1 rune exhausted", async () => {
    const game = await board(RETREAT).build();
    const before = counts(game);
    await bladeAtScout(game);
    expect(game.p2.can("cast", "resp")).toBe(true);
    await game.p2.cast("resp", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "resp"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves (LIFO)
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.p2.runes()).toHaveLength(before.p2Runes + 1);
    expect(game.p2.runes({ ready: false }).length).toBeGreaterThanOrEqual(1);
    // Hidden Blade is still waiting to resolve.
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("ruling: after Retreat, Hidden Blade resolves with NO valid target — the Scout is not killed and NOBODY draws", async () => {
    const game = await board(RETREAT).build();
    const before = counts(game);
    await bladeAtScout(game);
    await game.p2.cast("resp", { targets: "scout" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.trash()).not.toContain("scout");
    // P2's hand: -Retreat +Scout, no draws; P1's hand: -Blade, no draws. Decks untouched.
    expect(game.p2.hand()).toHaveLength(before.p2Hand - 1 + 1);
    expect(game.p1.hand()).toHaveLength(before.p1Hand - 1);
    expect(game.p2.deck()).toHaveLength(before.p2Deck);
    expect(game.p1.deck()).toHaveLength(before.p1Deck);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("resp")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: moving the unit to BASE instead (Flash) also makes it an invalid target — not killed, nobody draws", async () => {
    const game = await board(FLASH).build();
    const before = counts(game);
    await bladeAtScout(game);
    await game.p2.cast("resp", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.p2.hand()).toHaveLength(before.p2Hand - 1);
    expect(game.p1.hand()).toHaveLength(before.p1Hand - 1);
    expect(game.p2.deck()).toHaveLength(before.p2Deck);
    expect(game.p1.deck()).toHaveLength(before.p1Deck);
  });

  test("nuance: if the death is REPLACED (Zhonya's Hourglass) the Scout was still a valid target at resolution — Hourglass dies instead, Scout recalled exhausted, and P2 still draws 2", async () => {
    const game = await board().gear(P2, ZHONYAS, "hourglass").build();
    const before = counts(game);
    await bladeAtScout(game);
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand()).toHaveLength(before.p2Hand + 2);
    expect(game.p2.deck()).toHaveLength(before.p2Deck - 2);
    expect(game.p1.hand()).toHaveLength(before.p1Hand - 1);
  });
});
