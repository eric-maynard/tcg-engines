/**
 * Core rules: the PREGAME — setup sequence, turn-order determination, battlefield selection,
 * opening hand & mulligan, and the first-turn process of each Mode of Play.
 *
 * CARD-INDEPENDENT: every legend / champion / battlefield / main-deck card below is a synthetic
 * inline definition registered into a real engine, and every step is driven with the real pregame
 * moves (rollForFirst, chooseFirstPlayer, placeLegend, placeChampion, selectBattlefield /
 * selectRandomBattlefield, initializeMainDeck, initializeRuneDeck, shuffleDecks, drawInitialHand,
 * mulligan, transitionToPlay, startNextGame).
 *
 * Rules covered (riftbound-rules ids):
 *   107.2.c / 107.4(.a/.b/.d) / 108.2.b/.d / 108.3.b/.e / 108.4(.d) / 108.7(.c/.e)  zones in setup
 *   110–118          the Setup Process, in order, ending with the First Player's first turn
 *   113(.1)          the two unselected battlefields are set aside / removed
 *   114(.1/.2)       both decks are shuffled separately
 *   115(.1.a/.1.b/.1.b.1/.1.c)  a fair random method decides Turn Order; only the winner chooses
 *   116              each player draws four
 *   117(.1/.2/.3)    mulligan, in turn order: set aside ≤ 2 → draw that many → recycle them
 *   128.4 / 128.5    simultaneous actions / hidden information during setup
 *   315.3(.b) / 315.4(.b)  Channel 2 / Draw 1 every turn
 *   416(.1/.1.a/.5/.5.a)  Recycle → bottom; simultaneous Main-Deck recycles are RANDOM, Rune-Deck
 *                    recycles are in the owner's chosen order
 *   430.2.a / 430.4.a  channeled runes enter ready; the Rune Pool is a separate counter
 *   483.7            victory score per Mode of Play
 *   485.3/.4(.a)/.5/.6/.7  Duel: 8 points, 2 battlefields in play from 3 per deck, RANDOM pick,
 *                    the player going second channels +1 on their first Channel Phase
 *   486.4.a/.5(.a)/.6/.7  Match: the player CHOOSES; battlefields used in a decided game leave
 *   487.4(.a)/.5/.7  FFA3: three battlefields, first player skips their first draw, LAST player +1
 *   488.4.a/.4.b/.7  FFA4: three battlefields, the first player contributes none
 *   489.3/.4.a/.5.a/.5.b/.7  2v2 Magma Chamber: three battlefields, team victory score 11
 *   736 / 737 / 738  the turn queue; Additional Turns do not change Turn Order
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import type { CardDefLike, HarnessEngine, InlineCardDef } from "../../harness";
import { Game, P1, P2, P3, P4, getInternalState, loadDefaultCardPool, scenario, toLookupPayload } from "../../harness";
import type { InternalView } from "../../harness/internal";
import { GAME_MODES } from "../../modes/game-modes";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import { isTeamGame } from "../../operations/teams";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

// ===========================================================================
// Pregame driver — a real engine in the `setup` segment with synthetic decks
// ===========================================================================

const TAG = "T";

interface PlayerKit {
  legend: string;
  champion: string;
  bfs: string[];
  main: string[];
  runes: string[];
}

interface Pregame {
  engine: HarnessEngine;
  internal: InternalView;
  kit: Record<string, PlayerKit>;
  players: string[];
  put: (id: string, def: CardDefLike, owner: string) => void;
}

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/**
 * Fresh engine in the `setup` segment: every seat owns a legend (tag T, domains fury+chaos), a
 * tag-matching champion, 3 distinctly named battlefields, `mainCount` filler main-deck cards and
 * 12 runes — all registered but in no zone yet, exactly as the pregame moves expect.
 */
function newPregame(opts: { players?: string[]; seed?: string; mainCount?: number } = {}): Pregame {
  const players = opts.players ?? [P1, P2];
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: HarnessEngine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    players.map((id) => ({ id, name: id })),
    { seed: opts.seed ?? "core-rules-pregame" },
  );
  const internal = getInternalState(engine);
  const registry = getGlobalCardRegistry();
  const put = (id: string, def: CardDefLike, owner: string) => {
    internal.cards[id] = { controller: owner, definitionId: (def.id as string | undefined) ?? id, owner, zone: "staging" };
    internal.cardMetas[id] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false } as never;
    registry.register(id, toLookupPayload(def, id, def.cardType === "rune" ? { cardType: "rune", energyCost: 0 } : undefined));
  };
  const kit: Record<string, PlayerKit> = {};
  for (const p of players) {
    const legend = `${p}-legend`;
    put(legend, { abilities: [], cardType: "legend", championTag: TAG, domain: ["fury", "chaos"], name: `Filler Legend ${p}` }, p);
    const champion = `${p}-champion`;
    put(champion, { abilities: [], cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, keywords: [], might: 4, name: `Hero, ${p}`, tags: [TAG] }, p);
    const bfs = [1, 2, 3].map((i) => {
      const id = `${p}-bf${i}`;
      put(id, { abilities: [], cardType: "battlefield", name: `Filler Field ${p} #${i}` }, p);
      return id;
    });
    const main = Array.from({ length: opts.mainCount ?? 39 }, (_, i) => {
      const id = `${p}-d${i}`;
      put(id, { abilities: [], cardType: "unit", domain: "fury", energyCost: 2, keywords: [], might: 2, name: `Grunt ${i % 13}` }, p);
      return id;
    });
    const runeIds = Array.from({ length: 12 }, (_, i) => {
      const id = `${p}-r${i}`;
      const domain = i < 6 ? "fury" : "chaos";
      put(id, { abilities: [], cardType: "rune", domain, name: `${domain} Rune` }, p);
      return id;
    });
    kit[p] = { bfs, champion, legend, main, runes: runeIds };
  }
  return { engine, internal, kit, players, put };
}

function zone(pg: Pregame, zoneId: string, owner?: string): string[] {
  const ids = pg.internal.zones[zoneId]?.cardIds ?? [];
  return owner ? ids.filter((id: string) => pg.internal.cards[id]?.owner === owner) : [...ids];
}

function setupState(pg: Pregame) {
  return pg.engine.getState().setup;
}

/** Everyone rolls (re-rolling ties) and the roll winner names `first` as First Player. */
function rollAndChoose(pg: Pregame, first: string) {
  for (let round = 0; round < 50 && setupState(pg)?.rollWinner === undefined; round++) {
    for (const p of pg.players) {
      mv(pg.engine, "rollForFirst", p);
    }
  }
  const winner = setupState(pg)?.rollWinner as string;
  expect(winner).toBeDefined();
  expect(mv(pg.engine, "chooseFirstPlayer", winner, { firstPlayerId: first }).success).toBe(true);
}

function placeLegendsAndChampions(pg: Pregame) {
  for (const p of pg.players) {
    expect(mv(pg.engine, "placeLegend", p, { legendId: pg.kit[p]?.legend }).success).toBe(true);
  }
  for (const p of pg.players) {
    expect(mv(pg.engine, "placeChampion", p, { championId: pg.kit[p]?.champion }).success).toBe(true);
  }
}

function selectBattlefields(pg: Pregame, keep: number | Record<string, number> = 0) {
  for (const p of pg.players) {
    const k = typeof keep === "number" ? keep : (keep[p] ?? 0);
    const bfs = pg.kit[p]?.bfs ?? [];
    expect(mv(pg.engine, "selectBattlefield", p, { battlefieldId: bfs[k], discardIds: bfs.filter((_, i) => i !== k) }).success).toBe(true);
  }
}

function initDecks(pg: Pregame) {
  for (const p of pg.players) {
    expect(mv(pg.engine, "initializeMainDeck", p, { cardIds: pg.kit[p]?.main }).success).toBe(true);
    expect(mv(pg.engine, "initializeRuneDeck", p, { runeIds: pg.kit[p]?.runes }).success).toBe(true);
  }
}

function shuffleAll(pg: Pregame) {
  for (const p of pg.players) {
    expect(mv(pg.engine, "shuffleDecks", p).success).toBe(true);
  }
}

function drawHands(pg: Pregame) {
  for (const p of pg.players) {
    expect(mv(pg.engine, "drawInitialHand", p).success).toBe(true);
  }
}

function turnOrder(pg: Pregame, first: string): string[] {
  const i = pg.players.indexOf(first);
  return [...pg.players.slice(i), ...pg.players.slice(0, i)];
}

function mulliganKeepAll(pg: Pregame, first: string) {
  for (const p of turnOrder(pg, first)) {
    expect(mv(pg.engine, "mulligan", p, { keepCards: [] }).success).toBe(true);
  }
}

/** Everything up to and including the opening draw; no mulligans yet. */
function pregameThroughDraw(opts: { players?: string[]; seed?: string; first?: string; mainCount?: number; keep?: number } = {}) {
  const pg = newPregame(opts);
  const first = opts.first ?? (pg.players[0] as string);
  rollAndChoose(pg, first);
  placeLegendsAndChampions(pg);
  selectBattlefields(pg, opts.keep ?? 0);
  initDecks(pg);
  shuffleAll(pg);
  drawHands(pg);
  return { first, pg };
}

/** transitionToPlay + the per-battlefield unit zones the app server creates, wrapped in a Game. */
function startPlay(pg: Pregame, first: string): Game {
  expect(mv(pg.engine, "transitionToPlay", first).success).toBe(true);
  for (const bf of zone(pg, "battlefieldRow")) {
    pg.internal.zones[`battlefield-${bf}`] ??= { cardIds: [], config: { faceDown: false, id: `battlefield-${bf}`, name: bf, ordered: false, visibility: "public" } };
    pg.internal.zones[`facedown-${bf}`] ??= { cardIds: [], config: { faceDown: true, id: `facedown-${bf}`, maxSize: 1, name: bf, ordered: false, visibility: "private" } };
  }
  return Game.attach(pg.engine, { players: turnOrder(pg, first) });
}

function fullPregame(opts: { players?: string[]; seed?: string; first?: string } = {}) {
  const { first, pg } = pregameThroughDraw(opts);
  mulliganKeepAll(pg, first);
  const game = startPlay(pg, first);
  return { first, game, pg };
}

/** Find a seed whose d20 rolls satisfy `pred` (rolls are deterministic per seed). */
function findRollSeed(prefix: string, pred: (rolls: Record<string, number>) => boolean): Pregame {
  for (let i = 0; i < 400; i++) {
    const pg = newPregame({ mainCount: 4, seed: `${prefix}-${i}` });
    for (const p of pg.players) {
      mv(pg.engine, "rollForFirst", p);
    }
    if (pred((setupState(pg)?.rolls ?? {}) as Record<string, number>)) {
      return pg;
    }
  }
  throw new Error(`no seed found for ${prefix}`);
}

// ===========================================================================
// 1. The pregame sequence runs in the order 110–118
// ===========================================================================

describe("1. The pregame sequence runs in the order 110–118 (110, 111, 112, 113, 114, 115, 116, 117, 118)", () => {
  test("the happy path walks roll → choose → legends → champions → battlefields → decks → shuffle → draw → mulligans → play", async () => {
    const pg = newPregame({ seed: "sequence" });
    expect(pg.engine.getState().status).toBe("setup");
    expect(setupState(pg)?.step).toBe("rollForFirst");
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
    expect(setupState(pg)?.step).toBe("chooseFirst");
    const winner = setupState(pg)?.rollWinner as string;
    expect(mv(pg.engine, "chooseFirstPlayer", winner, { firstPlayerId: P1 }).success).toBe(true);
    placeLegendsAndChampions(pg);
    selectBattlefields(pg);
    initDecks(pg);
    shuffleAll(pg);
    drawHands(pg);
    mulliganKeepAll(pg, P1);
    expect(mv(pg.engine, "transitionToPlay", P1).success).toBe(true);
    expect(pg.engine.getState().status).toBe("playing");
    expect(pg.engine.getState().setup).toBeUndefined();
  });

  test("110–118 — a move belonging to a LATER step must be refused and change nothing; the pregame moves have no step gate at all", async () => {
    // Expected: success === false and a byte-identical state for each early move.
    // Actual: drawInitialHand runs before any shuffle, mulligan runs before the opening draw, and
    // transitionToPlay runs before either mulligan (setup.step / setup.pendingMulligan are never
    // consulted), so the whole sequence can be executed out of order.

    // (a) drawInitialHand before shuffleDecks.
    const a = newPregame({ seed: "ooo-draw" });
    rollAndChoose(a, P1);
    placeLegendsAndChampions(a);
    selectBattlefields(a);
    initDecks(a);
    const beforeDraw = zone(a, "mainDeck", P1);
    const early = mv(a.engine, "drawInitialHand", P1);
    expect(early.success).toBe(false);
    expect(zone(a, "hand", P1)).toEqual([]);
    expect(zone(a, "mainDeck", P1)).toEqual(beforeDraw);

    // (b) mulligan before drawInitialHand.
    const b = newPregame({ seed: "ooo-mull" });
    rollAndChoose(b, P1);
    placeLegendsAndChampions(b);
    selectBattlefields(b);
    initDecks(b);
    shuffleAll(b);
    expect(mv(b.engine, "mulligan", P1, { keepCards: [] }).success).toBe(false);

    // (c) transitionToPlay before both mulligans.
    const c = newPregame({ seed: "ooo-transition" });
    rollAndChoose(c, P1);
    placeLegendsAndChampions(c);
    selectBattlefields(c);
    initDecks(c);
    shuffleAll(c);
    drawHands(c);
    expect(mv(c.engine, "transitionToPlay", P1).success).toBe(false);
    expect(c.engine.getState().status).toBe("setup");
    expect(setupState(c)).toBeDefined();
  });
});

// ===========================================================================
// 2. The opening position after setup
// ===========================================================================

describe("2. The opening position after setup is exactly what the rules prescribe (111, 112, 114.1, 114.2, 116, 107.4, 108.3.b/.e, 485.3, 485.4)", () => {
  test("legend & champion zones, 35-card deck, 4-card hand, 12 runes, empty piles, 0–0 at victory score 8 and two uncontrolled battlefields", async () => {
    const { pg } = pregameThroughDraw({ seed: "opening" });
    mulliganKeepAll(pg, P1);
    const game = startPlay(pg, P1);
    const st = game.gameState;
    expect(st.victoryScore).toBe(8); // 485.3 / 483.7
    for (const p of [P1, P2]) {
      const seat = game.seat(p);
      expect(game.cardsAt("legendZone", p)).toEqual([pg.kit[p]?.legend as string]);
      expect(game.cardsAt("championZone", p)).toEqual([pg.kit[p]?.champion as string]);
      expect(seat.trash()).toEqual([]);
      expect(seat.banishment()).toEqual([]);
      expect(seat.base()).toEqual([]);
      expect(seat.points()).toBe(0);
      // The champion and the legend are in their own zones — never countable deck or hand cards.
      expect([...seat.hand(), ...seat.deck()]).not.toContain(pg.kit[p]?.champion as string);
      expect([...seat.hand(), ...seat.deck()]).not.toContain(pg.kit[p]?.legend as string);
    }
    // P2 has not taken a turn yet: 4 in hand, 35 in deck (40 − champion − 4 drawn), 12 runes.
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.p2.deck()).toHaveLength(35);
    expect(game.p2.runeDeck()).toHaveLength(12);
    expect(game.p2.runes()).toEqual([]);
    // 485.4 / 485.5 — exactly TWO battlefields in the row, one per player, nobody controlling one.
    const row = game.cardsAt("battlefieldRow");
    expect(row).toHaveLength(2);
    expect([...row].sort()).toEqual([pg.kit[P1]?.bfs[0], pg.kit[P2]?.bfs[0]].sort() as string[]);
    for (const bf of row) {
      expect(st.battlefields[bf]).toEqual({ contested: false, controller: null, id: bf });
    }
    expect(Object.values(st.battlefields).some((b) => b.controller !== null)).toBe(false);
    // 118 — the First Player is the turn player of turn 1 and the only seat with a menu.
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal()).toEqual([]);
  });

  test("the Legend Zone card cannot be moved out of it and the Champion Zone card is not a unit on the board", async () => {
    const { game, pg } = fullPregame({ seed: "opening-zones" });
    const legend = pg.kit[P1]?.legend as string;
    const champion = pg.kit[P1]?.champion as string;
    expect(game.zoneOf(legend)).toBe("legendZone");
    expect(game.zoneOf(champion)).toBe("championZone");
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    expect((await game.p1.try((s) => s.move(legend, "base"))).ok).toBe(false);
    expect((await game.p1.try((s) => s.do("standardMove", { destination: "base", unitIds: [champion] }))).ok).toBe(false);
    expect(game.zoneOf(legend)).toBe("legendZone");
    expect(game.zoneOf(champion)).toBe("championZone");
  });
});

// ===========================================================================
// 3. Turn order comes from a fair random method
// ===========================================================================

describe("3. Turn Order comes from a fair random method and only the roll winner chooses (115, 115.1, 115.1.a, 115.1.b, 115.1.b.1, 115.1.c)", () => {
  test("the strictly higher d20 wins — including when that is the second seat — and only the winner may chooseFirstPlayer", async () => {
    const higherP2 = findRollSeed("p2-higher", (r) => (r[P2] as number) > (r[P1] as number));
    expect(setupState(higherP2)?.rollWinner).toBe(P2 as never);
    expect(setupState(higherP2)?.step).toBe("chooseFirst");
    expect(mv(higherP2.engine, "chooseFirstPlayer", P1, { firstPlayerId: P1 }).success).toBe(false);
    expect(setupState(higherP2)?.firstPlayer).toBeUndefined();
    const higherP1 = findRollSeed("p1-higher", (r) => (r[P1] as number) > (r[P2] as number));
    expect(setupState(higherP1)?.rollWinner).toBe(P1 as never);
    expect(mv(higherP1.engine, "chooseFirstPlayer", P2, { firstPlayerId: P2 }).success).toBe(false);
  });

  test("the winner may name either player: naming the opponent seats them first, naming themselves keeps the first turn", async () => {
    const a = findRollSeed("names-opponent", (r) => (r[P1] as number) > (r[P2] as number));
    expect(mv(a.engine, "chooseFirstPlayer", P1, { firstPlayerId: P2 }).success).toBe(true);
    expect(setupState(a)?.firstPlayer).toBe(P2 as never);
    expect(setupState(a)?.secondPlayer).toBe(P1 as never);
    const b = findRollSeed("names-self", (r) => (r[P1] as number) > (r[P2] as number));
    expect(mv(b.engine, "chooseFirstPlayer", P1, { firstPlayerId: P1 }).success).toBe(true);
    expect(setupState(b)?.firstPlayer).toBe(P1 as never);
    expect(setupState(b)?.secondPlayer).toBe(P2 as never);
  });

  test("a player cannot roll twice, before or after the other has rolled", async () => {
    const pg = newPregame({ mainCount: 4, seed: "double-roll" });
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    const first = setupState(pg)?.rolls[P1];
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(false);
    expect(setupState(pg)?.rolls[P1]).toBe(first as number);
    expect(setupState(pg)?.rolls[P2]).toBeUndefined();
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(false);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(false);
  });

  test("on EQUAL rolls nobody wins: the rolls are cleared, the step returns to rollForFirst and chooseFirstPlayer is refused for BOTH", async () => {
    const pg = findRollSeed("tie", (r) => r[P1] === r[P2]);
    const s = setupState(pg);
    expect(s?.rollWinner).toBeUndefined();
    expect(s?.step).toBe("rollForFirst");
    // MUST NOT: a tie being awarded to a seat (players[0] / alphabetical order is not a fair method).
    expect(mv(pg.engine, "chooseFirstPlayer", P1, { firstPlayerId: P1 }).success).toBe(false);
    expect(mv(pg.engine, "chooseFirstPlayer", P2, { firstPlayerId: P2 }).success).toBe(false);
    expect(setupState(pg)?.firstPlayer).toBeUndefined();
    // Both may roll again.
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
  });
});

// ===========================================================================
// 4. Duel (Bo1): the battlefield is chosen RANDOMLY by the game
// ===========================================================================

describe("4. Duel (Bo1) battlefield selection is RANDOM, and each player selects exactly once (485.4.a, 485.5, 485.6, 113, 113.1)", () => {
  function throughChampions(seed: string): Pregame {
    const pg = newPregame({ seed });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    return pg;
  }

  test("the pick comes from the seeded RNG (same seed ⇒ same battlefield, different seeds ⇒ at least two different ones) and no player preference is consulted", async () => {
    const kept = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const pg = throughChampions(`duel-random-${i}`);
      const bfs = pg.kit[P1]?.bfs as string[];
      expect(mv(pg.engine, "selectRandomBattlefield", P1, { battlefieldIds: bfs }).success).toBe(true);
      const row = zone(pg, "battlefieldRow", P1);
      expect(row).toHaveLength(1);
      expect(bfs).toContain(row[0] as string);
      expect(zone(pg, "setAside", P1).sort()).toEqual(bfs.filter((b) => b !== row[0]).sort());
      kept.add((row[0] as string).replace(`${P1}-`, ""));
      // Deterministic per seed.
      const replay = throughChampions(`duel-random-${i}`);
      mv(replay.engine, "selectRandomBattlefield", P1, { battlefieldIds: replay.kit[P1]?.bfs ?? [] });
      expect(zone(replay, "battlefieldRow", P1)).toEqual(row);
    }
    expect(kept.size).toBeGreaterThan(1);
  });

  test("after the game has picked, a player-driven selection and a second random pick are both refused; the opponent still gets exactly one and the row totals 2", async () => {
    const pg = throughChampions("duel-once");
    const bfs = pg.kit[P1]?.bfs as string[];
    expect(mv(pg.engine, "selectRandomBattlefield", P1, { battlefieldIds: bfs }).success).toBe(true);
    const row = zone(pg, "battlefieldRow", P1);
    const other = bfs.find((b) => b !== row[0]) as string;
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: other, discardIds: [] }).success).toBe(false);
    expect(mv(pg.engine, "selectRandomBattlefield", P1, { battlefieldIds: bfs }).success).toBe(false);
    expect(zone(pg, "battlefieldRow", P1)).toEqual(row);
    expect(mv(pg.engine, "selectRandomBattlefield", P2, { battlefieldIds: pg.kit[P2]?.bfs ?? [] }).success).toBe(true);
    expect(zone(pg, "battlefieldRow", P2)).toHaveLength(1);
    expect(zone(pg, "battlefieldRow")).toHaveLength(2);
  });
});

// ===========================================================================
// 5. Match (Bo3): the battlefield is CHOSEN, and used ones leave the match
// ===========================================================================

describe("5. Match (Bo3) battlefield selection is CHOSEN by the player, and a decided game removes the battlefields it used (486.4.a, 486.5, 486.5.a, 486.6)", () => {
  test("selectBattlefield(P1, keep = B2) is honoured verbatim and identically across seeds — the choice is deliberate, not random", async () => {
    for (const seed of ["match-a", "match-b", "match-c"]) {
      const pg = newPregame({ seed });
      rollAndChoose(pg, P1);
      placeLegendsAndChampions(pg);
      const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
      expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
      expect(zone(pg, "battlefieldRow", P1)).toEqual([b2]);
      expect(Object.keys(pg.engine.getState().battlefields)).toEqual([b2]);
      // MUST NOT: B1 / B3 entering the row.
      expect(zone(pg, "battlefieldRow")).not.toContain(b1);
      expect(zone(pg, "battlefieldRow")).not.toContain(b3);
      const [c1, c2, c3] = pg.kit[P2]?.bfs as [string, string, string];
      expect(mv(pg.engine, "selectBattlefield", P2, { battlefieldId: c1, discardIds: [c2, c3] }).success).toBe(true);
      expect(zone(pg, "battlefieldRow")).toHaveLength(2);
    }
  });

  test("486.6 — after a decided game the battlefields it used are removed for the rest of the match; the next game must be presented from what is left", async () => {
    // A one-point duel that P1 wins by conquering bf1, then the match-level continuation.
    const game = await scenario()
      .victoryScore(1)
      .battlefield("bf1", { controller: null, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .card("spare", { def: { cardType: "battlefield", name: "Filler Spare Field" }, owner: P1, zone: "hand" })
      .build();
    await game.p1.move("U", "bf1");
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    const raw = (move: string, params: Record<string, unknown> = {}) => mv(game.engine, move, P1, params);
    expect(raw("startNextGame").success).toBe(true);
    const st = game.gameState;
    expect(st.status).toBe("setup");
    expect(st.match?.gameNumber).toBe(2);
    expect(st.match?.results).toEqual([{ winner: P1 }]);
    expect(st.match?.usedBattlefields).toContain("bf1");
    expect(Object.keys(st.battlefields)).toEqual([]);
    // MUST NOT: a used battlefield being selectable again in the next game of the match.
    expect(raw("selectBattlefield", { battlefieldId: "bf1", discardIds: [] }).success).toBe(false);
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);
    // …while a battlefield that has not been used is still available.
    expect(raw("selectBattlefield", { battlefieldId: "spare", discardIds: [] }).success).toBe(true);
    expect(Object.keys(game.gameState.battlefields)).toEqual(["spare"]);
  });
});

// ===========================================================================
// 6. The unselected battlefields are removed / set aside, not trashed
// ===========================================================================

describe("6. The two unselected battlefields are removed / set aside, NOT trashed (485.5, 486.5, 113, 108.2.b, 108.2.d)", () => {
  test("they are in no player-facing zone, the trash stays empty and nothing can count or return them", async () => {
    const pg = newPregame({ seed: "set-aside" });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    for (const z of ["hand", "mainDeck", "runeDeck", "banishment", "battlefieldRow", "trash", "base"]) {
      expect(zone(pg, z)).not.toContain(b1);
      expect(zone(pg, z)).not.toContain(b3);
    }
    // A trash-counting effect sees nothing at all.
    expect(zone(pg, "trash", P1)).toEqual([]);
    expect(zone(pg, "trash")).toEqual([]);
  });
});

// ===========================================================================
// 7. Selections are placed simultaneously — no information leak
// ===========================================================================

describe("7. Selections are placed simultaneously — no information leaks between the two picks (485.5, 486.5, 128.4, 128.5, 107.2.c)", () => {
  test("between P1's selection and P2's, P2's player view must not name P1's battlefield; after both, the row is public", async () => {
    const pg = newPregame({ seed: "simultaneous" });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    const midView = pg.engine.getPlayerView(P2 as CorePlayerId);
    expect(Object.keys(midView.battlefields)).not.toContain(b2);
    const [c1, c2, c3] = pg.kit[P2]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P2, { battlefieldId: c1, discardIds: [c2, c3] }).success).toBe(true);
    const finalView = pg.engine.getPlayerView(P2 as CorePlayerId);
    expect(Object.keys(finalView.battlefields).sort()).toEqual([b2, c1].sort());
  });
});

// ===========================================================================
// 8. Shuffle, then draw exactly four, once
// ===========================================================================

describe("8. Decks are shuffled, then each player draws exactly 4 from the top of their own deck, once (114, 114.1, 114.2, 116, 108.4, 108.4.d, 108.7)", () => {
  test("shuffleDecks permutes BOTH decks and preserves each multiset exactly", async () => {
    const mainOrders: string[][] = [];
    for (const seed of ["shuffle-A", "shuffle-B"]) {
      const pg = newPregame({ seed });
      rollAndChoose(pg, P1);
      placeLegendsAndChampions(pg);
      selectBattlefields(pg);
      initDecks(pg);
      expect(zone(pg, "mainDeck", P1)).toEqual(pg.kit[P1]?.main as string[]);
      expect(zone(pg, "runeDeck", P1)).toEqual(pg.kit[P1]?.runes as string[]);
      shuffleAll(pg);
      const main = zone(pg, "mainDeck", P1);
      const runes = zone(pg, "runeDeck", P1);
      expect(main).not.toEqual(pg.kit[P1]?.main as string[]);
      expect([...main].sort()).toEqual([...(pg.kit[P1]?.main as string[])].sort());
      expect(runes).not.toEqual(pg.kit[P1]?.runes as string[]);
      expect([...runes].sort()).toEqual([...(pg.kit[P1]?.runes as string[])].sort());
      mainOrders.push(main);
    }
    expect(mainOrders[0]).not.toEqual(mainOrders[1]);
  });

  test("drawInitialHand takes the top 4 in order, leaves 35, touches nobody else, and a second call is refused", async () => {
    const pg = newPregame({ seed: "opening-draw" });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    selectBattlefields(pg);
    initDecks(pg);
    shuffleAll(pg);
    const top4 = zone(pg, "mainDeck", P1).slice(0, 4);
    const p2Deck = zone(pg, "mainDeck", P2);
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(true);
    expect(zone(pg, "hand", P1)).toEqual(top4);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(35);
    expect(zone(pg, "runeDeck", P1)).toHaveLength(12);
    // P2 untouched until its own draw.
    expect(zone(pg, "hand", P2)).toEqual([]);
    expect(zone(pg, "mainDeck", P2)).toEqual(p2Deck);
    expect(mv(pg.engine, "drawInitialHand", P2).success).toBe(true);
    expect(zone(pg, "hand", P2)).toEqual(p2Deck.slice(0, 4));
    // The champion and legend are never drawable.
    for (const p of [P1, P2]) {
      expect([...zone(pg, "hand", p), ...zone(pg, "mainDeck", p)]).not.toContain(pg.kit[p]?.champion as string);
      expect([...zone(pg, "hand", p), ...zone(pg, "mainDeck", p)]).not.toContain(pg.kit[p]?.legend as string);
    }
    // MUST NOT: a second opening draw taking the hand to 8.
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(false);
    expect(zone(pg, "hand", P1)).toHaveLength(4);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(35);
  });
});

// ===========================================================================
// 9. Mulligan: draw the replacements FIRST, then recycle
// ===========================================================================

describe("9. Mulligan: draw the replacements FIRST, then recycle the set-aside cards to the bottom (117, 117.1, 117.2, 117.3, 416, 416.1, 416.1.a)", () => {
  test("(a) setting aside nothing leaves hand and deck byte-identical — no draw, no shuffle, no recycle", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-zero" });
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [] }).success).toBe(true);
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
    expect(zone(pg, "trash", P1)).toEqual([]);
  });

  test("(b) setting aside one card: it ends on the BOTTOM, the replacement comes off the top, and no other deck position moves", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-one" });
    const [h0, h1, h2, h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    const [t0, t1] = deck as [string, string];
    // NOTE: the engine's param is (mis)named `keepCards` but holds the cards to SET ASIDE.
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h1] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    expect(hand).toHaveLength(4);
    expect([...hand].sort()).toEqual([h0, h2, h3, t0].sort());
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(35);
    expect(after[0]).toBe(t1);
    expect(after[after.length - 1]).toBe(h1);
    expect(after.slice(0, -1)).toEqual(deck.slice(1)); // no reshuffle
    expect(hand).not.toContain(h1);
    expect(zone(pg, "trash", P1)).not.toContain(h1);
    expect(zone(pg, "banishment", P1)).not.toContain(h1);
    // P2's zones untouched.
    expect(zone(pg, "hand", P2)).toHaveLength(4);
    expect(zone(pg, "mainDeck", P2)).toHaveLength(35);
  });

  test("(c) order of operations on a 3-card deck: the replacements are the OLD top cards, never a card just set aside", async () => {
    const { pg } = pregameThroughDraw({ mainCount: 7, seed: "mull-tiny" }); // 4 drawn, 3 left
    const [h0, h1, h2, h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    expect(deck).toHaveLength(3);
    const [t0, t1, t2] = deck as [string, string, string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0, h3] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    expect([...hand].sort()).toEqual([h1, h2, t0, t1].sort());
    // MUST NOT: a recycle-before-draw handing a player back the card they just set aside.
    expect(hand).not.toContain(h0);
    expect(hand).not.toContain(h3);
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(t2);
    expect(after.slice(1).sort()).toEqual([h0, h3].sort());
  });
});

// ===========================================================================
// 10. Two cards recycled simultaneously reach the bottom in RANDOM order
// ===========================================================================

describe("10. Two cards recycled simultaneously reach the Main Deck bottom in RANDOM order, while Rune-Deck recycles keep the owner's chosen order (416.5, 416.5.a, 117.3)", () => {
  test("the pair ends at the bottom, the deck keeps its length and t2 is on top", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-bottom" });
    const [h0, , , h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    const t2 = deck[2] as string;
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0, h3] }).success).toBe(true);
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(35);
    expect(after[0]).toBe(t2);
    expect([...after.slice(-2)].sort()).toEqual([h0, h3].sort());
    expect(after.slice(0, -2)).toEqual(deck.slice(2));
  });

  test("416.5 — the two simultaneously recycled cards reach the bottom in a RANDOM order", async () => {
    // Expected: across a sample of distinct seeds the relative order of the bottom two varies.
    // Actual: `for (const cardId of toReturn) zones.moveCard({position:"bottom"})` — the named order
    // is preserved verbatim, so a deck-manipulation effect can read the player's own ordering back.
    const orders = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const { pg } = pregameThroughDraw({ seed: `mull-random-${i}` });
      const [h0, , , h3] = zone(pg, "hand", P1) as [string, string, string, string];
      expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0, h3] }).success).toBe(true);
      const bottom2 = zone(pg, "mainDeck", P1).slice(-2);
      expect([...bottom2].sort()).toEqual([h0, h3].sort());
      orders.add(bottom2[0] === h0 ? "named" : "reversed");
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  test("contrast (416.5.a): runes recycled simultaneously are ordered by their OWNER — the pick is surfaced and honoured verbatim", async () => {
    const RECYCLE_RUNES: InlineCardDef = {
      abilities: [{ effect: { amount: 2, type: "recycle", what: "rune" }, type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Filler Rune Return",
      rulesText: "Recycle 2 of your runes.",
      timing: "standard",
    };
    const game = await scenario()
      .rune(P1, "fury", { alias: "rA" })
      .rune(P1, "fury", { alias: "rB" })
      .rune(P1, "fury", { alias: "rC" })
      .hand(P1, RECYCLE_RUNES, "S")
      .build();
    const deck0 = game.p1.runeDeck().length;
    await game.p1.cast("S");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // The owner is asked which runes go back, and in which order.
    const d = game.decision();
    expect(d).toEqual(expect.objectContaining({ kind: "pick", seat: P1 }));
    await game.p1.pick("rC");
    await game.p1.pick("rA");
    const deck = game.p1.runeDeck();
    expect(deck).toHaveLength(deck0 + 2);
    // Bottom in the owner's chosen order — NOT randomized, NOT the pool order.
    expect(deck.slice(-2)).toEqual(["rC", "rA"]);
    expect(game.p1.runes()).toEqual(["rB"]);
  });
});

// ===========================================================================
// 11. Mulligan limits: up to two, once, from your own hand
// ===========================================================================

describe("11. Mulligan is up to two cards, once per player, from that player's own hand (117, 117.1, 117.2, 117.3)", () => {
  test("a three-card request is refused with no zone changes", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-three" });
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    const r = mv(pg.engine, "mulligan", P1, { keepCards: hand.slice(0, 3) });
    expect(r.success).toBe(false);
    // MUST NOT: silently truncating to the first two and succeeding.
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
    expect(hand.filter((id) => zone(pg, "hand", P1).includes(id)).length).toBeGreaterThanOrEqual(2);
  });

  test("a second mulligan by the same player is refused — no London-style chaining", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-twice" });
    const [h0] = zone(pg, "hand", P1) as [string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [hand[0]] }).success).toBe(false);
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
  });

  test("naming a card that is not in that player's hand (their own deck card, or an opponent's hand card) is refused with nothing moving", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-foreign" });
    const p1Hand = zone(pg, "hand", P1);
    const p1Deck = zone(pg, "mainDeck", P1);
    const p2Hand = zone(pg, "hand", P2);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [p1Deck[10] as string] }).success).toBe(false);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [p2Hand[0] as string] }).success).toBe(false);
    expect(zone(pg, "hand", P1)).toEqual(p1Hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(p1Deck);
    expect(zone(pg, "hand", P2)).toEqual(p2Hand);
  });
});

// ===========================================================================
// 12. Mulligans happen in turn order starting with the First Player
// ===========================================================================

describe("12. Mulligans happen in Turn Order starting with the First Player (117, 115.1.b.1, 115.1.c, 118, 108.7.c, 108.7.e)", () => {
  test("with P2 named First Player, P1's mulligan before P2's is refused; after both, P2 is the turn-1 Turn Player", async () => {
    const { pg } = pregameThroughDraw({ first: P2, seed: "order-p2-first" });
    expect(setupState(pg)?.firstPlayer).toBe(P2 as never);
    expect(setupState(pg)?.secondPlayer).toBe(P1 as never);
    const p1Hand = zone(pg, "hand", P1);
    const p1Deck = zone(pg, "mainDeck", P1);
    // MUST NOT: seat index or player-array order standing in for Turn Order.
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [p1Hand[0] as string] }).success).toBe(false);
    expect(zone(pg, "hand", P1)).toEqual(p1Hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(p1Deck);
    expect(mv(pg.engine, "mulligan", P2, { keepCards: [] }).success).toBe(true);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [p1Hand[0] as string] }).success).toBe(true);
    const game = startPlay(pg, P2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(1);
    expect(game.actingSeat()).toBe(P2);
  });

  test("the identity of the exchanged cards stays hidden: P1's view of P2's hand is redacted throughout", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-privacy" });
    const [h0, h1] = zone(pg, "hand", P2) as [string, string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [] }).success).toBe(true);
    expect(mv(pg.engine, "mulligan", P2, { keepCards: [h0, h1] }).success).toBe(true);
    const game = startPlay(pg, P1);
    const handZone = game.p1.view().zones.hand ?? [];
    const p2Cards = handZone.filter((c) => c.owner === P2);
    expect(p2Cards).toHaveLength(4);
    for (const card of p2Cards) {
      expect("hidden" in card && card.hidden === true).toBe(true);
    }
    // Control: P1 sees its own hand cards in full.
    const p1Cards = handZone.filter((c) => c.owner === P1);
    expect(p1Cards.length).toBeGreaterThan(0);
    expect(p1Cards.every((c) => "hidden" in c && c.hidden === true)).toBe(false);
    // The COUNT is public (four cards), the identities are not.
    expect(game.p2.hand()).toHaveLength(4);
  });
});

// ===========================================================================
// 13. Duel first-turn process
// ===========================================================================

describe("13. Duel first-turn process: the player going SECOND channels 3 on their FIRST Channel Phase only (485.7, 486.7, 315.3, 315.3.b, 315.4, 315.4.b, 430.2.a, 430.4.a, 483.7)", () => {
  test("P1 t1: 2 runes / hand 5; P2 t1: 3 runes / hand 5; P1 t2: 2 more; P2 t2: 2 more — and the Rune Pool itself stays 0", async () => {
    const { game } = fullPregame({ seed: "duel-first-turn" });
    // P1's first turn (game turn 1) — the first player DOES draw in a duel.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // 430.4.a
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p1.hand()).toHaveLength(5);
    // Channeling rune CARDS is not filling the Rune Pool (430.2.a).
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p2.runeDeck()).toHaveLength(12);

    await game.advanceTurn(); // P2's first turn (game turn 2)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: true })).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    expect(game.p2.hand()).toHaveLength(5);
    expect(game.p2.energy()).toBe(0);
    // MUST NOT: the bonus reaching the first player.
    expect(game.p1.runes()).toHaveLength(2);

    await game.advanceTurn(); // P1 turn 2
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runeDeck()).toHaveLength(8);
    expect(game.p1.hand()).toHaveLength(6);

    await game.advanceTurn(); // P2 turn 2 — the bonus is one-shot
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
    expect(game.p2.hand()).toHaveLength(6);
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 14. The extra rune is keyed to the second player's FIRST Channel Phase
// ===========================================================================

/** 0-cost plain filler spell: "Take a turn after this one." */
const FILLER_WARP: CardDefLike = {
  abilities: [{ effect: { type: "extra-turn" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  keywords: [],
  name: "Filler Time Loop",
  rulesText: "Take a turn after this one.",
  timing: "standard",
};

/** Setup-style injection of one extra card into `owner`'s hand of a started game. */
function injectIntoHand(pg: Pregame, id: string, def: CardDefLike, owner: string) {
  pg.put(id, def, owner);
  (pg.internal.cards[id] as { zone: string }).zone = "hand";
  pg.internal.zones.hand?.cardIds.push(id);
}

describe("14. The extra rune belongs to the second PLAYER's first Channel Phase, not to game turn 2 (485.7, 736, 737, 738, 315.3.b, 430.4.a)", () => {
  test("P1 takes an additional turn: the queue is P1, P1*, P2, P1, P2 … and on the additional turn P1 channels 2, not 3", async () => {
    const { game, pg } = fullPregame({ seed: "extra-turn-queue" });
    injectIntoHand(pg, "warp", FILLER_WARP, P1);
    expect(game.p1.can("cast", "warp")).toBe(true);
    await game.p1.cast("warp");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    // MUST NOT: the "player going second" bonus landing on P1's additional turn.
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p2.runes()).toHaveLength(0);
    // 737 — Turn Order itself is unchanged.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("on game turn 3 — P2's FIRST turn — P2 channels 3, then 2 per turn afterwards", async () => {
    const { game, pg } = fullPregame({ seed: "extra-turn-bonus" });
    injectIntoHand(pg, "warp", FILLER_WARP, P1);
    await game.p1.cast("warp");
    await game.settle();
    await game.advanceTurn(); // P1's additional turn
    await game.advanceTurn(); // P2's first turn (game turn 3)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    // MUST NOT: booking the bonus against absolute turn number 2 and leaving P2 on 2.
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    await game.advanceTurn(); // P1
    await game.advanceTurn(); // P2's second turn
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
  });

  test("printed cross-check: Time Warp (ogn-122-298, rule 738's own example) queues the same additional turn", async () => {
    const { game, pg } = fullPregame({ seed: "time-warp" });
    const timeWarp = (await loadDefaultCardPool()).get("ogn-122-298") as CardDefLike;
    expect(timeWarp?.name).toBe("Time Warp");
    injectIntoHand(pg, "timewarp", timeWarp, P1);
    await game.p1.do("addResources", { energy: 10, power: { mind: 4 } });
    await game.p1.cast("timewarp");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.p1.runes()).toHaveLength(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    expect(game.p2.runes()).toHaveLength(3);
  });
});

// ===========================================================================
// 15. Cross-mode guard: FFA3 / FFA4 / 2v2 differ from the duel
// ===========================================================================

describe("15. Cross-mode guard: the FFA3 / FFA4 / 2v2 first-turn process differs from the duel's (487.4, 487.4.a, 487.5, 487.7, 488.4.a, 488.4.b, 488.7, 489.3, 489.4.a, 489.5.a, 489.5.b, 489.7, 483.7)", () => {
  test("mode table (642): duel 2 battlefields / VS 8; ffa3 & ffa4 3 battlefields, first player skips their draw; magmaChamber 3 battlefields, team VS 11", async () => {
    expect(GAME_MODES.duel).toEqual(expect.objectContaining({ battlefieldCount: 2, firstPlayerSkipsDraw: false, victoryScore: 8 }));
    expect(GAME_MODES.ffa3).toEqual(expect.objectContaining({ battlefieldCount: 3, firstPlayerSkipsDraw: true, playerCount: 3, victoryScore: 8 }));
    expect(GAME_MODES.ffa4).toEqual(expect.objectContaining({ battlefieldCount: 3, firstPlayerSkipsDraw: true, playerCount: 4, victoryScore: 8 }));
    expect(GAME_MODES.magmaChamber).toEqual(expect.objectContaining({ battlefieldCount: 3, playerCount: 4, teamBased: true, victoryScore: 11 }));
  });

  test("FFA3: three battlefields, victory score 8, the FIRST player draws nothing on their first turn, and ONLY the LAST player channels 3", async () => {
    const { game, pg } = fullPregame({ players: [P1, P2, P3], seed: "ffa3" });
    expect(game.cardsAt("battlefieldRow").sort()).toEqual(
      [pg.kit[P1]?.bfs[0], pg.kit[P2]?.bfs[0], pg.kit[P3]?.bfs[0]].sort() as string[],
    );
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    // 487.7 first clause — the first player skips their first Draw Phase (contrast: 5 in a duel).
    expect(game.p1.hand()).toHaveLength(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    // MUST NOT: a middle player receiving the last-player bonus.
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(10);
    expect(game.p2.hand()).toHaveLength(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P3);
    expect(game.seat(P3).runes()).toHaveLength(3);
    expect(game.seat(P3).runeDeck()).toHaveLength(9);
    expect(game.seat(P3).hand()).toHaveLength(5);
    const p1Hand = game.p1.hand().length;
    await game.advanceTurn(); // P1's second turn — draws normally now
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.runes()).toHaveLength(4);
  });

  test("FFA4: the first player skips their first draw and only the last player channels 3", async () => {
    const { game } = fullPregame({ players: [P1, P2, P3, P4], seed: "ffa4" });
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.runes()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.p2.runes()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.seat(P3).runes()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P4);
    expect(game.seat(P4).runes()).toHaveLength(3);
    expect(game.seat(P4).hand()).toHaveLength(5);
  });

  test("488.4.a/.4.b — in FFA4 the player taking the FIRST turn contributes no battlefield, so the row holds exactly 3; the engine seats one battlefield per player and the row holds 4", async () => {
    // Expected: 3 battlefields in play in a 4-player game, none of them the first player's.
    // Actual: selectBattlefield has no mode awareness — every seat contributes one, so the row is 4.
    const { game, pg } = fullPregame({ players: [P1, P2, P3, P4], seed: "ffa4-battlefields" });
    const row = game.cardsAt("battlefieldRow");
    expect(row).toHaveLength(3);
    expect(row).not.toContain(pg.kit[P1]?.bfs[0] as string);
  });

  test.failing("BUG: 489.3 / 489.5.a — a 2v2 Magma Chamber game uses team victory score 11 with points shared by the team; no Mode of Play reaches the engine, so a 4-player setup is always a solo game at 8", async () => {
    // Expected: a four-player pregame that is a Magma Chamber has teams configured and victoryScore 11.
    // Actual: RiftboundGameState.victoryScore is fixed at 8 by the engine's initial state and
    // `teams` is never populated by any setup move, so isTeamGame(state) is false.
    const { game } = fullPregame({ players: [P1, P2, P3, P4], seed: "magma-chamber" });
    expect(isTeamGame(game.gameState)).toBe(true);
    expect(game.gameState.victoryScore).toBe(11);
  });
});
