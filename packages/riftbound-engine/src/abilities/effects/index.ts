import type { EffectHandler } from "./_helpers";
import { handle_delayedLoseControl } from "./delayed-lose-control";
import { handle_draw } from "./draw";
import { handle_damage } from "./damage";
import { handle_kill } from "./kill";
import { handle_temporaryKill } from "./temporary-kill";
import { handle_buff } from "./buff";
import { handle_score } from "./score";
import { handle_channel } from "./channel";
import { handle_ready } from "./ready";
import { handle_exhaust } from "./exhaust";
import { handle_stun } from "./stun";
import { handle_recall } from "./recall";
import { handle_move } from "./move";
import { handle_discard } from "./discard";
import { handle_recycle } from "./recycle";
import {
  handle_playBanishedCard,
  handle_playBanishedPass,
} from "./play-banished-pass";
import { handle_returnBanishedToHand } from "./return-banished-to-hand";
import { handle_returnToChampionZone } from "./return-to-champion-zone";
import { handle_returnToHand } from "./return-to-hand";
import { handle_modifyMight } from "./modify-might";
import { handle_doubleMight } from "./double-might";
import { handle_grantAbility } from "./grant-ability";
import { handle_swapMight } from "./swap-might";
import { handle_swapLocations } from "./swap-locations";
import { handle_increaseMightTo } from "./increase-might-to";
import { handle_setBaseMight } from "./set-base-might";
import { handle_gainControlOfSpell } from "./gain-control-of-spell";
import { handle_empower } from "./empower";
import { handle_replacement } from "./replacement";
import { handle_heal } from "./heal";
import { handle_grantFlow } from "./grant-flow";
import { handle_grantPlayPermission } from "./grant-play-permission";
import { handle_grantKeyword } from "./grant-keyword";
import { handle_grantKeywords } from "./grant-keywords";
import { handle_addResource } from "./add-resource";
import { handle_extraTurn } from "./extra-turn";
import { handle_winGame } from "./win-game";
import { handle_banish } from "./banish";
import { handle_counter } from "./counter";
import { handle_createToken } from "./create-token";
import { handle_replaceBattlefield } from "./replace-battlefield";
import { handle_swapBackBattlefield } from "./swap-back-battlefield";
import { handle_eachOpponentMay } from "./each-opponent-may";
import { handle_attach } from "./attach";
import { handle_attach_or_detach } from "./attach-or-detach";
import { handle_detach } from "./detach";
import { handle_equipAttach } from "./equip-attach";
import { handle_weaponmasterAttach } from "./weaponmaster-attach";
import { handle_become_copy } from "./become-copy";
import { handle_sequence } from "./sequence";
import { handle_conditional } from "./conditional";
import { handle_optional } from "./optional";
import { handle_choice } from "./choice";
import { handle_eachPlayerMay } from "./each-player-may";
import { handle_forEach } from "./for-each";
import { handle_choosePerLocation } from "./choose-per-location";
import { handle_doTimes } from "./do-times";
import { handle_reflexive } from "./reflexive";
import { handle_fight } from "./fight";
import { handle_play } from "./play";
import { handle_look } from "./look";
import { handle_mill } from "./mill";
import { handle_reveal } from "./reveal";
import { handle_revealHand } from "./reveal-hand";
import { handle_preventDamage } from "./prevent-damage";
import { handle_takeControl } from "./take-control";
import { handle_linkedBanishedToTrash } from "./linked-banished-to-trash";
import { handle_trashFacedown } from "./trash-facedown";
import { handle_enterReady } from "./enter-ready";
import { handle_costReduction } from "./cost-reduction";
import { handle_costIncrease } from "./cost-increase";
import { handle_additionalCost } from "./additional-cost";
import { handle_gainXp } from "./gain-xp";
import { handle_grantVisibility } from "./grant-visibility";
import { handle_spendXp } from "./spend-xp";
import { handle_spendBuff } from "./spend-buff";
import { handle_predict } from "./predict";
import { handle_addRestriction } from "./add-restriction";
import { handle_nameCard } from "./name-card";
import { handle_orderTop } from "./order-top";
import { handle_removeRestriction } from "./remove-restriction";
import { handle_turnStatic } from "./turn-static";
import { handle_revealRuneBranch } from "./reveal-rune-branch";
import { handle_activateConquerEffects } from "./activate-conquer-effects";

export type { EffectHandler, EffectHelpers } from "./_helpers";

export const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  // rule 383.4.g.1 — ogn-286-298 Reckoner's Arena
  "activate-conquer-effects": handle_activateConquerEffects,
  // rule 317.1 / 455 — sfd-202-221 "…at end of turn" control expiry + recall
  "delayed-lose-control": handle_delayedLoseControl,
  "draw": handle_draw,
  "damage": handle_damage,
  "kill": handle_kill,
  // rule 816.1 — the [Temporary] chain item pushed by the Beginning Phase
  "temporary-kill": handle_temporaryKill,
  "buff": handle_buff,
  "score": handle_score,
  "channel": handle_channel,
  "ready": handle_ready,
  "exhaust": handle_exhaust,
  "stun": handle_stun,
  "recall": handle_recall,
  "move": handle_move,
  "discard": handle_discard,
  "recycle": handle_recycle,
  // rule 337.1.b (ogn-115-298) — the deferred "then each player plays those cards" pass.
  "play-banished-pass": handle_playBanishedPass,
  "play-banished-card": handle_playBanishedCard,
  "return-banished-to-hand": handle_returnBanishedToHand,
  "return-to-champion-zone": handle_returnToChampionZone,
  "return-to-hand": handle_returnToHand,
  "modify-might": handle_modifyMight,
  "double-might": handle_doubleMight,
  "grant-ability": handle_grantAbility,
  "swap-might": handle_swapMight,
  "swap-locations": handle_swapLocations,
  "increase-might-to": handle_increaseMightTo,
  "set-base-might": handle_setBaseMight,
  "gain-control-of-spell": handle_gainControlOfSpell,
  "empower": handle_empower,
  "disempower": handle_empower,
  "replacement": handle_replacement,
  "heal": handle_heal,
  "grant-flow": handle_grantFlow,
  "grant-play-permission": handle_grantPlayPermission,
  "grant-keyword": handle_grantKeyword,
  "grant-keywords": handle_grantKeywords,
  "add-resource": handle_addResource,
  "extra-turn": handle_extraTurn,
  "win-game": handle_winGame,
  "banish": handle_banish,
  "counter": handle_counter,
  "create-token": handle_createToken,
  "replace-battlefield": handle_replaceBattlefield,
  // rule 438.7 (rule-id: unl-t03) — "replace this with the battlefield it replaced".
  "swap-back-battlefield": handle_swapBackBattlefield,
  // rule-id: sfd-081-221 — "each opponent may …".
  "each-opponent-may": handle_eachOpponentMay,
  "attach": handle_attach,
  "attach-or-detach": handle_attach_or_detach,
  "detach": handle_detach,
  // rule 377.3 / 818.1.c.1: the chain-resolution half of an [Equip] activation.
  "equip-attach": handle_equipAttach,
  // rule 821.1.c / 383.3.b: the chain-resolution half of [Weaponmaster]'s
  // "Pay … to attach it to this unit" — the cost is paid here, not at the pick.
  "weaponmaster-attach": handle_weaponmasterAttach,
  // rule 477.1.b (ven-137-166): equipped unit becomes a copy of a chosen unit.
  "become-copy": handle_become_copy,
  "sequence": handle_sequence,
  "conditional": handle_conditional,
  "optional": handle_optional,
  "choice": handle_choice,
  "each-player-may": handle_eachPlayerMay,
  "for-each": handle_forEach,
  "choose-per-location": handle_choosePerLocation,
  "do-times": handle_doTimes,
  reflexive: handle_reflexive,
  "fight": handle_fight,
  "play": handle_play,
  "look": handle_look,
  // rule 440.1 — [Burn N]: put the top N cards of a Main Deck into its trash.
  // "burn" is the printed keyword; "mill" is the legacy internal spelling —
  // both must dispatch to the same handler.
  "mill": handle_mill,
  "burn": handle_mill,
  "reveal": handle_reveal,
  "reveal-hand": handle_revealHand,
  "prevent-damage": handle_preventDamage,
  "take-control": handle_takeControl,
  "linked-banished-to-trash": handle_linkedBanishedToTrash,
  "trash-facedown": handle_trashFacedown,
  "enter-ready": handle_enterReady,
  "cost-reduction": handle_costReduction,
  "cost-increase": handle_costIncrease,
  "additional-cost": handle_additionalCost,
  "gain-xp": handle_gainXp,
  "grant-visibility": handle_grantVisibility,
  "spend-xp": handle_spendXp,
  // rule-id: ogn-147-298 — "spend a buff to X" cost handler.
  "spend-buff": handle_spendBuff,
  "predict": handle_predict,
  "add-restriction": handle_addRestriction,
  "name-card": handle_nameCard,
  "order-top": handle_orderTop,
  "remove-restriction": handle_removeRestriction,
  // rule 364.3 (ogn-053-298) — turn-scoped continuous (static-like) effect.
  "turn-static": handle_turnStatic,
  // rule 416.1.a (ogn-200-298) — reveal the top rune, recycle it, then take
  // the branch dictated by its domain (never a controller choice).
  "reveal-rune-branch": handle_revealRuneBranch,
};
