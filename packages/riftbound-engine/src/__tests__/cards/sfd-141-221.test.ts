/**
 * Irelia, Graceful — sfd-141-221 · Unit · Chaos · Champion (Irelia) · 4 energy + [chaos] · 4 Might
 *
 *   Your spells that choose me cost [1] or [rainbow] less.
 *
 * Rules: 366.2 (passives can alter the costs of cards as they are played), 356.4.b/356.4.f
 * ("cost [amount] less" discounts; may reduce a component to 0, never below), 356.1-ish: the
 * discount is evaluated while PLAYING the spell, i.e. from its chosen targets, so it also decides
 * affordability; "[1] or [rainbow]" = the caster picks ONE: 1 Energy off, or 1 Power pip (any
 * domain) off; "your spells" = only spells (not abilities) controlled by Irelia's controller;
 * "that choose me" = Irelia is among the spell's chosen targets (any slot), 365.1 (only on board).
 *
 * Head-judge corner cases considered:
 *   - reduce-to-zero: Cleave ([1]) on Irelia is free → castable with an empty pool;
 *   - the OR: Ride the Wind ([2][chaos]) becomes payable as [2] with no power, or as [1][chaos];
 *     with [2]+[chaos] available exactly one unit of resource must remain (never both discounts);
 *     [1] alone is still not enough (only one discount);
 *   - multi-target spell (Defiant Dance) choosing Irelia in either slot still gets it;
 *   - negative space: your spell choosing ANOTHER unit, an OPPONENT's spell choosing Irelia, and
 *     your ACTIVATED ABILITY (The Syren) choosing Irelia all pay full price;
 *   - Irelia's own cost/stats and affordability.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-141-221";
const CLEAVE = "ogn-004-298"; // [Action] [1]: give a unit Assault 3 this turn
const RIDE_THE_WIND = "ogn-173-298"; // [Action] [2][chaos]: move a friendly unit and ready it
const DEFIANT_DANCE = "sfd-196-221"; // [Reaction] [1][rainbow]: a unit +2, another unit -2 this turn
const THE_SYREN = "ogn-184-298"; // Gear · Chaos: [1], [Exhaust]: move a friendly unit at a battlefield to its base

function withIrelia(resources: { energy?: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, resources)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "irelia", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Sidekick" }, "side")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe");
}

describe("Irelia, Graceful (sfd-141-221)", () => {
  test("Irelia herself: 4 energy + [chaos], a 4-Might Chaos champion unit that enters exhausted; unaffordable without the [chaos] pip or at 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "irelia").build();
    await game.p1.play("irelia", { to: "base" });
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("irelia").domains).toEqual(["chaos"]);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
  });

  test("reduce-to-zero — Cleave ([1]) choosing Irelia is free: castable with an EMPTY pool and resolves (Assault 3 on Irelia)", async () => {
    // Expected: the [1] discount makes the play affordable at 0 energy; pool stays {0,{}}.
    const game = await withIrelia({ energy: 0 }).hand(P1, CLEAVE, "cleave").build();
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("irelia").grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  test("with 1 energy, Cleave on Irelia deducts nothing — the 1 energy is still there afterwards", async () => {
    // Expected: {1,{}} after the cast.
    const game = await withIrelia({ energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
  });

  test("negative space: the same Cleave choosing your OTHER unit pays full price (Irelia merely being on the board is not enough)", async () => {
    const game = await withIrelia({ energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "side" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("side").grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
    expect(game.state("irelia").grantedKeywords.filter((k) => k.keyword === "Assault")).toEqual([]);
    // and with 0 energy the sidekick line is simply not castable
    const broke = await withIrelia({ energy: 0 }).hand(P1, CLEAVE, "cleave").build();
    const r = await broke.p1.try((p) => p.cast("cleave", { targets: "side" }));
    expect(r.ok).toBe(false);
  });

  test("negative space: 'YOUR spells' — the opponent's Cleave choosing Irelia costs them the full [1]", async () => {
    const game = await withIrelia({}).active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "theirCleave").build();
    await game.p2.cast("theirCleave", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    const broke = await withIrelia({}).active(P2).resources(P2, { energy: 0 }).hand(P2, CLEAVE, "theirCleave").build();
    expect(broke.p2.can("cast", "theirCleave")).toBe(false);
  });

  test("negative space: 'SPELLS' — your activated ability that chooses Irelia (The Syren: [1], Exhaust) still costs the full [1]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "irelia")
      .gear(P1, THE_SYREN, "syren")
      .build();
    await game.p1.activate("syren", 0, { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("syren").isExhausted).toBe(true);
    const broke = await scenario().resources(P1, { energy: 0 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "irelia").gear(P1, THE_SYREN, "syren").build();
    expect(broke.p1.can("activate", "syren")).toBe(false);
  });

  test("'… or [rainbow] less' — Ride the Wind ([2][chaos]) choosing Irelia is castable with 2 energy and NO power (the pip is waived)", async () => {
    // Expected: offered and castable; afterwards {0,{}}; Irelia moved to bf1 and readied.
    const game = await withIrelia({ energy: 2 }).hand(P1, RIDE_THE_WIND, "rtw").build();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "irelia" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.settle({ policy: "first" });
    expect(game.locationOf("irelia")).toBe("bf1");
    expect(game.state("irelia").isReady).toBe(true);
  });

  test("'[1] … less' on a spell with a pip — Ride the Wind is castable with 1 energy + 1 chaos, ending on an empty pool", async () => {
    // Expected: castable via the energy discount, paying [1][chaos].
    const game = await withIrelia({ energy: 1, power: { chaos: 1 } }).hand(P1, RIDE_THE_WIND, "rtw").build();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "irelia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("it is [1] OR [rainbow], never both — with [2]+[chaos] available exactly one unit of resource is left after Ride the Wind on Irelia", async () => {
    // Expected: the caster picks one discount → remaining energy + chaos === 1 (either 1+0 or 0+1).
    const game = await withIrelia({ energy: 2, power: { chaos: 1 } }).hand(P1, RIDE_THE_WIND, "rtw").build();
    await game.p1.cast("rtw", { targets: "irelia" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.chooseMode(0); // whichever discount is listed first
    }
    expect(game.p1.energy() + game.p1.power("chaos")).toBe(1);
  });

  test("only ONE discount: Ride the Wind with just 1 energy and no power stays uncastable even choosing Irelia", async () => {
    const game = await withIrelia({ energy: 1 }).hand(P1, RIDE_THE_WIND, "rtw").build();
    expect(game.p1.can("cast", "rtw")).toBe(false);
    const r = await game.p1.try((p) => p.cast("rtw", { targets: "irelia" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rtw")).toBe("hand");
  });

  test("multi-target — Defiant Dance ([1][rainbow]) choosing Irelia in EITHER slot is discounted: castable holding only the [rainbow]", async () => {
    // Expected: with {0,{rainbow:1}} both target orders (Irelia +2 / Irelia -2) are castable via the [1] discount.
    const plus = await withIrelia({ energy: 0, power: { rainbow: 1 } }).hand(P1, DEFIANT_DANCE, "dd").build();
    expect(plus.p1.can("cast", "dd")).toBe(true);
    await plus.p1.cast("dd", { targets: ["irelia", "foe"] });
    expect(plus.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const minus = await withIrelia({ energy: 0, power: { rainbow: 1 } }).hand(P1, DEFIANT_DANCE, "dd").build();
    await minus.p1.cast("dd", { targets: ["foe", "irelia"] });
    expect(minus.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await minus.settle();
    expect(minus.state("irelia").might).toBe(2);
    expect(minus.state("foe").might).toBe(5);
  });

  test("baseline for the above: Defiant Dance not choosing Irelia (Sidekick +2 / Foe -2) costs the full [1][rainbow]", async () => {
    const game = await withIrelia({ energy: 1, power: { rainbow: 1 } }).hand(P1, DEFIANT_DANCE, "dd").build();
    await game.p1.cast("dd", { targets: ["side", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("side").might).toBe(4);
    expect(game.state("foe").might).toBe(1);
    expect(game.state("irelia").might).toBe(4);
  });

  test("registry payload: 4+[chaos] Chaos champion tagged Irelia with exactly one unconditional STATIC ability anchored on herself", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, isChampion: true, might: 4, tags: ["Irelia"] });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toHaveLength(1);
    const a = def?.abilities?.[0] as { type: string; condition?: unknown; effect: Record<string, unknown> };
    expect(a.type).toBe("static");
    expect(a.condition).toBeUndefined();
    expect(a.effect.target).toBe("self");
    expect(JSON.stringify(a.effect)).toMatch(/1/); // the [1] amount survives
  });

  test("registry payload — the static must encode a COST REDUCTION for the controller's SPELLS that choose her, with the '[1] OR [rainbow]' alternative", async () => {
    // Expected: an effect describing a cost discount (energy 1 | power/rainbow 1) scoped to spells choosing self.
    const def = (await loadDefaultCardPool()).get(CARD);
    const json = JSON.stringify(def?.abilities?.[0]);
    expect(json).toMatch(/cost/i);
    expect(json).toMatch(/spell/i);
    expect(json).toMatch(/rainbow|power/i);
  });
});
