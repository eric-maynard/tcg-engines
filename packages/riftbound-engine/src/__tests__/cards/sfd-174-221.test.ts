/**
 * Trove Golem — sfd-174-221 · Unit · Order · 8 energy + [order][order] · 9 Might
 *
 *   When you play me, play four Gold gear tokens exhausted.
 *
 * Gold (187.5): a domainless gear token with "[Reaction] — Kill this, [Exhaust]: [Add] [rainbow]".
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. It is a PLAY trigger, not a static: it goes on the chain after the Golem lands, the opponent
 *      gets priority before any Gold exists, and a Golem that was never "played" (already on the
 *      board) makes nothing.
 *   2. Exactly FOUR tokens, each a separate gear, all EXHAUSTED, all in the Golem controller's BASE
 *      (gear lives in base even when the Golem itself is played to a battlefield), none for the opponent.
 *   3. Exhausted Gold is dead money this turn: its ability needs [Exhaust] as a cost (414.4), so no
 *      activation is offered until the controller's next Awaken readies them.
 *   4. Cashing a Gold is Kill-this + Exhaust for [Add] [rainbow]: the token ceases to exist (186.1 —
 *      it is in no zone afterwards, not even the trash), the pool gains 1 power usable for ANY domain
 *      (135.2.e.5.b), and being an [Add] ability it never opens a chain.
 *   5. Cost sanity: 8 energy AND two ORDER power; 9 Might body that enters exhausted (143.4).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-174-221";
/** 0-energy Chaos unit costing one [chaos] — to prove Gold's [rainbow] pays an off-domain pip. */
const SELLSWORD = { cardType: "unit", domain: "chaos", energyCost: 0, might: 2, name: "Sellsword", powerCost: ["chaos"] } as const;

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

function ready(extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().resources(P1, { energy: 8, power: { order: 2 } }).hand(P1, CARD, "golem");
  extra?.(b);
  return b;
}

/** Play the Golem to base and let the trigger resolve. */
async function playedGolem(): Promise<Game> {
  const game = await ready().build();
  await game.p1.play("golem");
  await game.settle();
  return game;
}

describe("Trove Golem (sfd-174-221)", () => {
  test("registry payload: a single play-self trigger creating 4 Gold GEAR tokens, not ready", async () => {
    const game = await scenario().unit(P1, "base", CARD, "golem").build();
    expect(game.state("golem")).toMatchObject({ baseMight: 9, cardType: "unit", energyCost: 8, name: "Trove Golem" });
    expect(game.state("golem").powerCost).toEqual(["order", "order"]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { amount: 4, ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 8 energy + [order][order], enters base exhausted as a 9; short energy, short order or off-domain power → not playable", async () => {
    const game = await ready().build();
    await game.p1.play("golem");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("golem")).toBe("base");
    expect(game.state("golem")).toMatchObject({ isExhausted: true, might: 9 });
    expect((await scenario().resources(P1, { energy: 7, power: { order: 3 } }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
    expect((await scenario().resources(P1, { energy: 9, power: { order: 1 } }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
    expect((await scenario().resources(P1, { energy: 8, power: { chaos: 2 } }).hand(P1, CARD, "g").build()).p1.can("play", "g")).toBe(false);
  });

  test("the play trigger goes on the chain first: opponent gets priority while no Gold exists yet", async () => {
    const game = await ready().build();
    await game.p1.play("golem");
    expect(game.zoneOf("golem")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "golem", controller: P1, triggered: true })]);
    expect(golds(game)).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(golds(game)).toEqual([]);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(golds(game)).toHaveLength(4);
  });

  test("on resolution: exactly four Gold gear TOKENS, every one exhausted, in P1's base under P1's control — none for P2", async () => {
    const game = await playedGolem();
    const g = golds(game);
    expect(g).toHaveLength(4);
    expect(new Set(g).size).toBe(4); // four distinct objects
    for (const id of g) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1, zone: "base" });
      expect(game.state(id).domains).toEqual([]); // domainless (187.5)
    }
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.base()).toHaveLength(5); // golem + 4 gold, nothing else appeared
    expect(game.violations()).toEqual([]);
  });

  test("exhausted Gold cannot be cashed the turn it arrives ([Exhaust] is part of its cost, 414.4)", async () => {
    const game = await playedGolem();
    for (const id of golds(game)) {
      expect(game.p1.can("activate", id)).toBe(false);
    }
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
    expect(game.p1.power()).toBe(0);
  });

  test("next own turn: all four ready; each cashes for +1 [rainbow] with no chain, and the token ceases to exist (186.1)", async () => {
    const game = await playedGolem();
    await game.advanceTurn(); // → P2
    expect(golds(game).every((id) => game.state(id).isExhausted)).toBe(true); // P2's Awaken does not ready P1's gear
    await game.advanceTurn(); // → P1 (Awaken readies)
    expect(game.turnPlayer()).toBe(P1);
    const g = golds(game);
    expect(g).toHaveLength(4);
    expect(g.every((id) => game.state(id).isReady)).toBe(true);
    for (let i = 0; i < 4; i++) {
      const id = g[i] as string;
      await game.p1.activate(id);
      expect(game.chain()).toEqual([]); // [Add] abilities do not use the chain
      expect(game.p1.power("rainbow")).toBe(i + 1);
      expect(game.p1.base()).not.toContain(id);
      expect(game.p1.trash()).not.toContain(id); // a token in a non-board zone ceases to exist
      expect(game.has(id)).toBe(false);
    }
    expect(game.p1.resources().power).toEqual({ rainbow: 4 });
    expect(golds(game)).toEqual([]);
    expect(game.zoneOf("golem")).toBe("base");
  });

  test("Gold's [rainbow] is real any-domain power (135.2.e.5.b): it pays the [chaos] pip of an off-domain unit", async () => {
    const game = await ready((b) => b.hand(P1, SELLSWORD, "sell")).build();
    await game.p1.play("golem");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.p1.can("play", "sell")).toBe(false); // no power of any kind yet
    await game.p1.activate(golds(game)[0] as string);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("play", "sell")).toBe(true);
    await game.p1.play("sell");
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.zoneOf("sell")).toBe("base");
    expect(golds(game)).toHaveLength(3);
  });

  test("played to a battlefield you control: the Golem goes there but the four Gold still enter your BASE", async () => {
    const game = await ready((b) => b.battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1, name: "Flag" }, "flag")).build();
    await game.p1.play("golem", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("golem")).toBe("bf1");
    const g = golds(game);
    expect(g).toHaveLength(4);
    expect(g.every((id) => game.locationOf(id) === "base")).toBe(true);
    expect(game.cardsAt("bf1").filter((id) => game.state(id).name === "Gold")).toEqual([]);
  });

  test("negative space: 'When you PLAY me' — a Golem that starts on the board (or the opponent's Golem being played) gives you nothing", async () => {
    const placed = await scenario().unit(P1, "base", CARD, "golem").build();
    await placed.settle();
    expect(golds(placed)).toEqual([]);
    await placed.advanceTurn();
    await placed.advanceTurn();
    expect(golds(placed)).toEqual([]);
    const theirs = await scenario().active(P2).resources(P2, { energy: 8, power: { order: 2 } }).hand(P2, CARD, "golem").build();
    await theirs.p2.play("golem");
    await theirs.settle();
    expect(golds(theirs, "p2")).toHaveLength(4);
    expect(golds(theirs, "p1")).toEqual([]);
    expect(golds(theirs, "p2").every((id) => theirs.state(id).controller === P2)).toBe(true);
  });

  test("two Golems, two triggers: eight Gold — token creation is not capped or merged", async () => {
    const game = await scenario().resources(P1, { energy: 16, power: { order: 4 } }).hand(P1, CARD, "g1").hand(P1, CARD, "g2").build();
    await game.p1.play("g1");
    await game.settle();
    await game.p1.play("g2");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(golds(game)).toHaveLength(8);
  });
});
