import type { EffectHandler } from "./_helpers";
import { handle_draw } from "./draw";
import { handle_damage } from "./damage";
import { handle_kill } from "./kill";
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
import { handle_returnToHand } from "./return-to-hand";
import { handle_modifyMight } from "./modify-might";
import { handle_doubleMight } from "./double-might";
import { handle_grantAbility } from "./grant-ability";
import { handle_swapMight } from "./swap-might";
import { handle_empower } from "./empower";
import { handle_replacement } from "./replacement";
import { handle_heal } from "./heal";
import { handle_grantKeyword } from "./grant-keyword";
import { handle_grantKeywords } from "./grant-keywords";
import { handle_addResource } from "./add-resource";
import { handle_extraTurn } from "./extra-turn";
import { handle_banish } from "./banish";
import { handle_counter } from "./counter";
import { handle_createToken } from "./create-token";
import { handle_attach } from "./attach";
import { handle_detach } from "./detach";
import { handle_sequence } from "./sequence";
import { handle_conditional } from "./conditional";
import { handle_optional } from "./optional";
import { handle_choice } from "./choice";
import { handle_forEach } from "./for-each";
import { handle_doTimes } from "./do-times";
import { handle_fight } from "./fight";
import { handle_play } from "./play";
import { handle_look } from "./look";
import { handle_reveal } from "./reveal";
import { handle_revealHand } from "./reveal-hand";
import { handle_preventDamage } from "./prevent-damage";
import { handle_takeControl } from "./take-control";
import { handle_enterReady } from "./enter-ready";
import { handle_costReduction } from "./cost-reduction";
import { handle_costIncrease } from "./cost-increase";
import { handle_additionalCost } from "./additional-cost";
import { handle_gainXp } from "./gain-xp";
import { handle_spendXp } from "./spend-xp";
import { handle_predict } from "./predict";
import { handle_addRestriction } from "./add-restriction";
import { handle_nameCard } from "./name-card";
import { handle_removeRestriction } from "./remove-restriction";

export type { EffectHandler, EffectHelpers } from "./_helpers";

export const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  "draw": handle_draw,
  "damage": handle_damage,
  "kill": handle_kill,
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
  "return-to-hand": handle_returnToHand,
  "modify-might": handle_modifyMight,
  "double-might": handle_doubleMight,
  "grant-ability": handle_grantAbility,
  "swap-might": handle_swapMight,
  "empower": handle_empower,
  "disempower": handle_empower,
  "replacement": handle_replacement,
  "heal": handle_heal,
  "grant-keyword": handle_grantKeyword,
  "grant-keywords": handle_grantKeywords,
  "add-resource": handle_addResource,
  "extra-turn": handle_extraTurn,
  "banish": handle_banish,
  "counter": handle_counter,
  "create-token": handle_createToken,
  "attach": handle_attach,
  "detach": handle_detach,
  "sequence": handle_sequence,
  "conditional": handle_conditional,
  "optional": handle_optional,
  "choice": handle_choice,
  "for-each": handle_forEach,
  "do-times": handle_doTimes,
  "fight": handle_fight,
  "play": handle_play,
  "look": handle_look,
  "reveal": handle_reveal,
  "reveal-hand": handle_revealHand,
  "prevent-damage": handle_preventDamage,
  "take-control": handle_takeControl,
  "enter-ready": handle_enterReady,
  "cost-reduction": handle_costReduction,
  "cost-increase": handle_costIncrease,
  "additional-cost": handle_additionalCost,
  "gain-xp": handle_gainXp,
  "spend-xp": handle_spendXp,
  "predict": handle_predict,
  "add-restriction": handle_addRestriction,
  "name-card": handle_nameCard,
  "remove-restriction": handle_removeRestriction,
};
