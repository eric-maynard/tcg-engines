/**
 * Ruling 706134378e89df9c — Ekko, Recurrent (OGN-110 → ogn-110-298) · Unit · Mind · [5][mind] · 5 Might
 *   "[Accelerate] … [Deathknell] — Recycle me to ready your runes."
 *
 * Q: Can I exhaust ALL my runes in response to a Reaction spell that will kill Ekko, even though I have no
 *    cost to pay at that moment?
 * A: Yes. A rune's [Add] abilities (exhaust for Energy, recycle for Power) are Reaction speed and may be
 *    used whenever a reaction may be made. Once the killing spell starts resolving there is no further
 *    window, so bank the Energy first: Ekko's Deathknell then readies those runes again.
 * Rules: 429.3 / 357.1.a (rune [Add] abilities are Reaction speed), 340 (priority windows on the chain),
 *        321 (no window inside a resolution), 383 (Deathknell trigger).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EKKO = "ogn-110-298";

/** Reaction spell: "Kill an enemy unit." (stand-in for any reaction removal aimed at Ekko) */
const SNIPE = {
  abilities: [{ effect: { target: { controller: "enemy", type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snipe (inline reaction: Kill an enemy unit)",
  timing: "reaction",
};

/** P2's turn. P1 has Ekko in base and 5 ready Mind runes, and no Energy banked. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 0 })
    .runes(P1, "mind", 5)
    .unit(P1, "base", EKKO, "ekko")
    .hand(P2, SNIPE, "snipe");
}

describe("Ruling 706134378e89df9c — runes may be exhausted in response to the spell that will kill Ekko", () => {
  test("with Snipe on the chain P1 may tap runes for Energy even with nothing to pay — Reaction speed, no cost required", async () => {
    const game = await board().build();
    await game.p2.cast("snipe", { targets: "ekko" });
    await game.p2.passPriority(); // P1's response window
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("tapRune")).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(5);

    await game.p1.tapRunes(5);
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snipe", controller: P2 })]);
    expect(game.zoneOf("ekko")).toBe("base"); // still alive — the spell has not resolved
  });

  test("once both players pass, Snipe resolves and kills Ekko in one go — no window in between — and the Deathknell then readies the 5 runes on top of the 5 banked Energy", async () => {
    const game = await board().build();
    await game.p2.cast("snipe", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.tapRunes(5);
    await game.p1.passPriority(); // both have now passed: Snipe resolves and kills Ekko in one uninterrupted go
    expect(game.locationOf("ekko")).toBeUndefined(); // off the board — no window opened mid-resolution
    expect(game.zoneOf("ekko")).toBe("mainDeck"); // the Deathknell's "Recycle me" cost was paid at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", controller: P1, triggered: true })]);

    await game.settle(); // the Deathknell resolves and readies P1's runes
    expect(game.p1.energy()).toBe(5); // the banked Energy survives
    expect(game.p1.runes({ ready: true })).toHaveLength(5); // …and the runes are usable again — 10 Energy of value
    expect(game.violations()).toEqual([]);
  });

  test("contrast — waiting instead of tapping: after Ekko dies the runes are readied but nothing was banked, so P1 has 5 (not 10) rune-worth of Energy available", async () => {
    const game = await board().build();
    await game.p2.cast("snipe", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.settle();
    expect(game.locationOf("ekko")).toBeUndefined();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes({ ready: true })).toHaveLength(5);
  });
});
