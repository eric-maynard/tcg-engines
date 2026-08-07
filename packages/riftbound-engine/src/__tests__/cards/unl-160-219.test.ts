/**
 * Ultrasoft Poro — unl-160-219 · Unit · Order · 5 energy · 5 Might · Poro
 *
 *   [Exhaust]: Play two [1] [Might] Bird unit tokens with [Deflect]. Use this ability only while I'm at
 *   a battlefield. (Opponents must pay [rainbow] to choose a [Deflect] unit with a spell or ability.)
 *
 * Rules: 377 (activated ability: cost = exhaust; uses the chain, opponents may respond), 377.2.b (THIS
 * card is the rules' example: the "use only while I'm at a battlefield" condition must hold to ACTIVATE —
 * it is not re-checked on resolution), 381 / 310.1.a / 308.1.a (no Action/Reaction → only on its
 * controller's turn in a Neutral Open state: not in showdowns, not in response, not on the enemy turn),
 * 187.7 (Bird token: domainless 1-Might unit token, Bird tag, Deflect), 185.2.d / 143.4 (token units enter
 * exhausted and are played to base or a battlefield their controller controls), 809 (Deflect taxes only
 * OPPONENTS, 1 power of any domain per choose).
 *
 * Head-judge corner cases for THIS card:
 *   1. Location gate is on ACTIVATION only: in base → not activatable at all; at a battlefield → legal;
 *      if the Poro is killed in response the ability still resolves and both Birds arrive.
 *   2. Timing: plain activated ability → illegal on the opponent's turn, illegal while holding Focus in a
 *      showdown (even your own), legal in your Neutral Open main phase; it opens a chain P2 can answer.
 *   3. Cost is [Exhaust] only (0 energy): paid immediately (Poro exhausted while the ability is pending),
 *      so an exhausted Poro cannot use it and it is once per ready-cycle; usable again next turn.
 *   4. Exactly TWO tokens, each placed independently: base or a battlefield P1 controls (never an enemy
 *      battlefield); each is an exhausted 1-Might Deflect unit token controlled by P1.
 *   5. Deflect on the Birds binds P2 (needs a power of any domain to choose one) but never P1.
 *   6. Tags matter: with the Poro (Poro) and a Bird (Bird) among your units, Friendship gives +2.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-160-219";
const FRIENDSHIP = "unl-046-219"; // Calm Reaction · 1 · +1 Might this turn per tag among your units (Bird, Cat, Dog, Poro).
const BOLT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Reaction] Deal 5 to a unit.",
  timing: "reaction",
};

const birdsIn = (ids: readonly string[]) => ids.filter((c) => c.startsWith("token-bird-"));
const allBirds = (game: Game) => birdsIn([...game.cardsAt("base"), ...game.battlefields().flatMap((b) => game.cardsAt(b))]);

/** Pass priority around and answer each Bird destination prompt from `dests` (in order; default base). */
async function resolve(game: Game, dests: string[] = []): Promise<string[][]> {
  const offered: string[][] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick") {
      offered.push(d.options.map((o) => o.key));
      await game.seat(d.seat).pick(dests.shift() ?? "base");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return offered;
}

function atBattlefield() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "poro")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe");
}

describe("Ultrasoft Poro (unl-160-219)", () => {
  test("registry payload: one activated ability — cost {exhaust}, create-token ×2 of a 1-Might Bird unit with Deflect; Poro tag; 5/5 Order, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, might: 5, name: "Ultrasoft Poro", tags: ["Poro"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { exhaust: true },
      effect: { amount: 2, token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" },
      type: "activated",
    });
    expect((def?.abilities?.[0] as { cost?: { energy?: number } }).cost?.energy ?? 0).toBe(0);
  });

  // BUG — expected (377.2.b names this very card): the "Use this ability only while I'm at a battlefield"
  // clause must survive parsing as an activation condition/restriction. Actual: the ability carries no
  // condition at all, so nothing distinguishes base from battlefield.
  test("parsed ability dropped the 'only while I'm at a battlefield' activation condition", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/battlefield/);
  });

  test("cost to play: 5 energy, no power; enters the base exhausted at 5 Might; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 5 });
    expect((await scenario().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("at a battlefield: activating exhausts the Poro at once (cost), puts the ability on the chain, P2 gets priority, then two Birds are played", async () => {
    const game = await atBattlefield().build();
    expect(game.p1.can("activate", "poro")).toBe(true);
    await game.p1.activate("poro");
    expect(game.state("poro").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0); // no energy component
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: false })]);
    expect(allBirds(game)).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await resolve(game);
    expect(allBirds(game)).toHaveLength(2);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("each Bird is an exhausted 1-Might unit TOKEN with Deflect controlled by P1 (187.7, 143.4)", async () => {
    const game = await atBattlefield().build();
    await game.p1.activate("poro");
    await resolve(game);
    const birds = allBirds(game);
    expect(birds).toHaveLength(2);
    for (const b of birds) {
      expect(game.state(b)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Bird", owner: P1 });
      expect(game.state(b).keywords).toContain("Deflect");
    }
    expect(game.p1.units()).toHaveLength(3);
    expect(game.p2.units()).toEqual(["foe"]);
  });

  test("destinations: each token independently to base or a battlefield P1 CONTROLS — the enemy bf2 is never offered; one to bf1, one to base", async () => {
    const game = await atBattlefield().build();
    await game.p1.activate("poro");
    const offered = await resolve(game, ["battlefield-bf1", "base"]);
    expect(offered).toHaveLength(2);
    for (const o of offered) {
      expect([...o].sort()).toEqual(["base", "battlefield-bf1"]);
    }
    expect(birdsIn(game.p1.units("bf1"))).toHaveLength(1);
    expect(birdsIn(game.p1.units("base"))).toHaveLength(1);
    expect(birdsIn(game.cardsAt("bf2"))).toHaveLength(0);
  });

  // BUG — expected (377.2.b): with the Poro in its base the ability cannot be activated at all.
  // Actual: `activateAbility:poro#0` is offered from base and resolves normally.
  test("'Use this ability only while I'm at a battlefield' — a Poro in base must NOT be able to activate", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "poro").build();
    expect(game.p1.can("activate", "poro")).toBe(false);
    const r = await game.p1.try((p) => p.activate("poro", 0));
    expect(r.ok).toBe(false);
    expect(game.state("poro").isReady).toBe(true);
    expect(allBirds(game)).toHaveLength(0);
  });

  test("[Exhaust] is the whole cost: an exhausted Poro cannot activate; after resolving it cannot go again this turn; next own turn (readied) it can", async () => {
    const tired = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "poro", { exhausted: true }).build();
    expect(tired.p1.can("activate", "poro")).toBe(false);
    const game = await atBattlefield().build();
    await game.p1.activate("poro");
    await resolve(game);
    expect(game.p1.can("activate", "poro")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro").isReady).toBe(true);
    expect(game.p1.can("activate", "poro")).toBe(true);
    await game.p1.activate("poro");
    await resolve(game);
    expect(allBirds(game)).toHaveLength(4);
  });

  test("timing (381/308.1.a): not on the opponent's turn, not with Focus in the opponent's showdown, not with Focus in your OWN showdown", async () => {
    const oppTurn = await atBattlefield().active(P2).unit(P2, "base", { might: 1 }, "poke").build();
    expect(oppTurn.p1.can("activate", "poro")).toBe(false);
    await oppTurn.p2.move("poke", "bf1");
    await oppTurn.p2.passFocus();
    expect(oppTurn.actingSeat()).toBe(P1);
    expect(oppTurn.p1.can("activate", "poro")).toBe(false);

    const own = await atBattlefield().unit(P1, "base", { might: 1 }, "scout").build();
    await own.p1.move("scout", "bf2");
    expect(own.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(own.p1.can("activate", "poro")).toBe(false);
  });

  test("the gate is activation-only: P2 kills the Poro in response (Reaction Bolt) — the ability still resolves and both Birds arrive", async () => {
    const game = await atBattlefield().hand(P2, BOLT, "bolt").build();
    await game.p1.activate("poro");
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "poro" });
    expect(game.chain().map((c) => c.name)).toEqual(["Ultrasoft Poro", "Test Bolt"]);
    await resolve(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(allBirds(game)).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("Deflect on the Birds: P2 cannot Bolt a Bird on 0 power, can with 1 power of ANY domain (spent) — the 1-Might Bird dies; P1's own Friendship on a Bird is untaxed", async () => {
    const game = await atBattlefield().resources(P1, { energy: 1 }).hand(P2, BOLT, "bolt").hand(P1, FRIENDSHIP, "fs").build();
    await game.p1.activate("poro");
    await resolve(game);
    const [bird, other] = allBirds(game);
    await game.p1.cast("fs", { targets: bird! }); // own spell: 1 energy, no Deflect power
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect((await game.p2.try((p) => p.cast("bolt", { targets: other! }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { mind: 1 } });
    await game.p2.cast("bolt", { targets: other! });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.has(other!) ? game.zoneOf(other!) : "gone").not.toBe("base");
    expect(allBirds(game)).toHaveLength(1);
  });

  test("tags: Friendship on a vanilla ally counts Poro (the Poro) + Bird (a token) among your units → +2 Might this turn", async () => {
    const game = await atBattlefield().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2, name: "Pal" }, "pal").hand(P1, FRIENDSHIP, "fs").build();
    await game.p1.activate("poro");
    await resolve(game);
    await game.p1.cast("fs", { targets: "pal" });
    await game.settle();
    expect(game.state("pal").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("pal").might).toBe(2);
  });
});
