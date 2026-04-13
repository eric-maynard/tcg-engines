/**
 * Riftbound Token Moves
 *
 * Manual token spawning for the sandbox action panel (W10). Uses the
 * core `createCardInZone` zone operation to mint a new card instance
 * and registers a synthetic token definition in the global card
 * registry so downstream UI snapshots can resolve the token's stats.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
  TokenName,
} from "../../types";

/**
 * Minimal token definition used by the manual `addToken` move.
 *
 * `type` distinguishes unit tokens (Recruit, Sprite, ...) from the
 * single non-unit token (Gold), which is treated as a "gear"-class
 * card so it doesn't appear in combat math.
 */
export interface TokenDefinition {
  readonly name: TokenName;
  readonly type: "unit" | "gear";
  readonly might?: number;
  readonly keywords?: readonly string[];
}

/**
 * Built-in token catalog. These six tokens mirror the tokens produced
 * by card effects in the live game; they are centralized here so the
 * sandbox panel can spawn any of them without the UI having to know
 * their stats.
 */
export const RIFTBOUND_TOKEN_DEFS: Record<TokenName, TokenDefinition> = {
  Bird: {
    keywords: ["Evasive"],
    might: 1,
    name: "Bird",
    type: "unit",
  },
  Gold: {
    name: "Gold",
    type: "gear",
  },
  Mech: {
    might: 3,
    name: "Mech",
    type: "unit",
  },
  Recruit: {
    might: 1,
    name: "Recruit",
    type: "unit",
  },
  "Sand Soldier": {
    might: 2,
    name: "Sand Soldier",
    type: "unit",
  },
  Sprite: {
    keywords: ["Backline"],
    might: 1,
    name: "Sprite",
    type: "unit",
  },
};

/**
 * Monotonic counter appended to minted token IDs to guarantee
 * uniqueness within a single process. Tests reset this via
 * `resetTokenIdCounter` if they need deterministic IDs.
 */
let tokenIdCounter = 0;
export function resetTokenIdCounter(): void {
  tokenIdCounter = 0;
}

/**
 * Generate a unique synthetic token card ID.
 */
function makeTokenId(name: TokenName, playerId: string): string {
  tokenIdCounter += 1;
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return `token-${slug}-${playerId}-${tokenIdCounter}`;
}

/**
 * Token-spawning move definitions.
 */
export const tokenMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  addToken: {
    reducer: (_draft, context) => {
      const { playerId, zoneId, tokenName, count = 1 } = context.params;

      const def = RIFTBOUND_TOKEN_DEFS[tokenName as TokenName];
      if (!def) {
        return;
      }

      const registry = getGlobalCardRegistry();
      const zones = context.zones as unknown as {
        createCardInZone?: (params: {
          cardId: CoreCardId;
          definitionId: string;
          zoneId: CoreZoneId;
          ownerId: CorePlayerId;
          controllerId?: CorePlayerId;
          position?: "top" | "bottom" | number;
        }) => void;
      };
      const {createCardInZone} = zones;
      if (typeof createCardInZone !== "function") {
        return;
      }

      // Register the token definition under a stable ID so snapshots can
      // Look up name/might. A single shared definitionId keeps the card
      // Registry small — each spawned instance reuses the same static data.
      const definitionId = `token-def-${def.name.toLowerCase().replace(/\s+/g, "-")}`;
      if (!registry.get(definitionId)) {
        registry.register(definitionId, {
          cardType: def.type === "gear" ? "gear" : "unit",
          id: definitionId,
          keywords: def.keywords ? [...def.keywords] : undefined,
          might: def.might,
          name: def.name,
        });
      }

      const spawnCount = Math.max(1, Math.floor(count));
      for (let i = 0; i < spawnCount; i++) {
        const cardId = makeTokenId(def.name, playerId) as CoreCardId;
        createCardInZone({
          cardId,
          controllerId: playerId as CorePlayerId,
          definitionId,
          ownerId: playerId as CorePlayerId,
          zoneId: zoneId as CoreZoneId,
        });
      }
    },
  },
};
