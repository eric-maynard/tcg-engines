/**
 * "As you play me, add the <X> battlefield token to the board if it's not
 * there already. If you do, I enter there." (rule-id: unl-147-219 Baron Nashor)
 *
 * rule 135.2.b.3: the "as you play me" clause executes during the play itself,
 * so the token battlefield exists before the unit enters the board.
 * rule 187.9: a battlefield token is a real battlefield once added.
 * rule 369.3 / 370.1.b: "I enter there" replaces WHERE the unit enters — it is
 * not a play-location choice, so play-location restrictions (Mageseeker Warden)
 * do not apply to it.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundGameState } from "../../../types";

/** The battlefield token an "as you play me" clause adds to the board. */
interface BattlefieldTokenSpec {
  readonly defId: string;
  readonly name: string;
  readonly keywords?: readonly string[];
}

interface AddBattlefieldTokenEffect {
  readonly type: "add-battlefield-token";
  readonly battlefield: BattlefieldTokenSpec;
  /** "If you do, I enter there." */
  readonly enterThere?: boolean;
}

type ZonesLike = {
  getCardsInZone(zoneId: CoreZoneId, ownerId?: CorePlayerId): CoreCardId[];
  createCardInZone?(params: {
    cardId: CoreCardId;
    definitionId: string;
    zoneId: CoreZoneId;
    ownerId: CorePlayerId;
    controllerId?: CorePlayerId;
  }): void;
  createZone?(params: { zoneId: CoreZoneId; config?: Record<string, unknown> }): void;
};

function findSpec(cardId: string): AddBattlefieldTokenEffect | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(cardId) ?? [];
  for (const ability of abilities as { effect?: { type?: string } }[]) {
    if (ability.effect?.type === "add-battlefield-token") {
      return ability.effect as unknown as AddBattlefieldTokenEffect;
    }
  }
  return undefined;
}

/**
 * Runs the "as you play me" battlefield-token clause for `cardId`.
 *
 * @returns the zone the unit must enter instead of its play location, or
 * `undefined` when the card has no such clause or the token was already on the
 * board ("if you do" fails, rule 369.3).
 */
export function applyPlayBattlefieldToken(args: {
  cardId: string;
  playerId: string;
  draft: RiftboundGameState;
  zones: ZonesLike;
}): string | undefined {
  const { cardId, playerId, draft, zones } = args;
  const spec = findSpec(cardId);
  if (!spec) {
    return undefined;
  }
  const registry = getGlobalCardRegistry();
  const already = zones
    .getCardsInZone("battlefieldRow" as CoreZoneId)
    .some((id) => registry.get(id as string)?.name === spec.battlefield.name);
  if (already) {
    return undefined;
  }
  if (typeof zones.createCardInZone !== "function" || typeof zones.createZone !== "function") {
    return undefined;
  }
  // rule 439.4.b: "if it's not there already" is the NAME check above — a fresh
  // token is a brand new object. A slot key can survive the token that minted it
  // (rule 438.1, a Replace re-uses the slot), so take the next free id instead of
  // treating that stale key as the battlefield still being on the board.
  let tokenId = `token-bf-${spec.battlefield.defId}`;
  for (let n = 2; draft.battlefields[tokenId] !== undefined; n++) {
    tokenId = `token-bf-${spec.battlefield.defId}-${n}`;
  }
  zones.createCardInZone({
    cardId: tokenId as CoreCardId,
    controllerId: playerId as CorePlayerId,
    definitionId: spec.battlefield.defId,
    ownerId: playerId as CorePlayerId,
    zoneId: "battlefieldRow" as CoreZoneId,
  });
  registry.register(tokenId, {
    cardType: "battlefield",
    id: tokenId,
    keywords: spec.battlefield.keywords ? [...spec.battlefield.keywords] : undefined,
    name: spec.battlefield.name,
  });
  // rule 187.9: a token battlefield starts uncontrolled, like a printed one.
  draft.battlefields[tokenId] = { contested: false, controller: null, id: tokenId };
  zones.createZone({ zoneId: `battlefield-${tokenId}` as CoreZoneId });
  zones.createZone({
    config: { faceDown: true, maxSize: 1, visibility: "private" },
    zoneId: `facedown-${tokenId}` as CoreZoneId,
  });
  return spec.enterThere === false ? undefined : `battlefield-${tokenId}`;
}
