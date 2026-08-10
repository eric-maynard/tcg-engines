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
import { endTurn as driverEndTurn } from "../../harness/turn-driver";
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

export type CardDef = Record<string, unknown> & {
  id: string;
  cardType: string;
  name?: string;
  domain?: string | readonly string[];
  energyCost?: number;
};

export type Internal = {
  zones: Record<string, { config: unknown; cardIds: string[] }>;
  cards: Record<
    string,
    { definitionId: string; owner: string; controller: string; zone: string; position?: number }
  >;
  cardMetas: Record<string, RiftboundCardMeta>;
};

export function getInternal(engine: Engine): Internal {
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
export function getCardMeta(engine: Engine, instanceId: string): Record<string, unknown> | undefined {
  const internal = getInternal(engine);
  const meta = internal.cardMetas[instanceId] as unknown as
    | (Record<string, unknown> & { __flags?: Record<string, boolean> })
    | undefined;
  return meta ? { ...meta, exhausted: meta.__flags?.exhausted ?? (meta as { exhausted?: boolean }).exhausted } : undefined;
}

export function definitionIdOf(engine: Engine, instanceId: string): string | undefined {
  return getInternal(engine).cards[instanceId]?.definitionId;
}

export function makeLookupPayload(
  def: CardDef,
  cardId: string,
  overrides?: { cardType?: string; energyCost?: number }
): CardDefinitionLookup {
  return {
    abilities: def.abilities as CardDefinitionLookup["abilities"],
    cardType: overrides?.cardType ?? def.cardType,
    championTag: def.championTag as string | undefined,
    copyAttachedUnitText: def.copyAttachedUnitText as boolean | undefined,
    copyChosenUnitToHolder: def.copyChosenUnitToHolder as boolean | undefined,
    domain: def.domain as string | string[] | undefined,
    energyCost: overrides?.energyCost ?? def.energyCost,
    id: cardId,
    inheritExhaustAbilities: def.inheritExhaustAbilities as boolean | undefined,
    interactiveCostReduction: def.interactiveCostReduction as "target-might" | undefined,
    isChampion: def.isChampion as boolean | undefined,
    isToken: (def as { isToken?: boolean }).isToken === true ? true : undefined,
    keywords: def.keywords as string[] | undefined,
    might: def.might as number | undefined,
    mightBonus: def.mightBonus as number | undefined,
    moveEscalation: def.moveEscalation as boolean | undefined,
    name: (def.name as string) ?? cardId,
    powerCost: def.powerCost as string[] | undefined,
    sacrificeCostDiscount: def.sacrificeCostDiscount as { powerDomain: string } | undefined,
    tags: def.tags as string[] | undefined,
    timing: def.timing as string | undefined,
    tracksExiledCards: def.tracksExiledCards as boolean | undefined,
  };
}

export function registerCard(
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
 * `strategy: "cheap"` sorts by energyCost (affordable early); `"random"` shuffles
 * with `seed` so higher-cost cards are exercised too.
 */
export function buildDefaultDeck(
  allCards: CardDef[],
  domain1 = "fury",
  domain2 = "chaos",
  strategy: "cheap" | "random" = "cheap",
  seed = ""
): DeckConfig {
  const inDomain = (c: CardDef) =>
    c.domain &&
    (Array.isArray(c.domain)
      ? c.domain.every((d) => d === domain1 || d === domain2)
      : c.domain === domain1 || c.domain === domain2);

  let salt = 0;
  for (const c of seed) salt = (salt * 31 + c.charCodeAt(0)) | 0;
  const order =
    strategy === "cheap"
      ? (a: CardDef, b: CardDef) => (a.energyCost ?? 99) - (b.energyCost ?? 99)
      : (a: CardDef, b: CardDef) => {
          const h = (s: string) => {
            let x = salt;
            for (const ch of s) x = (x * 33 + ch.charCodeAt(0)) | 0;
            return x >>> 0;
          };
          return h(a.id) - h(b.id);
        };
  const byType = (t: string) => allCards.filter((c) => c.cardType === t && inDomain(c)).sort(order);

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

  // Legend must match the deck's domain identity (both if it's dual-domain,
  // else the primary). Falling back to first-match-either produced Kai'Sa on
  // an "Annie" fury/chaos deck because Daughter of the Void is fury/mind.
  const domainsOf = (c: CardDef) =>
    Array.isArray(c.domain) ? c.domain : c.domain ? [c.domain] : [];
  const legend =
    allCards.find(
      (c) =>
        c.cardType === "legend" &&
        domainsOf(c).includes(domain1) &&
        domainsOf(c).includes(domain2)
    ) ??
    allCards.find((c) => c.cardType === "legend" && domainsOf(c).includes(domain1)) ??
    allCards.find((c) => c.cardType === "legend" && inDomain(c));

  // Runes follow the legend's actual domains so power costs are payable.
  const legendDomains = legend ? domainsOf(legend) : [domain1, domain2];
  const [rd1, rd2] = [legendDomains[0] ?? domain1, legendDomains[1] ?? legendDomains[0] ?? domain2];
  runes.length = 0;
  const r1 = allCards.find((c) => c.cardType === "rune" && c.name === `${cap(rd1)} Rune`);
  const r2 = allCards.find((c) => c.cardType === "rune" && c.name === `${cap(rd2)} Rune`);
  for (let i = 0; i < 12; i++) {
    const r = i < 6 ? r1 : r2;
    if (r) runes.push(r.id);
  }

  // Battlefields matching legend domains where possible; distinct.
  const bfs = allCards
    .filter((c) => c.cardType === "battlefield" && (inDomain(c) || domainsOf(c).length === 0))
    .slice(0, 3)
    .map((c) => c.id);
  if (bfs.length < 3) {
    for (const c of allCards.filter((x) => x.cardType === "battlefield")) {
      if (bfs.length >= 3) break;
      if (!bfs.includes(c.id)) bfs.push(c.id);
    }
  }

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
  const P1 = "player-1";
  const P2 = "player-2";
  // Deck CONSTRUCTION legality (copy limit, domain identity, sideboard, 40-card
  // minimum…) is advisory and never checked here — only refuse what makes a
  // game impossible to seat.
  for (const [pid, deck] of [
    [P1, deck1],
    [P2, deck2],
  ] as const) {
    if (!Array.isArray(deck?.mainDeckCardIds) || deck.mainDeckCardIds.length === 0) {
      throw new Error(`Cannot create game: ${pid} has an empty main deck (0 cards)`);
    }
  }

  setGlobalCardRegistry(new CardDefinitionRegistry());
  const cardReg = getGlobalCardRegistry();
  const defById = new Map(allCards.map((c) => [c.id, c]));
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
    internal.zones[`facedown-${bf}`] = {
      cardIds: [],
      config: {
        faceDown: true,
        id: `facedown-${bf}`,
        name: `Facedown ${bf}`,
        ordered: false,
        visibility: "owner",
      },
    };
  }

  // Transition to playing via the engine's transitionToPlay move so the
  // FlowManager leaves the `setup` segment and enters `mainGame` (mirrors
  // Server.ts finalizePregame). The flow then cascades awaken → beginning →
  // Channel (2 runes) → draw (1 card) → main for P1 on its own.
  engine.applyPatches([
    { op: "replace", path: ["setup", "firstPlayer"], value: P1 },
    { op: "replace", path: ["setup", "secondPlayer"], value: P2 },
  ]);
  engine.executeMove("transitionToPlay", { params: {}, playerId: P1 as PlayerId });

  return { engine, instanceIds };
}

/**
 * Drive end-of-turn → start-of-next-turn through the shared TurnDriver
 * (harness/turn-driver.ts — the same path the app server uses): the
 * FlowManager cascades main → ending → cleanup → awaken → beginning →
 * channel → draw → main on its own once the next player is set.
 *
 * Call this INSTEAD of executing `endTurn` directly.
 */
export function advanceTurn(
  engine: Engine,
  players: readonly string[],
): { next: string; success: boolean; error?: string } {
  // Single implementation shared with the agent harness (harness/turn-driver.ts).
  const { next, success, error } = driverEndTurn(engine, players);
  return { error, next, success };
}
