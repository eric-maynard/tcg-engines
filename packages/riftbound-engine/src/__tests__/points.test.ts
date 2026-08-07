/**
 * operations/points.ts — the score / victory pipeline choke point.
 *
 *   awardPoints        054.1 denial → 443/367 per-method score replacement →
 *                      471.1.b Final Point (draw instead) → add
 *   losePoints         194.4 clamp at 0
 *   markScored         469 / 470 once per battlefield per turn
 *   scoreBattlefield   canPlayerScoreAtBattlefield gate + markScored + awardPoints,
 *                      isScore drives 471.2.c trigger emission
 *   effectiveVictoryScore  194.3 base + modifier + battlefield & board statics
 *   checkVictory       472 / 321 only writer of status/winner; no-op mid-resolution
 *   burnOut / refillDeckOrBurnOut  431.2 / 431.3(.b/.c.1)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CardId, PlayerId as CorePlayerId, ZoneId } from "@tcg/core";
import { withChainItemResolution } from "../chain/resolution-guard";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import {
  awardPoints,
  burnOut,
  checkVictory,
  effectiveVictoryScore,
  findWinner,
  isPointGainDenied,
  losePoints,
  markScored,
  refillDeckOrBurnOut,
  scoreBattlefield,
} from "../operations/points";
import type { PlayerState, RiftboundGameState } from "../types";

function createPlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return { id, turnsTaken: 3, victoryPoints: 0, victoryScoreModifier: 0, xp: 0, ...overrides };
}

function createState(overrides: Partial<RiftboundGameState> = {}): RiftboundGameState {
  return {
    battlefields: {
      A: { contested: false, controller: null, id: "A" },
      B: { contested: false, controller: null, id: "B" },
    },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: createPlayer("p1"), p2: createPlayer("p2") },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 3, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
    ...overrides,
  } as RiftboundGameState;
}

/** Minimal zone store: `zones[zoneId or zoneId:player] = cardIds`. */
function createIO(initial: Record<string, string[]> = {}, owners: Record<string, string> = {}) {
  const zones = new Map<string, string[]>(Object.entries(initial).map(([k, v]) => [k, [...v]]));
  const key = (zoneId: string, playerId?: string) =>
    zoneId.startsWith("battlefield-") || playerId === undefined ? zoneId : `${zoneId}:${playerId}`;
  const draws: { playerId: string; count: number }[] = [];
  const io = {
    cards: {
      getCardMeta: () => ({}),
      getCardOwner: (cardId: CardId) => owners[cardId as string],
    },
    draws,
    zones: {
      drawCards: (params: { count: number; from: ZoneId; to: ZoneId; playerId: CorePlayerId }) => {
        draws.push({ count: params.count, playerId: params.playerId as string });
        const deck = zones.get(key("mainDeck", params.playerId as string)) ?? [];
        const hand = zones.get(key("hand", params.playerId as string)) ?? [];
        hand.push(...deck.splice(0, params.count));
        zones.set(key("mainDeck", params.playerId as string), deck);
        zones.set(key("hand", params.playerId as string), hand);
      },
      getCardsInZone: (zoneId: ZoneId, playerId?: CorePlayerId) =>
        [...(zones.get(key(zoneId as string, playerId as string | undefined)) ?? [])] as CardId[],
      moveCard: (params: { cardId: CardId; targetZoneId: ZoneId }) => {
        let owner: string | undefined;
        for (const [k, ids] of zones) {
          const i = ids.indexOf(params.cardId as string);
          if (i >= 0) {
            ids.splice(i, 1);
            owner = k.includes(":") ? k.split(":")[1] : owners[params.cardId as string];
          }
        }
        const target = key(params.targetZoneId as string, owner);
        zones.set(target, [...(zones.get(target) ?? []), params.cardId as string]);
      },
    },
    zoneMap: zones,
  };
  return io;
}

const DENY_OPPONENTS = {
  effect: { restriction: "opponents can't gain points.", type: "restriction" },
  type: "static",
} as const;

let registry: CardDefinitionRegistry;
beforeEach(() => {
  registry = new CardDefinitionRegistry();
  setGlobalCardRegistry(registry);
});
afterEach(() => {
  clearGlobalCardRegistry();
});

describe("awardPoints — plain gains and rule 194.4 losses", () => {
  test("adds n points and reports gained; never checks victory (rule 472)", () => {
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 7 }), p2: createPlayer("p2") } });
    const io = createIO();
    expect(awardPoints(state, "p1", 1, { method: "effect" }, io)).toEqual({
      denied: false,
      drewInstead: false,
      gained: 1,
      replaced: false,
    });
    expect(state.players.p1?.victoryPoints).toBe(8);
    expect(state.status).toBe("playing");
    expect(state.winner).toBeUndefined();
  });

  test("n ≤ 0 or unknown player is a no-op", () => {
    const state = createState();
    const io = createIO();
    expect(awardPoints(state, "p1", 0, { method: "effect" }, io).gained).toBe(0);
    expect(awardPoints(state, "nobody", 1, { method: "effect" }, io).gained).toBe(0);
    expect(state.players.p1?.victoryPoints).toBe(0);
  });

  test("losePoints clamps at 0 and reports what was actually lost (194.4 / 194.4.a)", () => {
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 1 }), p2: createPlayer("p2") } });
    expect(losePoints(state, "p1", 2)).toBe(1);
    expect(state.players.p1?.victoryPoints).toBe(0);
    expect(losePoints(state, "p1", 1)).toBe(0);
    expect(state.players.p1?.victoryPoints).toBe(0);
  });
});

describe("awardPoints — rule 054.1 'can't gain points' denial", () => {
  test("an opposing denier on the board removes the point for every method except a repeat Burn Out (431.3.b)", () => {
    registry.register("denier", { abilities: [DENY_OPPONENTS], cardType: "unit", id: "denier", might: 1, name: "Denier" });
    const state = createState();
    const io = createIO({ "base:p2": ["denier"] }, { denier: "p2" });
    expect(isPointGainDenied(state, "p1", io)).toBe(true);
    expect(isPointGainDenied(state, "p2", io)).toBe(false); // its controller is not an opponent
    expect(awardPoints(state, "p1", 1, { method: "effect" }, io)).toMatchObject({ denied: true, gained: 0 });
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "hold" }, io)).toMatchObject({ denied: true, gained: 0 });
    expect(awardPoints(state, "p1", 1, { method: "burn-out", sequenceIndex: 0 }, io)).toMatchObject({ denied: true, gained: 0 });
    expect(state.players.p1?.victoryPoints).toBe(0);
    // 431.3.b — the second and later Burn Outs of one sequence can't be prevented.
    expect(awardPoints(state, "p1", 1, { method: "burn-out", sequenceIndex: 1 }, io)).toMatchObject({ denied: false, gained: 1 });
    expect(state.players.p1?.victoryPoints).toBe(1);
    // The denier's own controller still gains normally.
    expect(awardPoints(state, "p2", 1, { method: "effect" }, io).gained).toBe(1);
  });

  test("a conditional denier (Tianna: while-at-battlefield) only applies while its condition holds (365.1)", () => {
    registry.register("tianna", {
      abilities: [{ ...DENY_OPPONENTS, condition: { type: "while-at-battlefield" } }],
      cardType: "unit",
      id: "tianna",
      might: 4,
      name: "Tianna",
    });
    const state = createState();
    const inBase = createIO({ "base:p2": ["tianna"] }, { tianna: "p2" });
    expect(isPointGainDenied(state, "p1", inBase)).toBe(false);
    const atBattlefield = createIO({ "battlefield-A": ["tianna"] }, { tianna: "p2" });
    expect(isPointGainDenied(state, "p1", atBattlefield)).toBe(true);
  });
});

describe("awardPoints — rule 443.1.a per-method score replacement", () => {
  const SKIP_NEXT_CONQUER = {
    duration: "next",
    method: "conquer",
    replacement: "prevent",
    replaces: "score",
    target: { type: "player", which: "any" },
    type: "replacement",
  } as const;

  test("a conquer-scoped skip eats the next Conquer point but never a Hold or an effect point", () => {
    registry.register("skipper", { abilities: [SKIP_NEXT_CONQUER], cardType: "gear", id: "skipper", name: "Skipper" });
    const state = createState();
    const io = createIO({ "base:p2": ["skipper"] }, { skipper: "p2" });
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "hold" }, io)).toMatchObject({ gained: 1, replaced: false });
    expect(awardPoints(state, "p1", 1, { method: "effect" }, io)).toMatchObject({ gained: 1, replaced: false });
    expect(awardPoints(state, "p1", 1, { battlefieldId: "B", method: "conquer" }, io)).toMatchObject({ gained: 0, replaced: true });
    // duration "next": consumed — the following conquer scores.
    expect(awardPoints(state, "p1", 1, { battlefieldId: "B", method: "conquer" }, io)).toMatchObject({ gained: 1, replaced: false });
    expect(state.players.p1?.victoryPoints).toBe(3);
  });
});

describe("awardPoints — rule 471.1.b Final Point restriction (Conquer only)", () => {
  test("at VS−1 a Conquer with an unscored battlefield left draws 1 instead; a Hold or effect point is not restricted (471.1.a.1)", () => {
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 7 }), p2: createPlayer("p2") } });
    const io = createIO({ "mainDeck:p1": ["c1", "c2"] });
    markScored(state, "p1", "A", "conquer");
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "conquer" }, io)).toMatchObject({ drewInstead: true, gained: 0 });
    expect(state.players.p1?.victoryPoints).toBe(7);
    expect(io.draws).toEqual([{ count: 1, playerId: "p1" }]);
    // Hold at 7 → 8: no restriction.
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "hold" }, io)).toMatchObject({ drewInstead: false, gained: 1 });
    expect(state.players.p1?.victoryPoints).toBe(8);
  });

  test("with every battlefield scored this turn the Conquer earns the Final Point (471.1.b.1)", () => {
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 7 }), p2: createPlayer("p2") } });
    const io = createIO({ "mainDeck:p1": ["c1"] });
    markScored(state, "p1", "A", "hold");
    markScored(state, "p1", "B", "conquer");
    expect(awardPoints(state, "p1", 1, { battlefieldId: "B", method: "conquer" }, io)).toMatchObject({ drewInstead: false, gained: 1 });
    expect(state.players.p1?.victoryPoints).toBe(8);
    expect(io.draws).toEqual([]);
  });

  test("the restriction also applies ABOVE VS−1 (a tie at 8–8): a lone conquer draws", () => {
    const state = createState({
      players: { p1: createPlayer("p1", { victoryPoints: 8 }), p2: createPlayer("p2", { victoryPoints: 8 }) },
    });
    const io = createIO({ "mainDeck:p1": ["c1"] });
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "conquer" }, io)).toMatchObject({ drewInstead: true, gained: 0 });
  });

  test("denial is checked before the Final Point restriction — a denied conquer neither scores nor draws", () => {
    registry.register("denier", { abilities: [DENY_OPPONENTS], cardType: "unit", id: "denier", might: 1, name: "Denier" });
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 7 }), p2: createPlayer("p2") } });
    const io = createIO({ "base:p2": ["denier"], "mainDeck:p1": ["c1"] }, { denier: "p2" });
    expect(awardPoints(state, "p1", 1, { battlefieldId: "A", method: "conquer" }, io)).toMatchObject({ denied: true, drewInstead: false, gained: 0 });
    expect(io.draws).toEqual([]);
  });
});

describe("markScored / scoreBattlefield — rules 469 / 470 / 471.2.c", () => {
  test("markScored records once per battlefield per turn and reports repeats; conquer also records conqueredThisTurn", () => {
    const state = createState();
    expect(markScored(state, "p1", "A", "conquer")).toEqual({ wasAlreadyScoredThisTurn: false });
    expect(markScored(state, "p1", "A", "hold")).toEqual({ wasAlreadyScoredThisTurn: true });
    expect(state.scoredThisTurn.p1).toEqual(["A"]);
    expect(state.conqueredThisTurn.p1).toEqual(["A"]);
    expect(markScored(state, "p1", "B", "hold")).toEqual({ wasAlreadyScoredThisTurn: false });
    expect(state.conqueredThisTurn.p1).toEqual(["A"]);
  });

  test("scoreBattlefield: first take is a Score (isScore, +1); re-taking the same battlefield this turn is not (471.2.c: no trigger, no point)", () => {
    const state = createState();
    const io = createIO();
    expect(scoreBattlefield(state, "p1", "A", "conquer", io)).toMatchObject({ gained: 1, isScore: true });
    expect(scoreBattlefield(state, "p1", "A", "conquer", io)).toMatchObject({ gained: 0, isScore: false });
    expect(state.players.p1?.victoryPoints).toBe(1);
  });

  test("scoreBattlefield: a denied Hold is still a Score (383.4.d.2.c — isScore true, battlefield marked) with no point", () => {
    registry.register("denier", { abilities: [DENY_OPPONENTS], cardType: "unit", id: "denier", might: 1, name: "Denier" });
    const state = createState();
    const io = createIO({ "base:p2": ["denier"] }, { denier: "p2" });
    expect(scoreBattlefield(state, "p1", "A", "hold", io)).toMatchObject({ denied: true, gained: 0, isScore: true });
    expect(state.scoredThisTurn.p1).toEqual(["A"]);
  });

  test("scoreBattlefield: a 'players can't score here' battlefield (Forgotten Monument) is conquered but not Scored — no mark, no point, no trigger", () => {
    registry.register("A", {
      abilities: [{ condition: { threshold: 3, type: "turn-count-at-least" }, effect: { type: "prevent-score" }, type: "static" }],
      cardType: "battlefield",
      id: "A",
      name: "Forgotten Monument",
    });
    const state = createState({ players: { p1: createPlayer("p1", { turnsTaken: 1 }), p2: createPlayer("p2") } });
    const io = createIO();
    expect(scoreBattlefield(state, "p1", "A", "conquer", io)).toMatchObject({ gained: 0, isScore: false });
    expect(state.scoredThisTurn.p1).toEqual([]);
    expect(state.conqueredThisTurn.p1).toEqual(["A"]);
  });

  test("scoreBattlefield: in a team game, conquering a battlefield a teammate held scores no point (469.1.a / 630.1.a) but is still a Conquer", () => {
    const state = createState({
      conqueredThisTurn: { p1: [], p2: [], p3: [], p4: [] },
      players: { p1: createPlayer("p1"), p2: createPlayer("p2"), p3: createPlayer("p3"), p4: createPlayer("p4") },
      scoredThisTurn: { p1: [], p2: [], p3: [], p4: [] },
      teams: { p1: 1, p2: 2, p3: 1, p4: 2 },
    } as Partial<RiftboundGameState>);
    const io = createIO();
    expect(scoreBattlefield(state, "p1", "A", "conquer", io, { previousController: "p3" })).toMatchObject({ gained: 0, isScore: true });
    expect(scoreBattlefield(state, "p1", "B", "conquer", io, { previousController: "p2" })).toMatchObject({ gained: 1, isScore: true });
  });
});

describe("effectiveVictoryScore / findWinner / checkVictory — rules 194.3, 472, 321", () => {
  test("base + player modifier + in-play 'increase the points needed to win' battlefield", () => {
    registry.register("A", { abilities: [{ effect: { amount: 1, type: "increase-victory-score" }, type: "static" }], cardType: "battlefield", id: "A", name: "Climb" });
    const state = createState({ players: { p1: createPlayer("p1", { victoryScoreModifier: 1 }), p2: createPlayer("p2") } });
    expect(effectiveVictoryScore(state, "p1")).toBe(10);
    expect(effectiveVictoryScore(state, "p2")).toBe(9);
  });

  test("board statics `modify-victory-score` on permanents count while their source is on the board (365.1), scoped by `player`", () => {
    registry.register("herald", {
      abilities: [{ effect: { amount: -1, player: "self", type: "modify-victory-score" }, type: "static" }],
      cardType: "unit",
      id: "herald",
      might: 2,
      name: "Herald",
    });
    const state = createState();
    const io = createIO({ "battlefield-A": ["herald"] }, { herald: "p1" });
    expect(effectiveVictoryScore(state, "p1", io)).toBe(7);
    expect(effectiveVictoryScore(state, "p2", io)).toBe(8);
    expect(effectiveVictoryScore(state, "p1", createIO())).toBe(8);
  });

  test("findWinner needs the Victory Score AND strictly more than every opponent (194.2 / 472)", () => {
    const tied = createState({ players: { p1: createPlayer("p1", { victoryPoints: 8 }), p2: createPlayer("p2", { victoryPoints: 8 }) } });
    expect(findWinner(tied)).toBeNull();
    const ahead = createState({ players: { p1: createPlayer("p1", { victoryPoints: 8 }), p2: createPlayer("p2", { victoryPoints: 9 }) } });
    expect(findWinner(ahead)).toBe("p2");
  });

  test("checkVictory is the status/winner writer; it is a no-op while a Chain Item resolves (321) unless immediate (431.3.c.1)", () => {
    const state = createState({ players: { p1: createPlayer("p1", { victoryPoints: 8 }), p2: createPlayer("p2") } });
    withChainItemResolution(() => {
      expect(checkVictory(state)).toBeNull();
      expect(state.status).toBe("playing");
    });
    expect(checkVictory(state)).toBe("p1");
    expect(state.status).toBe("finished");
    expect(state.winner).toBe("p1");
    // idempotent once finished
    expect(checkVictory(state)).toBe("p1");

    const other = createState({ players: { p1: createPlayer("p1"), p2: createPlayer("p2", { victoryPoints: 8 }) } });
    withChainItemResolution(() => {
      expect(checkVictory(other, { immediate: true })).toBe("p2");
    });
    expect(other.status).toBe("finished");
  });
});

describe("burnOut / refillDeckOrBurnOut — rule 431", () => {
  test("burnOut shuffles the trash into the deck and gives each opponent 1 point through awardPoints", () => {
    const state = createState();
    const io = createIO({ "trash:p1": ["t1", "t2"] });
    expect(burnOut(state, "p1", io)).toEqual({ gameEnded: false });
    expect(io.zones.getCardsInZone("mainDeck" as ZoneId, "p1" as CorePlayerId)).toHaveLength(2);
    expect(io.zones.getCardsInZone("trash" as ZoneId, "p1" as CorePlayerId)).toHaveLength(0);
    expect(state.players.p2?.victoryPoints).toBe(1);
    expect(state.players.p1?.victoryPoints).toBe(0);
  });

  test("refillDeckOrBurnOut with an empty deck AND trash repeats until an opponent wins immediately (431.3.a / 431.3.c.1); the first point is deniable, later ones are not (431.3.b)", () => {
    registry.register("denier", { abilities: [DENY_OPPONENTS], cardType: "unit", id: "denier", might: 1, name: "Denier" });
    const state = createState({ players: { p1: createPlayer("p1"), p2: createPlayer("p2", { victoryPoints: 5 }) } });
    // p1 burns out; p1 controls a denier so p2 (its opponent) can't gain — only the first point is stopped.
    const io = createIO({ "base:p1": ["denier"] }, { denier: "p1" });
    expect(refillDeckOrBurnOut(state, "p1", io)).toBe(false);
    expect(state.status).toBe("finished");
    expect(state.winner).toBe("p2");
    expect(state.players.p2?.victoryPoints).toBe(8); // 5 (+0 denied) +1 +1 +1
  });

  test("refillDeckOrBurnOut returns true without burning out when the deck has cards, and after one refill from the trash", () => {
    const state = createState();
    const stocked = createIO({ "mainDeck:p1": ["c1"] });
    expect(refillDeckOrBurnOut(state, "p1", stocked)).toBe(true);
    expect(state.players.p2?.victoryPoints).toBe(0);
    const fromTrash = createIO({ "trash:p1": ["t1"] });
    expect(refillDeckOrBurnOut(state, "p1", fromTrash)).toBe(true);
    expect(state.players.p2?.victoryPoints).toBe(1);
    expect(state.status).toBe("playing");
  });

  test("no-progress guard: with no opponent able to win (tie can never break in their favour is not modelled — cap) the loop terminates", () => {
    const state = createState({ players: { p1: createPlayer("p1") } as never, scoredThisTurn: { p1: [] }, conqueredThisTurn: { p1: [] } });
    const io = createIO();
    expect(refillDeckOrBurnOut(state, "p1", io)).toBe(false);
    expect(state.status).toBe("playing");
  });
});
