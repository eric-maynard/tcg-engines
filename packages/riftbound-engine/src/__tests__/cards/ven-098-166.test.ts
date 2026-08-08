/**
 * Stargazer — ven-098-166 · Unit · Chaos · 5 energy · 4 Might
 *
 *   Spells with [Flow] you play from your trash cost [2] less, to a minimum of [1].
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. 829.1.c.1 — the discount rides on the FLOW cost (the alternate cost paid from the trash), not on
 *     the printed cost: Onslaught (4, Flow [4]) Flows for 2; Twilight Step (2+[chaos], Flow [4][chaos])
 *     Flows for 2+[chaos] — power pips are never discounted, only the energy.
 *  2. "to a minimum of [1]" (356.4.e): Dredge Up (Flow [2]) → 1, never 0; a Flow cost already at 1
 *     (Death Mark, Flow [1][rainbow][rainbow]) stays at 1. Two Stargazers on Onslaught: 4 → 2 → 1.
 *  3. Scope: only plays FROM YOUR TRASH. The same spell cast from hand costs full price with Stargazer
 *     out; an opponent's Flow play from THEIR trash is not discounted by your Stargazer.
 *  4. Stargazer must be on the board (base or battlefield) — in hand it does nothing.
 *  5. The Flowed spell is still banished afterwards (829.1.b.1) — the discount changes nothing else.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-098-166";
const DREDGE_UP = "ven-049-166"; // Spell · 2 · Draw 1. Flow [2]
const ONSLAUGHT = "ven-081-166"; // Spell · 4 · Give a unit +6 Might this turn. Flow [4]
const TWILIGHT_STEP = "ven-105-166"; // Spell · 2+[chaos] · Move a unit with 3 Might or less. Flow [4][chaos]
const DEATH_MARK = "ven-144-166"; // Spell · 2+[rainbow] · Burn 3, Shadow Clone token. Flow [1][rainbow][rainbow]

describe("Stargazer (ven-098-166)", () => {
  test("costs 5 energy (no power), 4-Might chaos unit; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sg").build();
    await game.p1.play("sg");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.state("sg")).toMatchObject({ baseMight: 4, might: 4 });
    const poor = await scenario().resources(P1, { energy: 4, power: { chaos: 2 } }).hand(P1, CARD, "sg").build();
    expect(poor.p1.can("play", "sg")).toBe(false);
  });

  test("Onslaught Flowed from the trash costs 4 − 2 = 2: +6 Might lands and the spell is banished", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "sg")
      .trash(P1, ONSLAUGHT, "ons")
      .build();
    expect(game.p1.can("cast", "ons")).toBe(true);
    await game.p1.cast("ons", { flow: true, targets: "sg" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("sg").might).toBe(10);
    expect(game.zoneOf("ons")).toBe("banishment");
    // 1 energy is one short of the discounted 2.
    const short = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "sg").trash(P1, ONSLAUGHT, "ons").build();
    expect(short.p1.can("cast", "ons")).toBe(false);
  });

  test("minimum of [1]: Dredge Up (Flow [2]) Flows for exactly 1 — legal with 1 energy, not with 0", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "sg")
      .trash(P1, DREDGE_UP, "du")
      .deckTop(P1, "ogn-175-298", "topcard")
      .build();
    await game.p1.cast("du", { flow: true });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toEqual(["topcard"]);
    expect(game.zoneOf("du")).toBe("banishment");
    const zero = await scenario().resources(P1, { energy: 0, power: { chaos: 3 } }).unit(P1, "base", CARD, "sg").trash(P1, DREDGE_UP, "du").build();
    expect(zero.p1.can("cast", "du")).toBe(false);
  });

  test("a Flow cost already at [1] is not reduced below 1, and power pips are untouched (Death Mark: 1 + 2 rainbow)", async () => {
    const ok = await scenario().resources(P1, { energy: 1, power: { rainbow: 2 } }).unit(P1, "base", CARD, "sg").trash(P1, DEATH_MARK, "dm").build();
    expect(ok.p1.can("cast", "dm")).toBe(true);
    await ok.p1.cast("dm", { flow: true });
    expect(ok.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const noEnergy = await scenario().resources(P1, { energy: 0, power: { rainbow: 2 } }).unit(P1, "base", CARD, "sg").trash(P1, DEATH_MARK, "dm").build();
    expect(noEnergy.p1.can("cast", "dm")).toBe(false);
    const onePip = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).unit(P1, "base", CARD, "sg").trash(P1, DEATH_MARK, "dm").build();
    expect(onePip.p1.can("cast", "dm")).toBe(false);
  });

  test("only the energy is discounted: Twilight Step (Flow [4][chaos]) Flows for 2 + [chaos]; without the chaos power it is illegal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, TWILIGHT_STEP, "ts")
      .build();
    expect(game.p1.can("cast", "ts")).toBe(true);
    await game.p1.cast("ts", { flow: true, targets: "scout" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const noPower = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, TWILIGHT_STEP, "ts")
      .build();
    expect(noPower.p1.can("cast", "ts")).toBe(false);
  });

  test("negative space: the same Flow spell cast from HAND pays full price (Onslaught = 4) even with Stargazer on the board", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "sg").hand(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { targets: "sg" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ons")).toBe("trash"); // from hand → trash (Flow-able later), not banished
    const three = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "sg").hand(P1, ONSLAUGHT, "ons").build();
    expect(three.p1.can("cast", "ons")).toBe(false);
  });

  test("negative space: without Stargazer on the board (it is in hand) Onslaught Flows for the full 4", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "sg").unit(P1, "base", { might: 1 }, "ally").trash(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { flow: true, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    const two = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sg").unit(P1, "base", { might: 1 }, "ally").trash(P1, ONSLAUGHT, "ons").build();
    expect(two.p1.can("cast", "ons")).toBe(false);
  });

  test("'you play': the opponent's Flow play from THEIR trash is not discounted by your Stargazer (Dredge Up still 2 for them)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "sg").trash(P2, DREDGE_UP, "du").build();
    expect(game.p2.can("cast", "du")).toBe(false);
    const full = await scenario().active(P2).resources(P2, { energy: 2 }).unit(P1, "base", CARD, "sg").trash(P2, DREDGE_UP, "du").build();
    await full.p2.cast("du", { flow: true });
    expect(full.p2.energy()).toBe(0);
  });

  test("Stargazer at a battlefield still discounts (it is on the board): Dredge Up Flows for 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sg")
      .trash(P1, DREDGE_UP, "du")
      .build();
    await game.p1.cast("du", { flow: true });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("du")).toBe("banishment");
  });

  test("two Stargazers stack, each floored at 1 (356.4.e): Onslaught Flows 4 → 2 → 1, never 0", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "sg1")
      .unit(P1, "base", CARD, "sg2")
      .trash(P1, ONSLAUGHT, "ons")
      .build();
    expect(game.p1.can("cast", "ons")).toBe(true);
    await game.p1.cast("ons", { flow: true, targets: "sg1" });
    expect(game.p1.energy()).toBe(0);
    const zero = await scenario().resources(P1, { energy: 0, power: { chaos: 2 } }).unit(P1, "base", CARD, "sg1").unit(P1, "base", CARD, "sg2").trash(P1, ONSLAUGHT, "ons").build();
    expect(zero.p1.can("cast", "ons")).toBe(false);
  });

  test("full loop with Stargazer out: Dredge Up from hand (2) → trash → Flow (1) → banished = 2 draws for 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "sg").hand(P1, DREDGE_UP, "du").build();
    await game.p1.cast("du");
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.zoneOf("du")).toBe("trash");
    await game.p1.cast("du", { flow: true });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("du")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("parsed abilities: one static cost-reduction of 2 (min 1) scoped to friendly Flow spells played from the trash", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, might: 4, name: "Stargazer" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { by: 2, minimum: 1, target: { controller: "friendly", fromZone: "trash", keyword: "Flow", type: "spell" }, type: "cost-reduction" },
      type: "static",
    });
  });
});
