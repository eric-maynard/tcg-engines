/**
 * Combat-role Might bonuses (Assault / Shield).
 *
 * rule 807.1.c (Assault) / rule 814.1.c (Shield): "While I'm an attacker /
 * defender, I have +X [Might]". rule 432.1.a — that is real Might: it raises
 * the value damage from ANY source (combat or a spell) must reach to be lethal
 * (rule 142.4.b), for as long as the combat role is stamped on the unit.
 *
 * Kept here so every effective-Might reader (state-based lethal check, cost
 * model, target resolver) can agree on one implementation.
 */

import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "./card-lookup";
import type { RiftboundCardMeta } from "../types";

interface CombatRoleMeta {
  readonly combatRole?: string | null;
  readonly grantedKeywords?: readonly { keyword: string; value?: number }[];
}

/**
 * The Might a unit gains from Assault (as an attacker) or Shield (as a
 * defender), counting printed copies and runtime grants (rule 814.2 stacking).
 * Returns 0 when the unit holds no combat role.
 */
export function combatRoleMightBonus(
  cardId: string,
  meta: Partial<RiftboundCardMeta> | CombatRoleMeta | undefined,
): number {
  const role = (meta as CombatRoleMeta | undefined)?.combatRole;
  if (role !== "attacker" && role !== "defender") {
    return 0;
  }
  const keyword = role === "attacker" ? "Assault" : "Shield";
  const def = getGlobalCardRegistry().get(cardId as CoreCardId as string);
  let bonus = 0;
  for (const ability of def?.abilities ?? []) {
    if (ability.type === "keyword" && (ability as { keyword?: string }).keyword === keyword) {
      bonus += (ability as { value?: number }).value ?? 1;
    }
  }
  if (bonus === 0) {
    bonus += (def?.keywords ?? []).filter((k) => k === keyword).length;
  }
  for (const granted of (meta as CombatRoleMeta | undefined)?.grantedKeywords ?? []) {
    if (granted.keyword === keyword) {
      bonus += granted.value ?? 1;
    }
  }
  return bonus;
}
