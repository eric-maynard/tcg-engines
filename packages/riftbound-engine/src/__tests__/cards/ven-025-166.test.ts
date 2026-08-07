/**
 * Esteemed Hierophant — ven-025-166 · Unit · Calm · 5 energy · 5 Might
 *
 *   While you control 7 or more runes, prevent all damage that enemy spells and abilities
 *   would deal to me.
 *
 * Head-judge checklist (the tricky spots this file covers):
 *  1. Threshold: exactly 7 runes in your rune POOL turns it on (8 too); 6 does not — runes still in the
 *     rune deck are not "controlled" (the scenario rune deck holds 12 and must not count).
 *  2. Only ENEMY sources: your own spell hitting it is dealt in full.
 *  3. Only SPELL / ABILITY damage: enemy combat damage is dealt normally (437 covers "damage that
 *     [source] would deal"; combat damage is dealt by units).
 *  4. Prevent "all" is a replacement (369.2, 437.4): the damage is not dealt at all — an exactly/over-lethal
 *     Falling Comet (6) or a 7-rune Siphoning Strike (7) leaves it on 0 damage; ability damage
 *     (Iron Ballista) likewise.
 *  5. Prevention is not indestructibility: an enemy Vengeance ("Kill a unit") still kills it.
 *  6. "While" is continuous — evaluated when the damage would be dealt: recycling a rune in response
 *     (7 → 6) turns the shield off before the spell resolves.
 *  The engine parses NO ability for this card (vanilla 5/5) → every prevention clause is a BUG test.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-025-166";
const FALLING_COMET = "ogn-085-298"; // Mind Action spell, 5: Deal 6 to a unit at a battlefield.
const SIPHONING_STRIKE = "ven-146-166"; // Calm/Mind spell, 4: Deal 4 to a unit at a battlefield; 7 instead if you control 7+ runes.
const IRON_BALLISTA = "ogn-017-298"; // Gear: [Exhaust]: Deal 2 to a unit at a battlefield (ability #1).
const VENGEANCE = "ogn-229-298"; // Order spell, 4+[order][order]: Kill a unit.

/** P2's turn; P1 holds `runes` calm runes and the Hierophant at bf1; P2 has Falling Comet + 5 energy. */
function cometBoard(runes: number) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5 })
    .runes(P1, "calm", runes)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "eh")
    .hand(P2, FALLING_COMET, "comet");
}

describe("Esteemed Hierophant (ven-025-166)", () => {
  test("registry payload carries one conditional prevent-damage ability (7+ runes, enemy spells/abilities); the parser produced none", async () => {
    // Expected: exactly one static/replacement ability mentioning prevent + the 7-rune condition.
    // Actual: `abilities` is absent — the card is a vanilla 5/5 to the engine.
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, might: 5, name: "Esteemed Hierophant" });
    const abilities = (def?.abilities ?? []) as unknown[];
    expect(abilities).toHaveLength(1);
    expect(JSON.stringify(abilities[0])).toMatch(/prevent/i);
    expect(JSON.stringify(abilities[0])).toMatch(/7/);
  });

  test("cost: 5 energy, no power; a 5-Might unit that enters the base exhausted; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "eh").build();
    await game.p1.play("eh", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("eh")).toBe("base");
    expect(game.state("eh")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5, powerCost: [] });
    const poor = await scenario().resources(P1, { energy: 4, power: { calm: 3 } }).hand(P1, CARD, "eh").build();
    expect(poor.p1.can("play", "eh")).toBe(false);
  });

  test("with exactly 7 runes, an enemy Falling Comet (6 ≥ 5, lethal) is fully prevented — 0 damage, still at bf1", async () => {
    // Expected (437.2/437.4): the 6 damage is replaced by 0; Hierophant survives undamaged.
    // Actual: no ability → takes 6 and dies.
    const game = await cometBoard(7).build();
    expect(game.p1.runes()).toHaveLength(7);
    await game.p2.cast("comet", { targets: "eh" });
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("eh")).toBe("battlefield-bf1");
    expect(game.state("eh").damage).toBe(0);
  });

  test("negative: with 6 runes in the pool (and a full rune DECK, which does not count) the same Comet kills it", async () => {
    const game = await cometBoard(6).build();
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runeDeck().length).toBeGreaterThanOrEqual(7); // undrawn runes are not "controlled"
    await game.p2.cast("comet", { targets: "eh" });
    await game.settle();
    expect(game.zoneOf("eh")).toBe("trash");
  });

  test("negative: only ENEMY sources — your own Falling Comet at 7 runes is dealt in full and kills it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .runes(P1, "calm", 7)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "eh")
      .hand(P1, FALLING_COMET, "comet")
      .build();
    await game.p1.cast("comet", { targets: "eh" });
    await game.settle();
    expect(game.zoneOf("eh")).toBe("trash");
  });

  test("negative: only spell/ability damage — enemy COMBAT damage at 7 runes is dealt normally (6-Might attacker kills it, takes 5, conquers)", async () => {
    const game = await scenario()
      .active(P2)
      .runes(P1, "calm", 7)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "eh")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("eh")).toBe("trash");
    expect(game.locationOf("brute")).toBe("bf1"); // took 5 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("enemy ABILITY damage is prevented too — Iron Ballista's '[Exhaust]: Deal 2' leaves it on 0 damage at 7 runes", async () => {
    // Expected: 0 damage marked (437.4 — not dealt at all). Actual: 2 damage marked.
    const game = await scenario()
      .active(P2)
      .runes(P1, "calm", 7)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "eh")
      .gear(P2, IRON_BALLISTA, "ballista")
      .build();
    await game.p2.activate("ballista", 1, { answers: ["eh"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("eh");
      await game.settle();
    }
    expect(game.state("ballista").isExhausted).toBe(true); // the ability was used and paid for
    expect(game.zoneOf("eh")).toBe("battlefield-bf1");
    expect(game.state("eh").damage).toBe(0);
  });

  test("'7 or MORE' — at 8 runes an enemy 7-rune Siphoning Strike (7 damage) is still fully prevented", async () => {
    // Expected: survives on 0 damage. Actual: dies.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { rainbow: 2 } })
      .runes(P2, "calm", 7) // P2's own 7 runes only upgrade THEIR spell to 7 damage
      .runes(P1, "calm", 8)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "eh")
      .hand(P2, SIPHONING_STRIKE, "siphon")
      .build();
    await game.p2.cast("siphon", { targets: "eh" });
    await game.settle();
    expect(game.zoneOf("siphon")).toBe("trash");
    expect(game.zoneOf("eh")).toBe("battlefield-bf1");
    expect(game.state("eh").damage).toBe(0);
  });

  test("negative: the opponent's rune count is irrelevant — P2 at 7 runes, P1 at 6: Siphoning Strike deals 7 and kills it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { rainbow: 2 } })
      .runes(P2, "calm", 7)
      .runes(P1, "calm", 6)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "eh")
      .hand(P2, SIPHONING_STRIKE, "siphon")
      .build();
    await game.p2.cast("siphon", { targets: "eh" });
    await game.settle();
    expect(game.zoneOf("eh")).toBe("trash");
  });

  test("negative: prevention is not indestructibility — an enemy Vengeance ('Kill a unit') kills it even at 7 runes", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .runes(P1, "calm", 7)
      .unit(P1, "base", CARD, "eh")
      .hand(P2, VENGEANCE, "vengeance")
      .build();
    await game.p2.cast("vengeance", { targets: "eh" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("eh")).toBe("trash");
    expect(game.zoneOf("vengeance")).toBe("trash");
  });

  test("'while' is continuous: P1 recycling a rune in response (7 → 6) switches the shield off before the Comet resolves → it dies", async () => {
    const game = await cometBoard(7).build();
    await game.p2.cast("comet", { targets: "eh" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.recycleRune();
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.power("calm")).toBe(1);
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("eh")).toBe("trash");
  });
});
