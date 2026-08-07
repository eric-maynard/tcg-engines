/**
 * Core rules: Setup, deck construction, battlefield selection, opening hand & mulligan,
 * turn order and first-turn process — CARD-INDEPENDENT (synthetic legend / champion / filler
 * definitions + the real pregame moves).
 *
 * Rules covered (Riftbound Core Rules):
 *   103           a deck = Main Deck + Rune Deck + Champion Legend + Battlefields
 *   103.1(.b)     1 Champion Legend; it dictates Domain Identity
 *   103.2         Main Deck ≥ 40 INCLUDING the Chosen Champion
 *   103.2.a(.1/.2) Chosen Champion: a CHAMPION unit whose champion TAG matches the legend's tag
 *   103.2.b(.1/.2) ≤ 3 copies per full card name (champion-zone copy counts; different names ≠ same card)
 *   103.2.c       main deck subject to Domain Identity
 *   103.2.d(.1/.2/.3) ≤ 3 Signature cards total, all with the legend's tag; signatures are not champions
 *   103.3(.a/.a.1/.b) Rune Deck: exactly 12, in Domain Identity, kept separate
 *   103.4(.a/.b/.c) Battlefields: count by Mode of Play, Domain Identity if applicable, distinct names
 *   107.2 / 107.4 / 108.2.b / 108.3(.b) / 108.4 / 108.7  zones used during setup
 *   110–118       Setup Process: legend → champion → set aside battlefields → shuffle → turn order →
 *                 draw 4 → mulligan in turn order → First Player takes their turn
 *   114(.1/.2)    both decks shuffled separately into their zones
 *   115(.1.a/.1.b/.1.b.1/.1.c/.2)  fair random Turn Order; First Player; looping queue
 *   116           each player draws 4
 *   117(.1/.2/.3) mulligan once, in turn order: set aside ≤ 2 → draw that many → recycle the set-aside
 *   118           First Player takes the first turn
 *   315.3.b / 315.4.b  Channel 2 / Draw 1 each turn
 *   416(.1/.1.a/.5) Recycle = bottom of the Main Deck (simultaneous → random order)
 *   430.4.a       channeled runes enter ready
 *   483.7 / 485.3 / 485.4(.a) / 485.5 / 485.7  Duel: VS 8, 2 battlefields in play from 3 per deck,
 *                 random battlefield, second player channels +1 on their first Channel Phase
 *   486.4.a / 486.5(.a) / 486.6 / 486.7  Match: chosen battlefield, used ones removed after a win
 *   487.4 / 487.5 / 487.7 (488.7 / 489.7)  FFA3: 3 battlefields, first player skips first draw,
 *                 LAST player channels +1
 *   736 / 737 / 738  turn queue; Additional Turns do not change Turn Order
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import type { Domain } from "@tcg/riftbound-types";
import type { BattlefieldCard, Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { DeckBuilder } from "../../deckbuilder/deck-builder";
import { riftboundDefinition } from "../../game-definition/definition";
import type { CardDefLike, HarnessEngine } from "../../harness";
import { Game, P1, P2, P3, getInternalState, loadDefaultCardPool, toLookupPayload } from "../../harness";
import type { InternalView } from "../../harness/internal";
import { GAME_MODES } from "../../modes/game-modes";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { validateDeck } from "../../validators/deck-validators";

// ===========================================================================
// Part A — synthetic typed cards for validateDeck / DeckBuilder
// ===========================================================================

let idCounter = 0;
const nid = () => createCardId(`synthetic-${++idCounter}`);

const TAG = "T";

const legendL = (over: Partial<LegendCard> = {}): LegendCard => ({
  cardType: "legend",
  championTag: TAG,
  domain: ["fury", "chaos"] as Domain[],
  id: nid(),
  name: "Filler Legend, the Placeholder",
  ...over,
});

const championC = (over: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  energyCost: 4,
  id: nid(),
  isChampion: true,
  might: 4,
  name: "Hero, Alpha",
  tags: [TAG],
  ...over,
});

const fillerUnit = (name: string, over: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  energyCost: 2,
  id: nid(),
  might: 2,
  name,
  ...over,
});

/** 13 distinct names × 3 copies = 39 fillers, mixing fury / chaos / dual [fury, chaos]. */
function fillers39(): Card[] {
  const out: Card[] = [];
  for (let n = 0; n < 13; n++) {
    const domain: Domain | Domain[] = n % 3 === 0 ? "fury" : n % 3 === 1 ? "chaos" : (["fury", "chaos"] as Domain[]);
    for (let c = 0; c < 3; c++) {
      out.push(fillerUnit(`Grunt ${String.fromCharCode(65 + n)}`, { domain }));
    }
  }
  return out;
}

function fillersN(n: number): Card[] {
  const base = fillers39();
  while (base.length < n) {
    const i = base.length;
    base.push(fillerUnit(`Extra Grunt ${Math.floor((i - 39) / 3)}`, { domain: "chaos" as Domain }));
  }
  return base.slice(0, n);
}

const rune = (domain: Domain): RuneCard => ({ cardType: "rune", domain, id: nid(), isBasic: true, name: `${domain} Rune` });
const runes12 = (): RuneCard[] => [...Array.from({ length: 6 }, () => rune("fury")), ...Array.from({ length: 6 }, () => rune("chaos"))];

const battlefield = (name: string, over: Partial<BattlefieldCard> = {}): BattlefieldCard => ({ cardType: "battlefield", id: nid(), name, ...over });
const battlefields3 = (): BattlefieldCard[] => [battlefield("Filler Ridge"), battlefield("Filler Marsh"), battlefield("Filler Spire")];

function legalConfig(mode?: "duel" | "match" | "ffa3" | "ffa4" | "magmaChamber") {
  const legend = legendL();
  const chosenChampion = championC();
  return { battlefields: battlefields3(), chosenChampion, legend, mainDeck: [chosenChampion as Card, ...fillers39()], mode, runeDeck: runes12() };
}

function codes(result: { errors: readonly { code: string }[] }): string[] {
  return result.errors.map((e) => e.code);
}

/** Error code of a DeckBuilder AddCardResult (undefined on success). */
function errCode(r: { success: boolean; error?: { code: string } } | { success: true }): string | undefined {
  return "error" in r ? r.error?.code : undefined;
}

// ===========================================================================
// Part B — real pregame driver (RuleEngine + registered synthetic instances)
// ===========================================================================

type Engine = HarnessEngine;

interface PlayerKit {
  legend: string;
  champion: string;
  bfs: string[];
  main: string[];
  runes: string[];
}

interface Pregame {
  engine: Engine;
  internal: InternalView;
  kit: Record<string, PlayerKit>;
  players: string[];
  /** Register one more synthetic instance owned by `owner` (not yet in any zone). */
  put: (id: string, def: CardDefLike, owner: string) => void;
}

function mv(engine: Engine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/**
 * Fresh engine in the `setup` segment with every player's synthetic deck registered:
 * legend (domains fury+chaos, championTag T), champion (tag T), 3 distinctly named battlefields,
 * `mainCount` filler main-deck cards d0..d(n-1) (the champion is already separated → 40-card deck
 * for the default 39) and 12 runes r0..r11.
 */
function newPregame(opts: { players?: string[]; seed?: string; mainCount?: number } = {}): Pregame {
  const players = opts.players ?? [P1, P2];
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: Engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    players.map((id) => ({ id, name: id })),
    { seed: opts.seed ?? "core-rules-setup" },
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

/** Roll for everyone; the roll winner names `first` as First Player. */
function rollAndChoose(pg: Pregame, first: string) {
  // rule 115: a tie clears the rolls and everyone rolls again.
  for (let round = 0; round < 50 && setupState(pg)?.rollWinner === undefined; round++) {
    for (const p of pg.players) {
      expect(mv(pg.engine, "rollForFirst", p).success).toBe(true);
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

/** Each player keeps battlefield index `keep` (default 0) and discards the other two. */
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

/** Turn order starting with `first` (seat order otherwise). */
function turnOrder(pg: Pregame, first: string): string[] {
  const i = pg.players.indexOf(first);
  return [...pg.players.slice(i), ...pg.players.slice(0, i)];
}

function mulliganKeepAll(pg: Pregame, first: string) {
  for (const p of turnOrder(pg, first)) {
    expect(mv(pg.engine, "mulligan", p, { keepCards: [] }).success).toBe(true);
  }
}

/** Everything up to (and including) the opening draw; no mulligans yet. */
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

/** transitionToPlay + battlefield unit zones (as the app server does) + harness Game in turn order. */
function startPlay(pg: Pregame, first: string): Game {
  expect(mv(pg.engine, "transitionToPlay", first).success).toBe(true);
  for (const bf of zone(pg, "battlefieldRow")) {
    pg.internal.zones[`battlefield-${bf}`] ??= { cardIds: [], config: { faceDown: false, id: `battlefield-${bf}`, name: bf, ordered: false, visibility: "public" } };
    pg.internal.zones[`facedown-${bf}`] ??= { cardIds: [], config: { faceDown: true, id: `facedown-${bf}`, maxSize: 1, name: bf, ordered: false, visibility: "private" } };
  }
  return Game.attach(pg.engine, { players: turnOrder(pg, first) });
}

/** Full legal pregame (no cards returned in mulligan) → Game at the First Player's turn 1 main phase. */
function fullPregame(opts: { players?: string[]; seed?: string; first?: string } = {}) {
  const { first, pg } = pregameThroughDraw(opts);
  mulliganKeepAll(pg, first);
  const game = startPlay(pg, first);
  return { first, game, pg };
}

// ===========================================================================
// 1. Minimal legal duel deck validates
// ===========================================================================

describe("Deck construction: a minimal legal deck (103, 103.1, 103.2, 103.2.c, 103.3.a, 103.4.a, 485.4.a, 486.4.a)", () => {
  test("legend + tag-matching champion + 39 in-identity fillers (13 names × 3) + 12 in-identity runes + 3 distinct battlefields: no construction error other than the battlefield-count check", async () => {
    for (const mode of ["duel", "match"] as const) {
      const result = validateDeck(legalConfig(mode));
      expect(codes(result).filter((c) => c !== "WRONG_BATTLEFIELD_COUNT")).toEqual([]);
    }
    // With no mode the count check is skipped entirely and the deck is valid outright.
    const noMode = validateDeck(legalConfig(undefined));
    expect(noMode.valid).toBe(true);
    expect(noMode.errors).toEqual([]);
  });

  test("485.4.a / 486.4.a — a duel/match DECK provides THREE battlefields (2 is the number IN PLAY, 485.4); validateDeck(mode duel|match) rejects 3 with WRONG_BATTLEFIELD_COUNT", async () => {
    // Expected: valid === true, no WRONG_BATTLEFIELD_COUNT for 3 battlefields in duel and match.
    // Actual: BATTLEFIELD_COUNT_BY_MODE.duel/match === 2 conflates "in play" with "in deck".
    for (const mode of ["duel", "match"] as const) {
      const result = validateDeck(legalConfig(mode));
      expect(codes(result)).not.toContain("WRONG_BATTLEFIELD_COUNT");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  test("DeckBuilder: the same list reports isComplete (40 incl. champion, 12 runes, 3 battlefields)", async () => {
    const cfg = legalConfig("duel");
    const pool: Card[] = [cfg.legend, cfg.chosenChampion, ...cfg.mainDeck.slice(1), ...cfg.runeDeck, ...cfg.battlefields];
    const b = new DeckBuilder(pool, "duel");
    b.setLegend(cfg.legend);
    expect(b.setChampion(cfg.chosenChampion).success).toBe(true);
    for (const c of cfg.mainDeck.slice(1)) {
      expect(b.addToMainDeck(c).success).toBe(true);
    }
    for (const r of cfg.runeDeck) {
      expect(b.addToRuneDeck(r).success).toBe(true);
    }
    for (const bf of cfg.battlefields) {
      expect(b.addBattlefield(bf).success).toBe(true);
    }
    const stats = b.getStats();
    expect(stats.mainDeckCount).toBe(40);
    expect(stats.runeDeckCount).toBe(12);
    expect(stats.battlefieldCount).toBe(3);
    expect(stats.requiredBattlefields).toBe(3);
    expect(stats.isComplete).toBe(true);
  });
});

// ===========================================================================
// 2. Main deck minimum 40 includes the Chosen Champion
// ===========================================================================

describe("Main Deck of at least 40 INCLUDING the Chosen Champion (103.2, 103.2.a, 103.2.a.1, 112)", () => {
  test("C + 38 fillers (39) → exactly one MAIN_DECK_TOO_SMALL and nothing else; C + 39 (40) → valid; C + 45 (46) → valid (minimum, not exact)", async () => {
    const legend = legendL();
    const C = championC();
    const small = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, ...fillersN(38)], runeDeck: runes12() });
    expect(small.valid).toBe(false);
    expect(codes(small)).toEqual(["MAIN_DECK_TOO_SMALL"]);
    const exact = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, ...fillersN(39)], runeDeck: runes12() });
    expect(exact.valid).toBe(true);
    const big = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, ...fillersN(45)], runeDeck: runes12() });
    expect(big.valid).toBe(true);
    expect(codes(big).some((c) => /LARGE|BIG|MAX/i.test(c))).toBe(false);
  });

  test("DeckBuilder counts the champion exactly once: champion + 39 → mainDeckCount 40 & complete; + 38 → 39 & incomplete; adding C again via addToMainDeck → 41 (a 2nd copy), not 40", async () => {
    const legend = legendL();
    const C = championC();
    const build = (n: number) => {
      const b = new DeckBuilder([], "duel");
      b.setLegend(legend);
      expect(b.setChampion(C).success).toBe(true);
      for (const c of fillersN(n)) {
        expect(b.addToMainDeck(c).success).toBe(true);
      }
      for (const r of runes12()) {
        b.addToRuneDeck(r);
      }
      for (const bf of battlefields3()) {
        b.addBattlefield(bf);
      }
      return b;
    };
    const b40 = build(39);
    expect(b40.getStats().mainDeckCount).toBe(40);
    expect(b40.getStats().isComplete).toBe(true);
    const b39 = build(38);
    expect(b39.getStats().mainDeckCount).toBe(39);
    expect(b39.getStats().isComplete).toBe(false);
    // The champion-zone copy is already counted; another copy in the list is a SECOND copy.
    expect(b40.addToMainDeck(C).success).toBe(true);
    expect(b40.getStats().mainDeckCount).toBe(41);
    expect(b40.getCopyCounts()[C.name]).toBe(2);
  });
});

// ===========================================================================
// 3. Three copies per name (incl. champion); same character ≠ same name; signature sub-limit
// ===========================================================================

describe("Copy limits: 3 per full card name including the Chosen Champion; signatures ≤ 3 total (103.2.b, 103.2.b.1, 103.2.b.2, 103.2.d)", () => {
  test("4× 'Grunt A' → TOO_MANY_COPIES naming Grunt A; 3× → valid", async () => {
    const legend = legendL();
    const C = championC();
    const list = fillers39(); // already 3× Grunt A
    const four = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, ...list, fillerUnit("Grunt A")], runeDeck: runes12() });
    expect(four.valid).toBe(false);
    expect(codes(four)).toEqual(["TOO_MANY_COPIES"]);
    expect(four.errors[0]?.message).toContain("Grunt A");
    const three = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, ...list], runeDeck: runes12() });
    expect(three.valid).toBe(true);
  });

  test("the champion-zone copy counts toward the 3: C + 2 more 'Hero, Alpha' → valid; C + 3 more (4 total) → TOO_MANY_COPIES (103.2.b.1)", async () => {
    const legend = legendL();
    const C = championC();
    const okList = [C as Card, championC(), championC(), ...fillersN(37)];
    expect(okList).toHaveLength(40);
    const ok = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: okList, runeDeck: runes12() });
    expect(ok.valid).toBe(true);
    const bad = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, championC(), championC(), championC(), ...fillersN(36)], runeDeck: runes12() });
    expect(bad.valid).toBe(false);
    expect(codes(bad)).toEqual(["TOO_MANY_COPIES"]);
    expect(bad.errors[0]?.message).toContain("Hero, Alpha");
    // DeckBuilder mirrors it: after setChampion(C), two more copies are fine, the third extra is refused.
    const b = new DeckBuilder([], "duel");
    b.setLegend(legend);
    b.setChampion(C);
    expect(b.addToMainDeck(championC()).success).toBe(true);
    expect(b.addToMainDeck(championC()).success).toBe(true);
    const third = b.addToMainDeck(championC());
    expect(third.success).toBe(false);
    expect(errCode(third)).toBe("MAX_COPIES");
  });

  test("3× 'Hero, Alpha' + 3× 'Hero, Beta' (both champion units, same tag T, different names) → valid: the limit is per NAME, not per character/tag (103.2.b.2)", async () => {
    const legend = legendL();
    const C = championC();
    const list = [C as Card, championC(), championC(), championC({ name: "Hero, Beta" }), championC({ name: "Hero, Beta" }), championC({ name: "Hero, Beta" }), ...fillersN(34)];
    expect(list).toHaveLength(40);
    const r = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: list, runeDeck: runes12() });
    expect(codes(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  test("signature sub-limit: 3 tag-T non-champion (signature) cards of mixed names → valid; a 4th (different name, each name ≤ 3) → TOO_MANY_SIGNATURE_CARDS (103.2.d, 103.2.d.1)", async () => {
    const legend = legendL();
    const C = championC();
    const sig = (name: string) => fillerUnit(name, { tags: [TAG] });
    const three = validateDeck({
      battlefields: battlefields3(),
      chosenChampion: C,
      legend,
      mainDeck: [C as Card, sig("Sidekick, Loyal"), sig("Sidekick, Loyal"), sig("Familiar, Fierce"), ...fillersN(36)],
      runeDeck: runes12(),
    });
    expect(three.valid).toBe(true);
    const four = validateDeck({
      battlefields: battlefields3(),
      chosenChampion: C,
      legend,
      mainDeck: [C as Card, sig("Sidekick, Loyal"), sig("Sidekick, Loyal"), sig("Familiar, Fierce"), sig("Relic, Ancient"), ...fillersN(35)],
      runeDeck: runes12(),
    });
    expect(four.valid).toBe(false);
    expect(codes(four)).toEqual(["TOO_MANY_SIGNATURE_CARDS"]);
    // Champion units with tag T are NOT signature cards (103.2.d.3) and do not count toward this sub-limit.
    const champs = validateDeck({
      battlefields: battlefields3(),
      chosenChampion: C,
      legend,
      mainDeck: [C as Card, championC(), championC(), sig("Sidekick, Loyal"), sig("Sidekick, Loyal"), sig("Familiar, Fierce"), ...fillersN(34)],
      runeDeck: runes12(),
    });
    expect(champs.valid).toBe(true);
  });

  test("103.2.d.2 — a Signature card whose champion tag is NOT the legend's tag must be rejected; validateDeck has no notion of 'signature' beyond 'non-champion sharing the legend tag' and accepts it", async () => {
    // Expected: valid === false with a signature-tag error for a signature card tagged "U" under a tag-"T" legend.
    // Actual: the card is simply not counted as a signature and the deck validates.
    const legend = legendL();
    const C = championC();
    const foreignSignature = { ...fillerUnit("Stranger's Familiar", { tags: ["U"] }), isSignature: true } as unknown as Card;
    const r = validateDeck({ battlefields: battlefields3(), chosenChampion: C, legend, mainDeck: [C as Card, foreignSignature, ...fillersN(38)], runeDeck: runes12() });
    expect(r.valid).toBe(false);
    expect(codes(r).some((c) => /SIGNATURE/.test(c))).toBe(true);
  });
});

// ===========================================================================
// 4. Rune deck: exactly 12, in domain
// ===========================================================================

describe("Rune Deck: exactly 12 rune cards of the legend's Domain Identity (103.3, 103.3.a, 103.3.a.1, 103.3.b)", () => {
  test("11 → RUNE_DECK_WRONG_SIZE; 13 → RUNE_DECK_WRONG_SIZE; 12 → valid (exact, not 'at least')", async () => {
    const cfg = legalConfig();
    const eleven = validateDeck({ ...cfg, runeDeck: cfg.runeDeck.slice(0, 11) });
    expect(eleven.valid).toBe(false);
    expect(codes(eleven)).toEqual(["RUNE_DECK_WRONG_SIZE"]);
    const thirteen = validateDeck({ ...cfg, runeDeck: [...cfg.runeDeck, rune("fury")] });
    expect(thirteen.valid).toBe(false);
    expect(codes(thirteen)).toEqual(["RUNE_DECK_WRONG_SIZE"]);
    expect(validateDeck(cfg).valid).toBe(true);
  });

  test("12 runes with one off-identity (calm under a fury/chaos legend) → RUNE_DOMAIN_VIOLATION and NO size error", async () => {
    const cfg = legalConfig();
    const r = validateDeck({ ...cfg, runeDeck: [...cfg.runeDeck.slice(0, 11), rune("calm")] });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(["RUNE_DOMAIN_VIOLATION"]);
  });

  test("DeckBuilder: runeDeckCount 12 is required for isComplete; 11 → incomplete; a 13th rune is refused (RUNE_DECK_FULL); off-identity rune refused (RUNE_DOMAIN)", async () => {
    const cfg = legalConfig();
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    b.setChampion(cfg.chosenChampion);
    for (const c of cfg.mainDeck.slice(1)) {
      b.addToMainDeck(c);
    }
    for (const bf of cfg.battlefields) {
      b.addBattlefield(bf);
    }
    for (const r of cfg.runeDeck.slice(0, 11)) {
      expect(b.addToRuneDeck(r).success).toBe(true);
    }
    expect(b.getStats().runeDeckCount).toBe(11);
    expect(b.getStats().isComplete).toBe(false);
    const off = b.addToRuneDeck(rune("calm"));
    expect(off.success).toBe(false);
    expect(errCode(off)).toBe("RUNE_DOMAIN");
    expect(b.addToRuneDeck(cfg.runeDeck[11] as RuneCard).success).toBe(true);
    expect(b.getStats().runeDeckCount).toBe(12);
    expect(b.getStats().isComplete).toBe(true);
    const extra = b.addToRuneDeck(rune("chaos"));
    expect(extra.success).toBe(false);
    expect(errCode(extra)).toBe("RUNE_DECK_FULL");
    expect(b.getStats().runeDeckCount).toBe(12);
  });
});

// ===========================================================================
// 5. Chosen Champion must be a champion unit sharing the legend's TAG
// ===========================================================================

describe("Chosen Champion: a CHAMPION unit whose champion tag matches the Champion Legend's tag (103.1, 103.2.a.2, 103.2.d.3, 108.3.b)", () => {
  test("champion unit tagged ['U'] under a tag-T legend → CHAMPION_TAG_MISMATCH; DeckBuilder.setChampion → TAG_MISMATCH", async () => {
    const cfg = legalConfig();
    const wrong = championC({ name: "Hero, Outsider", tags: ["U"] });
    const r = validateDeck({ ...cfg, chosenChampion: wrong, mainDeck: [wrong as Card, ...cfg.mainDeck.slice(1)] });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(["CHAMPION_TAG_MISMATCH"]);
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    const res = b.setChampion(wrong);
    expect(res.success).toBe(false);
    expect(errCode(res)).toBe("TAG_MISMATCH");
    expect(b.getState().chosenChampion).toBeNull();
  });

  test("a NON-champion (signature-shaped) unit carrying the right tag T → CHAMPION_NOT_CHAMPION_UNIT / NOT_CHAMPION — the tag alone is not sufficient (103.2.a.2 ex. 2, 103.2.d.3)", async () => {
    const cfg = legalConfig();
    const tibbersShape = fillerUnit("Familiar, Fierce", { isChampion: false, tags: [TAG] });
    const r = validateDeck({ ...cfg, chosenChampion: tibbersShape, mainDeck: [tibbersShape as Card, ...cfg.mainDeck.slice(1)] });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(["CHAMPION_NOT_CHAMPION_UNIT"]);
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    const res = b.setChampion(tibbersShape);
    expect(res.success).toBe(false);
    expect(errCode(res)).toBe("NOT_CHAMPION");
  });

  test("champion tagged ['T', 'X'] (contains the legend's tag among others) → valid", async () => {
    const cfg = legalConfig();
    const multi = championC({ name: "Hero, Wanderer", tags: [TAG, "X"] });
    const r = validateDeck({ ...cfg, chosenChampion: multi, mainDeck: [multi as Card, ...cfg.mainDeck.slice(1)] });
    expect(codes(r)).toEqual([]);
    expect(r.valid).toBe(true);
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    expect(b.setChampion(multi).success).toBe(true);
  });

  test("matching is on the legend's champion TAG, never its NAME: legend named 'Blade Dancer' with championTag 'Z' rejects a champion tagged 'Blade Dancer' and accepts one tagged 'Z'", async () => {
    const legend = legendL({ championTag: "Z", name: "Blade Dancer" });
    const byName = championC({ name: "Blade Dancer, Reborn", tags: ["Blade Dancer"] });
    const byTag = championC({ name: "Someone, Else", tags: ["Z"] });
    const bad = validateDeck({ battlefields: battlefields3(), chosenChampion: byName, legend, mainDeck: [byName as Card, ...fillers39()], runeDeck: runes12() });
    expect(bad.valid).toBe(false);
    expect(codes(bad)).toEqual(["CHAMPION_TAG_MISMATCH"]);
    const good = validateDeck({ battlefields: battlefields3(), chosenChampion: byTag, legend, mainDeck: [byTag as Card, ...fillers39()], runeDeck: runes12() });
    expect(good.valid).toBe(true);
    const b = new DeckBuilder([legend, byName, byTag] as Card[], "duel");
    b.setLegend(legend);
    expect(b.getLegalChampions().map((c) => c.name)).toEqual(["Someone, Else"]);
  });
});

// ===========================================================================
// 6. Battlefields: three, distinct names, in identity
// ===========================================================================

describe("Battlefields: exactly three per deck, distinct names, Domain Identity if applicable (103.4, 103.4.a, 103.4.b, 103.4.c, 485.4.a, 486.4.a)", () => {
  test("103.4.c — two battlefields sharing a name must be rejected by validateDeck", async () => {
    // Expected: valid === false with a duplicate-battlefield error for [Ridge, Ridge, Marsh].
    // Actual: validateDeck only checks domain and (mode) count; duplicates pass.
    const cfg = legalConfig();
    const r = validateDeck({ ...cfg, battlefields: [battlefield("Filler Ridge"), battlefield("Filler Ridge"), battlefield("Filler Marsh")] });
    expect(r.valid).toBe(false);
    expect(codes(r).some((c) => /DUPLICATE|SAME_NAME|BATTLEFIELD_NAME/i.test(c))).toBe(true);
  });

  test("DeckBuilder.addBattlefield refuses a same-named second copy (BF_DUPLICATE) and leaves the count unchanged; a 4th distinct one is BF_FULL", async () => {
    const cfg = legalConfig();
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    expect(b.addBattlefield(battlefield("Filler Ridge")).success).toBe(true);
    const dup = b.addBattlefield(battlefield("Filler Ridge"));
    expect(dup.success).toBe(false);
    expect(errCode(dup)).toBe("BF_DUPLICATE");
    expect(b.getStats().battlefieldCount).toBe(1);
    expect(b.addBattlefield(battlefield("Filler Marsh")).success).toBe(true);
    expect(b.addBattlefield(battlefield("Filler Spire")).success).toBe(true);
    const fourth = b.addBattlefield(battlefield("Filler Delta"));
    expect(fourth.success).toBe(false);
    expect(errCode(fourth)).toBe("BF_FULL");
    expect(b.getStats().battlefieldCount).toBe(3);
    expect(b.getRequiredBattlefieldCount()).toBe(3);
  });

  test("4 battlefields under mode duel / match → rejected (WRONG_BATTLEFIELD_COUNT)", async () => {
    const cfg = legalConfig();
    for (const mode of ["duel", "match"] as const) {
      const r = validateDeck({ ...cfg, battlefields: [...battlefields3(), battlefield("Filler Delta")], mode });
      expect(r.valid).toBe(false);
      expect(codes(r)).toContain("WRONG_BATTLEFIELD_COUNT");
    }
  });

  test("485.4.a / 486.4.a — only TWO battlefields in a duel/match deck must be rejected (the deck provides 3; 2 is merely how many end up in play) — validateDeck accepts 2", async () => {
    // Expected: WRONG_BATTLEFIELD_COUNT (or equivalent) for a 2-battlefield deck in duel and match.
    // Actual: BATTLEFIELD_COUNT_BY_MODE.duel === 2, so 2 validates and 3 is what gets rejected.
    const cfg = legalConfig();
    for (const mode of ["duel", "match"] as const) {
      const r = validateDeck({ ...cfg, battlefields: battlefields3().slice(0, 2), mode });
      expect(r.valid).toBe(false);
      expect(codes(r)).toContain("WRONG_BATTLEFIELD_COUNT");
    }
  });

  test("a battlefield carrying an off-identity domain (calm) → BATTLEFIELD_DOMAIN_VIOLATION; a domainless battlefield is allowed (103.4.b 'if applicable')", async () => {
    const cfg = legalConfig();
    const off = validateDeck({ ...cfg, battlefields: [battlefield("Filler Ridge"), battlefield("Filler Marsh"), battlefield("Calm Lagoon", { domain: "calm" as Domain })] });
    expect(off.valid).toBe(false);
    expect(codes(off)).toEqual(["BATTLEFIELD_DOMAIN_VIOLATION"]);
    const inIdentity = validateDeck({ ...cfg, battlefields: [battlefield("Filler Ridge"), battlefield("Fury Peak", { domain: "fury" as Domain }), battlefield("Plain Field")] });
    expect(inIdentity.valid).toBe(true);
    const b = new DeckBuilder([], "duel");
    b.setLegend(cfg.legend);
    const res = b.addBattlefield(battlefield("Calm Lagoon", { domain: "calm" as Domain }));
    expect(res.success).toBe(false);
    expect(errCode(res)).toBe("BF_DOMAIN");
    expect(b.addBattlefield(battlefield("Plain Field")).success).toBe(true);
  });
});

// ===========================================================================
// 7. Pregame sequence → correct opening position
// ===========================================================================

describe("Pregame sequence produces the correct opening position (110–118, 485.3, 485.4, 485.5, 107.4, 108.3)", () => {
  test("roll → (only the roll winner may) choose first → legends → champions → battlefields → decks → shuffle → draw 4 → mulligans → play: zones, scores, battlefields and turn are exactly as the rules prescribe", async () => {
    const pg = newPregame({ seed: "opening-position" });
    // 115: both roll; step advances; the roll winner is recorded.
    expect(setupState(pg)?.step).toBe("rollForFirst");
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
    expect(setupState(pg)?.step).toBe("chooseFirst");
    const winner = setupState(pg)?.rollWinner as string;
    expect([P1, P2]).toContain(winner);
    const loser = winner === P1 ? P2 : P1;
    // Only the roll winner may choose; the loser's attempt fails and changes nothing.
    const denied = mv(pg.engine, "chooseFirstPlayer", loser, { firstPlayerId: loser });
    expect(denied.success).toBe(false);
    expect(setupState(pg)?.step).toBe("chooseFirst");
    expect(setupState(pg)?.firstPlayer).toBeUndefined();
    expect(mv(pg.engine, "chooseFirstPlayer", winner, { firstPlayerId: P1 }).success).toBe(true);
    expect(setupState(pg)?.firstPlayer).toBe(P1 as never);
    expect(setupState(pg)?.secondPlayer).toBe(P2 as never);
    // 111 / 112 / 113 / 114 / 116 / 117.
    placeLegendsAndChampions(pg);
    selectBattlefields(pg, 0);
    initDecks(pg);
    shuffleAll(pg);
    drawHands(pg);
    for (const p of [P1, P2]) {
      expect(zone(pg, "hand", p)).toHaveLength(4);
      expect(zone(pg, "mainDeck", p)).toHaveLength(35);
    }
    mulliganKeepAll(pg, P1);
    const game = startPlay(pg, P1);

    // --- 118: play has begun with the First Player's turn 1 (its Channel + Draw already performed).
    const st = game.gameState;
    expect(st.status).toBe("playing");
    expect(st.setup).toBeUndefined();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.actingSeat()).toBe(P1);
    expect(st.victoryScore).toBe(8); // 485.3
    for (const p of [P1, P2]) {
      const seat = game.seat(p);
      expect(seat.legend()).toBe(pg.kit[p]?.legend);
      expect(game.cardsAt("legendZone", p)).toEqual([pg.kit[p]?.legend as string]);
      expect(seat.champion()).toBe(pg.kit[p]?.champion);
      expect(game.cardsAt("championZone", p)).toEqual([pg.kit[p]?.champion as string]);
      expect(seat.points()).toBe(0);
      expect(seat.resources()).toEqual({ energy: 0, power: {} });
      expect(seat.base()).toEqual([]);
      // The champion / legend are in their own zones — never in the deck or hand.
      expect([...seat.hand(), ...seat.deck()]).not.toContain(pg.kit[p]?.champion as string);
      expect([...seat.hand(), ...seat.deck()]).not.toContain(pg.kit[p]?.legend as string);
    }
    // P2 (going second) is still in its post-mulligan position: 4 in hand, 35 in deck, 12 runes in the rune deck, none channeled.
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.p2.deck()).toHaveLength(35);
    expect(game.p2.runeDeck()).toHaveLength(12);
    expect(game.p2.runes()).toEqual([]);
    // P1 has taken its first Channel (2 runes, ready, no energy yet) and Draw (hand 5).
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.p1.deck()).toHaveLength(34);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p1.energy()).toBe(0);
    // 485.4 / 485.5: exactly two battlefields in play, one from each player, uncontrolled and uncontested.
    const row = game.cardsAt("battlefieldRow");
    expect(row.sort()).toEqual([pg.kit[P1]?.bfs[0], pg.kit[P2]?.bfs[0]].sort() as string[]);
    expect(Object.keys(st.battlefields).sort()).toEqual([...row].sort());
    for (const bf of row) {
      expect(st.battlefields[bf]).toEqual({ contested: false, controller: null, id: bf });
    }
    // MUST NOT: any battlefield controlled, more than 2 in the row, P2 pre-channeled, wrong first player.
    expect(Object.values(st.battlefields).some((b) => b.controller !== null)).toBe(false);
    expect(row).toHaveLength(2);
    expect(game.p1.legal().some((o) => o.moveId === "endTurn")).toBe(true);
    expect(game.p2.legal()).toEqual([]);
  });
});

// ===========================================================================
// 8. Opening hand is exactly four from a shuffled deck
// ===========================================================================

describe("Opening hand: decks are shuffled, then each player draws exactly 4 from the top of their own Main Deck (114, 114.1, 114.2, 116, 108.4, 108.7)", () => {
  test("shuffleDecks actually permutes the main AND rune deck (order ≠ insertion order, differs between two independent shuffles) while preserving the multiset", async () => {
    const orders: string[][] = [];
    const runeOrders: string[][] = [];
    for (const seed of ["shuffle-A", "shuffle-B"]) {
      const pg = newPregame({ seed });
      rollAndChoose(pg, P1);
      placeLegendsAndChampions(pg);
      selectBattlefields(pg);
      initDecks(pg);
      expect(zone(pg, "mainDeck", P1)).toEqual(pg.kit[P1]?.main as string[]); // insertion order d0..d38 before shuffling
      expect(zone(pg, "runeDeck", P1)).toEqual(pg.kit[P1]?.runes as string[]);
      shuffleAll(pg);
      const after = zone(pg, "mainDeck", P1);
      expect(after).not.toEqual(pg.kit[P1]?.main as string[]);
      expect([...after].sort()).toEqual([...(pg.kit[P1]?.main as string[])].sort());
      const runesAfter = zone(pg, "runeDeck", P1);
      expect(runesAfter).not.toEqual(pg.kit[P1]?.runes as string[]);
      expect([...runesAfter].sort()).toEqual([...(pg.kit[P1]?.runes as string[])].sort());
      orders.push(after);
      runeOrders.push(runesAfter);
    }
    expect(orders[0]).not.toEqual(orders[1]);
  });

  test("drawInitialHand(P1): hand === the 4 ids that were on top of P1's shuffled deck, in order; deck 39 → 35; P2 untouched until its own draw; rune deck untouched (12); champion/legend never drawable", async () => {
    const pg = newPregame({ seed: "opening-draw" });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    selectBattlefields(pg);
    initDecks(pg);
    shuffleAll(pg);
    const top4 = zone(pg, "mainDeck", P1).slice(0, 4);
    const p2DeckBefore = zone(pg, "mainDeck", P2);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(39);
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(true);
    expect(zone(pg, "hand", P1)).toEqual(top4);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(35);
    expect(zone(pg, "mainDeck", P1)).not.toContain(top4[0] as string);
    // P2: nothing drawn yet, deck unchanged.
    expect(zone(pg, "hand", P2)).toEqual([]);
    expect(zone(pg, "mainDeck", P2)).toEqual(p2DeckBefore);
    expect(mv(pg.engine, "drawInitialHand", P2).success).toBe(true);
    expect(zone(pg, "hand", P2)).toEqual(p2DeckBefore.slice(0, 4));
    // Rune decks untouched by the opening draw; champion & legend stay in their zones.
    for (const p of [P1, P2]) {
      expect(zone(pg, "runeDeck", p)).toHaveLength(12);
      expect(zone(pg, "runePool", p)).toEqual([]);
      expect(zone(pg, "championZone", p)).toEqual([pg.kit[p]?.champion as string]);
      expect(zone(pg, "legendZone", p)).toEqual([pg.kit[p]?.legend as string]);
      expect([...zone(pg, "hand", p), ...zone(pg, "mainDeck", p)]).not.toContain(pg.kit[p]?.champion as string);
    }
  });

  test("116 — the opening draw happens once: a second drawInitialHand(P1) must be refused (or be a no-op); the engine draws 4 more (hand 8)", async () => {
    // Expected: success === false (or hand still 4). Actual: no condition on drawInitialHand → hand becomes 8, deck 31.
    const pg = newPregame({ seed: "double-draw" });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    selectBattlefields(pg);
    initDecks(pg);
    shuffleAll(pg);
    expect(mv(pg.engine, "drawInitialHand", P1).success).toBe(true);
    const again = mv(pg.engine, "drawInitialHand", P1);
    expect(zone(pg, "hand", P1)).toHaveLength(4);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(35);
    expect(again.success).toBe(false);
  });
});

// ===========================================================================
// 9. Mulligan: return 0 / 1 / 2 → draw replacements THEN recycle to the bottom
// ===========================================================================

describe("Mulligan mechanics: set aside ≤ 2 → draw that many → recycle the set-aside cards to the BOTTOM (117, 117.1, 117.2, 117.3, 416, 416.1, 416.1.a, 416.5)", () => {
  test("(a) returning nothing leaves hand and deck byte-identical", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-zero" });
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [] }).success).toBe(true);
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
    expect(zone(pg, "trash", P1).filter((id) => !id.includes("-bf"))).toEqual([]);
  });

  test("(b) returning one card h1: hand === {h0,h2,h3,t0} (size 4); deck length unchanged (35); t1 now on top; h1 is the BOTTOM card; h1 not in hand/trash/banishment; rest of the deck order untouched (no shuffle)", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-one" });
    const [h0, h1, h2, h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    const [t0, t1] = deck as [string, string];
    // NOTE: the engine's param is (mis)named `keepCards` but holds the cards to RETURN.
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h1] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    expect(hand).toHaveLength(4);
    expect([...hand].sort()).toEqual([h0, h2, h3, t0].sort());
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(35);
    expect(after[0]).toBe(t1);
    expect(after[after.length - 1]).toBe(h1);
    expect(after.slice(0, -1)).toEqual(deck.slice(1)); // same order, just t0 gone and h1 appended
    expect(zone(pg, "trash", P1)).not.toContain(h1);
    expect(zone(pg, "banishment", P1)).not.toContain(h1);
    expect(hand).not.toContain(h1);
    // P2's zones untouched by P1's mulligan.
    expect(zone(pg, "hand", P2)).toHaveLength(4);
    expect(zone(pg, "mainDeck", P2)).toHaveLength(35);
  });

  test("(c) returning two cards {h0,h3}: hand === {h1,h2,t0,t1}; deck length 35; the bottom two are {h0,h3} in either order (416.5) and t2 is on top", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-two" });
    const [h0, h1, h2, h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    const [t0, t1, t2] = deck as [string, string, string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0, h3] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    expect([...hand].sort()).toEqual([h1, h2, t0, t1].sort());
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(35);
    expect(after[0]).toBe(t2);
    expect(after.slice(-2).sort()).toEqual([h0, h3].sort());
    expect(after.slice(0, -2)).toEqual(deck.slice(2));
    expect(zone(pg, "trash", P1)).not.toContain(h0);
    expect(zone(pg, "trash", P1)).not.toContain(h3);
  });

  test("(c′) order of operations with a tiny deck: 3 cards left [t0,t1,t2], return {h0,h3} → replacements are t0,t1 (never a returned card), deck becomes [t2, {h0,h3}]", async () => {
    const { pg } = pregameThroughDraw({ mainCount: 7, seed: "mull-tiny" }); // 4 to hand, 3 remain
    const [h0, h1, h2, h3] = zone(pg, "hand", P1) as [string, string, string, string];
    const deck = zone(pg, "mainDeck", P1);
    expect(deck).toHaveLength(3);
    const [t0, t1, t2] = deck as [string, string, string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0, h3] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    expect([...hand].sort()).toEqual([h1, h2, t0, t1].sort());
    expect(hand).not.toContain(h0);
    expect(hand).not.toContain(h3);
    const after = zone(pg, "mainDeck", P1);
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(t2);
    expect(after.slice(1).sort()).toEqual([h0, h3].sort());
  });
});

// ===========================================================================
// 10. Mulligan: at most two cards, only once, only your own hand cards
// ===========================================================================

describe("Mulligan limits: up to two cards, performed once per player, from that player's own hand (117, 117.1, 117.2, 117.3)", () => {
  test("asking to return three never moves more than two cards out of the hand (hand stays 4, deck stays 35, ≥ 2 of the original hand kept)", async () => {
    const { pg } = pregameThroughDraw({ seed: "mull-three" });
    const original = zone(pg, "hand", P1);
    mv(pg.engine, "mulligan", P1, { keepCards: original.slice(0, 3) });
    const hand = zone(pg, "hand", P1);
    expect(hand).toHaveLength(4);
    expect(zone(pg, "mainDeck", P1)).toHaveLength(35);
    expect(hand.filter((id) => original.includes(id)).length).toBeGreaterThanOrEqual(2);
  });

  test("117.1 'up to two' — a 3-card mulligan request must be REJECTED (success:false, state unchanged); the engine silently truncates to the first two and succeeds", async () => {
    // Expected: success === false and hand/deck byte-identical. Actual: slice(0, 2) → a 2-card mulligan is performed.
    const { pg } = pregameThroughDraw({ seed: "mull-three-reject" });
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    const r = mv(pg.engine, "mulligan", P1, { keepCards: hand.slice(0, 3) });
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
    expect(r.success).toBe(false);
  });

  test("117 (once per player) — after a completed 1-card mulligan a SECOND mulligan by the same player must be refused; the engine performs it (no 'London' chaining allowed)", async () => {
    // Expected: second call success === false, zones unchanged. Actual: no condition → another draw+recycle happens.
    const { pg } = pregameThroughDraw({ seed: "mull-twice" });
    const [h0] = zone(pg, "hand", P1) as [string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0] }).success).toBe(true);
    const hand = zone(pg, "hand", P1);
    const deck = zone(pg, "mainDeck", P1);
    const second = mv(pg.engine, "mulligan", P1, { keepCards: [hand[0]] });
    expect(zone(pg, "hand", P1)).toEqual(hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(deck);
    expect(second.success).toBe(false);
  });

  test("117.1 'cards in their hand' — returning an id that is NOT in P1's hand (a P1 deck card, or a P2 hand card) must be rejected with no zone changes; the engine draws for P1 and moves the foreign card anyway", async () => {
    // Expected: both calls fail; every zone unchanged. Actual: P1 draws a replacement and the named card is
    // spliced to the bottom of the (shared) main-deck zone regardless of where it was or who owns it.
    const { pg } = pregameThroughDraw({ seed: "mull-foreign" });
    const p1Hand = zone(pg, "hand", P1);
    const p1Deck = zone(pg, "mainDeck", P1);
    const p2Hand = zone(pg, "hand", P2);
    const deckCard = p1Deck[10] as string;
    const r1 = mv(pg.engine, "mulligan", P1, { keepCards: [deckCard] });
    const r2 = mv(pg.engine, "mulligan", P1, { keepCards: [p2Hand[0]] });
    expect(zone(pg, "hand", P1)).toEqual(p1Hand);
    expect(zone(pg, "mainDeck", P1)).toEqual(p1Deck);
    expect(zone(pg, "hand", P2)).toEqual(p2Hand);
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });
});

// ===========================================================================
// 11. Mulligan in turn order; the chosen First Player starts
// ===========================================================================

describe("Mulligans happen in Turn Order starting with the First Player, and the First Player takes turn 1 (115, 115.1.a, 115.1.b.1, 115.1.c, 117, 118, 736)", () => {
  test("roll winner names P2 as First Player → setup.firstPlayer P2 / secondPlayer P1; after mulligans (P2 then P1) transitionToPlay makes P2 the turn-1 Turn Player and books the extra-rune bonus for P1 (the player going second), not P2", async () => {
    const { pg } = pregameThroughDraw({ first: P2, seed: "p2-first" });
    expect(setupState(pg)?.firstPlayer).toBe(P2 as never);
    expect(setupState(pg)?.secondPlayer).toBe(P1 as never);
    // Choosing zero still performs P2's mulligan; then P1 returns one card.
    expect(mv(pg.engine, "mulligan", P2, { keepCards: [] }).success).toBe(true);
    const [h0] = zone(pg, "hand", P1) as [string];
    expect(mv(pg.engine, "mulligan", P1, { keepCards: [h0] }).success).toBe(true);
    expect(zone(pg, "hand", P1)).toHaveLength(4);
    expect(zone(pg, "hand", P1)).not.toContain(h0);
    const game = startPlay(pg, P2);
    expect(game.gameState.status).toBe("playing");
    expect(game.turnPlayer()).toBe(P2); // MUST NOT default to players[0]
    expect(game.turnNumber()).toBe(1);
    expect(game.actingSeat()).toBe(P2);
    expect(game.engine.getFlowManager()?.getCurrentPlayer()).toBe(P2 as never);
    expect(game.gameState.firstTurnNumber ?? {}).toEqual({ [P1]: 2 });
    expect(Object.keys(game.gameState.firstTurnNumber ?? {})).not.toContain(P2);
    // P2 took the first Channel (2, not 3) and Draw.
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(5);
    expect(game.p1.runes()).toHaveLength(0);
    // Then P1 — the player going second — channels 3 on ITS first turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.p1.hand()).toHaveLength(5);
  });

  test("117 'in turn order' — with P2 chosen as First Player, P1 attempting its mulligan BEFORE P2 must be refused (success:false, nothing moves); the engine performs it", async () => {
    // Expected: r.success === false and P1's hand unchanged until P2 has mulliganed. Actual: mulligan has no
    // condition at all (setup.pendingMulligan is never populated), so any player may mulligan at any time.
    const { pg } = pregameThroughDraw({ first: P2, seed: "out-of-order" });
    const p1Hand = zone(pg, "hand", P1);
    const r = mv(pg.engine, "mulligan", P1, { keepCards: [p1Hand[0]] });
    expect(zone(pg, "hand", P1)).toEqual(p1Hand);
    expect(r.success).toBe(false);
    // …whereas the First Player may go right away.
    expect(mv(pg.engine, "mulligan", P2, { keepCards: [] }).success).toBe(true);
  });
});

// ===========================================================================
// 12. Second player channels three on their first Channel Phase only
// ===========================================================================

describe("Duel first-turn process: the player going SECOND channels 3 on their first Channel Phase only; everyone draws every turn (485.7, 486.7, 315.3.b, 315.4.b, 430.4.a, 115.2, 483.7)", () => {
  test("P1 t1: 2 runes / 10 left / hand 5 (first player DOES draw in a duel); P2 t1: 3 / 9 / hand 5; P1 t2: 4 / 8; P2 t2: 5 / 7 (bonus is one-shot); runes enter ready and energy stays 0", async () => {
    const { game } = fullPregame({ seed: "second-player-bonus" });
    // P1 turn 1 (game turn 1).
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2); // MUST NOT be 3
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.p1.energy()).toBe(0);
    // No rune was pre-placed for P2 during setup.
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p2.runeDeck()).toHaveLength(12);
    // P2 turn 1 (game turn 2).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: true })).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    expect(game.p2.hand()).toHaveLength(5);
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.runes()).toHaveLength(2); // P1 never gets a bonus
    // P1 turn 2 (game turn 3).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runeDeck()).toHaveLength(8);
    expect(game.p1.hand()).toHaveLength(6);
    // P2 turn 2 (game turn 4): back to 2 per turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(4);
    expect(game.p2.runes()).toHaveLength(5); // MUST NOT be 6
    expect(game.p2.runeDeck()).toHaveLength(7);
    expect(game.p2.hand()).toHaveLength(6);
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 13. The extra rune follows the second PLAYER, not absolute turn 2
// ===========================================================================

/** 0-cost plain filler spell: "Take an additional turn after this one." */
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

describe("Additional turns do not change Turn Order: the +1 rune belongs to the second PLAYER's first Channel Phase, whenever that turn happens (485.7, 736, 737, 738, 315.3.b)", () => {
  test("P1 takes an additional turn (inline 'take a turn after this one'): queue is [P1, P1*, P2, P1, P2…]; on the additional turn (game turn 2) P1 channels exactly 2, not 3", async () => {
    const { game, pg } = fullPregame({ seed: "extra-turn-queue" });
    injectIntoHand(pg, "warp", FILLER_WARP, P1);
    expect(game.p1.can("cast", "warp")).toBe(true);
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("trash");
    // Game turn 2 = P1's additional turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.p1.runes()).toHaveLength(4); // 2 + 2 — P1 is not "the player going second"
    expect(game.p1.runeDeck()).toHaveLength(8);
    expect(game.p2.runes()).toHaveLength(0);
    // Game turn 3 = P2's first turn; turn 4 = P1; turn 5 = P2 (Turn Order itself unchanged, 737).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(5);
  });

  test.failing("BUG: 485.7 — after P1's additional turn, game turn 3 is P2's FIRST turn and P2 must channel 3; the engine keys the bonus to absolute turn number 2 (firstTurnNumber[P2] === 2) and P2 only channels 2", async () => {
    // Expected: P2 runes 3 / rune deck 9 on its first Channel Phase (game turn 3), then 2 per turn (5 / 7 on turn 5).
    // Actual: the flow compares firstTurnNumber[P2] (2) with the current turn number (3) → no bonus, ever.
    const { game, pg } = fullPregame({ seed: "extra-turn-bonus" });
    injectIntoHand(pg, "warp", FILLER_WARP, P1);
    await game.p1.cast("warp");
    await game.settle();
    await game.advanceTurn(); // P1* (turn 2)
    expect(game.turnPlayer()).toBe(P1);
    await game.advanceTurn(); // P2's first turn (turn 3)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    await game.advanceTurn(); // P1 (turn 4)
    await game.advanceTurn(); // P2's second turn (turn 5)
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
  });

  test("printed cross-check: Time Warp (ogn-122-298, the card in rule 738's example) queues the same additional turn — P1, P1*, then P2 — and P1 channels 2 on the additional turn", async () => {
    const { game, pg } = fullPregame({ seed: "time-warp" });
    const timeWarp = (await loadDefaultCardPool()).get("ogn-122-298") as CardDefLike;
    expect(timeWarp?.name).toBe("Time Warp");
    injectIntoHand(pg, "timewarp", timeWarp, P1);
    await game.p1.do("addResources", { energy: 10, power: { mind: 4 } }); // sandbox: Time Warp costs [10] + 4 mind
    await game.p1.cast("timewarp");
    await game.settle();
    expect(game.zoneOf("timewarp")).toBe("banishment"); // "Banish this."
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.p1.runes()).toHaveLength(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
  });
});

// ===========================================================================
// 14. Bo1 random battlefield vs Bo3 chosen; unpicked are removed, not trashed; simultaneous
// ===========================================================================

describe("Battlefield selection: Duel = random 1 of 3, Match = chosen 1 of 3; the other two are removed/set aside (not trashed); selections are placed simultaneously (113, 113.1, 485.5, 486.5, 486.5.a, 486.6, 107.2, 108.2.b)", () => {
  function throughChampions(seed: string) {
    const pg = newPregame({ seed });
    rollAndChoose(pg, P1);
    placeLegendsAndChampions(pg);
    return pg;
  }

  test("Match / Bo3 game 1 (486.5): selectBattlefield(P1, keep = B2) is honoured exactly — B2 alone enters the battlefield row for P1, B1/B3 do not; exactly one battlefield per player after both select", async () => {
    const pg = throughChampions("bo3-choice");
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    expect(zone(pg, "battlefieldRow", P1)).toEqual([b2]);
    expect(pg.engine.getState().battlefields[b2]).toEqual({ contested: false, controller: null, id: b2 });
    expect(pg.engine.getState().battlefields[b1]).toBeUndefined();
    expect(pg.engine.getState().battlefields[b3]).toBeUndefined();
    const [c1, c2, c3] = pg.kit[P2]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P2, { battlefieldId: c1, discardIds: [c2, c3] }).success).toBe(true);
    expect(zone(pg, "battlefieldRow")).toHaveLength(2);
    expect(zone(pg, "battlefieldRow", P2)).toEqual([c1]);
  });

  test("485.5 / 486.5 / 113 — the two unselected battlefields are 'removed' / 'set aside', NOT put in the trash (where they would be public, countable trash cards); the engine moves them to the trash zone", async () => {
    // Expected: B1/B3 in no player-facing zone (not trash/hand/mainDeck/banishment/battlefieldRow).
    // Actual: selectBattlefield's reducer does zones.moveCard(→ "trash") for each discardId.
    const pg = throughChampions("set-aside");
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    for (const z of ["hand", "mainDeck", "banishment", "battlefieldRow", "trash"]) {
      expect(zone(pg, z)).not.toContain(b1);
      expect(zone(pg, z)).not.toContain(b3);
    }
  });

  test("485.5 'placed simultaneously' — between P1's selection and P2's selection, P2's player view must not reveal which battlefield P1 kept; engine publishes it in state.battlefields / the public battlefieldRow immediately", async () => {
    // Expected: getPlayerView(P2).battlefields has no P1 entry (or the row is hidden) until P2 has also locked in.
    // Actual: selectBattlefield writes draft.battlefields[b2] and moves the card to the public row at once.
    const pg = throughChampions("simultaneous");
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    const p2View = pg.engine.getPlayerView(P2);
    expect(Object.keys(p2View.battlefields)).not.toContain(b2);
  });

  test.failing("BUG: 485.5 — in a Duel (Bo1) each player's battlefield is selected at RANDOM by the game; the engine only offers a player-driven selectBattlefield, so a supplied preference always forces the outcome (identical across seeds)", async () => {
    // Expected: with identical inputs, different seeds yield at least two different kept battlefields for P1
    // (a player-named id must not be able to force it). Actual: the named id is always the one kept.
    const kept = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const pg = throughChampions(`bo1-random-${i}`);
      const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
      mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] });
      for (const id of zone(pg, "battlefieldRow", P1)) {
        kept.add(id.replace(/^player-1-/, ""));
      }
    }
    expect(kept.size).toBeGreaterThan(1);
  });

  test.failing("BUG: 486.5 / 486.6 — Match (Bo3) structure is absent: after a decisive game 1 there is no way to start game 2 with the used battlefields removed (P1 limited to {B1,B3}, B2 refused; game 3 forced to the last one; 486.5.a re-presentation after a draw)", async () => {
    // Expected: some match-level continuation (a move or state) that removes game-1 battlefields for the
    // rest of the match and refuses re-selecting them. Actual: the engine models a single game only —
    // no move in the definition concerns matches / next games, and RiftboundGameState has no match record.
    const moveIds = Object.keys(riftboundDefinition.moves);
    expect(moveIds.some((m) => /match|nextGame|newGame|sideboard|presentBattlefield/i.test(m))).toBe(true);
  });

  test("485.4.a / 485.5 ('only 1 will be used') — a second selectBattlefield by the same player is refused", async () => {
    // Expected: again.success === false and P1's row stays [B2]. Actual: no condition on selectBattlefield → row [B2, B1].
    const pg = throughChampions("double-select");
    const [b1, b2, b3] = pg.kit[P1]?.bfs as [string, string, string];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b2, discardIds: [b1, b3] }).success).toBe(true);
    const again = mv(pg.engine, "selectBattlefield", P1, { battlefieldId: b1, discardIds: [] });
    expect(zone(pg, "battlefieldRow", P1)).toEqual([b2]);
    expect(again.success).toBe(false);
  });
});

// ===========================================================================
// 15. Turn-order roll: ties are re-rolled, not seat-ordered
// ===========================================================================

/** Find a seed whose two d20 rolls satisfy `pred` (deterministic per seed). */
function findRollSeed(prefix: string, pred: (r1: number, r2: number) => boolean): { pg: Pregame; seed: string } {
  for (let i = 0; i < 400; i++) {
    const seed = `${prefix}-${i}`;
    const pg = newPregame({ mainCount: 4, seed });
    mv(pg.engine, "rollForFirst", P1);
    mv(pg.engine, "rollForFirst", P2);
    const rolls = setupState(pg)?.rolls ?? {};
    if (pred(rolls[P1] as number, rolls[P2] as number)) {
      return { pg, seed };
    }
  }
  throw new Error(`no seed found for ${prefix}`);
}

describe("Turn Order is decided by a FAIR random method: the higher d20 wins, ties are re-rolled (115, 115.1.a, 115.1.b)", () => {
  test("decisive roll: the strictly higher roll is rollWinner (even when that is P2), and only the winner may chooseFirstPlayer", async () => {
    const { pg } = findRollSeed("p2-higher", (a, b) => b > a);
    expect(setupState(pg)?.rollWinner).toBe(P2 as never);
    expect(setupState(pg)?.step).toBe("chooseFirst");
    expect(mv(pg.engine, "chooseFirstPlayer", P1, { firstPlayerId: P1 }).success).toBe(false);
    expect(setupState(pg)?.firstPlayer).toBeUndefined();
    expect(mv(pg.engine, "chooseFirstPlayer", P2, { firstPlayerId: P2 }).success).toBe(true);
    expect(setupState(pg)?.firstPlayer).toBe(P2 as never);
    const { pg: pgB } = findRollSeed("p1-higher", (a, b) => a > b);
    expect(setupState(pgB)?.rollWinner).toBe(P1 as never);
    expect(mv(pgB.engine, "chooseFirstPlayer", P2, { firstPlayerId: P2 }).success).toBe(false);
  });

  test("a player cannot roll twice in the same round (before or after the other player rolls)", async () => {
    const pg = newPregame({ mainCount: 4, seed: "double-roll" });
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    const r1 = setupState(pg)?.rolls[P1];
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(false);
    expect(setupState(pg)?.rolls[P1]).toBe(r1 as number);
    expect(setupState(pg)?.rolls[P2]).toBeUndefined();
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(false);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(false);
  });

  test("115 (fair random method) — on EQUAL rolls nobody wins: rollWinner stays undefined, the step returns to rollForFirst with rolls cleared, and chooseFirstPlayer is refused for both; the engine awards ties to players[0]", async () => {
    // Expected: tie → re-roll. Actual: `ties go to first player alphabetically` — P1 is rollWinner on a tie.
    const { pg } = findRollSeed("tie", (a, b) => a === b);
    const s = setupState(pg);
    expect(s?.rolls[P1]).toBe(s?.rolls[P2] as number);
    expect(s?.rollWinner).toBeUndefined();
    expect(s?.step).toBe("rollForFirst");
    expect(mv(pg.engine, "chooseFirstPlayer", P1, { firstPlayerId: P1 }).success).toBe(false);
    expect(mv(pg.engine, "chooseFirstPlayer", P2, { firstPlayerId: P2 }).success).toBe(false);
    // Both may (must) roll again.
    expect(mv(pg.engine, "rollForFirst", P1).success).toBe(true);
    expect(mv(pg.engine, "rollForFirst", P2).success).toBe(true);
  });
});

// ===========================================================================
// 16. Cross-mode guard: FFA3 — first player skips first draw; only the LAST player gets +1 rune
// ===========================================================================

describe("FFA3 first-turn process (cross-mode guard): 3 battlefields, first player skips their first draw, ONLY the last player channels +1 (487.4, 487.5, 487.7, 488.7, 489.7, 485.7, 315.4.b, 483.7)", () => {
  test("3-player pregame: three battlefields in the row (one per player), victory score 8, P1 first; P1 t1 channels 2; P3 (last) channels 3 on its first turn; P1 draws normally on its second turn", async () => {
    const { game, pg } = fullPregame({ players: [P1, P2, P3], seed: "ffa3" });
    expect(GAME_MODES.ffa3.battlefieldCount).toBe(3);
    expect(GAME_MODES.ffa3.firstPlayerSkipsDraw).toBe(true);
    expect(game.cardsAt("battlefieldRow").sort()).toEqual([pg.kit[P1]?.bfs[0], pg.kit[P2]?.bfs[0], pg.kit[P3]?.bfs[0]].sort() as string[]);
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    await game.advanceTurn(); // P2, turn 2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand()).toHaveLength(5); // P2 draws 1
    await game.advanceTurn(); // P3, turn 3
    expect(game.turnPlayer()).toBe(P3);
    expect(game.turnNumber()).toBe(3);
    expect(game.seat(P3).runes()).toHaveLength(3);
    expect(game.seat(P3).runeDeck()).toHaveLength(9);
    expect(game.seat(P3).hand()).toHaveLength(5);
    const p1HandBefore = game.p1.hand().length;
    await game.advanceTurn(); // P1, turn 4 — draws normally now
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(p1HandBefore + 1);
    expect(game.p1.runes()).toHaveLength(4);
  });

  test("487.7 first clause — in FFA3 the player going FIRST draws NOTHING in their first Draw Phase (hand stays 4); GAME_MODES.ffa3.firstPlayerSkipsDraw is defined but the draw phase never consults it (P1 has 5)", async () => {
    // Expected: P1 hand === 4 after its turn-1 Draw Phase in a 3-player game (contrast: 5 in a duel).
    // Actual: the flow always draws 1; the engine has no notion of the mode being played.
    const { game } = fullPregame({ players: [P1, P2, P3], seed: "ffa3-skip-draw" });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(4);
  });

  test("487.7 second clause — only the LAST player (P3) channels +1; P2 (neither first nor last) must channel exactly 2 on its first turn; transitionToPlay books firstTurnNumber for EVERY non-first player so P2 gets 3", async () => {
    // Expected: P2 runes 2 / rune deck 10 after its first Channel Phase; P3 runes 3.
    // Actual: firstTurnNumber = { P2: 2, P3: 3 } and secondPlayerExtraRune applies to both → P2 channels 3.
    const { game } = fullPregame({ players: [P1, P2, P3], seed: "ffa3-middle" });
    await game.advanceTurn(); // P2's first turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(2);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(10);
    await game.advanceTurn(); // P3's first turn — the LAST player does get 3
    expect(game.seat(P3).runes()).toHaveLength(3);
  });
});
