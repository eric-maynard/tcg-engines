/**
 * Interaction: battlefield selection at setup — the two UNCHOSEN battlefields are set aside and
 * contribute nothing.
 *
 *   × Obelisk of Power     (ogn-284-298, Battlefield) "At the start of each player's first
 *                          Beginning Phase, that player channels 1 rune."
 *   × The Arena's Greatest (ogn-290-298, Battlefield) "At the start of each player's first
 *                          Beginning Phase, that player gains 1 point."
 *   × Hallowed Tomb        (ogn-281-298, Battlefield) "When you hold here, you may return your
 *                          Chosen Champion from your trash to your Champion Zone if it is empty."
 *
 * Rules: 113 / 113.1 (battlefields are set aside during setup; the Mode of Play says how they
 * are used), 103.4.a / 103.4.c (count by mode; no two of the same name), 485.4 / 485.4.a (Duel:
 * Battlefield Count 2, each player PROVIDES 3, only 1 is used), 485.5 (Duel: random pick, the
 * other two "are removed and will not be used for this game"), 486.5 (Match: each player
 * SELECTS one, the other two "are set aside"), 315.2.a.1 (start-of-Beginning-Phase effects).
 *
 * Question: seat 1 registers Obelisk / Arena's Greatest / Hallowed Tomb.
 *   (1) Is the per-seat selection an explicit, attributable step (a Decision listing exactly
 *       those three, or an engine move naming the pick) rather than a silent default to index 0?
 *   (2) Seat 1 keeps The Arena's Greatest: each player gains exactly 1 point at the start of
 *       their own first Beginning Phase, and NO extra rune is channeled from the set-aside
 *       Obelisk — the unchosen two are in no zone card effects can see (not in the battlefield
 *       row, not in trash, no `battlefields` entry, no triggers).
 *   (3) Contrast: seat 1 keeps Obelisk instead — each player channels +1 rune on their first
 *       Beginning Phase and nobody gains the Arena point.
 *   (4) Two copies of the same battlefield name among the three is rejected (103.4.c); only two
 *       battlefields is rejected (485.4.a requires 3).
 *
 * The scenario() builder starts mid-game, so the setup facets drive the engine's real pregame
 * moves (rollForFirst → chooseFirstPlayer → placeLegend/Champion → selectBattlefield → decks →
 * shuffle → draw → mulligan → transitionToPlay) and then attach the harness `Game`.
 */
import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import type { BattlefieldCard, Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { riftboundDefinition } from "../../../game-definition/definition";
import type { CardDefLike, HarnessEngine } from "../../../harness";
import { FILLER_UNIT_DEF, Game, P1, P2, getInternalState, loadDefaultCardPool, toLookupPayload } from "../../../harness";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { validateDeck } from "../../../validators/deck-validators";

const OBELISK = "ogn-284-298";
const ARENA = "ogn-290-298";
const TOMB = "ogn-281-298";
const P1_BATTLEFIELDS = [OBELISK, ARENA, TOMB] as const;

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

interface Pregame {
  engine: HarnessEngine;
  /** instance id of each of P1's three registered battlefields, keyed by definition id */
  p1Bf: Record<string, string>;
  p2Bf: string[];
  zone: (zoneId: string) => string[];
}

/**
 * A fresh engine in the setup segment, driven up to (but not including) battlefield selection:
 * P1 registers the three REAL battlefields under test, P2 three inert filler battlefields; both
 * get a synthetic legend/champion, 39 filler main-deck cards and 12 fury runes. P1 goes first.
 */
async function pregameThroughChampions(seed = "bf-set-aside"): Promise<Pregame> {
  const pool = await loadDefaultCardPool();
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: HarnessEngine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [P1, P2].map((id) => ({ id, name: id })),
    { seed },
  );
  const internal = getInternalState(engine);
  const registry = getGlobalCardRegistry();
  const put = (id: string, def: CardDefLike, owner: string) => {
    internal.cards[id] = { controller: owner, definitionId: (def.id as string | undefined) ?? id, owner, zone: "staging" };
    internal.cardMetas[id] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false } as never;
    registry.register(id, toLookupPayload(def, id, def.cardType === "rune" ? { cardType: "rune", energyCost: 0 } : undefined));
  };
  const p1Bf: Record<string, string> = {};
  const p2Bf: string[] = [];
  const kit: Record<string, { legend: string; champion: string; main: string[]; runes: string[] }> = {};
  for (const p of [P1, P2]) {
    const legend = `${p}-legend`;
    put(legend, { abilities: [], cardType: "legend", championTag: "T", domain: ["fury", "chaos"], name: `Filler Legend ${p}` }, p);
    const champion = `${p}-champion`;
    put(champion, { abilities: [], cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, keywords: [], might: 4, name: `Hero, ${p}`, tags: ["T"] }, p);
    if (p === P1) {
      for (const defId of P1_BATTLEFIELDS) {
        const id = `${p}:${defId}`;
        put(id, pool.get(defId) as CardDefLike, p);
        p1Bf[defId] = id;
      }
    } else {
      for (const i of [1, 2, 3]) {
        const id = `${p}-bf${i}`;
        put(id, { abilities: [], cardType: "battlefield", name: `Filler Field ${i}` }, p);
        p2Bf.push(id);
      }
    }
    const main = Array.from({ length: 39 }, (_, i) => {
      const id = `${p}-d${i}`;
      put(id, { ...FILLER_UNIT_DEF, name: `Grunt ${i % 13}` }, p);
      return id;
    });
    const runes = Array.from({ length: 12 }, (_, i) => {
      const id = `${p}-r${i}`;
      put(id, { abilities: [], cardType: "rune", domain: "fury", name: "Fury Rune" }, p);
      return id;
    });
    kit[p] = { champion, legend, main, runes };
  }
  // rule 115: roll (re-roll ties); the winner names P1 First Player.
  for (let round = 0; round < 50 && engine.getState().setup?.rollWinner === undefined; round++) {
    mv(engine, "rollForFirst", P1);
    mv(engine, "rollForFirst", P2);
  }
  const winner = engine.getState().setup?.rollWinner as string;
  expect(mv(engine, "chooseFirstPlayer", winner, { firstPlayerId: P1 }).success).toBe(true);
  for (const p of [P1, P2]) {
    expect(mv(engine, "placeLegend", p, { legendId: kit[p]?.legend }).success).toBe(true);
    expect(mv(engine, "placeChampion", p, { championId: kit[p]?.champion }).success).toBe(true);
  }
  // Stash the deck kit on the closure for finishPregame.
  (engine as unknown as { __kit: typeof kit }).__kit = kit;
  const zone = (zoneId: string) => [...(internal.zones[zoneId]?.cardIds ?? [])];
  return { engine, p1Bf, p2Bf, zone };
}

/** P1 keeps `keepDef`, P2 keeps its first filler; decks, shuffle, draw 4, mulligan (keep all), play. */
function finishPregame(pg: Pregame, keepDef: string): Game {
  const { engine, p1Bf, p2Bf } = pg;
  const kit = (engine as unknown as { __kit: Record<string, { main: string[]; runes: string[] }> }).__kit;
  const keepId = p1Bf[keepDef] as string;
  const discardIds = Object.values(p1Bf).filter((id) => id !== keepId);
  expect(mv(engine, "selectBattlefield", P1, { battlefieldId: keepId, discardIds }).success).toBe(true);
  expect(mv(engine, "selectBattlefield", P2, { battlefieldId: p2Bf[0], discardIds: p2Bf.slice(1) }).success).toBe(true);
  for (const p of [P1, P2]) {
    expect(mv(engine, "initializeMainDeck", p, { cardIds: kit[p]?.main }).success).toBe(true);
    expect(mv(engine, "initializeRuneDeck", p, { runeIds: kit[p]?.runes }).success).toBe(true);
    expect(mv(engine, "shuffleDecks", p).success).toBe(true);
    expect(mv(engine, "drawInitialHand", p).success).toBe(true);
  }
  for (const p of [P1, P2]) {
    expect(mv(engine, "mulligan", p, { keepCards: [] }).success).toBe(true);
  }
  expect(mv(engine, "transitionToPlay", P1).success).toBe(true);
  const internal = getInternalState(engine);
  for (const bf of internal.zones.battlefieldRow?.cardIds ?? []) {
    internal.zones[`battlefield-${bf}`] ??= { cardIds: [], config: { faceDown: false, id: `battlefield-${bf}`, name: bf, ordered: false, visibility: "public" } };
    internal.zones[`facedown-${bf}`] ??= { cardIds: [], config: { faceDown: true, id: `facedown-${bf}`, maxSize: 1, name: bf, ordered: false, visibility: "private" } };
  }
  return Game.attach(engine, { players: [P1, P2] });
}

/** Every zone the harness/engine knows about, minus the set-aside holding area. */
function visibleZones(game: Game): string[] {
  return Object.keys(getInternalState(game.engine).zones).filter((z) => z !== "setAside");
}

// ---------------------------------------------------------------------------
// (4) deck-registration validation uses the typed card shapes
// ---------------------------------------------------------------------------

let synth = 0;
const sid = () => createCardId(`synthetic-bf-test-${++synth}`);
const legendCard = (): LegendCard => ({ cardType: "legend", championTag: "T", domain: ["fury", "chaos"], id: sid(), name: "Filler Legend" }) as LegendCard;
const championCard = (): UnitCard => ({ cardType: "unit", domain: "fury", energyCost: 4, id: sid(), isChampion: true, might: 4, name: "Hero, Alpha", tags: ["T"] }) as UnitCard;
const filler = (name: string): UnitCard => ({ cardType: "unit", domain: "fury", energyCost: 2, id: sid(), might: 2, name }) as UnitCard;
const fillers39 = (): Card[] => Array.from({ length: 39 }, (_, i) => filler(`Grunt ${i % 13}`));
const runes12 = (): RuneCard[] => Array.from({ length: 12 }, () => ({ cardType: "rune", domain: "fury", id: sid(), isBasic: true, name: "Fury Rune" }) as RuneCard);

async function realBattlefield(defId: string): Promise<BattlefieldCard> {
  const pool = await loadDefaultCardPool();
  return pool.get(defId) as unknown as BattlefieldCard;
}

async function deckWith(battlefields: BattlefieldCard[], mode: "duel" | "match") {
  const legend = legendCard();
  const chosenChampion = championCard();
  return validateDeck({ battlefields, chosenChampion, legend, mainDeck: [chosenChampion as Card, ...fillers39()], mode, runeDeck: runes12() });
}

// ===========================================================================

describe("(1) battlefield selection is an explicit, attributable per-seat step (485.4.a, 485.5, 486.5)", () => {
  test.failing("BUG: Game.fromDecks with three registered battlefields should surface a per-seat selection Decision (486.5) or a logged random pick (485.5) — it silently keeps battlefieldIds[0] and never registers the other two", async () => {
    // Expected (486.5 / 485.5): before play starts each seat is asked to keep exactly one of ITS
    // three battlefields (a `pick` Decision listing those three), or the game logs a random pick.
    // Actual: createPlayableGame takes deck.battlefieldIds[0] for each seat with no Decision, and
    // the game is already at P1's turn-1 main phase (status "playing").
    const main = Array.from({ length: 40 }, () => "ogn-175-298");
    const runes = Array.from({ length: 12 }, () => "ogn-007-298");
    const game = await Game.fromDecks({
      p1: { battlefieldIds: [...P1_BATTLEFIELDS], mainDeckCardIds: main, runeDeckCardIds: runes },
      p2: { battlefieldIds: [TOMB, ARENA, OBELISK], mainDeckCardIds: main, runeDeckCardIds: runes },
    });
    const d = game.decision();
    expect(game.gameState.status).toBe("setup");
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const cards = getInternalState(game.engine).cards;
    const offered = d?.kind === "pick" ? d.options.map((o) => cards[o.card ?? o.key]?.definitionId) : [];
    expect([...offered].sort()).toEqual([...P1_BATTLEFIELDS].sort());
  });

  test("engine pregame: selectBattlefield is a per-player move that honours the NAMED battlefield exactly (not index 0) and records the choice per seat", async () => {
    const pg = await pregameThroughChampions("explicit-pick");
    // Before anyone selects: nothing in the row, no recorded choice, all three still registered to P1.
    expect(pg.zone("battlefieldRow")).toEqual([]);
    expect(pg.engine.getState().setup?.battlefieldChoices ?? {}).toEqual({});
    const keep = pg.p1Bf[ARENA] as string; // index 1 of the registered three — NOT index 0
    const others = [pg.p1Bf[OBELISK], pg.p1Bf[TOMB]] as string[];
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: keep, discardIds: others }).success).toBe(true);
    expect(pg.engine.getState().setup?.battlefieldChoices?.[P1]).toBe(keep);
    expect(pg.zone("battlefieldRow")).toEqual([keep]);
    // P2's choice is its own, independent step; until then P2 has no recorded choice.
    expect(pg.engine.getState().setup?.battlefieldChoices?.[P2]).toBeUndefined();
    expect(mv(pg.engine, "selectBattlefield", P2, { battlefieldId: pg.p2Bf[2], discardIds: pg.p2Bf.slice(0, 2) }).success).toBe(true);
    expect(pg.engine.getState().setup?.battlefieldChoices?.[P2]).toBe(pg.p2Bf[2]);
    // 485.4: Battlefield Count 2 — one per player.
    expect([...pg.zone("battlefieldRow")].sort()).toEqual([keep, pg.p2Bf[2] as string].sort());
  });

  test("485.4.a 'only 1 will be used' — a seat cannot select a second battlefield once it has chosen", async () => {
    const pg = await pregameThroughChampions("no-second-pick");
    const keep = pg.p1Bf[ARENA] as string;
    expect(mv(pg.engine, "selectBattlefield", P1, { battlefieldId: keep, discardIds: [pg.p1Bf[OBELISK], pg.p1Bf[TOMB]] }).success).toBe(true);
    const again = mv(pg.engine, "selectBattlefield", P1, { battlefieldId: pg.p1Bf[OBELISK], discardIds: [] });
    expect(again.success).toBe(false);
    expect(pg.zone("battlefieldRow")).toEqual([keep]);
  });

  test("485.5 (Duel Bo1): selectRandomBattlefield is still an explicit engine step per seat — it records WHICH of the three was kept in setup.battlefieldChoices and sets the other two aside", async () => {
    const pg = await pregameThroughChampions("random-pick");
    const three = Object.values(pg.p1Bf);
    expect(mv(pg.engine, "selectRandomBattlefield", P1, { battlefieldIds: three }).success).toBe(true);
    const kept = pg.engine.getState().setup?.battlefieldChoices?.[P1] as string;
    expect(three).toContain(kept);
    expect(pg.zone("battlefieldRow")).toEqual([kept]);
    expect([...pg.zone("setAside")].sort()).toEqual(three.filter((b) => b !== kept).sort());
  });
});

describe("(2) seat 1 keeps The Arena's Greatest — Arena fires once per player; set-aside Obelisk/Tomb are invisible (113, 486.5, 315.2.a.1)", () => {
  test("after setup exactly two battlefields are in play (Arena's Greatest + P2's pick); Obelisk and Hallowed Tomb are in NO visible zone — not the battlefield row, not trash, not banishment, no `battlefields` entry", async () => {
    const pg = await pregameThroughChampions("arena-kept-zones");
    const game = finishPregame(pg, ARENA);
    await game.settle();
    const arena = pg.p1Bf[ARENA] as string;
    const obelisk = pg.p1Bf[OBELISK] as string;
    const tomb = pg.p1Bf[TOMB] as string;
    expect([...game.cardsAt("battlefieldRow")].sort()).toEqual([arena, pg.p2Bf[0] as string].sort());
    expect(Object.keys(game.gameState.battlefields).sort()).toEqual([arena, pg.p2Bf[0] as string].sort());
    for (const z of visibleZones(game)) {
      expect(game.cardsAt(z)).not.toContain(obelisk);
      expect(game.cardsAt(z)).not.toContain(tomb);
    }
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    // The engine parks them in a dedicated out-of-game holding area.
    expect(game.zoneOf(obelisk)).toBe("setAside");
    expect(game.zoneOf(tomb)).toBe("setAside");
    // Nothing on any seat's menu references a set-aside card.
    for (const seat of [game.p1, game.p2]) {
      for (const o of seat.legal()) {
        expect(o.card).not.toBe(obelisk);
        expect(o.card).not.toBe(tomb);
        for (const f of o.fields) {
          const vals = (f.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]));
          expect(vals).not.toContain(obelisk);
          expect(vals).not.toContain(tomb);
        }
      }
    }
  });

  test("P1's first Beginning Phase: The Arena's Greatest trigger goes on the chain for P1 and resolves to exactly +1 point; P1 channels only the normal 2 runes (no Obelisk rune)", async () => {
    const pg = await pregameThroughChampions("arena-kept-p1");
    const game = finishPregame(pg, ARENA);
    // transitionToPlay cascades into P1's turn 1; the start-of-Beginning-Phase trigger is pending.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: pg.p1Bf[ARENA], controller: P1, triggered: true });
    expect(game.p1.points()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.runes()).toHaveLength(2); // 315.3.b: channel 2 — no +1 from the set-aside Obelisk
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("P2's first Beginning Phase: P2 gains exactly 1 point (Arena fires for 'that player'), channels 3 (2 + the going-second bonus, 485.7) and NOT 4; P1 stays at 1 point", async () => {
    const pg = await pregameThroughChampions("arena-kept-p2");
    const game = finishPregame(pg, ARENA);
    await game.settle();
    const { next } = await game.advanceTurn();
    expect(next).toBe(P2);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(2);
  });

  test("Arena's Greatest is once per PLAYER: on P1's and P2's second turns nobody gains another point and channeling stays normal (P1 4, P2 5)", async () => {
    const pg = await pregameThroughChampions("arena-kept-later");
    const game = finishPregame(pg, ARENA);
    await game.settle();
    await game.advanceTurn(); // → P2 t1
    await game.advanceTurn(); // → P1 t2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(4);
    await game.advanceTurn(); // → P2 t2
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.runes()).toHaveLength(5);
    // Over the whole run no chain item / trigger ever came from a set-aside battlefield.
    const fromSetAside = game
      .transcript()
      .steps.map((s) => JSON.stringify(s))
      .filter((s) => s.includes(pg.p1Bf[OBELISK] as string) || s.includes(pg.p1Bf[TOMB] as string));
    expect(fromSetAside).toEqual([]);
  });
});

describe("(3) contrast — seat 1 keeps Obelisk of Power instead: +1 rune on each player's first Beginning Phase, no Arena point for anyone", () => {
  test("P1 turn 1: channels 3 (2 + Obelisk), 0 points; Arena's Greatest and Hallowed Tomb are set aside", async () => {
    const pg = await pregameThroughChampions("obelisk-kept-p1");
    const game = finishPregame(pg, OBELISK);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf(pg.p1Bf[ARENA] as string)).toBe("setAside");
    expect(game.zoneOf(pg.p1Bf[TOMB] as string)).toBe("setAside");
    expect(Object.keys(game.gameState.battlefields)).not.toContain(pg.p1Bf[ARENA] as string);
  });

  test("P2 turn 1: channels 4 (2 + going-second bonus + Obelisk), still 0–0; second turns channel the normal 2 (P1 5, P2 6) and the score never moves", async () => {
    const pg = await pregameThroughChampions("obelisk-kept-p2");
    const game = finishPregame(pg, OBELISK);
    await game.settle();
    await game.advanceTurn(); // → P2 t1
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(4);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn(); // → P1 t2
    expect(game.p1.runes()).toHaveLength(5);
    await game.advanceTurn(); // → P2 t2
    expect(game.p2.runes()).toHaveLength(6);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(4) deck registration: three distinctly named battlefields (103.4.a, 103.4.c, 485.4.a)", () => {
  test("Obelisk + Arena's Greatest + Hallowed Tomb is a legal battlefield set for duel and match", async () => {
    const three = [await realBattlefield(OBELISK), await realBattlefield(ARENA), await realBattlefield(TOMB)];
    for (const mode of ["duel", "match"] as const) {
      const r = await deckWith(three, mode);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  test("103.4.c — two copies of Obelisk of Power among the three is rejected (DUPLICATE_BATTLEFIELD_NAME)", async () => {
    const dup = [await realBattlefield(OBELISK), await realBattlefield(OBELISK), await realBattlefield(ARENA)];
    for (const mode of ["duel", "match"] as const) {
      const r = await deckWith(dup, mode);
      expect(r.valid).toBe(false);
      expect(r.errors.map((e) => e.code)).toContain("DUPLICATE_BATTLEFIELD_NAME");
    }
  });

  test("485.4.a — registering only two battlefields is rejected (WRONG_BATTLEFIELD_COUNT: the deck provides 3 even though only 2 end up in play)", async () => {
    const two = [await realBattlefield(OBELISK), await realBattlefield(ARENA)];
    for (const mode of ["duel", "match"] as const) {
      const r = await deckWith(two, mode);
      expect(r.valid).toBe(false);
      expect(r.errors.map((e) => e.code)).toContain("WRONG_BATTLEFIELD_COUNT");
    }
  });
});
