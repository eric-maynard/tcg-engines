/**
 * Retreat — ogn-104-298 · Spell · Mind · 1 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.
 *
 * Rules: Reaction timing (may be played on any turn and onto an open chain),
 * channel = move the top rune of the rune deck into the rune pool (here: exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-104-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2 }, "ally")
    .unit(P2, "base", { might: 2 }, "foe")
    .hand(P1, CARD, "ret");
}

describe("Retreat (ogn-104-298)", () => {
  test("costs 1 energy; only friendly units are targets; returns the unit to its owner's hand; spell to trash", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ret")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    await game.p1.cast("ret", { targets: "ally" });
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ret", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.zoneOf("ret")).toBe("trash");
  });

  test("not playable without a friendly unit or without 1 energy", async () => {
    const noUnit = await scenario().resources(P1, { energy: 1 }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CARD, "ret").build();
    expect(noUnit.p1.can("cast", "ret")).toBe(false);
    const noEnergy = await scenario().unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ret").build();
    expect(noEnergy.p1.can("cast", "ret")).toBe(false);
  });

  test.failing("BUG: 'Its owner channels 1 rune exhausted' — P1's rune pool gains one exhausted rune from the rune deck", async () => {
    // Expected: after resolution P1 has +1 rune in the pool, that rune is exhausted, rune deck −1.
    // Actual: only the return-to-hand half resolves; no rune is channeled.
    const game = await board().build();
    const pool0 = game.p1.runes().length;
    const deck0 = game.p1.runeDeck().length;
    await game.p1.cast("ret", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(pool0 + 1);
    expect(game.p1.runeDeck()).toHaveLength(deck0 - 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.energy()).toBe(1); // channeling exhausted adds no energy
  });

  test("Reaction timing: playable on the opponent's turn (in a Closed State — rule 316.5.b / 813.1.c)", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ret").hand(P2, { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Slow Draw", timing: "action" }, "theirs").build();
    expect(game.p1.can("cast", "ret")).toBe(false); // opponent's Neutral Open State
    await game.p2.cast("theirs");
    await game.p2.passPriority();
    expect(game.p1.can("cast", "ret")).toBe(true);
    await game.p1.cast("ret", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
  });

  test("Reaction timing: can be added to an open chain (a second Retreat in response to the first)", async () => {
    const game = await board().hand(P1, CARD, "ret2").unit(P1, "base", { might: 1 }, "other").build();
    await game.p1.cast("ret", { targets: "ally" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "ret2")).toBe(true);
    await game.p1.cast("ret2", { targets: "other" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ret", "ret2"]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("other")).toBe("hand");
  });
});
