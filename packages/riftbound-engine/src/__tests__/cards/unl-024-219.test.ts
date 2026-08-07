/**
 * Rengar, Unseen — unl-024-219 · Champion Unit (Rengar) · Fury · 4 energy + [fury] · 4 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [Ganking] (I can move from battlefield to battlefield.)
 *
 * Rules: 805 (Accelerate: optional additional cost [1][C], C must match my domain; I enter READY via
 * a replacement — I never "become ready"), 807 (Assault X: +X Might only while I hold the Attacker
 * designation), 809 (Deflect: opponents' spells/abilities that choose me cost 1 more Power of ANY
 * domain; my controller's own are free), 810/144.4.c (Ganking: my Standard Move may go battlefield →
 * battlefield; it is still a Standard Move, so it exhausts me and needs me ready).
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Full price with Accelerate is 5 energy + TWO fury (base pip + accelerate pip). 4+[fury] with
 *     one spare energy but no second fury → only the slow line is legal. A [mind] power can pay
 *     neither pip; a [rainbow]/any-domain power can pay both.
 *  2. The whole point of the kit: Accelerate → enter ready at a battlefield I control → Ganking to the
 *     enemy battlefield the SAME turn → fight at 6 (Assault 2). Tested end to end incl. the conquer
 *     (the accelerate-to-battlefield leg is an engine gap today; the gank→combat leg passes).
 *  3. Assault is attacker-only: defending on the opponent's turn he is a plain 4 (a 5 kills him);
 *     attacking, a 5-Might defender dies and he survives (takes 5 < 6). One-short: a 6-Might
 *     defender trades with him.
 *  4. Deflect taxes only OPPONENTS and is paid in any domain; with no power at all the opponent
 *     simply cannot choose him (their spell may still hit something else).
 *  5. Ganking adds an option, it does not remove the exhaust cost: an exhausted Rengar cannot gank;
 *     a vanilla unit beside him cannot gank at all; battlefield → base stays legal for both.
 *  6. Played from the Champion Zone it is still "playing me" — the [fury] pip is still owed and
 *     Accelerate must be offered there too (both are engine gaps today, recorded as BUG tests).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-024-219";
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 4 to a unit.",
  timing: "action",
} as const;

describe("Rengar, Unseen (unl-024-219)", () => {
  test("registry payload: 4+[fury] fury champion, 4 Might, abilities = [Accelerate{1,[fury]}, Assault 2, Deflect 1, Ganking]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, might: 4, name: "Rengar, Unseen", tags: ["Rengar"] });
    expect(def?.powerCost).toEqual(["fury"]);
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" },
      { keyword: "Assault", type: "keyword", value: 2 },
      { keyword: "Deflect", type: "keyword", value: 1 },
      { keyword: "Ganking", type: "keyword" },
    ]);
  });

  test("cost without Accelerate: 4 energy + 1 fury, enters base EXHAUSTED as a 4; no fury / 3 energy / a [mind] pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "rengar").build();
    expect(game.p1.option("play", "rengar")?.fields.some((f) => f.arg === "payOptional")).toBe(false); // can't afford the extra
    await game.p1.play("rengar");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("rengar").keywords).toEqual(expect.arrayContaining(["Accelerate", "Assault", "Deflect", "Ganking"]));
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("[Accelerate]: 5 energy + 2 fury total → enters READY; declining with the same pool leaves exactly 1 energy + 1 fury", async () => {
    const fast = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).hand(P1, CARD, "rengar").build();
    await fast.p1.play("rengar", { accelerate: true });
    expect(fast.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await fast.settle();
    expect(fast.state("rengar").isReady).toBe(true);

    const slow = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).hand(P1, CARD, "rengar").build();
    await slow.p1.play("rengar", { accelerate: false });
    await slow.settle();
    expect(slow.state("rengar").isExhausted).toBe(true);
    expect(slow.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("[Accelerate] pip must be [fury] (805.1.a.1): with 5 energy + 1 fury + 1 mind only the slow line is legal; a rainbow (any-domain) power does pay it", async () => {
    const mind = await scenario().resources(P1, { energy: 5, power: { fury: 1, mind: 1 } }).hand(P1, CARD, "rengar").build();
    expect(mind.p1.can("play", "rengar")).toBe(true);
    const r = await mind.p1.try((p) => p.play("rengar", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(mind.zoneOf("rengar")).toBe("hand");
    expect(mind.p1.power("mind")).toBe(1);

    const rainbow = await scenario().resources(P1, { energy: 5, power: { rainbow: 2 } }).hand(P1, CARD, "rengar").build();
    await rainbow.p1.play("rengar", { accelerate: true });
    expect(rainbow.p1.resources().energy).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
    await rainbow.settle();
    expect(rainbow.state("rengar").isReady).toBe(true);
  });

  test("Accelerate must also be offered when playing to a battlefield I control (805.2 — it is a cost of playing, wherever I am played); kit end-to-end: ready at MY field → gank → fight at 6 → conquer", async () => {
    // Expected: play(rengar, {accelerate, to: mine}) is a legal variant (5 energy + 2 fury), Rengar lands ready
    // at "mine", ganks into "theirs" and wins 6 vs 5. Actual: the accelerated variant is enumerated for
    // location "base" only — `no legal variant matches payOptional=true, to="mine"`.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 5, name: "Warden" }, "warden")
      .hand(P1, CARD, "rengar")
      .build();
    expect(game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to")?.options).toEqual(["base", "battlefield-mine"]);
    await game.p1.play("rengar", { accelerate: true, to: "mine" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.locationOf("rengar")).toBe("mine");
    expect(game.state("rengar").isReady).toBe(true);
    await game.p1.gank("rengar", "theirs");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.gameState.battlefields.theirs?.controller).toBe(P1);
  });

  test("the kit end-to-end: a ready Rengar at MY battlefield ganks into the enemy battlefield → attacks at 6 (Assault 2), kills a 5, survives on 5 damage, conquers", async () => {
    const game = await scenario()
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "mine", CARD, "rengar")
      .build();
    expect(game.state("rengar").might).toBe(4); // no designation yet
    expect(game.p1.can("gank", "rengar")).toBe(true);
    await game.p1.gank("rengar", "theirs");
    expect(game.locationOf("rengar")).toBe("theirs");
    expect(game.state("rengar").isExhausted).toBe(true); // still a Standard Move (144.2)
    expect(game.state("rengar").might).toBe(6); // attacker designation held during the showdown
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash"); // 6 ≥ 5
    expect(game.zoneOf("rengar")).toBe("battlefield-theirs"); // 5 < 6
    expect(game.state("rengar")).toMatchObject({ damage: 0, might: 4 }); // healed, Assault off again
    expect(game.gameState.battlefields.theirs?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("[Assault 2] one short: attacking a 6-Might defender is a trade (6 ≥ 6 both ways); nobody conquers and the emptied battlefield goes Uncontrolled (466.5.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "rengar")
      .unit(P2, "bf1", { might: 6, name: "Colossus" }, "colossus")
      .build();
    await game.p1.move("rengar", "bf1");
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("[Assault] is attacker-only: DEFENDING on P2's turn Rengar is a plain 4 — a 5-Might attacker kills him and survives on 4 damage", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rengar")
      .unit(P2, "base", { might: 5, name: "Hunter" }, "hunter")
      .build();
    await game.p2.move("hunter", "bf1");
    expect(game.state("rengar").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Deflect]: on P2's turn a Bolt with no power cannot choose Rengar (a plain ally is fine); with 1 [calm] it can, pays it, and 4 damage kills him", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "rengar")
      .unit(P1, "base", { might: 4, name: "Plain" }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const targets = broke.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["plain"]]);
    expect((await broke.p2.try((p) => p.cast("bolt", { targets: "rengar" }))).ok).toBe(false);
    expect(broke.zoneOf("bolt")).toBe("hand");

    const rich = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", CARD, "rengar")
      .hand(P2, BOLT, "bolt")
      .build();
    await rich.p2.cast("bolt", { targets: "rengar" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await rich.settle();
    expect(rich.zoneOf("rengar")).toBe("trash");
  });

  test("[Deflect] never taxes the controller: P1's own Bolt chooses Rengar for exactly 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "rengar").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "rengar" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
  });

  test("[Ganking] is an extra OPTION on the Standard Move: a vanilla neighbour cannot gank; an exhausted Rengar cannot gank; battlefield → base stays legal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "rengar")
      .unit(P1, "bf1", { might: 3, name: "Plain" }, "plain")
      .unit(P1, "bf1", CARD, "tired", { exhausted: true })
      .build();
    expect(game.p1.can("gank", "rengar")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    expect(game.p1.can("gank", "tired")).toBe(false);
    // Plain may still walk home; so may Rengar.
    const homeTargets = game.p1.option("standardMove:to:base")?.fields.find((f) => f.arg === "units")?.options ?? [];
    expect(JSON.stringify(homeTargets)).toContain("plain");
    expect(JSON.stringify(homeTargets)).toContain("rengar");
    await game.p1.gank("rengar", "bf2");
    await game.settle();
    expect(game.locationOf("rengar")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // empty battlefield → conquered
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("plain")).toBe("bf1");
  });

  test("from the Champion Zone without Accelerate: 4 + [fury] paid, lands in base exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).champion(P1, CARD, "rengar").build();
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("rengar").isExhausted).toBe(true);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).champion(P1, CARD, "r").build()).p1.can("playChampion")).toBe(false);
  });

  test("the [fury] pip is part of my cost from the Champion Zone too — with 4 energy and NO power playChampion must be illegal", async () => {
    // Expected: not offered / rejected, Rengar stays in the champion zone. Actual: it is offered, resolves, and
    // Rengar lands in base having paid only the 4 energy (pool afterwards: {energy 0, fury 0, rainbow 0}).
    const game = await scenario().resources(P1, { energy: 4 }).champion(P1, CARD, "rengar").build();
    expect(game.p1.can("playChampion")).toBe(false);
    const r = await game.p1.try((p) => p.playChampion("base"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("championZone");
  });

  test("playing me from the Champion Zone is still 'playing me' (805.2) — the Accelerate option must be offered there and make me enter ready", async () => {
    // Expected: playFromChampionZone exposes a paid-additional-cost variant; choosing it charges 5 + 2 fury and
    // Rengar enters ready. Actual: the champion-zone play offers only { location: "base" } — no Accelerate line.
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).champion(P1, CARD, "rengar").build();
    expect(game.p1.option("playChampion")?.fields.some((f) => f.arg === "payOptional")).toBe(true);
    await game.p1.choose(game.p1.option("playChampion")!.key, { payOptional: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("rengar").isReady).toBe(true);
  });
});
