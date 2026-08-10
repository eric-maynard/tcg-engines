/**
 * Interaction: On the Hunt (sfd-204-221) · Spell · Body/Chaos · 1 energy + 2 power pips · "Ready your units."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] "Deal 3 to a unit at a battlefield."
 *   × Gold token (sfd-t03) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Question: P1's Main Phase, Neutral Open. P1 recycled a Calm and a Mind rune and tapped two others →
 * pool (2, {calm:1, mind:1}); a ready Gold; an enemy unit at a battlefield. (a) Is On the Hunt playable
 * from calm+mind? (b) Is Hextech Ray? two wrong pips for one [fury]? (c) Crack Gold → pool? Ray legal —
 * which pip pays? (d) From (2,{fury:2}) can P1 over-pay Ray? (e) What happens to the stranded power at
 * end of turn, and did the recycled runes go under the RUNE deck?
 *
 * Rules: 135.2.e.5.a/.b ([A] as a cost = any domain; [A] in the pool pays any domain), 135.2.e.6.c
 * (a [C] pip on a MULTI-domain card = power of either of ITS domains — the CR's own Defiant Dance
 * example), 163.2/.a/.b (power has a domain; only Universal power is wild), 444.1 / 444.3.a (Pay
 * removes exactly what is directed — no over-payment), 166.2, 429.2 (Add abilities resolve at once,
 * no chain item), 164.2.b.1 / 416.1.b (recycled runes → bottom of the Rune Deck), 167.1 / 317.2.d
 * (unspent Energy/Power lost in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ON_THE_HUNT = "sfd-204-221";
const HEXTECH_RAY = "ogn-009-298";
const GOLD = "sfd-t03";

/**
 * P1's turn, empty pool, four ready runes on board (calm, mind, body, body), a ready Gold, an exhausted
 * unit (so "Ready your units" is observable), both spells in hand; P2's 4-Might Foe holds bf1.
 * `runes` = the domains of runeA / runeB, the two runes P1 will recycle for power (default calm + mind, as in the question).
 */
function board(runes: { a: string; b: string } = { a: "calm", b: "mind" }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .rune(P1, runes.a, { alias: "runeA" })
    .rune(P1, runes.b, { alias: "runeB" })
    .rune(P1, "body", { alias: "tap1" })
    .rune(P1, "body", { alias: "tap2" })
    .gear(P1, GOLD, "gold")
    .hand(P1, ON_THE_HUNT, "hunt")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Tap the two body runes for 2 energy and recycle runeA + runeB for one power each → (2, {a:1, b:1}). */
async function buildPool(game: Game): Promise<void> {
  await game.p1.tapRune("tap1");
  await game.p1.tapRune("tap2");
  await game.p1.recycleRune("runeA");
  await game.p1.recycleRune("runeB");
}

describe("(a) On the Hunt from (2, {calm:1, mind:1})", () => {
  test("setup: taps give 2 energy, each recycle adds one power OF THAT RUNE'S DOMAIN (164.2.b.1) → exactly (2, {calm:1, mind:1}); rune deck +2, board runes −2", async () => {
    const game = await board().build();
    expect(game.p1.runeDeck()).toHaveLength(12);
    expect(game.p1.runes()).toHaveLength(4);
    await buildPool(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 1 } });
    expect(game.p1.runes()).toEqual(["tap1", "tap2"]);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.runeDeck()).toHaveLength(14);
    expect(game.chain()).toEqual([]); // rune abilities are Adds — nothing lingers
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("On the Hunt is NOT playable from calm+mind: its two pips are [C][C] on a Body/Chaos card = body-or-chaos hybrids (135.2.e.6.c), not true [rainbow]; deck-building domains aside, calm/mind simply do not match", async () => {
    // RULING-CONFLICT: the pairing's expected answer reads the pips as [A][A] ("power of any domain",
    // 135.2.e.5.a) and says calm+mind pays. CR 135.2.e.6.c ("A [C] shorthand on a card with multiple
    // Domains is processed as any power of that card's Domains" — Defiant Dance example) and the green
    // sfd-204-221 card test say otherwise — engine follows the CR: only body/chaos (or pooled [A]) pays.
    const game = await board().build();
    await buildPool(game);
    expect(game.p1.can("cast", "hunt")).toBe(false);
    await expect(game.p1.cast("hunt")).rejects.toThrow();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 1 } }); // nothing spent
    expect(game.zoneOf("hunt")).toBe("hand");
  });

  test("contrast: had P1 recycled a BODY and a CHAOS rune instead, (2,{body:1,chaos:1}) pays 1E + both pips → (1,{}) and On the Hunt readies P1's units", async () => {
    const game = await board({ a: "body", b: "chaos" }).build();
    await buildPool(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1, chaos: 1 } });
    expect(game.p1.can("cast", "hunt")).toBe(true);
    await game.p1.cast("hunt");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("foe").isExhausted).toBe(false); // enemy untouched either way
    expect(game.zoneOf("hunt")).toBe("trash");
  });
});

describe("(b) Hextech Ray from (2, {calm:1, mind:1})", () => {
  test("NOT playable: a [fury] pip takes Fury or Universal power only (163.2, 135.2.e.5.b) — two wrong-domain power do not convert into one fury; nothing is spent", async () => {
    const game = await board().build();
    await buildPool(game);
    expect(game.p1.can("cast", "ray")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ray")).toBe(false);
    await expect(game.p1.cast("ray", { targets: "foe" })).rejects.toThrow();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 1 } });
    expect(game.state("foe").damage).toBe(0);
  });
});

describe("(c) crack Gold, then Ray", () => {
  test("Gold: kill + exhaust as the cost, +1 UNIVERSAL power immediately, no chain item, no priority passes (429.2) → (2, {calm:1, mind:1, rainbow:1}); the token ceases to exist", async () => {
    const game = await board().build();
    await buildPool(game);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 1, rainbow: 1 } });
  });

  test("Ray is now legal and paying it removes 1 energy + THE RAINBOW pip — the calm and mind pips cannot stand in and stay stranded → (1, {calm:1, mind:1}); Ray deals 3 to Foe", async () => {
    const game = await board().build();
    await buildPool(game);
    await game.p1.activate("gold");
    expect(game.p1.can("cast", "ray")).toBe(true);
    expect(game.p1.option("cast", "ray")?.variantCount).toBe(1); // one way to pay — no "which pip" choice
    await game.p1.cast("ray", { targets: "foe" });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.power("calm")).toBe(1);
    expect(game.p1.power("mind")).toBe(1);
    expect(game.p1.power()).toBe(2);
    await game.settle();
    expect(game.state("foe")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
    // Still no way to turn calm+mind into On the Hunt's body/chaos pips.
    expect(game.p1.can("cast", "hunt")).toBe(false);
  });

  test("even WITH the Gold's rainbow un-spent, On the Hunt stays unplayable from {calm, mind, rainbow}: the [A] covers one hybrid pip (135.2.e.5.b) but nothing covers the second", async () => {
    const game = await board().build();
    await buildPool(game);
    await game.p1.activate("gold");
    expect(game.p1.can("cast", "hunt")).toBe(false);
  });
});

describe("(d) no over-payment", () => {
  test("from (2, {fury:2}) Hextech Ray costs exactly 1E + 1 fury → (1, {fury:1}); there is no variant that spends the second fury (444.1 / 444.3.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    const opt = game.p1.option("cast", "ray");
    expect(opt?.variantCount).toBe(1);
    expect(opt?.fields.map((f) => f.name)).toEqual(["targets"]); // the only thing to choose is the target
    await game.p1.cast("ray", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // the spare fury floats until end of turn
  });
});

describe("(e) end of turn", () => {
  test("after (c) the stranded (1, {calm:1, mind:1}) is emptied in the Expiration Step (317.2.d / 167.1) — the trace records exactly that loss — and P1 starts P2's turn with an empty pool", async () => {
    const game = await board().build();
    await buildPool(game);
    await game.p1.activate("gold");
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(1);
    expect(passes[0]?.poolsEmptied[P1]).toEqual({ energy: 1, power: { calm: 1, mind: 1 } });
  });

  test("the two recycled runes sit at the BOTTOM of P1's RUNE deck in the order recycled (416.1.b) — not in the trash, not in the main deck; rune deck 12 → 14, board runes 4 → 2", async () => {
    const game = await board().build();
    const mainBefore = game.p1.deck().length;
    await buildPool(game);
    expect(game.zoneOf("runeA")).toBe("runeDeck");
    expect(game.zoneOf("runeB")).toBe("runeDeck");
    expect(game.p1.runeDeck().slice(-2)).toEqual(["runeA", "runeB"]);
    expect(game.p1.runeDeck()).toHaveLength(14);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(mainBefore);
    // Still there after the turn passes (P2 channels from P2's own rune deck).
    await game.advanceTurn();
    expect(game.p1.runeDeck().slice(-2)).toEqual(["runeA", "runeB"]);
    expect(game.violations()).toEqual([]);
  });
});
