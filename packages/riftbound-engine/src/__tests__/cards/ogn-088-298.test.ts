/**
 * Mega-Mech — ogn-088-298 · Unit · Mind · 7 energy · 8 Might · MECH
 *
 *   (no rules text — a vanilla body; the printed MECH tag is its only hook)
 *
 * Head-judge checklist (what can go wrong with a "textless" card):
 *  1. Cost/body: exactly 7 energy, no power pip; 6 energy (even with a pile of power) is not
 *     enough; ready runes can be tapped to reach 7. Enters EXHAUSTED (140.2 — no Accelerate).
 *  2. It has NO abilities: playing it puts nothing on the chain after it resolves, no prompt is
 *     left behind, and the registry payload carries no parsed abilities but DOES carry the MECH tag
 *     (105.2 — tags are characteristics other effects filter on).
 *  3. The MECH tag is what partner cards key on: Rumble, Scrapper ("Your Mechs have +1 Might")
 *     makes it 9; Breakneck Mech ("Your Mechs have [Deflect] and [Ganking]") grants it both;
 *     Bubble Bot ("ready another friendly Mech") can ready it the turn it lands; Production Surge
 *     costs 2 less while you control it. An ENEMY Rumble must not pump it (friendly-only statics).
 *  4. Standard unit rules still apply: it may be played to a battlefield you control (never to an
 *     enemy one), it holds/conquers like any unit, and 8 Might is real in combat — it kills a
 *     7-Might defender and survives, and trades with an 8.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-088-298";
const RUMBLE_SCRAPPER = "sfd-089-221"; // Your Mechs have +1 Might (including me).
const BREAKNECK = "sfd-071-221"; // Your Mechs have [Deflect] and [Ganking]. I enter ready if you control another Mech.
const BUBBLE_BOT = "sfd-062-221"; // When you play me, ready another friendly Mech.
const PRODUCTION_SURGE = "sfd-076-221"; // This costs [2] less if you control a Mech. 4 + [mind]

describe("Mega-Mech (ogn-088-298)", () => {
  test("registry payload: 7-cost 8-Might Mind unit tagged Mech with no power cost and no parsed abilities", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 7, might: 8, name: "Mega-Mech", tags: ["Mech"] });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.rulesText).toBeUndefined();
    expect(def?.abilities ?? []).toEqual([]);
  });

  test("cost: 7 energy deducted, no power touched; lands in base exhausted at 8 Might with no keywords and nothing on the chain", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).hand(P1, CARD, "mech").build();
    await game.p1.play("mech");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 2 } });
    await game.settle();
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.state("mech")).toMatchObject({ baseMight: 8, damage: 0, isExhausted: true, might: 8 });
    expect(game.state("mech").keywords).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable: 6 energy is not enough even with plenty of power; 7 exactly is", async () => {
    const poor = await scenario().resources(P1, { energy: 6, power: { mind: 5, rainbow: 3 } }).hand(P1, CARD, "mech").build();
    expect(poor.p1.can("play", "mech")).toBe(false);
    const exact = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "mech").build();
    expect(exact.p1.can("play", "mech")).toBe(true);
  });

  test("runes pay for it: 5 energy in the pool + 2 ready runes tapped reaches 7", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).runes(P1, "mind", 2).hand(P1, CARD, "mech").build();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(7);
    await game.p1.play("mech");
    await game.settle();
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("may be played straight to a battlefield you control, never to an enemy-controlled one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P1, "mine", { might: 1 }, "holder")
      .hand(P1, CARD, "mech")
      .build();
    const to = game.p1.option("play", "mech")?.fields.find((f) => f.arg === "to")?.options;
    expect(to).toEqual(expect.arrayContaining(["base", "battlefield-mine"]));
    expect(to).not.toContain("battlefield-theirs");
    expect((await game.p1.try((p) => p.play("mech", { to: "theirs" }))).ok).toBe(false);
    await game.p1.play("mech", { to: "mine" });
    await game.settle();
    expect(game.zoneOf("mech")).toBe("battlefield-mine");
  });

  test("MECH tag × Rumble, Scrapper: a friendly Rumble makes it 9 Might; an enemy Rumble does nothing for it", async () => {
    const friendly = await scenario().unit(P1, "base", RUMBLE_SCRAPPER, "rumble").unit(P1, "base", CARD, "mech").build();
    expect(friendly.state("mech")).toMatchObject({ baseMight: 8, might: 9 });
    const enemy = await scenario().unit(P2, "base", RUMBLE_SCRAPPER, "rumble").unit(P1, "base", CARD, "mech").build();
    expect(enemy.state("mech").might).toBe(8);
  });

  test("MECH tag × Breakneck Mech: it gains Deflect and Ganking, and Ganking really lets it hop battlefield → battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", BREAKNECK, "breakneck")
      .unit(P1, "bf1", CARD, "mech")
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.state("mech").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    expect(game.state("plain").keywords).toEqual([]); // not a Mech
    await game.p1.gank("mech", "bf2");
    await game.settle();
    expect(game.zoneOf("mech")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.can("gank", "plain")).toBe(false);
  });

  test("MECH tag × Bubble Bot: 'ready another friendly Mech' readies the freshly played (exhausted) Mega-Mech", async () => {
    const game = await scenario().resources(P1, { energy: 10 }).hand(P1, CARD, "mech").hand(P1, BUBBLE_BOT, "bot").build();
    await game.p1.play("mech");
    await game.settle();
    expect(game.state("mech").isExhausted).toBe(true);
    await game.p1.play("bot", { answers: ["mech"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mech");
      await game.settle();
    }
    expect(game.state("mech").isReady).toBe(true);
    expect(game.state("bot").isExhausted).toBe(true); // "another" — the bot never readies itself
  });

  test("MECH tag × Production Surge: with Mega-Mech on board the spell costs 2 + [mind] instead of 4 + [mind]", async () => {
    const withMech = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", CARD, "mech").hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(withMech.p1.can("cast", "surge")).toBe(true);
    await withMech.p1.cast("surge");
    expect(withMech.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const without = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", { might: 8, name: "Not A Mech" }, "big").hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(without.p1.can("cast", "surge")).toBe(false);
  });

  test("8 Might in combat: attacking a 7-Might defender kills it, Mega-Mech survives (damage healed in cleanup) and conquers for a point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "mech")
      .build();
    await game.p1.move("mech", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("mech")).toBe("battlefield-bf1");
    expect(game.state("mech").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: into an 8-Might defender both die — nobody conquers and the emptied field goes uncontrolled (190.4.c); into a 9 it just dies", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 8, name: "Twin" }, "twin").unit(P1, "base", CARD, "mech").build();
    await trade.p1.move("mech", "bf1");
    await trade.settle();
    expect(trade.zoneOf("mech")).toBe("trash");
    expect(trade.zoneOf("twin")).toBe("trash");
    expect(trade.gameState.battlefields.bf1?.controller).toBeNull();
    expect(trade.p1.points() + trade.p2.points()).toBe(0);
    const loss = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9, name: "Giant" }, "giant").unit(P1, "base", CARD, "mech").build();
    await loss.p1.move("mech", "bf1");
    await loss.settle();
    expect(loss.zoneOf("mech")).toBe("trash");
    expect(loss.zoneOf("giant")).toBe("battlefield-bf1");
  });

  test("holding: parked on its controller's battlefield it scores 1 at the start of P1's turn and readies in the Awaken step", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "mech", { exhausted: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("mech").isReady).toBe(true);
  });
});
