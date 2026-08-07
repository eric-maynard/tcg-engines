/**
 * Breakneck Mech — sfd-071-221 · Unit · Mind · 8 energy + [mind][mind] · 7 might · MECH
 *
 *   Your Mechs have [Deflect] and [Ganking]. (Opponents must pay [rainbow] to choose us with a
 *   spell or ability. We can move from battlefield to battlefield.)
 *   I enter ready if you control another Mech.
 *
 * Head-judge notes (the tricky cases covered below):
 *  - Scope of the static (522): YOUR Mechs only — itself included ("us"), a friendly non-Mech and
 *    an ENEMY Mech get nothing; a Mech played after Breakneck is covered at once; the grant ends
 *    the moment Breakneck leaves the board.
 *  - Deflect (809): opponents pay 1 power of ANY domain per Mech chosen; the controller's own
 *    spells are untaxed; with no power the Mech is simply not a legal choice. Two Breaknecks are
 *    two sources → Deflect 2 on every Mech (809.2 sums granted Deflect).
 *  - Ganking (810): battlefield → battlefield as a Standard Move, including into an enemy-held
 *    battlefield (opens combat as attacker); a non-Mech beside it still cannot.
 *  - "I enter ready if you control ANOTHER Mech": itself never satisfies the condition, nor does
 *    an opponent's Mech; a friendly Mega-Mech does.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-071-221";
const MEGA_MECH = "ogn-088-298"; // vanilla 8-might Mech
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Cull",
  rulesText: "[Action] Kill a unit.",
  timing: "action",
};

const GRANTED = [
  { duration: "static", keyword: "Deflect", value: undefined },
  { duration: "static", keyword: "Ganking", value: undefined },
];

describe("Breakneck Mech (sfd-071-221)", () => {
  test("cost: 8 energy + 2 mind for a 7-might unit; unaffordable at 7 energy or with a single mind power", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).unit(P1, "base", MEGA_MECH, "mega").hand(P1, CARD, "bm").build();
    await game.p1.play("bm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("bm")).toBe("base");
    expect(game.state("bm").might).toBe(7);
    const lowEnergy = await scenario().resources(P1, { energy: 7, power: { mind: 2 } }).hand(P1, CARD, "bm").build();
    expect(lowEnergy.p1.can("play", "bm")).toBe(false);
    const lowPower = await scenario().resources(P1, { energy: 8, power: { mind: 1 } }).hand(P1, CARD, "bm").build();
    expect(lowPower.p1.can("play", "bm")).toBe(false);
  });

  test("enters READY when you already control another Mech (Mega-Mech)", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).unit(P1, "base", MEGA_MECH, "mega").hand(P1, CARD, "bm").build();
    await game.p1.play("bm");
    expect(game.state("bm").isExhausted).toBe(false);
  });

  test("enters EXHAUSTED when it is your only Mech — 'another Mech' never counts itself", async () => {
    // rule 143.4: no other friendly Mech → the `control` condition fails → default (exhausted).
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).unit(P1, "base", { might: 3, name: "NotAMech" }, "plain").hand(P1, CARD, "bm").build();
    await game.p1.play("bm");
    expect(game.zoneOf("bm")).toBe("base");
    expect(game.state("bm").isExhausted).toBe(true);
  });

  test("enters EXHAUSTED when the only other Mech is the OPPONENT's ('you control')", async () => {
    // rule 143.4: an enemy Mega-Mech is not a Mech you control → exhausted.
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).unit(P2, "base", MEGA_MECH, "theirs").hand(P1, CARD, "bm").build();
    await game.p1.play("bm");
    expect(game.state("bm").isExhausted).toBe(true);
  });

  test("static scope: itself and friendly Mechs get Deflect + Ganking; a friendly non-Mech and an enemy Mech get nothing", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "bm")
      .unit(P1, "base", MEGA_MECH, "mega")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .unit(P2, "base", MEGA_MECH, "theirs")
      .build();
    expect(game.state("bm").grantedKeywords).toEqual(GRANTED);
    expect(game.state("mega").grantedKeywords).toEqual(GRANTED);
    expect(game.state("plain").grantedKeywords).toEqual([]);
    expect(game.state("theirs").grantedKeywords).toEqual([]);
  });

  test("continuous (522): a Mech played AFTER Breakneck is covered immediately; killing Breakneck strips the grant", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 2 } })
      .unit(P1, "base", CARD, "bm")
      .hand(P1, MEGA_MECH, "mega")
      .hand(P1, KILL, "cull")
      .build();
    await game.p1.play("mega");
    expect(game.state("mega").grantedKeywords).toEqual(GRANTED);
    await game.p1.cast("cull", { targets: "bm" });
    await game.settle();
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.state("mega").grantedKeywords).toEqual([]);
    expect(game.state("mega").keywords).toEqual([]);
  });

  test("Ganking: a Mech moves battlefield → open battlefield; the non-Mech beside it is not offered that move", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "bm")
      .unit(P1, "bf1", MEGA_MECH, "mega")
      .unit(P1, "bf1", { might: 3, name: "Footman" }, "footman")
      .build();
    const movers = game.p1.option("standardMove:to:bf2")?.fields.find((f) => f.arg === "units")?.options;
    expect(movers).toEqual(expect.arrayContaining([["mega"]]));
    expect(JSON.stringify(movers)).not.toContain("footman");
    const illegal = await game.p1.try((p) => p.move("footman", "bf2"));
    expect(illegal.ok).toBe(false);
    await game.p1.move("mega", "bf2");
    await game.settle();
    expect(game.locationOf("mega")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // conquered the open battlefield
    expect(game.p1.points()).toBe(1);
  });

  test("Ganking into an ENEMY battlefield: Breakneck itself attacks from bf1, wins combat (7 vs 3) and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "bm")
      .unit(P2, "bf2", { might: 3, name: "Sentry" }, "sentry")
      .build();
    await game.p1.move("bm", "bf2");
    expect(game.state("bm").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("bm")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative: without Breakneck on the board a Mega-Mech at a battlefield has no battlefield → battlefield move", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", MEGA_MECH, "mega")
      .hand(P1, CARD, "bm") // in hand: statics are not active off the board
      .build();
    expect(game.p1.option("standardMove:to:bf2")).toBeUndefined();
    expect(game.p1.can("gank", "mega")).toBe(false);
    expect(game.state("mega").grantedKeywords).toEqual([]);
  });

  test("Deflect: an opponent's spell may not choose a friendly Mech without power; with 1 power of any domain it pays it", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "bm")
      .unit(P1, "base", MEGA_MECH, "mega")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const targets = broke.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["plain"]]); // neither Mech is choosable
    const r = await broke.p2.try((p) => p.cast("bolt", { targets: "mega" }));
    expect(r.ok).toBe(false);

    const funded = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", CARD, "bm")
      .unit(P1, "base", MEGA_MECH, "mega")
      .hand(P2, BOLT, "bolt")
      .build();
    await funded.p2.cast("bolt", { targets: "bm" });
    expect(funded.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await funded.settle();
    expect(funded.state("bm").damage).toBe(2);
  });

  test("Deflect taxes opponents only: Breakneck's controller bolts their own Mega-Mech for the bare cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "bm")
      .unit(P1, "base", MEGA_MECH, "mega")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "mega" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mega").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("two Breakneck Mechs are two Deflect sources — Deflect 2, so one power is not enough (809.2)", async () => {
    // Expected: Mega-Mech has Deflect from bm1 AND bm2 → summed value 2 → a 1-power opponent cannot choose it.
    // Actual: the second grant is deduplicated; the bolt is cast for a single power.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", CARD, "bm1")
      .unit(P1, "base", CARD, "bm2")
      .unit(P1, "base", MEGA_MECH, "mega")
      .hand(P2, BOLT, "bolt")
      .build();
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "mega" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
  });

  test("parsed abilities: a friendly-Mech grant of [Deflect, Ganking] and a conditional self enter-ready on controlling a Mech", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 8, might: 7, powerCost: ["mind", "mind"], tags: ["Mech"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({
      effect: {
        keywords: ["Deflect", "Ganking"],
        target: { controller: "friendly", filter: { tag: "Mech" }, type: "unit" },
        type: "grant-keywords",
      },
      type: "static",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { target: { filter: { tag: "Mech" } }, type: "control" },
      effect: { target: "self", type: "enter-ready" },
      type: "static",
    });
  });

  test("the parsed enter-ready condition drops 'ANOTHER' — it should exclude the entering Mech itself", async () => {
    // Expected: condition.target carries excludeSelf (as Bubble Bot's "another friendly Mech" does).
    // Actual: { filter: { tag: "Mech" } } only, so Breakneck would satisfy its own condition.
    const pool = await loadDefaultCardPool();
    const condition = (pool.get(CARD)?.abilities?.[1] as { condition?: { target?: Record<string, unknown> } }).condition;
    expect(condition?.target).toMatchObject({ excludeSelf: true, filter: { tag: "Mech" } });
  });
});
