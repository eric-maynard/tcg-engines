/**
 * Core rules — PLAY PERMISSIONS (366.1 / 419.1.a / 419.2) and the `playFromZone`
 * move: an effect that says "you may play it from your banishment this turn"
 * writes a permission (`operations/play-permissions.ts`); from then on the
 * permitted player is OFFERED that play as a Discretionary Action (enumerated
 * like any hand play, subject to the card's normal timing), and taking it runs
 * the ONE play pipeline (`via: "permission"`): location prompt, additional
 * costs, printed cost — or the permission's alternative cost (356.1.a).
 * Standing permissions printed on cards (Endless Riches' trash grant, Undying
 * Legion's own "[Legion] play me from your trash for …") are read through the
 * same collector.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { collectPlayPermissions } from "../../operations/play-permissions";

const OPTIONAL_DRAW = [
  { effect: { amount: 1, type: "draw" }, optional: true, trigger: { event: "play-self" }, type: "triggered" },
];

/** 2-cost unit, "When you play me, you may draw 1". */
const UNIT2 = {
  abilities: [...OPTIONAL_DRAW],
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  keywords: [],
  might: 2,
  name: "Exile-alike (test)",
  powerCost: [],
};

/** Action spell: "Banish a friendly unit. You may play it from your banishment this turn[ for <cost>]." */
const exileSpell = (grant: Record<string, unknown> = {}) => ({
  abilities: [
    {
      effect: {
        effects: [
          { target: { controller: "friendly", type: "unit" }, type: "banish" },
          { duration: "turn", target: { type: "pending-value" }, type: "grant-play-permission", ...grant },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Exile (test)",
  powerCost: [],
  timing: "action",
});

const UNDYING_LEGION = "unl-025-219"; // [Legion] — You may play me from your trash for [3][fury].
const ENDLESS_RICHES = "ven-022-166"; // … You may play cards from your trash. …

async function exiled(grant: Record<string, unknown> = {}, energy = 2) {
  const game = await scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", UNIT2, "u", { damage: 1 })
    .hand(P1, exileSpell(grant), "exile")
    .build();
  await game.p1.cast("exile", { targets: "u" });
  await game.settle();
  expect(game.zoneOf("u")).toBe("banishment");
  return game;
}

describe("runtime permission — 'you may play it from your banishment this turn'", () => {
  test("before the grant nothing in banishment is playable; after it the play is OFFERED (enumerated) to the permitted player only", async () => {
    const none = await scenario().resources(P1, { energy: 5 }).banishment(P1, UNIT2, "u").build();
    expect(none.p1.can("playFrom", "u")).toBe(false);

    const game = await exiled();
    expect(game.p1.can("playFrom", "u")).toBe(true);
    expect(game.p2.can("playFrom", "u")).toBe(false);
    expect(game.gameState.playPermissions).toEqual([
      expect.objectContaining({ cardId: "u", expires: "turn", playerId: P1, source: "runtime", zone: "banishment" }),
    ]);
  });

  test("taking it runs the play pipeline: location prompt (base / own battlefield), printed cost paid (2), enters exhausted as a fresh object, play trigger asked, Legion counts it", async () => {
    const game = await exiled();
    await game.p1.playFrom("u");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
    expect(game.state("u")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may draw 1"
    await game.p1.no();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // the spell + the unit
    expect(game.p1.can("playFrom", "u")).toBe(false); // no longer in the permitted zone
  });

  test("unaffordable → not offered (419.2.a); an alternative cost on the permission replaces the printed one (356.1.a: 'play it for [1]')", async () => {
    const poor = await exiled({}, 1);
    expect(poor.p1.can("playFrom", "u")).toBe(false);

    const cheap = await exiled({ cost: { energy: 1 } }, 1);
    expect(cheap.p1.can("playFrom", "u")).toBe(true);
    await cheap.p1.playFrom("u", { answers: ["base", "no"] });
    expect(cheap.zoneOf("u")).toBe("base");
    expect(cheap.p1.energy()).toBe(0);
  });

  test("timing is the card's own (419.2): a unit is not offered on the opponent's turn, and 'this turn' lapses at end of turn", async () => {
    const game = await exiled({}, 4);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("playFrom", "u")).toBe(false); // not P1's Neutral Open main phase
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("playFrom", "u")).toBe(false); // the grant was for that turn only
    expect(game.zoneOf("u")).toBe("banishment");
  });

  test("a permanent grant ('you may play it from your banishment') survives the turn", async () => {
    // "for [0]" so the empty pool of the new turn does not hide the offer
    const game = await exiled({ cost: { energy: 0 }, duration: "permanent" }, 4);
    await game.p1.endTurn();
    await game.settle();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("playFrom", "u")).toBe(true);
  });
});

describe("standing permissions printed on cards are read by the same collector", () => {
  test("Undying Legion in the trash after another play this turn: a static-self permission for [3][fury] (served by the hand-move family, not double-offered by playFromZone)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .trash(P1, UNDYING_LEGION, "ul")
      .hand(P1, { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Cheap (test)", powerCost: [] }, "cheap")
      .build();
    const zones = { getCardZone: (id: string) => game.zoneOf(id), getCardsInZone: (z: string, p?: string) => (z === "trash" && p === P1 ? ["ul"] : []) };
    expect(collectPlayPermissions(game.gameState, P1, zones as never)).toEqual([]); // Legion not yet on
    await game.p1.play("cheap");
    await game.settle();
    expect(collectPlayPermissions(game.gameState, P1, zones as never)).toEqual([
      expect.objectContaining({ cardId: "ul", cost: { energy: 3, power: ["fury"] }, source: "static-self", zone: "trash" }),
    ]);
    expect(game.p1.can("play", "ul")).toBe(true);
    expect(game.p1.can("playFrom", "ul")).toBe(false);
  });

  test("Endless Riches on the board: a static-board 'any card from your trash' permission for its controller", async () => {
    const game = await scenario().gear(P1, ENDLESS_RICHES, "riches").trash(P1, UNIT2, "u").build();
    const perms = collectPlayPermissions(game.gameState, P1, {
      getCardZone: (id: string) => game.zoneOf(id),
      getCardsInZone: (z: string, p?: string) => game.gameState && z === "trash" && p === P1 ? ["u"] : z === "base" && p === P1 ? ["riches"] : [],
    } as never);
    expect(perms).toEqual([expect.objectContaining({ playerId: P1, source: "static-board", zone: "trash" })]);
    expect(collectPlayPermissions(game.gameState, P2, { getCardZone: () => undefined, getCardsInZone: () => [] } as never)).toEqual([]);
  });
});
