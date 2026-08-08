/**
 * Allay, Eager Admirer — unl-041-219 · Champion Unit · Calm · 3 energy · 3 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   While I'm at a battlefield, your other units here have [Deflect].
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - 809.1.c/809.1.d: Deflect is a MANDATORY additional cost of 1 power (any domain, 809.1.c.1)
 *    on OPPONENTS' spells AND abilities that choose her; her controller pays nothing extra.
 *  - Her own Deflect is unconditional (works in base); the GRANT is doubly scoped: only while
 *    Allay is at a battlefield, only to YOUR units, only OTHER units, only units HERE (same bf).
 *    Enemy units sharing her battlefield, friendly units in base / at another bf get nothing.
 *  - The grant is a continuous static: it turns on when she arrives, follows units leaving
 *    (a buddy moving to base loses it) and turns off the moment she leaves the board.
 *  - 809.2: she does not grant herself a second Deflect ("other") — targeting her is +1, not +2.
 *  - Ability targeting (Iron Ballista's [Exhaust]) is taxed exactly like a spell; with no power
 *    the activation is simply not legal against a Deflect unit.
 * Partner/counter cards used: Vengeance ogn-229-298 (4 + [order][order], "Kill a unit."),
 * Iron Ballista ogn-017-298 (gear, "[Exhaust]: Deal 2 to a unit at a battlefield.").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-041-219";
const VENGEANCE = "ogn-229-298";
const BALLISTA = "ogn-017-298";

/** P2's turn; P2 holds Vengeance with its base cost plus `spare` off-domain power. Allay is at `allayAt`. */
function p2Turn(allayAt: "bf1" | "bf2" | "base", spare = 1) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4, power: { mind: spare, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, allayAt, CARD, "allay")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .hand(P2, VENGEANCE, "veng");
}

describe("Allay, Eager Admirer (unl-041-219)", () => {
  test("static grant: with Allay at bf1, your OTHER units at bf1 have Deflect; base units, other-bf units, enemies here and Allay's own granted list do not", async () => {
    const game = await p2Turn("bf1").unit(P1, "bf2", { might: 2 }, "far").build();
    expect(game.state("allay").keywords).toContain("Deflect");
    expect(game.state("allay").grantedKeywords).toEqual([]);
    expect(game.state("buddy").grantedKeywords).toEqual([{ duration: "static", keyword: "Deflect" }]);
    expect(game.state("home").keywords).not.toContain("Deflect");
    expect(game.state("far").keywords).not.toContain("Deflect");
    expect(game.state("foe").keywords).not.toContain("Deflect");
  });

  test("printed Deflect: an opponent's Vengeance choosing Allay costs 4 energy + [order][order] + 1 extra power of ANY domain", async () => {
    const game = await p2Turn("bf1").build();
    await game.p2.cast("veng", { targets: "allay" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("allay")).toBe("trash");
  });

  test("printed Deflect works in base too (only the grant is conditional on being at a battlefield)", async () => {
    const game = await p2Turn("base").build();
    await game.p2.cast("veng", { targets: "allay" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  });

  test("granted Deflect taxes the opponent: Vengeance on Buddy (here with Allay) costs +1; without spare power Buddy and Allay are not legal targets but Homebody is", async () => {
    const game = await p2Turn("bf1").build();
    await game.p2.cast("veng", { targets: "buddy" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("trash");

    const broke = await p2Turn("bf1", 0).build();
    expect((await broke.p2.try((p) => p.cast("veng", { targets: "buddy" }))).ok).toBe(false);
    expect((await broke.p2.try((p) => p.cast("veng", { targets: "allay" }))).ok).toBe(false);
    expect(broke.zoneOf("veng")).toBe("hand");
    await broke.p2.cast("veng", { targets: "home" });
    expect(broke.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  });

  test("'While I'm at a battlefield': Allay in base grants nothing — Vengeance on Buddy costs no extra power", async () => {
    const game = await p2Turn("base").build();
    expect(game.state("buddy").grantedKeywords).toEqual([]);
    await game.p2.cast("veng", { targets: "buddy" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 1, order: 0 } });
  });

  test("'While I'm at a battlefield': Allay in base grants nothing to a unit sharing her base either (rule 355.1 — a base is not a battlefield)", async () => {
    const game = await p2Turn("base").build();
    expect(game.state("home").grantedKeywords).toEqual([]);
    expect(game.state("home").keywords).not.toContain("Deflect");
    await game.p2.cast("veng", { targets: "home" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 1, order: 0 } });
  });

  test("'here': Allay at bf2 does not reach Buddy at bf1 — no tax", async () => {
    const game = await p2Turn("bf2").build();
    expect(game.state("buddy").grantedKeywords).toEqual([]);
    await game.p2.cast("veng", { targets: "buddy" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 1, order: 0 } });
  });

  test("Deflect only taxes OPPONENTS: Allay's controller kills its own Buddy with Vengeance for the bare cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "allay")
      .unit(P1, "bf1", { might: 2 }, "buddy")
      .hand(P1, VENGEANCE, "veng")
      .build();
    expect(game.state("buddy").keywords).toContain("Deflect");
    await game.p1.cast("veng", { targets: "buddy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("trash");
  });

  test("continuous: the grant appears when Allay moves in, drops off a unit that leaves, and ends when Allay dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "allay")
      .unit(P1, "bf1", { might: 2 }, "buddy")
      .unit(P1, "bf1", { might: 2 }, "pal")
      .hand(P1, VENGEANCE, "veng")
      .build();
    expect(game.state("buddy").grantedKeywords).toEqual([]);
    await game.p1.move("allay", "bf1");
    expect(game.state("buddy").keywords).toContain("Deflect");
    expect(game.state("pal").keywords).toContain("Deflect");
    await game.p1.move("pal", "base");
    expect(game.state("pal").keywords).not.toContain("Deflect");
    expect(game.state("buddy").keywords).toContain("Deflect");
    await game.p1.cast("veng", { targets: "allay" });
    await game.settle();
    expect(game.zoneOf("allay")).toBe("trash");
    expect(game.state("buddy").grantedKeywords).toEqual([]);
    expect(game.state("buddy").keywords).not.toContain("Deflect");
  });

  test("abilities are taxed too: P2's Iron Ballista [Exhaust] at Allay or Buddy needs 1 power; with none it is not even legal", async () => {
    const withPower = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "allay")
      .unit(P1, "bf1", { might: 2 }, "buddy")
      .gear(P2, BALLISTA, "ib")
      .build();
    await withPower.p2.activate("ib", 1, { targets: "buddy" });
    expect(withPower.p2.power()).toBe(0);
    await withPower.settle();
    expect(withPower.zoneOf("buddy")).toBe("trash"); // 2 damage ≥ 2 Might

    const noPower = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "allay")
      .unit(P1, "bf1", { might: 2 }, "buddy")
      .gear(P2, BALLISTA, "ib")
      .build();
    expect(noPower.p2.can("activate", "ib")).toBe(false);
    expect((await noPower.p2.try((p) => p.activate("ib", 1, { targets: "allay" }))).ok).toBe(false);
    expect(noPower.state("allay").damage).toBe(0);
    expect(noPower.state("ib").isReady).toBe(true);
  });

  test("cost: 3 energy, no power; enters base exhausted as a 3-Might unit; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "allay").build();
    await game.p1.play("allay");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("allay")).toBe("base");
    expect(game.state("allay")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("allay").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "allay").build()).p1.can("play", "allay")).toBe(false);
  });

  test("parsed abilities: [Deflect 1 keyword] + [static grant-keyword Deflect → friendly, other, here]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, isChampion: true, might: 3, tags: ["Allay"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { keyword: "Deflect", target: { controller: "friendly", excludeSelf: true, location: "here-battlefield", type: "unit" }, type: "grant-keyword" },
      type: "static",
    });
  });
});
