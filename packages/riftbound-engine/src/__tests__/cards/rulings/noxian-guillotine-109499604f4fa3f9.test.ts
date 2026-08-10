/**
 * Ruling 109499604f4fa3f9 — Noxian Guillotine (OGN-254 → ogn-254-298) · Fury/Order Action spell · [4][rainbow]
 *   "Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead."
 *   × Disintegrate (OGN-005 → ogn-005-298) · Fury Action spell · [4]
 *   "Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1."
 *
 * Q: Guillotine a 12-Might unit, then Disintegrate it. Does Disintegrate draw you a card?
 * A: No. Disintegrate deals 3 (not lethal on its own); the unit dies to Guillotine's delayed "kill it the next
 *    time it takes damage" effect, so the kill credit belongs to Guillotine, not to Disintegrate — "If this
 *    kills it" is false and no card is drawn.
 * Rules: 724 (Legion — not met here: Guillotine is P1's first card), delayed kill effect vs. damage credit,
 *        359.3.e.14 (Disintegrate's draw is linked to ITS kill).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_GUILLOTINE = "ogn-254-298";
const DISINTEGRATE = "ogn-005-298";

/** P1's turn, nothing played yet (no Legion). P2's 12-Might Colossus at P2's bf1. P1: both spells, [8] + 1 power for the [rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 12, name: "Colossus" }, "colossus")
    .hand(P1, NOXIAN_GUILLOTINE, "guillotine")
    .hand(P1, DISINTEGRATE, "disintegrate")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 109499604f4fa3f9 — Guillotine's delayed kill takes the credit: Disintegrate draws nothing", () => {
  test("Noxian Guillotine without Legion (first card this turn) does NOT kill now — the Colossus stays, undamaged, with a pending 'kill on next damage this turn'", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.cast("guillotine", { targets: "colossus" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("guillotine")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.state("colossus").damage).toBe(0);
    expect(game.p1.hand()).toEqual(["disintegrate"]);
  });

  test("ruling: Disintegrate then deals 3 — the Colossus (12 Might) dies to GUILLOTINE's effect, and P1 draws NO card", async () => {
    const game = await board().build();
    await game.p1.cast("guillotine", { targets: "colossus" });
    await game.settle();
    await game.p1.cast("disintegrate", { targets: "colossus" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const deck = game.p1.deck().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    // 3 damage is nowhere near lethal for 12 Might, yet the unit is dead: Guillotine killed it.
    expect(game.zoneOf("colossus")).toBe("trash");
    expect(game.zoneOf("disintegrate")).toBe("trash");
    // "If this kills it" is false for Disintegrate → no draw.
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Disintegrate that itself kills (a 3-Might unit, no Guillotine) DOES draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Runt" }, "runt")
      .hand(P1, DISINTEGRATE, "disintegrate")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.cast("disintegrate", { targets: "runt" });
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("control: Disintegrate alone on the 12-Might Colossus just marks 3 damage and draws nothing", async () => {
    const game = await board().build();
    await game.p1.cast("disintegrate", { targets: "colossus" });
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.state("colossus").damage).toBe(3);
    expect(game.p1.hand()).toEqual(["guillotine"]);
  });
});
