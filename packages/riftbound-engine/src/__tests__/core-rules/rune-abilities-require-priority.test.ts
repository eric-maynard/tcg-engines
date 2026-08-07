/**
 * Rune Add abilities require Priority (rules 164.2.a/b, 312.1.a/b, 429.3).
 *
 * A Basic Rune's "[Exhaust]: Add [1]" and "Recycle this: Add [C]" are [Reaction]
 * Add abilities. Only the player who currently holds Priority may activate an
 * ability, so while a chain is open the off-priority player must be offered
 * neither move (the playtest report showed the action panel listing
 * "Exhaust Rune" / "Recycle Rune" for a player waiting on the opponent's
 * trigger). Once Priority comes back around, both are available again.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

/** A slow 0-cost spell — something to hold the chain open. */
const SLOW_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Cantrip",
};

describe("164.2 / 312.1 — rune Add abilities need Priority", () => {
  test("while the opponent holds Priority on an open chain, the waiting player may neither exhaust nor recycle a rune", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "f1" })
      .rune(P2, "fury", { alias: "f2" })
      .hand(P1, SLOW_SPELL, "cantrip")
      .build();

    // Before anything is on the chain both players' runes are usable.
    expect(game.p1.can("tapRune", "f1")).toBe(true);

    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);

    // P1 is waiting on P2 — no rune actions may be offered or taken.
    expect(game.p1.can("tapRune", "f1")).toBe(false);
    expect(game.p1.can("recycleRune", "f1")).toBe(false);
    const attempt = await game.p1.try((p) => p.tapRune("f1"));
    expect(attempt.ok).toBe(false);
    expect(game.state("f1").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(0);

    // The player who does hold Priority still may.
    expect(game.p2.can("tapRune", "f2")).toBe(true);
    await game.p2.tapRune("f2");
    expect(game.p2.energy()).toBe(1);

    // Chain empties → P1 may use its rune again.
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("tapRune", "f1")).toBe(true);
    await game.p1.tapRune("f1");
    expect(game.p1.energy()).toBe(1);
  });
});
