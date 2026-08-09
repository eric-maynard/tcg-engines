/**
 * Mountain Drake — ogn-142-298 · Unit · Body · 9 energy (no power) · 10 Might · Dragon
 *
 *   (no rules text — a vanilla Dragon)
 *
 * Rules: 143.4 (units enter exhausted), 359.2.c (played to base or a battlefield you control),
 * 349 (standard timing only), 357.1.a (ready runes may be exhausted for energy while paying),
 * 465/466 (combat: simultaneous damage = Might; lethal = damage ≥ Might; survivors heal in the
 * Combat Cleanup), 763.1 (Dragon is a tag other effects key off).
 *
 * Head-judge notes — what matters for a textless 9-drop:
 *  1. The whole card is its cost and its tag: 9 ENERGY, zero power — body power never substitutes;
 *     8 energy is one short; 9 ready runes with an empty pool DO pay for it.
 *  2. The Dragon tag is load-bearing for its natural partners: Herald of Scales makes it cost 7,
 *     Direwing enters READY because a Drake is already on the board, Gentle Gemdragon's "when you play
 *     another Dragon" readies up to 2 runes when the Drake lands. A silently dropped tag breaks all three.
 *  3. No [Accelerate]: it always enters exhausted and cannot move the turn it is played, then readies
 *     in its controller's next Awaken step.
 *  4. Combat knife-edges at 10: it eats a 9 and lives (healed to 0), trades with a 10, and two 5s
 *     together deal exactly lethal 10.
 *  5. Timing/location negative space: not on the opponent's turn, not to an enemy battlefield.
 *  6. Registry payload: tags ["Dragon"], no abilities/keywords.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-142-298";
const HERALD_OF_SCALES = "ogn-140-298"; // Your Dragons' Energy costs are reduced by 2 (min 1)
const DIREWING = "sfd-094-221"; // 7-cost Dragon: I enter ready if you control another Dragon
const GENTLE_GEMDRAGON = "unl-104-219"; // When you play me or another Dragon, ready up to 2 runes

describe("Mountain Drake (ogn-142-298)", () => {
  test("registry payload: 9-cost Body unit, 10 Might, Dragon tag, no power cost, no keywords, no abilities", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 9, might: 10, name: "Mountain Drake", tags: ["Dragon"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities ?? []).toEqual([]);
    expect(def?.keywords ?? []).toEqual([]);
    const game = await scenario().unit(P1, "base", CARD, "drake").build();
    expect(game.state("drake")).toMatchObject({ baseMight: 10, keywords: [], might: 10 });
    expect(game.p1.can("activate", "drake")).toBe(false);
  });

  test("cost: exactly 9 energy is deducted (power untouched), nothing lingers on the chain, it lands in base EXHAUSTED at 10 Might and cannot move this turn", async () => {
    const game = await scenario().resources(P1, { energy: 10, power: { body: 1 } }).battlefield("bf1", { controller: null }).hand(P1, CARD, "drake").build();
    await game.p1.play("drake", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ isExhausted: true, might: 10 });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: 8 energy + plenty of body power is NOT enough; 9 ready runes with an empty pool ARE (357.1.a)", async () => {
    const short = await scenario().resources(P1, { energy: 8, power: { body: 3 } }).hand(P1, CARD, "drake").build();
    expect(short.p1.can("play", "drake")).toBe(false);
    expect((await short.p1.try((p) => p.play("drake"))).ok).toBe(false);
    expect(short.zoneOf("drake")).toBe("hand");
    const runes = await scenario().runes(P1, "body", 9).hand(P1, CARD, "drake").build();
    await runes.p1.tapRunes(9);
    expect(runes.p1.energy()).toBe(9);
    await runes.p1.play("drake");
    await runes.settle();
    expect(runes.zoneOf("drake")).toBe("base");
    expect(runes.p1.energy()).toBe(0);
    expect(runes.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("no [Accelerate]: no accelerate option is offered, and the Drake readies only in its controller's next Awaken step", async () => {
    const game = await scenario().resources(P1, { energy: 11, power: { body: 2 } }).battlefield("bf1", { controller: null }).hand(P1, CARD, "drake").build();
    const fields = game.p1.option("playUnit", "drake")?.fields ?? [];
    expect(fields.some((f) => f.arg === "accelerate" || f.name === "accelerate")).toBe(false);
    await game.p1.play("drake", { to: "base" });
    await game.settle();
    expect(game.state("drake").isExhausted).toBe(true);
    await game.advanceTurn(); // → P2: still exhausted (only the turn player awakens)
    expect(game.state("drake").isExhausted).toBe(true);
    await game.advanceTurn(); // → P1: Awaken readies it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("drake").isReady).toBe(true);
    expect(game.p1.can("move")).toBe(true);
  });

  test("locations: base or a battlefield P1 controls — never an enemy-held or uncontrolled battlefield; not playable on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .battlefield("open", { controller: null })
      .unit(P1, "mine", { might: 1, name: "Flag" }, "flag")
      .hand(P1, CARD, "drake")
      .build();
    const to = game.p1.option("playUnit", "drake")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect([...to].sort()).toEqual(["base", "battlefield-mine"]);
    await game.p1.play("drake", { to: "mine" });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("battlefield-mine");
    const oppTurn = await scenario().active(P2).resources(P1, { energy: 9 }).hand(P1, CARD, "drake").build();
    expect(oppTurn.p1.can("play", "drake")).toBe(false);
  });

  test("combat at 10: attacking a 9-Might defender kills it, the Drake survives (9 < 10), is healed in the Combat Cleanup and conquers", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9, name: "Big Guard" }, "guard").unit(P1, "base", CARD, "drake").build();
    await game.p1.move("drake", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.state("drake").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("combat knife-edge: into a 10-Might defender both die and nobody controls the battlefield; two 5-Might defenders together are exactly lethal too", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 10, name: "Mirror" }, "mirror").unit(P1, "base", CARD, "drake").build();
    await trade.p1.move("drake", "bf1");
    await trade.settle();
    expect(trade.zoneOf("drake")).toBe("trash");
    expect(trade.zoneOf("mirror")).toBe("trash");
    expect(trade.gameState.battlefields.bf1?.controller).toBeNull();
    expect(trade.p1.points()).toBe(0);
    const pair = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Twin A" }, "a")
      .unit(P2, "bf1", { might: 5, name: "Twin B" }, "b")
      .unit(P1, "base", CARD, "drake")
      .build();
    await pair.p1.move("drake", "bf1");
    await pair.settle({ policy: "first" }); // damage assignment: 10 splits 5/5, both twins die; they deal 10 back
    expect(pair.zoneOf("a")).toBe("trash");
    expect(pair.zoneOf("b")).toBe("trash");
    expect(pair.zoneOf("drake")).toBe("trash");
  });

  test("defending at 10: a 9-Might attacker dies to it and P1 keeps the battlefield", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "drake").unit(P2, "base", { might: 9, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Dragon tag × Herald of Scales: with the Herald on board the Drake costs 7 (9 − 2) — playable on 7 energy and fully spent", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).unit(P1, "base", HERALD_OF_SCALES, "herald").hand(P1, CARD, "drake").build();
    expect(game.p1.can("play", "drake")).toBe(true);
    await game.p1.play("drake");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    // Negative space: an ENEMY Herald does not discount my Dragon.
    const theirs = await scenario().resources(P1, { energy: 7 }).unit(P2, "base", HERALD_OF_SCALES, "herald").hand(P1, CARD, "drake").build();
    expect(theirs.p1.can("play", "drake")).toBe(false);
  });

  test("Dragon tag × Direwing: with a Mountain Drake already on the board Direwing enters READY; without it Direwing enters exhausted", async () => {
    const withDrake = await scenario().resources(P1, { energy: 7 }).unit(P1, "base", CARD, "drake").hand(P1, DIREWING, "dw").build();
    await withDrake.p1.play("dw");
    await withDrake.settle();
    expect(withDrake.state("dw")).toMatchObject({ isReady: true, zone: "base" });
    const alone = await scenario().resources(P1, { energy: 7 }).hand(P1, DIREWING, "dw").build();
    await alone.p1.play("dw");
    await alone.settle();
    expect(alone.state("dw").isExhausted).toBe(true);
    // An ENEMY Drake is not "another Dragon you control".
    const enemyDrake = await scenario().resources(P1, { energy: 7 }).unit(P2, "base", CARD, "drake").hand(P1, DIREWING, "dw").build();
    await enemyDrake.p1.play("dw");
    await enemyDrake.settle();
    expect(enemyDrake.state("dw").isExhausted).toBe(true);
  });

  test("Dragon tag × Gentle Gemdragon: playing the Drake with the Gemdragon out triggers 'ready up to 2 runes' — the two runes tapped to pay come back ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .runes(P1, "body", 2)
      .unit(P1, "base", GENTLE_GEMDRAGON, "gem")
      .hand(P1, CARD, "drake")
      .build();
    await game.p1.tapRunes(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.play("drake");
    // Drive: pass priority on the Gemdragon trigger, then pick both runes whenever asked.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(...d.options.slice(0, 2).map((o) => o.key));
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
