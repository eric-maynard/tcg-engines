/**
 * Daisy! — unl-196-219 · Unit · Calm/Order · 9 energy + [rainbow][rainbow] · 8 Might
 *
 *   I enter ready.
 *   Reduce my cost by [1] for each of the following tags among your units — Bird, Cat, Dog, and Poro.
 *   When I attack while your units have all 4 tags, [Stun] an enemy unit here. (It doesn't deal combat
 *   damage this turn.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Cost: 9 + two [rainbow] pips; on a Calm/Order card a [rainbow] pip is "a power of one of my
 *      domains" (135.2.e.6.c) — calm and/or order pay it, fury does not.
 *   2. "I enter ready" is a self static replacing the exhausted entry (143.4) wherever she is played —
 *      and it matters: she can Standard Move the turn she lands.
 *   3. The discount counts DISTINCT TAGS present among YOUR units on the board (0–4), not units: two
 *      Poros = 1, Bird + Poro = 2, all four = 4 (→ 5 energy); the opponent's Cat counts for nothing.
 *      Friendship (unl-046-219) uses the very same count and serves as the oracle partner card.
 *   4. The attack trigger has an extra condition checked as she gains the attacker designation
 *      (383.4.e.2.b): all four tags → Stun an enemy unit HERE (423: it deals no combat damage, so an
 *      8-Might blocker dies to her 8 without touching her); three tags → plain combat, 8 into 8 trades.
 *   5. Parser status: only "I enter ready" made it into the ability list — the discount and the attack
 *      trigger are silently missing, which the payload test pins down.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-196-219";
const BIRD = "unl-t02"; // 1-Might Bird unit token (tag Bird)
const LOYAL_PORO = "unl-156-219"; // Order 3/3, tag Poro
const FRIENDSHIP = "unl-046-219"; // Calm 1-energy Reaction: +1 Might this turn per Bird/Cat/Dog/Poro tag among your units
const CAT = { energyCost: 2, might: 2, name: "Test Cat", tags: ["Cat"] } as const;
const DOG = { energyCost: 2, might: 2, name: "Test Dog", tags: ["Dog"] } as const;

/** P1's base holds one unit per tag: Bird token, Test Cat, Test Dog, Loyal Poro. */
function menagerie(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 2 } })
    .unit(P1, "base", BIRD, "token-bird")
    .unit(P1, "base", CAT, "cat")
    .unit(P1, "base", DOG, "dog")
    .unit(P1, "base", LOYAL_PORO, "poro")
    .hand(P1, CARD, "daisy");
}

describe("Daisy! (unl-196-219)", () => {
  test("registry payload should carry three abilities (enter-ready static, tag-count cost reduction, conditional attack→stun trigger); only enter-ready was parsed", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: ["calm", "order"], energyCost: 9, might: 8, name: "Daisy!", powerCost: ["rainbow", "rainbow"] });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: { type?: string }; trigger?: { event?: string }; condition?: unknown }[];
    expect(abilities[0]).toEqual({ effect: { target: "self", type: "enter-ready" }, type: "static" });
    expect(abilities).toHaveLength(3);
    expect(abilities.some((a) => a.type === "static" && /cost/.test(String(a.effect?.type)))).toBe(true);
    expect(abilities.some((a) => a.type === "triggered" && a.trigger?.event === "attack" && a.effect?.type === "stun" && a.condition !== undefined)).toBe(true);
  });

  test("cost with no tagged units: 9 energy + 2 rainbow → an 8-Might unit that enters the base READY; 8 energy or fury power is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { rainbow: 2 } }).hand(P1, CARD, "daisy").build();
    await game.p1.play("daisy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("daisy")).toBe("base");
    expect(game.state("daisy")).toMatchObject({ isReady: true, might: 8 });
    const short = await scenario().resources(P1, { energy: 8, power: { rainbow: 2 } }).hand(P1, CARD, "daisy").build();
    expect(short.p1.can("play", "daisy")).toBe(false);
    const offDomain = await scenario().resources(P1, { energy: 9, power: { fury: 2 } }).hand(P1, CARD, "daisy").build();
    expect(offDomain.p1.can("play", "daisy")).toBe(false);
  });

  test("the two [rainbow] pips are payable with her own domains: one calm + one order (or two calm) works (135.2.e.6.c)", async () => {
    const mixed = await scenario().resources(P1, { energy: 9, power: { calm: 1, order: 1 } }).hand(P1, CARD, "daisy").build();
    await mixed.p1.play("daisy");
    expect(mixed.p1.energy()).toBe(0);
    expect(mixed.p1.power()).toBe(0);
    const calm = await scenario().resources(P1, { energy: 9, power: { calm: 2 } }).hand(P1, CARD, "daisy").build();
    expect(calm.p1.can("play", "daisy")).toBe(true);
    const oneShort = await scenario().resources(P1, { energy: 9, power: { order: 1 } }).hand(P1, CARD, "daisy").build();
    expect(oneShort.p1.can("play", "daisy")).toBe(false);
  });

  test("'I enter ready' also holds when played to a battlefield you control, and it lets her Standard Move the same turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, CARD, "daisy")
      .build();
    await game.p1.play("daisy", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("daisy")).toBe("bf1");
    expect(game.state("daisy").isReady).toBe(true);
    await game.p1.move("daisy", "base"); // ready → she can move right away
    expect(game.locationOf("daisy")).toBe("base");
    expect(game.state("daisy").isExhausted).toBe(true);
  });

  test("partner oracle — Friendship on a Bird + two-Poro board gives +2 (two distinct tags), proving the tag count the discount should use", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", BIRD, "token-bird")
      .unit(P1, "base", LOYAL_PORO, "poroA")
      .unit(P1, "base", LOYAL_PORO, "poroB")
      .unit(P2, "base", CAT, "theircat") // theirs: not "your units"
      .hand(P1, FRIENDSHIP, "friendship")
      .build();
    await game.p1.cast("friendship", { targets: "poroA" });
    await game.settle();
    expect(game.state("poroA").might).toBe(3 + 2);
  });

  test("one Poro among your units should make her cost 8 (+2 rainbow); the tag discount is not applied", async () => {
    // Expected: 8 energy + 2 rainbow is enough with Loyal Poro on the board and the pool empties. Actual: needs 9.
    const game = await scenario().resources(P1, { energy: 8, power: { rainbow: 2 } }).unit(P1, "base", LOYAL_PORO, "poro").hand(P1, CARD, "daisy").build();
    expect(game.p1.can("play", "daisy")).toBe(true);
    await game.p1.play("daisy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("the discount counts distinct TAGS among YOUR units — two Poros = 1, Bird + Poro = 2, all four = 4 (5 energy), the opponent's Cat adds nothing", async () => {
    const twoPoros = await scenario()
      .resources(P1, { energy: 7, power: { rainbow: 2 } })
      .unit(P1, "base", LOYAL_PORO, "poroA")
      .unit(P1, "base", LOYAL_PORO, "poroB")
      .unit(P2, "base", CAT, "theircat")
      .hand(P1, CARD, "daisy")
      .build();
    expect(twoPoros.p1.can("play", "daisy")).toBe(false); // 9 − 1 = 8 > 7 (a second Poro and THEIR Cat don't help)
    await twoPoros.p1.do("addResources", { energy: 1 });
    expect(twoPoros.p1.can("play", "daisy")).toBe(true); // exactly 8
    const birdPoro = await scenario()
      .resources(P1, { energy: 7, power: { rainbow: 2 } })
      .unit(P1, "base", BIRD, "token-bird")
      .unit(P1, "base", LOYAL_PORO, "poro")
      .hand(P1, CARD, "daisy")
      .build();
    expect(birdPoro.p1.can("play", "daisy")).toBe(true); // 9 − 2 = 7
    const all4at4 = await menagerie(4).build();
    expect(all4at4.p1.can("play", "daisy")).toBe(false); // 9 − 4 = 5 > 4
    const all4 = await menagerie(5).build();
    expect(all4.p1.can("play", "daisy")).toBe(true);
    await all4.p1.play("daisy");
    expect(all4.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("attacking while your units have all 4 tags should Stun an enemy unit here — it then deals no combat damage, so her 8 kills an 8-Might blocker and she conquers unhurt", async () => {
    // Expected: an attack trigger on the chain; on resolution Blocker is stunned (423.1.b), combat is 8 → Blocker
    // dies, 0 → Daisy lives, bf1 conquered. Actual: no trigger exists; 8 into 8 trades and nobody conquers.
    const game = await menagerie(0)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Blocker" }, "blocker")
      .build();
    await game.p1.do("addResources", { energy: 9 });
    await game.p1.play("daisy");
    await game.settle();
    await game.p1.move("daisy", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "daisy", controller: P1, triggered: true })]);
    // Resolve just the trigger by hand: settle() would run the whole showdown,
    // past the point where a stun is still observable on a unit that then dies.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("blocker");
        continue;
      }
      await game.acting().pass();
    }
    expect(game.state("blocker").isStunned).toBe(true);
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.zoneOf("daisy")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: attacking with only THREE of the tags (no Dog) stuns nothing — 8 into an 8-Might blocker is a straight trade and bf1 is not conquered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", BIRD, "token-bird")
      .unit(P1, "base", CAT, "cat")
      .unit(P1, "base", LOYAL_PORO, "poro")
      .unit(P2, "bf1", { might: 8, name: "Blocker" }, "blocker")
      .unit(P2, "base", DOG, "theirdog") // THEIR Dog does not complete my set
      .hand(P1, CARD, "daisy")
      .build();
    await game.p1.play("daisy");
    await game.settle();
    await game.p1.move("daisy", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("theirdog").isStunned).toBe(false);
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.zoneOf("daisy")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("she has no defend trigger either way: an enemy attacking into Daisy with all four tags on my board just fights (5 into 8 dies, she is undamaged after cleanup)", async () => {
    const game = await menagerie(0)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "daisyOnBoard")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("raider").isStunned).toBe(false);
    expect(game.zoneOf("daisyOnBoard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
