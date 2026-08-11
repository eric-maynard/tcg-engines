/**
 * Honest Broker — sfd-155-221 · Unit · Order · 2 energy (no power) · 2 Might
 *
 *   [Deathknell] — Play a Gold gear token exhausted. (When I die, get the effect.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Deathknell (808) triggers on its OWN death from any cause — spell damage, combat, a Kill effect
 *     (Vengeance), even being sacrificed by its own controller (Cull the Weak) — and goes on the chain
 *     BEFORE the Broker reaches the trash finishes mattering (428.1.a.1.b): opponent gets priority.
 *  2. Leaving the board any other way (Retreat → hand) is not dying: no Gold.
 *  3. The Gold (187.5) is played to the Broker CONTROLLER's base (182), EXHAUSTED (184.1) — so its
 *     "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]" is unusable until it readies next Awaken.
 *  4. Simultaneous deaths: two Brokers trading in one combat each make their own controller a Gold.
 *  5. Karthus, Eternal ("Your Deathknell effects trigger an additional time") → two Golds.
 *  6. Surviving damage (1 on a 2-Might body) is not a death.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-155-221";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.
const VENGEANCE = "ogn-229-298"; // Order 4 + [order][order]: Kill a unit.
const CULL_THE_WEAK = "ogn-209-298"; // Order 2 + [order]: Each player kills one of their units.
const RETREAT = "ogn-104-298"; // Mind [Reaction] 1: Return a friendly unit to its owner's hand …
const KARTHUS = "ogn-236-298"; // Order champion: Your [Deathknell] effects trigger an additional time.

const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P2's turn, 8 energy, Final Spark in hand; P1's Broker holds bf1. */
function sparkBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "hb")
    .hand(P2, FINAL_SPARK, "spark");
}

describe("Honest Broker (sfd-155-221)", () => {
  test("registry payload (skeleton): 2-cost 2-Might Order unit whose Deathknell effect plays a Gold GEAR token", async () => {
    const game = await scenario().hand(P1, CARD, "hb").build();
    expect(game.state("hb")).toMatchObject({ baseMight: 2, cardType: "unit", energyCost: 2, name: "Honest Broker" });
    expect(game.state("hb").powerCost).toEqual([]);
    expect(game.state("hb").keywords).toContain("Deathknell"); // 808.3: Deathknell is a characteristic
    const abilities = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as Record<string, any>[];
    expect(abilities.some((a) => a.keyword === "Deathknell")).toBe(true);
    const effects = abilities.map((a) => a.effect).filter(Boolean);
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e).toMatchObject({ token: { name: "Gold", type: "gear" }, type: "create-token" });
    }
    const trig = abilities.find((a) => a.type === "triggered");
    if (trig) {
      expect(trig.trigger).toEqual({ event: "die", on: "self" });
    }
  });

  test("registry payload — 'Play a Gold gear token EXHAUSTED' must be encoded (ready:false) on the create-token effect", async () => {
    // Expected: every create-token effect carries `ready: false` (as Black Market Broker's does).
    // Actual: the flag is missing, so the gear-token default (enters ready) applies.
    await scenario().hand(P1, CARD, "hb").build();
    const abilities = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as Record<string, any>[];
    const effects = abilities.map((a) => a.effect).filter(Boolean);
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.ready).toBe(false);
    }
  });

  test("cost: 2 energy, no power; enters the base exhausted; nothing triggers on play; 1 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "hb").build();
    await game.p1.play("hb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("hb")).toMatchObject({ isExhausted: true, might: 2, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p1")).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 1, power: { order: 2 } }).hand(P1, CARD, "x").build()).p1.can("play", "x")).toBe(false);
  });

  test("dies to spell damage at a battlefield: Deathknell goes on the chain (opponent may respond), then exactly ONE Gold token appears in P1's BASE", async () => {
    const game = await sparkBoard().build();
    await game.p2.cast("spark", { targets: "hb" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Final Spark resolves
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", controller: P1, triggered: true })]);
    expect(golds(game, "p1")).toHaveLength(0); // not before the trigger resolves
    await game.settle();
    const mine = golds(game, "p1");
    expect(mine).toHaveLength(1); // one Deathknell, one Gold (no double from keyword+trigger parsing)
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", controller: P1, isToken: true, name: "Gold", owner: P1, zone: "base" });
    expect(game.cardsAt("bf1").filter((id) => game.state(id).name === "Gold")).toHaveLength(0);
    expect(golds(game, "p2")).toHaveLength(0);
  });

  test("the Gold token must enter EXHAUSTED (184.1 'play … exhausted'), so it cannot be cashed for [rainbow] the turn it arrives", async () => {
    // Expected: isExhausted true and no legal activate. Actual: it enters ready.
    const game = await sparkBoard().build();
    await game.p2.cast("spark", { targets: "hb" });
    await game.settle();
    const [gold] = golds(game, "p1");
    expect(gold).toBeDefined();
    expect(game.state(gold!).isExhausted).toBe(true);
  });

  test("dying in COMBAT (323.4) also triggers: a 3-Might attacker kills the Broker, P1 gets a Gold, P2 gets none and takes bf1", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "hb").unit(P2, "base", { might: 3, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space: surviving 1 damage (2-Might body) is not dying — no trigger, no Gold", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "hb").unit(P2, "base", { might: 1, name: "Poker" }, "poker").build();
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.locationOf("hb")).toBe("bf1");
    expect(game.zoneOf("poker")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(0);
  });

  test("a Kill effect (Vengeance) is a death: Gold for the Broker's controller, not for the caster", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 4, power: { order: 2 } }).unit(P1, "base", CARD, "hb").hand(P2, VENGEANCE, "veng").build();
    await game.p2.cast("veng", { targets: "hb" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toHaveLength(0);
  });

  test("sacrificed by its OWN controller (Cull the Weak: each player kills one of their units) still pays out a Gold", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P1, "base", CARD, "hb")
      .unit(P2, "base", { might: 4, name: "Their Only Unit" }, "theirs")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    // rule 355.10.e — Cull the Weak does not target: each player, the caster
    // included, names their own victim as the spell RESOLVES.
    await game.p1.cast("cull");
    game.script(P1, ["hb"]);
    game.script(P2, ["theirs"]);
    await game.settle({ policy: "first" }); // each side has exactly one unit to give up
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toHaveLength(0);
  });

  test("negative space: leaving the board WITHOUT dying (Retreat → owner's hand) creates no Gold", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "hb").hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("retreat", { targets: "hb" });
    await game.settle();
    expect(game.zoneOf("hb")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p1")).toHaveLength(0);
  });

  test("simultaneous deaths: P1's Broker (defending) and P2's Broker (attacking) trade — each controller gets exactly one Gold in their own base", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "mine").unit(P2, "base", CARD, "theirs").build();
    await game.p2.move("theirs", "bf1");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0]!).controller).toBe(P1);
    expect(game.state(golds(game, "p2")[0]!).controller).toBe(P2);
  });

  test("with Karthus, Eternal on P1's board the Deathknell triggers an additional time → two Golds", async () => {
    const game = await sparkBoard().unit(P1, "base", KARTHUS, "karthus").build();
    await game.p2.cast("spark", { targets: "hb" });
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(2);
    expect(game.zoneOf("karthus")).toBe("base");
  });

  test("the Gold is a real Gold token (187.5): on P1's next turn it is ready and 'Kill this, [Exhaust]: [Add] [rainbow]' yields one rainbow and removes it", async () => {
    const game = await sparkBoard().build();
    await game.p2.cast("spark", { targets: "hb" });
    await game.settle();
    const [gold] = golds(game, "p1");
    expect(gold).toBeDefined();
    await game.advanceTurn(); // → P1's turn; Awaken readies everything
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold!).isReady).toBe(true);
    expect(game.p1.can("activate", gold!)).toBe(true);
    await game.p1.activate(gold!);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.base()).not.toContain(gold!);
  });
});
