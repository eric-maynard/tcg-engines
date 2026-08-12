/**
 * CardState: one merged, read-only view of a card instance (definition +
 * placement + meta + counter flags), i.e. the mockup's GetCardState().
 */

import type { CardId as CoreCardId } from "@tcg/core";
import { getCardEffectiveMight } from "../game-definition/moves/play/cost";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { CombatRole, RiftboundCardMeta } from "../types/game-state";
import { domainsOf } from "./card-pool";
import type { HarnessEngine, InternalView } from "./internal";
import { getInternalState, peekCurrentState } from "./internal";
import type { CardDefLike, CardPool, CardRef, CardState, GrantedKeywordView, LocationRef, ZoneKey } from "./types";
import { HarnessError } from "./types";

type MetaBag = Partial<RiftboundCardMeta> & {
  __flags?: Record<string, boolean>;
  __counters?: Record<string, number>;
} & Record<string, unknown>;

export function isTokenInstance(id: string, definitionId: string | undefined): boolean {
  return (
    id.startsWith("token-") ||
    (definitionId ?? "").startsWith("token-def-") ||
    getGlobalCardRegistry().isToken(id)
  );
}

export function locationOfZone(zone: string): LocationRef | undefined {
  if (zone === "base") {
    return "base";
  }
  if (zone.startsWith("battlefield-")) {
    return zone.slice("battlefield-".length);
  }
  return undefined;
}

/** Merge boolean status from the counter flag store and the legacy meta field. */
function flag(meta: MetaBag | undefined, name: "exhausted" | "stunned" | "buffed"): boolean {
  if (!meta) {
    return false;
  }
  const fromFlags = meta.__flags?.[name];
  const fromMeta = meta[name] as boolean | undefined;
  return fromFlags === true || fromMeta === true;
}

export function readMeta(internal: InternalView, id: CardRef): MetaBag | undefined {
  return internal.cardMetas[id] as MetaBag | undefined;
}

/**
 * Build the CardState for `id`. Throws CARD_NOT_FOUND for unknown ids.
 * `pool` (optional) supplies rules text / printed data the registry drops.
 */
export function buildCardState(engine: HarnessEngine, id: CardRef, pool?: CardPool): CardState {
  const internal = getInternalState(engine);
  const inst = internal.cards[id];
  if (!inst) {
    throw new HarnessError({ code: "CARD_NOT_FOUND", detail: { id }, message: `No card instance "${id}"` });
  }
  const registry = getGlobalCardRegistry();
  const def = registry.get(id);
  const poolDef = pool?.get(inst.definitionId);
  const meta = readMeta(internal, id);
  const metaAccessor = (cid: CoreCardId) => internal.cardMetas[cid as string] as Partial<RiftboundCardMeta> | undefined;

  const gameOver = peekCurrentState(engine)?.status === "finished";

  const baseMight = def?.might ?? poolDef?.might ?? 0;
  const isBuffed = flag(meta, "buffed");
  // getCardEffectiveMight reads meta.buffed; feed it the merged flag.
  const might =
    baseMight === 0
      ? Math.max(0, (meta?.mightModifier ?? 0) + (meta?.staticMightBonus ?? 0) + (isBuffed ? 1 : 0))
      : getCardEffectiveMight(id, (cid) => {
          const m = metaAccessor(cid);
          return (cid as string) === id && m ? { ...m, buffed: isBuffed } : m;
        });

  const granted: GrantedKeywordView[] = (meta?.grantedKeywords ?? []).map((g) => ({
    duration: g.duration,
    keyword: g.keyword,
    value: g.value,
  }));
  const printedKeywords = new Set<string>([
    ...(def?.keywords ?? []),
    ...((def?.abilities ?? [])
      .filter((a) => a.type === "keyword" && typeof a.keyword === "string")
      .map((a) => a.keyword as string)),
  ]);
  const keywords = [...new Set([...printedKeywords, ...granted.map((g) => g.keyword)])];

  const attachments = Object.entries(internal.cardMetas)
    .filter(([, m]) => (m as MetaBag | undefined)?.attachedTo === id)
    .map(([cid]) => cid);
  const equipped = meta?.equippedWith ?? [];
  const isExhausted = flag(meta, "exhausted");
  const damage = Math.max(meta?.damage ?? 0, meta?.__counters?.damage ?? 0);

  return {
    attachedTo: meta?.attachedTo,
    attachments: [...new Set([...equipped, ...attachments])],
    baseMight,
    cardType: def?.cardType ?? poolDef?.cardType ?? "unknown",
    combatRole: (meta?.combatRole ?? null) as CombatRole,
    controller: inst.controller,
    damage,
    defId: inst.definitionId,
    domains: domainsOf((def as CardDefLike | undefined) ?? poolDef),
    energyCost: def?.energyCost ?? poolDef?.energyCost ?? 0,
    grantedKeywords: granted,
    id,
    isBuffed,
    isEmpowered: meta?.empowered === true,
    isExhausted,
    // rule 421.4 — a facedown card stays where it is when the game ends, but its
    // owner reveals it to all players, so nothing is hidden once play is over.
    isHidden: gameOver ? false : meta?.hidden === true || inst.zone.startsWith("facedown-"),
    isReady: !isExhausted,
    isStunned: flag(meta, "stunned"),
    isTapped: isExhausted,
    isToken: isTokenInstance(id, inst.definitionId),
    keywords,
    location: locationOfZone(inst.zone),
    meta: (meta ?? {}) as Readonly<Record<string, unknown>>,
    might,
    mightModifier: meta?.mightModifier ?? 0,
    name: def?.name ?? poolDef?.name ?? inst.definitionId,
    owner: inst.owner,
    powerCost: [...(def?.powerCost ?? poolDef?.powerCost ?? [])],
    rulesText: (poolDef?.rulesText as string | undefined) ?? undefined,
    staticMightBonus: meta?.staticMightBonus ?? 0,
    zone: inst.zone as ZoneKey,
  };
}

/** Human label for logs / option labels: "Cleave [cleave]". */
export function cardLabel(engine: HarnessEngine, id: CardRef): string {
  const internal = getInternalState(engine);
  const inst = internal.cards[id];
  const name = getGlobalCardRegistry().get(id)?.name ?? inst?.definitionId ?? id;
  return name === id ? id : `${name} [${id}]`;
}
