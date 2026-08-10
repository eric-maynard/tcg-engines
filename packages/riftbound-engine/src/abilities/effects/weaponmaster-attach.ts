// Effect handler: "weaponmaster-attach" — the resolution half of [Weaponmaster].
//
// rule 821.1.c: "When you play me, you may choose an Equipment you control …
// Pay the cost of its Equip ability, reduced by [A], to attach it to this unit."
// rule 383.3.a — the leading "you may" (and the choice of Equipment) is decided
// at FINALIZATION, which the `weaponmaster-equip` pending choice does.
// rule 383.3.b / 204.3.b — "Pay … to attach" is a cost inside an instruction
// LATER in the effect, so it is paid when the triggered ability RESOLVES: the
// item sits on the chain, every player gets priority, and only then is the cost
// paid and the Equipment attached. That resolution half is this handler.
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { deductAbilityCost } from "../../game-definition/moves/chain/activate-ability";
import { printedEquipCost } from "../../game-definition/moves/equip-cost";
import {
  canPayWeaponmasterEquip,
  weaponmasterEquipCost,
  weaponmasterSacrificeOptions,
} from "../../game-definition/moves/pending-choice";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { handle_equipAttach } from "./equip-attach";

export function handle_weaponmasterAttach(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const spec = effect as unknown as { equipmentId?: string; unitId?: string };
  const equipmentId = spec.equipmentId;
  const unitId = spec.unitId;
  if (!equipmentId || !unitId) {
    return;
  }
  const draft = ctx.draft as RiftboundGameState;
  const playerId = ctx.playerId;
  const getMeta = (m: CoreCardId) =>
    ctx.cards.getCardMeta?.(m) as Partial<RiftboundCardMeta> | undefined;

  // rule 821.1.c.2 / 206.1: the Equip cost is priced as though [Equip] were
  // activated choosing the Weaponmaster unit, then reduced by [A].
  const priced = weaponmasterEquipCost(equipmentId, unitId, getMeta);
  // rule 821.1.c.3 / 730.2 (unl-158-219 Shepherd's Heirloom): "Spend N XP" is not
  // an [A] cost, so Weaponmaster never waives it — it rides along in full.
  const printedXp = printedEquipCost(equipmentId)?.xp;
  const equipCost =
    priced === undefined
      ? undefined
      : printedXp !== undefined && printedXp > 0
        ? { ...priced, xp: printedXp }
        : priced;
  // rule 821.1.c.5 — re-checked HERE, not at the pick: responses made while the
  // item was on the chain can drain the pool, and then nothing attaches. Below
  // N XP the XP half is unpayable, so the Equipment stays where it is.
  if (
    !equipCost ||
    !canPayWeaponmasterEquip(draft, playerId, equipmentId, ctx, unitId, getMeta) ||
    (printedXp !== undefined && printedXp > 0 && (draft.players[playerId]?.xp ?? 0) < printedXp)
  ) {
    return;
  }
  deductAbilityCost(draft, playerId, equipCost, ctx.zones, ctx.counters);

  // rule 434 / 355.8 — the same attach the ordinary [Equip] resolution does,
  // including the Mighty check and the "fizzles if either card left the board"
  // guard, so the two paths cannot drift.
  handle_equipAttach(
    { equipmentId, type: "equip-attach", unitId } as unknown as ExecutableEffect,
    ctx,
    h,
  );

  // rule 821.1.c.3 / 818.1.c.3 (sfd-178-221 Blade of the Ruined King):
  // [A] waives one power pip only — the "Kill a friendly unit" half of the
  // Equip cost is still owed on the Weaponmaster path. rule 428.1.a.1 — it is
  // an Active Kill, so a token ceases to exist (186.1).
  if (equipCost.killFriendlyUnit === true && !draft.pendingChoice) {
    const fodder = weaponmasterSacrificeOptions(draft, playerId, unitId, ctx);
    if (fodder.length === 1) {
      h.executeEffect({ target: { type: "unit" }, type: "kill" } as unknown as ExecutableEffect, {
        ...ctx,
        boundTargets: [fodder[0] as string],
        sourceCardId: equipmentId,
      } as EffectContext);
    } else if (fodder.length > 1) {
      // rule 357.2: the payer picks which friendly unit pays.
      draft.pendingChoice = {
        effect: { target: { type: "unit" }, type: "kill" },
        options: fodder as never,
        playerId: playerId as never,
        remaining: 1,
        sourceCardId: equipmentId as never,
        type: "choose-target",
      } as RiftboundGameState["pendingChoice"];
    }
  }

  // rule 821.1.c / 476.1 (sfd-150-221 Last Rites): the non-resource part of the
  // Equip cost — "Recycle N cards from your trash" — is paid by its payer
  // choosing which cards leave the trash.
  const recycleCount = equipCost.recycleFromTrash as number | undefined;
  if (recycleCount !== undefined && recycleCount > 0 && !draft.pendingChoice) {
    const trash = ctx.zones
      .getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)
      .map((id: unknown) => id as string);
    draft.pendingChoice = {
      onPicked: "recycle",
      prompter: playerId,
      remaining: recycleCount,
      revealed: trash,
      revealer: playerId,
      type: "reveal-and-pick",
    } as RiftboundGameState["pendingChoice"];
  }
}
