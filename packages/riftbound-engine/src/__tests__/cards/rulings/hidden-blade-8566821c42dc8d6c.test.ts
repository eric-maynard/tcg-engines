/**
 * Ruling 8566821c42dc8d6c — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] Action [2][order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Tideturner (OGN-199 → ogn-199-298) · [Hidden] 2-Might unit "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *   (Zhonya's Hourglass ogn-077-298 is only mentioned as the contrasting replacement case.)
 *
 * Q: Hidden Blade, HIDDEN at battlefield A, is flipped on an attacking unit there; the opponent answers with Tideturner,
 *    swapping that unit to battlefield B. Does the Blade still kill it, and does anyone draw 2?
 * A: No and no. A card played from facedown may only choose units "here"; once the unit is at B it is no longer a legal
 *    target, so Hidden Blade resolves with no effect — no kill, and (the draw being tied to the killed unit) no draw.
 *    Had the Blade been played from HAND, the moved unit would still be "a unit at a battlefield" and the kill + draw
 *    would happen.
 * Rules: 811.1.d.2 (hidden play ⇒ implicit "here" targeting requirement), 359.3.f.2 / 359.3.e.14 (target legality is
 *        re-checked on resolution; dependent "its controller draws 2" is skipped), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";

/**
 * Turn 3, P2's turn. Battlefield A: P1's, held by a 4-Might Defender, with P1's Hidden Blade facedown there.
 * Battlefield B: P2's, held by a 1-Might Guard, with P2's Tideturner facedown there. P2's 3-Might Raider in base
 * is the attacker-to-be. For the from-hand contrast P1 also holds a second Hidden Blade with exactly [2][order].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 4, name: "Defender" }, "defender")
    .facedown(P1, "bfA", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "bladeHand")
    .unit(P2, "bfB", { might: 1, name: "Guard" }, "guard")
    .facedown(P2, "bfB", TIDETURNER, "tt")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Raider attacks A; P2 passes focus; P1 plays a Blade (hidden or from hand) on Raider; P2 answers with Tideturner from B and swaps with Raider; the swap resolves. */
async function bladeThenTideturner(which: "blade" | "bladeHand"): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  await game.settle({ maxSteps: 20, policy: (d) => (d.kind === "action" && d.context === "chain" && d.passKey ? { key: d.passKey, kind: "action" } : undefined) });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  if (which === "blade") {
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    const ask = game.decision();
    if (ask?.kind === "pick" && ask.seat === P1) {
      // 811.1.d.2 — only units HERE (bfA) are offered: Defender and the attacking Raider, never the Guard at B.
      expect(ask.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["defender", "raider"]);
      await game.p1.pick("raider");
    }
  } else {
    await game.p1.cast("bladeHand", { targets: "raider" });
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: which, controller: P1, targets: ["raider"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    expect(d.options.map((o) => o.card ?? o.key)).toContain("raider");
    await game.p2.pick("raider");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual([which, "tt"]);
  // Tideturner's swap resolves first (LIFO).
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.locationOf("raider")).toBe("bfB");
  expect(game.locationOf("tt")).toBe("bfA");
  expect(game.chain().map((c) => c.cardId)).toEqual([which]);
  return game;
}

describe("Ruling 8566821c42dc8d6c — a HIDDEN Hidden Blade loses its target when Tideturner swaps it to another battlefield", () => {
  test("sequence: Blade (from facedown at A) targets the attacker; Tideturner from B swaps with it — the attacker is now at B while the Blade is still pending", async () => {
    const game = await bladeThenTideturner("blade");
    expect(game.zoneOf("raider")).toBe("battlefield-bfB");
  });

  test("Hidden Blade then resolves with NO effect: the Raider (no longer 'here') survives at B and NOBODY draws", async () => {
    const game = await bladeThenTideturner("blade");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bfB");
    expect(game.state("raider").damage).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (nuance): the same Blade played from HAND has no 'here' restriction — after the swap the Raider is still 'a unit at a battlefield', so it dies at B and P2 draws 2", async () => {
    const game = await bladeThenTideturner("bladeHand");
    const p2Hand = game.p2.hand().length;
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bladeHand")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });
});
