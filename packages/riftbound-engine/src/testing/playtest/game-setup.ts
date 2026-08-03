/**
 * Headless playable-game setup.
 *
 * Extracted from apps/riftbound-app/server.ts (createGameFromDecks + finalizePregame)
 * so tests, tracers, and bots can create a fully-playable engine without the app.
 * Without this the global CardDefinitionRegistry is empty and enumerateMoves()
 * only ever returns [endTurn, concede].
 */
import { RuleEngine, type PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import {
  type CardDefinitionLookup,
  CardDefinitionRegistry,
  getGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

export type Engine = RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>;

export interface DeckConfig {
  mainDeckCardIds: string[];
  runeDeckCardIds: string[];
  battlefieldIds: string[];
  legendId?: string;
  championId?: string;
}

type CardDef = Record<string, unknown> & {
  id: string;
  cardType: string;
  name?: string;
  domain?: string | string[];
  energyCost?: number;
};

type Internal = {
  zones: Record<string, { config: unknown; cardIds: string[] }>;
  cards: Record<
    string,
    { definitionId: string; owner: string; controller: string; zone: string; position?: number }
  >;
  cardMetas: Record<string, RiftboundCardMeta>;
};

function getInternal(engine: Engine): Internal {
  return (engine as unknown as { internalState: Internal }).internalState;
}

/** Read a per-player zone's card ids from the engine's internal state. */
export function getZoneCards(engine: Engine, zone: string, playerId?: string): string[] {
  const zs = getInternal(engine).zones;
  const z = zs[zone];
  if (!z) return [];
  if (!playerId) return [...z.cardIds];
  const cards = getInternal(engine).cards;
  return z.cardIds.filter((id) => cards[id]?.owner === playerId);
}

/** Map an instance id back to its definition id. */
export function definitionIdOf(engine: Engine, instanceId: string): string | undefined {
  return getInternal(engine).cards[instanceId]?.definitionId;
}

function makeLookupPayload(
  def: CardDef,
  cardId: string,
  overrides?: { cardType?: string; energyCost?: number }
): CardDefinitionLookup {
  return {
    abilities: def.abilities as CardDefinitionLookup["abilities"],
    cardType: overrides?.cardType ?? def.cardType,
    copyAttachedUnitText: def.copyAttachedUnitText as boolean | undefined,
    domain: def.domain,
    energyCost: overrides?.energyCost ?? def.energyCost,
    id: cardId,
    inheritExhaustAbilities: def.inheritExhaustAbilities as boolean | undefined,
    interactiveCostReduction: def.interactiveCostReduction as "target-might" | undefined,
    isChampion: def.isChampion as boolean | undefined,
    keywords: def.keywords as string[] | undefined,
    might: def.might as number | undefined,
    mightBonus: def.mightBonus as number | undefined,
    moveEscalation: def.moveEscalation as boolean | undefined,
    name: (def.name as string) ?? cardId,
    powerCost: def.powerCost as string[] | undefined,
    timing: def.timing as string | undefined,
    tracksExiledCards: def.tracksExiledCards as boolean | undefined,
  };
}

function registerCard(
  internal: Internal,
  cardId: string,
  definitionId: string,
  owner: string,
  zone: string
) {
  internal.cards[cardId] = { controller: owner, definitionId, owner, position: undefined, zone };
  internal.cardMetas[cardId] = {
    buffed: false,
    combatRole: null,
    damage: 0,
    exhausted: false,
    hidden: false,
    stunned: false,
  } as RiftboundCardMeta;
}

/**
 * Build a legal-ish 2-domain starter deck from a real card pool.
 * Sorts by energyCost so early draws are affordable.
 */
export function buildDefaultDeck(
  allCards: CardDef[],
  domain1 = "fury",
  domain2 = "chaos"
): DeckConfig {
  const inDomain = (c: CardDef) =>
    c.domain &&
    (Array.isArray(c.domain)
      ? c.domain.some((d) => d === domain1 || d === domain2)
      : c.domain === domain1 || c.domain === domain2);

  const byType = (t: string) =>
    allCards
      .filter((c) => c.cardType === t && inDomain(c))
      .sort((a, b) => (a.energyCost ?? 99) - (b.energyCost ?? 99));

  const units = byType("unit").filter((c) => !c.isChampion);
  const spells = byType("spell");
  const gears = allCards.filter(
    (c) => (c.cardType === "gear" || c.cardType === "equipment") && inDomain(c)
  );

  const main: string[] = [];
  const add = (pool: CardDef[], limit: number) => {
    for (const c of pool) {
      if (main.length >= 40 || limit <= 0) break;
      if (main.filter((id) => id === c.id).length < 2) {
        main.push(c.id);
        limit--;
      }
    }
  };
  add(units, 28);
  add(spells, 8);
  add(gears, 4);
  add([...units, ...spells, ...gears], 40 - main.length);

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rune1 = allCards.find((c) => c.cardType === "rune" && c.name === `${cap(domain1)} Rune`);
  const rune2 = allCards.find((c) => c.cardType === "rune" && c.name === `${cap(domain2)} Rune`);
  const runes: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = i < 6 ? rune1 : rune2;
    if (r) runes.push(r.id);
  }

  const bfs = allCards.filter((c) => c.cardType === "battlefield").slice(0, 3).map((c) => c.id);

  const legend = allCards.find((c) => c.cardType === "legend" && inDomain(c));
  let championId: string | undefined;
  if (legend) {
    const tag = legend.championTag as string | undefined;
    championId = allCards.find(
      (c) =>
        c.cardType === "unit" &&
        c.isChampion &&
        Array.isArray(c.tags) &&
        (c.tags as string[]).includes(tag ?? "")
    )?.id;
  }

  return {
    battlefieldIds: bfs,
    championId,
    legendId: legend?.id,
    mainDeckCardIds: main,
    runeDeckCardIds: runes,
  };
}

/**
 * Create a fully-playable engine at turn 1, main phase, with P1's first
 * channel + draw already applied. enumerateMoves() will return real play
 * moves (exhaustRune → playUnit/…).
 */
export function createPlayableGame(
  allCards: CardDef[],
  deck1: DeckConfig,
  deck2: DeckConfig,
  seed = "playtest"
): { engine: Engine; instanceIds: { p1: string[]; p2: string[] } } {
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const cardReg = getGlobalCardRegistry();
  const defById = new Map(allCards.map((c) => [c.id, c]));

  const P1 = "player-1";
  const P2 = "player-2";
  const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Bot1" },
      { id: P2, name: "Bot2" },
    ],
    { seed }
  );
  const internal = getInternal(engine);
  const instanceIds = { p1: [] as string[], p2: [] as string[] };

  const bfInstanceIds: string[] = [];
  for (const [pid, deck, bucket] of [
    [P1, deck1, instanceIds.p1],
    [P2, deck2, instanceIds.p2],
  ] as const) {
    const mainIds: string[] = [];
    deck.mainDeckCardIds.forEach((defId, i) => {
      const cid = `${pid}-main-${i}-${defId}`;
      mainIds.push(cid);
      bucket.push(cid);
      registerCard(internal, cid, defId, pid, "mainDeck");
      const def = defById.get(defId);
      if (def) cardReg.register(cid, makeLookupPayload(def, cid));
    });
    engine.executeMove("initializeMainDeck", {
      params: { cardIds: mainIds, playerId: pid },
      playerId: pid as PlayerId,
    });

    const runeIds: string[] = [];
    deck.runeDeckCardIds.forEach((defId, i) => {
      const cid = `${pid}-rune-${i}-${defId}`;
      runeIds.push(cid);
      registerCard(internal, cid, defId, pid, "runeDeck");
      const def = defById.get(defId);
      if (def) cardReg.register(cid, makeLookupPayload(def, cid, { cardType: "rune", energyCost: 0 }));
    });
    engine.executeMove("initializeRuneDeck", {
      params: { playerId: pid, runeIds },
      playerId: pid as PlayerId,
    });

    if (deck.legendId) {
      const cid = `${pid}-legend-${deck.legendId}`;
      registerCard(internal, cid, deck.legendId, pid, "legendZone");
      const def = defById.get(deck.legendId);
      if (def) cardReg.register(cid, makeLookupPayload(def, cid));
      engine.executeMove("placeLegend", { params: { legendId: cid }, playerId: pid as PlayerId });
    }
    if (deck.championId) {
      const cid = `${pid}-champion-${deck.championId}`;
      registerCard(internal, cid, deck.championId, pid, "championZone");
      const def = defById.get(deck.championId);
      if (def) cardReg.register(cid, makeLookupPayload(def, cid));
      engine.executeMove("placeChampion", {
        params: { championId: cid },
        playerId: pid as PlayerId,
      });
    }

    engine.executeMove("shuffleDecks", { params: { playerId: pid }, playerId: pid as PlayerId });
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });

    const bfDef = deck.battlefieldIds[0];
    if (bfDef) {
      const cid = `${pid}-bf-${bfDef}`;
      registerCard(internal, cid, bfDef, pid, "battlefieldRow");
      const def = defById.get(bfDef);
      if (def) cardReg.register(cid, makeLookupPayload(def, cid));
      bfInstanceIds.push(cid);
    }
  }

  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: bfInstanceIds },
    playerId: P1 as PlayerId,
  });
  for (const bf of bfInstanceIds) {
    internal.zones[`battlefield-${bf}`] = {
      cardIds: [],
      config: {
        faceDown: false,
        id: `battlefield-${bf}`,
        name: `Battlefield ${bf}`,
        ordered: false,
        visibility: "public",
      },
    };
  }

  // Transition to playing (mirrors server.ts finalizePregame — applyPatches, not transitionToPlay)
  engine.applyPatches([
    { op: "replace", path: ["status"], value: "playing" },
    { op: "replace", path: ["turn", "activePlayer"], value: P1 },
    { op: "replace", path: ["turn", "phase"], value: "main" },
    { op: "replace", path: ["turn", "number"], value: 1 },
  ]);
  engine.executeMove("channelRunes", {
    params: { count: 2, directed: true, playerId: P1 },
    playerId: P1 as PlayerId,
  });
  engine.executeMove("drawCard", {
    params: { count: 1, playerId: P1 },
    playerId: P1 as PlayerId,
  });

  return { engine, instanceIds };
}

/**
 * Drive end-of-turn → start-of-next-turn manually. Mirrors
 * apps/riftbound-app/server.ts preparePlayerRotation + finalizeEndTurn,
 * because the engine's flow manager does not reliably cascade phases when
 * the game was set up via applyPatches.
 *
 * Call this immediately after a successful `endTurn` executeMove.
 */
export function advanceTurn(engine: Engine, players: readonly string[]): string {
  const s = engine.getState();
  const cur = s.turn.activePlayer;
  const idx = players.indexOf(cur);
  const next = players[(idx + 1) % players.length];

  engine.getFlowManager()?.setCurrentPlayer(next as PlayerId);

  // Rule 517.2.c: empty rune pools at end of turn
  for (const pid of players) {
    engine.executeMove("emptyRunePool", { params: { playerId: pid }, playerId: pid as PlayerId });
  }

  const turnNo = (s.turn as { number?: number }).number ?? 1;
  engine.applyPatches([
    { op: "replace", path: ["turn", "number"], value: turnNo + 1 },
    { op: "replace", path: ["turn", "activePlayer"], value: next },
    { op: "replace", path: ["turn", "phase"], value: "main" },
    { op: "replace", path: ["conqueredThisTurn", next], value: [] },
    { op: "replace", path: ["scoredThisTurn", next], value: [] },
  ]);

  // Rule 515.1 Awaken
  engine.executeMove("readyAll", { params: { playerId: next }, playerId: next as PlayerId });

  // Rule 515.2.b Hold scoring
  const s2 = engine.getState();
  for (const [bfId, bf] of Object.entries(s2.battlefields ?? {})) {
    if ((bf as { controller?: string }).controller === next) {
      engine.executeMove("scorePoint", {
        params: { battlefieldId: bfId, method: "hold", playerId: next },
        playerId: next as PlayerId,
      });
    }
  }

  // Rule 515.3 Channel (with 644.7 catch-up)
  const isFirstTurnForNext = turnNo + 1 === players.indexOf(next) + 1;
  engine.executeMove("channelRunes", {
    params: { count: isFirstTurnForNext ? 3 : 2, directed: true, playerId: next },
    playerId: next as PlayerId,
  });

  // Rule 515.4.b Draw
  engine.executeMove("drawCard", {
    params: { count: 1, playerId: next },
    playerId: next as PlayerId,
  });

  return next;
}
