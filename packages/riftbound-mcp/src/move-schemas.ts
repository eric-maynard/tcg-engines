/**
 * Per-move parameter JSON Schemas (published as `riftbound://schema/moves`)
 * and the move-coverage contract: how every engine move id is reachable
 * through the MCP surface, or why it is intentionally internal.
 *
 * Hand-written from `packages/riftbound-engine/src/types/moves.ts` /
 * `docs/harness/01-engine-inventory.md` (TS types are not available at
 * runtime). `src/__tests__/contract.test.ts` fails when the engine gains a
 * move that is neither covered nor listed as internal.
 */

import type { JsonObject } from "./mcp-lite";

const str = { type: "string" } as const;
const cardId = { description: "card instance id", type: "string" } as const;
const cardIds = { items: cardId, type: "array" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;

function obj(properties: JsonObject, required: string[] = [], description?: string): JsonObject {
  return { additionalProperties: false, description, properties, required, type: "object" };
}

/** How an enumerable (player-decision) engine move is reached through MCP tools. */
export interface MoveCoverage {
  /** Harness ActionOption.verb for this move. */
  verb: string;
  /** Named convenience tool, if any (everything is also reachable via `act`). */
  tool?: string;
  /** `act` answer shape that reaches it. */
  via: string;
  params: JsonObject;
}

export const ENUMERABLE_MOVES: Record<string, MoveCoverage> = {
  activateAbility: {
    params: obj(
      {
        abilityIndex: int,
        cardId,
        discardId: cardId,
        playerId: str,
        sacrificeId: cardId,
        sourceCardId: cardId,
        targets: cardIds,
      },
      ["playerId", "cardId", "abilityIndex"],
    ),
    tool: "activate_ability",
    verb: "activate",
    via: 'act {kind:"action", key:"activateAbility:<card>#<i>", args:{sacrifice?,discard?,source?}}',
  },
  concede: {
    params: obj({ playerId: str }, ["playerId"]),
    tool: "concede",
    verb: "concede",
    via: 'act {kind:"action", key:"concede:-"}',
  },
  conquerBattlefield: {
    params: obj({ battlefieldId: cardId, playerId: str }, ["playerId", "battlefieldId"]),
    verb: "conquer",
    via: 'act {kind:"action", key:"conquerBattlefield:<bf>"} (normally automatic)',
  },
  contestBattlefield: {
    params: obj({ battlefieldId: cardId, playerId: str }, ["playerId", "battlefieldId"]),
    verb: "contest",
    via: 'act {kind:"action", key:"contestBattlefield:<bf>"} (normally automatic)',
  },
  endShowdown: {
    params: obj({}),
    verb: "endShowdown",
    via: "auto procedure (TurnDriver); act key endShowdown:- when autoProcedures=false",
  },
  endTurn: {
    params: obj({ playerId: str }, ["playerId"]),
    tool: "end_turn",
    verb: "endTurn",
    via: 'act {kind:"action", key:"endTurn:-"} — routed through the TurnDriver',
  },
  exhaustRune: {
    params: obj({ playerId: str, runeId: cardId }, ["playerId", "runeId"]),
    tool: "tap_rune",
    verb: "tapRune",
    via: 'act {kind:"action", key:"exhaustRune:<rune>"}',
  },
  gankingMove: {
    params: obj({ playerId: str, toBattlefield: cardId, unitId: cardId }, [
      "playerId",
      "unitId",
      "toBattlefield",
    ]),
    tool: "move_units",
    verb: "gank",
    via: 'act {kind:"action", key:"gankingMove:<unit>", args:{to}} / move_units {units:[unit], to, gank:true}',
  },
  hideCard: {
    params: obj({ battlefieldId: cardId, cardId, playerId: str }, [
      "playerId",
      "cardId",
      "battlefieldId",
    ]),
    verb: "hide",
    via: 'act {kind:"action", key:"hideCard:<card>", args:{to:<bf>}}',
  },
  invitePlayer: {
    params: obj({ invitedPlayerId: str, playerId: str }, ["playerId", "invitedPlayerId"]),
    verb: "invite",
    via: 'act {kind:"action", key:"invitePlayer:<seat>"} (3-4 player only)',
  },
  passChainPriority: {
    params: obj({ playerId: str }, ["playerId"]),
    tool: "pass_priority",
    verb: "passPriority",
    via: 'act "pass" / {kind:"action", key:<passKey>}',
  },
  passShowdownFocus: {
    params: obj({ playerId: str }, ["playerId"]),
    tool: "pass_focus",
    verb: "passFocus",
    via: 'act "pass" / {kind:"action", key:<passKey>}',
  },
  playFromChampionZone: {
    params: obj({ location: str, playerId: str }, ["playerId", "location"]),
    tool: "play_card",
    verb: "playChampion",
    via: 'act {kind:"action", key:"playFromChampionZone:-", args:{to}} / play_card {card:<champion>}',
  },
  playGear: {
    params: obj({ cardId, chosenTargetId: cardId, playerId: str }, ["playerId", "cardId"]),
    tool: "play_card",
    verb: "equip",
    via: 'act {kind:"action", key:"playGear:<card>", args:{costTarget?}}',
  },
  playSpell: {
    params: obj(
      {
        additionalCostSpec: obj({ energy: int, power: { items: str, type: "array" } }),
        cardId,
        paidAdditionalCost: bool,
        playerId: str,
        repeatCount: int,
        targets: cardIds,
        viaFlow: bool,
        xAmount: int,
      },
      ["playerId", "cardId"],
    ),
    tool: "play_card",
    verb: "cast",
    via: 'act {kind:"action", key:"playSpell:<card>", args:{targets?, x?, repeat?, flow?, payOptional?}}',
  },
  playUnit: {
    params: obj(
      {
        additionalCostSpec: obj({ energy: int, power: { items: str, type: "array" }, xp: int }),
        cardId,
        location: { description: '"base" or "battlefield-<bf>"', type: "string" },
        paidAdditionalCost: bool,
        playerId: str,
        sacrificeId: cardId,
      },
      ["playerId", "cardId", "location"],
    ),
    tool: "play_card",
    verb: "play",
    via: 'act {kind:"action", key:"playUnit:<card>", args:{to?, accelerate?, sacrifice?}}',
  },
  recallUnit: {
    params: obj({ playerId: str, unitId: cardId }, ["playerId", "unitId"]),
    tool: "move_units",
    verb: "recall",
    via: 'act {kind:"action", key:"recallUnit:<unit>"} / move_units {units:[unit], to:"base"} when only recall is legal',
  },
  recycleRune: {
    params: obj({ domain: str, playerId: str, runeId: cardId }, ["playerId", "runeId", "domain"]),
    tool: "recycle_rune",
    verb: "recycleRune",
    via: 'act {kind:"action", key:"recycleRune:<rune>", args:{domain?}}',
  },
  resolveChain: {
    params: obj({}),
    verb: "resolveChain",
    via: "auto procedure (TurnDriver); act key resolveChain:- when autoProcedures=false",
  },
  resolveFullCombat: {
    params: obj({ battlefieldId: cardId }, ["battlefieldId"]),
    verb: "resolveCombat",
    via: "auto procedure (TurnDriver); act key resolveFullCombat:<bf> when autoProcedures=false",
  },
  resolvePendingChoice: {
    params: obj(
      {
        accept: bool,
        pickedCardId: cardId,
        pickedMode: int,
        pickedName: str,
        pickedZoneId: str,
        playerId: str,
      },
      ["playerId"],
    ),
    verb: "(prompt)",
    via: 'act with a prompt answer: "<optionKey>" | ["k"] | true/false | n | "decline" | {kind:"pick"|"yes-no"|"integer"|"name"|"distribute"|"decline",…}',
  },
  revealHidden: {
    params: obj({ cardId, playerId: str }, ["playerId", "cardId"]),
    verb: "reveal",
    via: 'act {kind:"action", key:"revealHidden:<card>"}',
  },
  scorePoint: {
    params: obj(
      {
        battlefieldId: cardId,
        method: { enum: ["conquer", "hold"], type: "string" },
        playerId: str,
        previousController: { type: ["string", "null"] },
      },
      ["playerId", "method", "battlefieldId"],
    ),
    verb: "score",
    via: 'act {kind:"action", key:"scorePoint:<bf>"} (normally automatic)',
  },
  standardMove: {
    params: obj(
      {
        destination: { description: '"base" or a battlefield id', type: "string" },
        playerId: str,
        unitIds: cardIds,
      },
      ["playerId", "unitIds", "destination"],
    ),
    tool: "move_units",
    verb: "move",
    via: 'act {kind:"action", key:"standardMove:to:<dest>", args:{units:[…]}}',
  },
  startShowdown: {
    params: obj({ battlefieldId: cardId, playerId: str }, ["playerId", "battlefieldId"]),
    verb: "startShowdown",
    via: 'act {kind:"action", key:"startShowdown:<bf>"} (normally automatic)',
  },
};

/**
 * Engine moves with no enumerator: setup / flow-directed / effect-directed /
 * sandbox tabletop moves. Not exposed as decisions (the harness `seat.do()`
 * escape hatch is deliberately not an MCP tool).
 */
export const INTERNAL_MOVES: Record<string, string> = {
  addBuff: "sandbox/status (effects)",
  addCounter: "sandbox meta",
  addDamage: "sandbox/status (effects)",
  addResources: "directed (channel/tutor); sandbox",
  addToken: "sandbox meta (effects mint tokens)",
  advancePhase: "flow-directed",
  assignAttacker: "combat internals (resolveFullCombat automates)",
  assignDamage: "combat internals (resolveFullCombat automates)",
  assignDefender: "combat internals (resolveFullCombat automates)",
  banishCard: "effect-directed",
  burnOut: "flow-directed (draw from empty deck)",
  channelRunes: "flow-directed (Channel step)",
  chooseFirstPlayer: "pregame setup (skipped by createPlayableGame/scenario)",
  clearCombatState: "combat internals",
  clearDamage: "sandbox/status (cleanup step)",
  counterSpell: "effect-directed only (rule 544.4)",
  discardCard: "effect-directed",
  drawCard: "flow/effect-directed",
  drawInitialHand: "pregame setup",
  duplicateCard: "sandbox meta",
  emptyRunePool: "flow-directed (end of turn)",
  equipCard: "effect-directed (Equip ability resolves via activateAbility)",
  exhaustCard: "sandbox/status",
  gainXp: "effect-directed",
  initializeMainDeck: "pregame setup",
  initializeRuneDeck: "pregame setup",
  killUnit: "effect-directed",
  labelCard: "sandbox meta",
  modifyBuff: "sandbox meta",
  mulligan: "pregame setup (not modelled as a Decision yet)",
  peekTopN: "sandbox meta",
  placeBattlefields: "pregame setup",
  placeCardsOnTopOfDeckInOrder: "sandbox meta",
  placeChampion: "pregame setup",
  placeLegend: "pregame setup",
  readyAll: "flow-directed (Awaken step)",
  readyCard: "sandbox/status",
  recallGear: "directed (cleanup)",
  recycleCard: "effect-directed",
  recycleMany: "sandbox meta",
  removeBuff: "sandbox/status",
  removeDamage: "sandbox/status",
  resolveCombat: "combat internals (resolveFullCombat is the enumerated form)",
  revealTopToOpponent: "sandbox meta",
  rollForFirst: "pregame setup",
  selectBattlefield: "pregame setup",
  sendToHand: "sandbox meta",
  shuffleDecks: "pregame setup",
  spendResources: "directed (cost payment)",
  spendXp: "effect-directed",
  stunUnit: "effect-directed",
  transferControl: "sandbox meta / effect-directed",
  transitionToPlay: "pregame setup",
  unequipCard: "effect-directed",
  unstunUnit: "flow-directed (cleanup)",
};

export function movesSchemaDocument(): JsonObject {
  return {
    $comment:
      "Per-move engine parameter schemas for Riftbound. Agents normally never build these params: use current_decision/list_legal_actions option keys with `act`, or the named verb tools. `via` says how each move is reached.",
    enumerable: Object.fromEntries(
      Object.entries(ENUMERABLE_MOVES).map(([id, c]) => [
        id,
        { params: c.params, tool: c.tool ?? null, verb: c.verb, via: c.via },
      ]),
    ),
    internal: INTERNAL_MOVES,
    playArgs: obj(
      {
        abilityIndex: int,
        accelerate: {
          description: "pay the optional additional cost (Accelerate) — alias of payOptional",
          type: "boolean",
        },
        costTarget: cardId,
        discard: cardId,
        domain: str,
        flow: bool,
        params: { description: "raw engine-param constraints (escape hatch)", type: "object" },
        payOptional: bool,
        repeat: int,
        sacrifice: cardId,
        source: cardId,
        targets: { description: "one card id or an ordered list", oneOf: [cardId, cardIds] },
        to: { description: '"base", a battlefield id, or "battlefield-<bf>"', type: "string" },
        units: cardIds,
        x: int,
      },
      [],
      'PlayArgs: the idiomatic bundle fields accepted in act {kind:"action", key, args} and by the verb tools',
    ),
  };
}
