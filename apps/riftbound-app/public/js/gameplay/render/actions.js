// render/actions.js — Action panel (renderActions), move descriptions, and
// cost-payment re-evaluation. Classic script: everything is global.
// Split out of renderer.js.

/** Resolve a param value: if it's a card ID, return the card name */
function resolveParamValue(value) {
  if (typeof value !== "string") return value;
  const card = findCard(value);
  if (card && card.name) return card.name;
  return value.replace(/^player-[12]-/, "");
}

/**
 * Rule 355.3 — display text for mode `idx` of a "Choose one —" prompt: the
 * server-computed `optionLabels`, else the option's printed `label`/`text`,
 * else a short rendering of its instruction (never a raw id like "create-token 4").
 */
function modeOptionText(pending, idx) {
  const fromServer = pending?.optionLabels?.[idx];
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer;
  const opt = pending?.effect?.options?.[idx];
  const printed = opt?.label ?? opt?.text ?? opt?.effect?.text;
  if (typeof printed === "string" && printed.trim()) return printed;
  return humanizeEffect(opt?.effect) || `Option ${Number(idx) + 1}`;
}

/** Short English rendering of a condition payload ("" when it can't be described). */
function humanizeCondition(c) {
  if (!c || typeof c !== "object") return "";
  if (typeof c.text === "string" && c.text.trim()) return c.text;
  if (c.type === "count") {
    const t = c.target && typeof c.target === "object" ? c.target : {};
    const cmp = c.comparison && typeof c.comparison === "object" ? c.comparison : {};
    const [op, val] = Object.entries(cmp)[0] ?? [];
    if (typeof val !== "number") return "";
    const who = t.controller === "enemy" ? "the opponent has" : "you have";
    const noun = `${t.type ?? "card"}${val === 1 ? "" : "s"}`;
    const where = t.location === "hand" ? " in hand" : t.location === "battlefield" ? " at a battlefield" : t.location === "base" ? " in base" : t.location === "trash" ? " in the trash" : "";
    if (op === "lte" || op === "gte") return `${who} ${val} or ${op === "lte" ? "fewer" : "more"} ${noun}${where}`;
    if (op === "lt" || op === "gt") return `${who} ${op === "lt" ? "fewer" : "more"} than ${val} ${noun}${where}`;
    if (op === "eq") return `${who} exactly ${val} ${noun}${where}`;
    return "";
  }
  return "";
}

/**
 * English noun phrase for a target payload, honouring `quantity` — rule 355.5: a
 * chain item must say how many it affects ("up to 4 friendly runes", not "a friendly rune").
 * Quantity is `number | "all" | "any" | { upTo | atLeast | exactly }`.
 */
function targetNoun(t) {
  if (!t || typeof t !== "object") return "";
  const q = t.quantity;
  const kind = t.type ?? "target";
  // Target-DSL selectors that name an already-known object rather than a class of
  // cards: phrase them as pronouns, never as "a trigger-source" (rule 355.5 — the
  // chain item must read as English).
  if (kind === "trigger-source" || kind === "trigger-target") return "it";
  if (kind === "self" || kind === "source") return "this";
  // Card defs write the location either singular ("battlefield") or plural
  // ("battlefields", e.g. Tibbers ogs-018-024) — both name the same zone, so
  // normalise before phrasing or the qualifier silently vanishes.
  const loc = typeof t.location === "string" ? t.location.replace(/s$/, "") : t.location;
  const who = t.controller === "friendly" ? "friendly " : t.controller === "enemy" ? "enemy " : "";
  const article = t.controller === "enemy" ? "an " : "a ";
  let count = null;
  let prefix = null;
  if (typeof q === "number") count = q;
  else if (q === "all") prefix = "all ";
  else if (q === "any") prefix = "any number of ";
  else if (q && typeof q === "object") {
    if (typeof q.exactly === "number") count = q.exactly;
    else if (typeof q.upTo === "number") { count = q.upTo; prefix = `up to ${q.upTo} `; }
    else if (typeof q.atLeast === "number") { count = q.atLeast; prefix = `at least ${q.atLeast} `; }
  }
  const plural = prefix === "all " || prefix === "any number of " || (count != null && count !== 1);
  const head = prefix ?? (count != null && count !== 1 ? `${count} ` : article);
  const where =
    loc === "battlefield"
      ? plural
        ? " at battlefields"
        : " at a battlefield"
      : loc === "base"
        ? plural
          ? " in bases"
          : " in a base"
        : "";
  return `${head}${who}${kind}${plural ? "s" : ""}${where}`;
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five"];

/** Numeric count behind a `quantity` payload, or null for "all"/"any"/absent. */
function quantityCount(q) {
  if (typeof q === "number") return q;
  if (q && typeof q === "object") {
    if (typeof q.exactly === "number") return q.exactly;
    if (typeof q.upTo === "number") return q.upTo;
    if (typeof q.atLeast === "number") return q.atLeast;
  }
  return null;
}

/**
 * rule 428.1.a.1 — `player: "each"` makes EVERY player perform the effect on the
 * cards they control, and it is mandatory for anyone able to. Phrase it that way
 * ("Each player kills one of their gear") instead of the caster-relative
 * "Kill up to 1 friendly gear", which both drops the other player and reads as
 * optional. Returns "" when the shape isn't one we can phrase.
 */
function eachPlayerEffect(e, n) {
  const t = e.target && typeof e.target === "object" ? e.target : null;
  const ownTargets = !t || t.controller == null || t.controller === "friendly";
  const c = quantityCount(t?.quantity);
  const kind = t?.type ?? "card";
  const noun = c != null && c !== 1
    ? `${COUNT_WORDS[c] ?? c} of their ${kind}${kind.endsWith("s") ? "" : "s"}`
    : `one of their ${kind}`;
  switch (e.type) {
    case "kill": return ownTargets ? `Each player kills ${noun}` : "";
    case "recycle": return ownTargets ? `Each player recycles ${noun}` : "";
    case "discard": return `Each player discards ${n ?? 1}`;
    case "draw": return `Each player draws ${n ?? 1}`;
    default: return "";
  }
}

/** Minimal English rendering of an effect payload (label fallback only). */
function humanizeEffect(e) {
  if (!e || typeof e !== "object") return "";
  const t = e.target && typeof e.target === "object" ? e.target : null;
  const noun = targetNoun(t);
  const n = typeof e.amount === "number" ? e.amount : null;
  const turn = e.duration === "turn" ? " this turn" : "";
  if (e.player === "each") {
    const each = eachPlayerEffect(e, n);
    if (each) return each;
  }
  switch (e.type) {
    // rule 355.5 — "Deal N damage divided as you choose" hits SEVERAL targets for
    // a share each; "→ A, B" alone reads as N to each, so say "split".
    case "damage": {
      const splash = typeof e.splashOthers === "number"
        ? `, then ${e.splashOthers} to each other enemy unit there`
        : "";
      if (e.split) return `Deal ${n ?? "damage"} split among ${noun || "units"}${splash}`;
      return `Deal ${n ?? "damage"} to ${noun || "a unit"}${splash}`;
    }
    case "draw": return `Draw ${n ?? 1}`;
    case "counter": return "Counter a spell";
    case "create-token": {
      const k = e.token ?? {};
      const c = n ?? 1;
      // Tokens created with ready:false (or exhausted:true) enter exhausted —
      // say so, otherwise the chain overlay misstates the effect.
      const exhausted = e.ready === false || e.exhausted === true ? " exhausted" : "";
      return `Play ${c === 1 ? "a" : c} ${k.might != null ? `${k.might} Might ` : ""}${k.name ?? "token"} ${k.type ?? "unit"} token${c === 1 ? "" : "s"}${k.keywords?.length ? ` with ${k.keywords.join(", ")}` : ""}${exhausted}`;
    }
    // rule 355.8 (rule-id: ven-154-166) — a reference-pair kill compares the
    // victim against a SECOND, caster-chosen unit that is not itself killed.
    // Naming the yardstick keeps the chain item honest about who dies.
    case "kill": {
      const ref = e.reference && typeof e.reference === "object" ? e.reference : null;
      const cmp = ref && t?.filter?.mightLessThanReference
        ? ` with less Might than ${targetNoun({ controller: "friendly", ...ref }) || "a unit you control"}`
        : "";
      return `Kill ${noun || "a unit"}${cmp}`;
    }
    case "buff": return `Buff ${noun || "a unit"}`;
    case "stun": return `Stun ${noun || "a unit"}`;
    case "ready": return `Ready ${noun || "a permanent"}`;
    case "exhaust": return `Exhaust ${noun || "a permanent"}`;
    // rule 355.4 — a move names a DESTINATION as well as a mover; the default
    // "Move — a friendly unit" hides where the unit lands.
    case "move": {
      const dest = e.to === "choose" || e.to == null
        ? "base or a battlefield"
        : e.to === "target-battlefield"
          ? "that unit's battlefield"
          : e.to === "base"
            ? "base"
            : e.to === "battlefield"
              ? "a battlefield"
              : String(e.to);
      if (e.swap) return `Swap ${noun || "a unit"} with ${targetNoun(e.partner) || "another unit"}`;
      if (e.toOrFromBase) return `Move ${noun || "a friendly unit"} to or from its base`;
      return `Move ${noun || "a friendly unit"} to ${dest}`;
    }
    case "recall": return `Recall ${noun || "a unit"} to base${e.exhausted ? " exhausted" : ""}`;
    case "modify-might": return `Give ${noun || "a unit"} ${n != null && n >= 0 ? "+" : ""}${n ?? ""} Might${turn}`;
    // rule 385.2: an ability that functions from the trash must say where the card
    // is returned FROM, and target:"self" names the source card, not "a unit".
    case "return-to-hand": {
      const self = e.target === "self";
      const from = e.from === "trash" ? " from your trash" : e.from === "battlefield" ? " from the battlefield" : e.from === "base" ? " from your base" : "";
      return `Return ${self ? "this" : noun || "a unit"}${from} to ${self ? "your" : "its owner's"} hand`;
    }
    case "recycle": return `Recycle ${noun || "cards"}`;
    case "discard": return `${e.player === "opponent" ? "Opponent discards" : "Discard"} ${n ?? 1}`;
    case "channel": return `Channel ${n ?? 1} rune${n === 1 ? "" : "s"}${e.exhausted ? " exhausted" : ""}`;
    case "grant-keyword": return `${noun ? `Give ${noun} ` : "Gain "}${e.keyword ?? "a keyword"}${e.value != null ? ` ${e.value}` : ""}${turn}`;
    case "empower": return `Empower ${noun || "a unit"}${turn}`;
    case "disempower": return `Disempower ${noun || "a unit"}${turn}`;
    case "sequence": return (e.effects ?? []).map(humanizeEffect).filter(Boolean).join(", then ");
    // rule 355.5 — a chain item must say what it will do: describe the body of a
    // conditional effect (plus its condition), never the raw "conditional" type.
    case "conditional": {
      // rule 355.5 (ven-037-166 Tomb-Raider Barbara) — the object is often named
      // on the conditional NODE ("Disempower an enemy gear; otherwise kill it"),
      // leaving both branches targetless. Inherit the node's target so the branch
      // names the real card type instead of falling back to "a unit".
      const inherit = (b) =>
        b && typeof b === "object" && b.target === undefined && e.target !== undefined
          ? { ...b, target: e.target }
          : b;
      const body = humanizeEffect(inherit(e.then ?? e.effect));
      const cond = humanizeCondition(e.condition);
      const alt = humanizeEffect(inherit(e.else));
      if (!body) return alt ? `Otherwise ${alt}` : "";
      return `${body}${cond ? ` if ${cond}` : ""}${alt ? `, otherwise ${alt}` : ""}`;
    }
    case "raw": return String(e.text ?? "");
    default: {
      const verb = String(e.type ?? "effect").replace(/-/g, " ");
      return `${verb.charAt(0).toUpperCase()}${verb.slice(1)}${n != null ? ` ${n}` : ""}${noun ? ` — ${noun}` : ""}`;
    }
  }
}

/** Depth-first search for a `reference` slot anywhere in an effect tree. */
function findEffectReference(e) {
  if (!e || typeof e !== "object") return null;
  if (e.reference && typeof e.reference === "object") return e.reference;
  for (const child of [e.then, e.else, e.effect, ...(Array.isArray(e.effects) ? e.effects : []), ...(Array.isArray(e.options) ? e.options : [])]) {
    const found = findEffectReference(child);
    if (found) return found;
  }
  return null;
}

/**
 * rule 355.8 — an item's locked `targets` can hold objects the effect will NOT
 * act on: a reference-pair spell (ven-154-166 Public Execution) stores
 * `[reference, victim]`, the reference being the friendly Might yardstick.
 * Split the two so the overlay never lists the yardstick beside the victims as
 * though it were also being killed. Returns `{ reference, targets }` of names.
 */
function splitChainTargets(effect, names) {
  const list = Array.isArray(names) ? names.slice() : [];
  if (list.length < 2 || !findEffectReference(effect)) return { reference: null, targets: list };
  return { reference: list[0], targets: list.slice(1) };
}

/** rule 355.5 — the one-line "what this item will do" text for a chain item. */
function chainWhatText(effect, names, modeText) {
  const split = splitChainTargets(effect, names);
  // rule 355.5 — a divided-damage set shares ONE amount out; "→ A, B" would read
  // as the full amount to each, so label the list as the split.
  const arrow = effect && typeof effect === "object" && effect.type === "damage" && effect.split
    ? "split:"
    : "→";
  const base = [modeText || "", split.targets.length ? `${arrow} ${split.targets.join(", ")}` : ""].filter(Boolean).join(" ");
  if (!split.reference) return base;
  return [base, `(compared to ${split.reference})`].filter(Boolean).join(" ");
}

/** Fallback param formatter: show only resolved values without raw key names */
function formatParamsFallback(params) {
  if (!params) return "";
  const vals = Object.entries(params)
    .filter(([k]) => k !== "playerId" && k !== "method")
    .map(([, v]) => resolveParamValue(v))
    .filter(v => v != null && v !== "");
  return vals.join(", ");
}

/** Format a move's params into a natural-language description */
function formatMoveDescription(moveId, params) {
  if (!params) return null;
  const r = (v) => Array.isArray(v) ? v.map(resolveParamValue).join(", ") : resolveParamValue(v);
  const bf = (v) => typeof v === "string" ? getBattlefieldName(v) : String(v ?? "");
  // A play location is "base" or "battlefield-<bfId>" — name the battlefield.
  const loc = (v) => !v || v === "base" ? "base" : getBattlefieldName(String(v).replace(/^battlefield-/, ""));
  switch (moveId) {
    case "playUnit": return `${r(params.cardId)} to ${loc(params.location)}${costObjectSuffix(params)}`;
    case "playFromChampionZone": {
      const champ = (typeof zoneForPlayer === "function" ? zoneForPlayer("championZone", viewingPlayer)[0] : null);
      return `${champ?.name ?? "Champion"} to ${loc(params.location)}${params.paidAdditionalCost ? " (+ additional cost)" : ""}`;
    }
    // rule 476.1: [Equip] — name both the Equipment and the unit it attaches to.
    case "equipCard": return `${r(params.equipmentId)} → ${r(params.unitId)}`;
    case "revealHidden": return `${r(params.cardId)}`;
    // [rule:sfd-122-221 Repeat] repeatCount / paidAdditionalCost variants must be distinguishable.
    case "playSpell": return `${r(params.cardId)}${params.repeatCount ? ` (Repeat ×${params.repeatCount})` : ""}${params.paidAdditionalCost ? " (+ additional cost)" : ""}${costObjectSuffix(params)}${params.targets?.length ? " → " + r(params.targets) : ""}`;
    case "playGear": return `${r(params.cardId)}${costObjectSuffix(params)}${params.chosenTargetId ? " → " + r(params.chosenTargetId) : ""}`;
    case "exhaustRune": return `${r(params.runeId)}`;
    case "recycleRune": return `${r(params.runeId)}${params.domain ? " for " + params.domain : ""}`;
    case "standardMove": return `${r(params.unitIds)} to ${bf(params.destination)}`;
    case "gankingMove": return `${r(params.unitId)} to ${bf(params.toBattlefield)}`;
    case "assignAttacker": return `${r(params.unitId)}`;
    case "assignDefender": return `${r(params.unitId)}`;
    case "contestBattlefield": return `${bf(params.battlefieldId)}`;
    case "conquerBattlefield": return `${bf(params.battlefieldId)}`;
    case "recallUnit": return `${r(params.unitId)}`;
    // rule 723 (Hidden): two hideable cards at the same battlefield must be told apart.
    case "hideCard": return `${r(params.cardId)} at ${bf(params.battlefieldId)}`;
    case "scorePoint": return `${bf(params.battlefieldId)}`;
    // Inherited abilities (Heimerdinger) share cardId — name the source card and
    // ability slot so the options are distinguishable.
    case "activateAbility": {
      // Name the ability by its printed cost + effect (rule 331.1) so two
      // abilities on the same card — and inherited ones (Heimerdinger) — are
      // told apart without reading the board.
      const shown = typeof activatedAbilityLabel === "function"
        ? activatedAbilityLabel(params.cardId, params.abilityIndex, params.sourceCardId)
        : `${r(params.cardId)}${Number.isInteger(params.abilityIndex) && params.abilityIndex > 0 ? ` — ability ${params.abilityIndex + 1}` : ""}`;
      return `${shown}${costObjectSuffix(params)}${params.targets?.length ? " → " + r(params.targets) : ""}`;
    }
    case "resolveFullCombat": return `${bf(params.battlefieldId)}`;
    case "passChainPriority": return null;
    case "passShowdownFocus": return null;
    case "advancePhase": return null;
    case "endTurn": return null;
    case "channelRunes": return null;
    case "drawCard": return null;
    case "readyAll": return null;
    case "emptyRunePool": return null;
    case "concede": return null;
    case "pass": return null;
    default: return null;
  }
}

/** Re-evaluate cost payment mode after a state update */
function reevaluateCostPayment() {
  const pendingId = interaction.pendingCardId;
  const pendingCost = interaction.pendingCardCost;
  if (!pendingId || !pendingCost) {
    resetInteractionSilent();
    render();
    return;
  }

  // Check if the pending card is still in hand
  const card = findCard(pendingId);
  const zone = findCardZone(pendingId);
  if (!card || zone !== "hand") {
    // Card is gone, cancel
    resetInteractionSilent();
    render();
    return;
  }

  const pool = gameState?.runePools?.[viewingPlayer];
  const currentEnergy = pool?.energy ?? 0;

  // Check if play moves are now available (server says card is playable)
  const playMoves = availableMoves.filter(m =>
    (m.moveId === "playUnit" || m.moveId === "playSpell" || m.moveId === "playGear") &&
    m.params?.cardId === pendingId
  );

  if (playMoves.length > 0) {
    // Card is now affordable — transition to cardSelected with play moves
    interaction = {
      mode: "cardSelected",
      sourceCardId: pendingId,
      sourceZone: "hand",
      action: "playCard",
      validTargets: ["player-base"],
      matchingMoves: playMoves,
      pendingCardId: null,
      pendingCardCost: 0,
    };
    selectedCard = pendingId;
    clearRuneTappableHighlights();
    applyValidTargetHighlights();
    showCostPaymentActionBar(card, currentEnergy);
    return;
  }

  // Still can't afford — keep the prompt open only while some rune gesture can
  // actually advance THIS cost. rule 414.1.b: an exhausted rune cannot be
  // exhausted again; rule 164.2.b: recycling adds Power, never generic energy —
  // so counting every rune move left the bar open on an unpayable cost whose only
  // exit was Cancel, still telling the player to exhaust runes.
  const outstanding = typeof costPaymentOutstanding === "function"
    ? costPaymentOutstanding()
    : { energyShortfall: Math.max(0, pendingCost - currentEnergy), unmetPips: [] };
  const usefulRuneMoves = availableMoves.filter(m =>
    (m.moveId === "exhaustRune" && outstanding.energyShortfall > 0) ||
    (m.moveId === "recycleRune" && outstanding.unmetPips.length > 0)
  );

  if (usefulRuneMoves.length === 0) {
    // DESIGN.md §Paying costs: never take the prompt away without saying so.
    showToast(outstanding.unmetPips.length > 0
      ? `Can't pay ${outstanding.unmetPips.map(p => `[${p}]`).join("")} — no rune left to recycle`
      : `Not enough energy (${currentEnergy}/${pendingCost}) — no more runes available`);
    resetInteractionSilent();
    render();
    return;
  }

  // Stay in costPayment mode — re-apply highlights and update action bar
  applyRuneTappableHighlights();
  showCostPaymentActionBar(card, currentEnergy);
}

/**
 * Split a card's printed rules text into its activated-ability segments.
 * Activated abilities are printed "COST: effect" (rule 331.1), e.g.
 * "[Exhaust]: Give a unit +2 Might." or "[Empower] [2][fury]: …".
 * Reminder text in parentheses is dropped.
 */
function activatedAbilitySegments(card) {
  const text = (card?.rulesText || "")
    .replace(/\(([^()]*)\)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!text) return [];
  return text
    .split(/\n+|(?<=\.)\s+/)
    .map(s => s.trim())
    // rule 331.1: the cost/effect divider is printed as ":" OR as an em dash
    // ("[Empower] — Discard 1"); dropping the em-dash form left every variant
    // of the move sharing one bare card-name button.
    // rule 827.1.c.1: "[Empower] [2]" is printed sugar for "[2]: Empower this"
    // — an activated ability whose whole segment is bracket cost tokens, with
    // no ":" and no dash. Without it Tools of Empire (ven-077-166) produced a
    // single segment and both ability buttons wore the [Exhaust] label.
    .filter(s =>
      /^[^:]{1,48}:/.test(s)
      || /^\[[^\]]{1,24}\]\s*[—–-]\s*\S/.test(s)
      || /^\[\s*Empower\s*\]\s*(?:\[[^\]]+\]\s*,?\s*)+$/i.test(s));
}

/**
 * Name the OBJECTS a move pays with (rule 357.2 additional costs), so variants
 * that differ only by which card is discarded/sacrificed/recycled read as
 * distinct choices instead of N identical buttons.
 */
const COST_OBJECT_PARAM_VERBS = {
  discardId: "discard", discardIds: "discard",
  sacrificeId: "sacrifice", sacrificeIds: "sacrifice",
  recycleId: "recycle", recycleIds: "recycle",
  killId: "kill", killIds: "kill",
  exhaustId: "exhaust", exhaustIds: "exhaust",
  returnGearId: "return", returnCardId: "return",
  spentBuffId: "spend buff on", spentBuffIds: "spend buff on",
};

function costObjectSuffix(params) {
  if (!params) return "";
  const parts = [];
  // rule-id: sfd-044-221 — the enumerator fills the legacy `sacrificeId` for a
  // "return to hand" additional cost too, so read the cost KIND off
  // `costs.paid` before calling it a sacrifice.
  const bounced = params.costs?.paid?.["return-to-hand"];
  for (const [key, rawVerb] of Object.entries(COST_OBJECT_PARAM_VERBS)) {
    const verb = bounced && (key === "sacrificeId" || key === "sacrificeIds") ? "return" : rawVerb;
    const value = params[key];
    if (value == null || (Array.isArray(value) && value.length === 0)) continue;
    const names = Array.isArray(value)
      ? value.map(resolveParamValue).join(", ")
      : resolveParamValue(value);
    if (names === "" || names == null) continue;
    parts.push(`${verb} ${names}`);
  }
  return parts.length ? ` — ${parts.join(", ")}` : "";
}

/** rule 476.1: the printed "[Equip] [cost]" of an Equipment, e.g. "Equip [fury]" ("" when absent). */
function equipCostText(cardId) {
  const text = findCard(cardId)?.rulesText || "";
  const m = text.match(/\[\s*Equip\s*\]\s*((?:\[[^\]]+\]\s*)*)/i);
  if (!m) return "";
  const cost = (m[1] || "").replace(/\s+/g, "").trim();
  return cost ? `Equip ${cost}` : "Equip";
}

/**
 * Human label for an activateAbility move: the ability's own cost + effect text,
 * so a player can tell "[Exhaust]: Buff me" from "Empower — [2][fury]" instead of
 * reading a generic "Activate Ability" button.
 */
function activatedAbilityLabel(cardId, abilityIndex, sourceCardId) {
  const card = findCard(cardId);
  const name = String(card?.name ?? cardId ?? "").replace(/^player-[12]-/, "");
  const srcCard = sourceCardId && sourceCardId !== cardId ? findCard(sourceCardId) : null;
  const segs = activatedAbilitySegments(srcCard ?? card);
  let seg = null;
  if (segs.length === 1) {
    seg = segs[0];
  } else if (segs.length > 1) {
    const i = Number.isInteger(abilityIndex) ? abilityIndex : 0;
    seg = segs[i] ?? segs[segs.length - 1];
  }
  const suffix = srcCard ? ` (from ${String(srcCard.name ?? sourceCardId).replace(/^player-[12]-/, "")})` : "";
  if (!seg) {
    return `${name}${Number.isInteger(abilityIndex) && abilityIndex > 0 ? ` — ability ${abilityIndex + 1}` : ""}${suffix}`;
  }
  return `${name} — ${seg}${suffix}`;
}

// rule 357.1.a — during the pay-costs step the only things the controller may do
// are Add resources (or cancel). Anything that SPENDS the pool being accumulated
// for the pending card must not be offered while that payment is open.
const COST_PAYMENT_PANEL_MOVES = ["exhaustRune", "recycleRune", "addResources"];

function renderActions() {
  const list = document.getElementById("actionsList");
  const payingCosts = interaction.mode === "costPayment" && !!interaction.pendingCardId;
  // While a payment is open the panel shows only the Add-resource actions plus an
  // explicit way out — never another play that would spend the pool being built.
  const panelMoves = payingCosts
    ? (availableMoves ?? []).filter(m => COST_PAYMENT_PANEL_MOVES.includes(m.moveId))
    : availableMoves;
  if (!payingCosts && (!availableMoves || availableMoves.length === 0)) {
    list.innerHTML = '<div style="color:#6a6288; font-size:11px; padding:4px;">No moves available</div>';
    return;
  }

  const MOVE_LABELS = {
    advancePhase: "Advance Phase",
    endTurn: "End Turn",
    pass: "Pass",
    channelRunes: "Channel Runes",
    drawCard: "Draw Card",
    readyAll: "Ready All",
    emptyRunePool: "Empty Rune Pool",
    playUnit: "Play Unit",
    playSpell: "Play Spell",
    playGear: "Play Gear",
    standardMove: "Move Unit",
    gankingMove: "Ganking Move",
    recallUnit: "Recall Unit",
    exhaustRune: "Exhaust Rune",
    recycleRune: "Recycle Rune",
    contestBattlefield: "Contest Battlefield",
    conquerBattlefield: "Conquer Battlefield",
    scorePoint: "Score Point",
    hideCard: "Hide Card",
    revealHidden: "Reveal Hidden",
    addResources: "Add Resources",
    spendResources: "Spend Resources",
    concede: "Concede",
    passChainPriority: "Pass Priority",
    passShowdownFocus: "Pass Focus",
    resolveChain: "Resolve Chain",
    startShowdown: "Start Showdown",
    endShowdown: "End Showdown",
    activateAbility: "Activate Ability",
    resolveFullCombat: "Resolve Combat",
    playFromChampionZone: "Play Champion",
    equipCard: "Equip",
    resolvePendingChoice: "Choose",
  };

  // Categorize moves into sections
  const sections = {
    turn: { label: "Turn Actions", moveIds: ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll", "emptyRunePool"], moves: [] },
    play: { label: "Play Cards", moveIds: ["playUnit", "playFromChampionZone", "playSpell", "playGear", "hideCard"], moves: [] },
    // Activated abilities are a primary action (rule 331) — they belong next to
    // Play Cards, not buried under "Other" below Concede. [Equip] (rule 476.1)
    // and revealing a Hidden card (rule 723) are abilities of the card too.
    abilities: { label: "Abilities", moveIds: ["activateAbility", "equipCard", "revealHidden"], moves: [] },
    movement: { label: "Movement", moveIds: ["standardMove", "gankingMove", "recallUnit"], moves: [] },
    runes: { label: "Rune Actions", moveIds: ["exhaustRune", "recycleRune"], moves: [] },
    battlefield: { label: "Battlefield", moveIds: ["contestBattlefield", "conquerBattlefield", "scorePoint"], moves: [] },
    other: { label: "Other", moveIds: [], moves: [] },
  };

  for (const move of panelMoves) {
    // Prompt answers are rendered by the pending / trigger-order block above the
    // sections — never as an anonymous "Other" group.
    if (move.moveId === "resolvePendingChoice") continue;
    // Concede lives in the sidebar header (match.js: Concede game / Concede match, with a confirm).
    if (move.moveId === "concede" && typeof matchConcedeButtonsHtml === "function") continue;
    let placed = false;
    for (const section of Object.values(sections)) {
      if (section.moveIds.includes(move.moveId)) {
        section.moves.push(move);
        placed = true;
        break;
      }
    }
    if (!placed) sections.other.moves.push(move);
  }

  let html = "";
  if (payingCosts) {
    const pendingName = String(findCard(interaction.pendingCardId)?.name ?? interaction.pendingCardId)
      .replace(/^player-[12]-/, "");
    html += `<div class="action-section-title" style="background:#3a2a4a;color:#ffd070;padding:6px;border-radius:3px;">
      Paying for ${esc(pendingName)} — add resources or cancel
    </div>`;
  }
  // Move groups whose variants differ only by target; the button enters
  // targeting mode (interactions.js) instead of executing a variant directly.
  const targetPlayGroups = [];
  const TARGETABLE_MOVES = ["playSpell", "playGear", "playUnit", "activateAbility", "equipCard"];
  // Plays whose per-card variants differ by cost / destination open the
  // play-options modal; every other multi-variant move lists its variants.
  const PER_CARD_MOVES = ["playUnit", "playFromChampionZone", "playSpell", "playGear", "hideCard"];
  const COST_MODAL_MOVES = ["playUnit", "playFromChampionZone", "playSpell", "playGear"];

  // Pending choice (discard / pick-from-revealed / choose-target) — the engine
  // blocks every other move until this is answered, so surface it as a modal
  // panel at the top of the action list rather than burying it under "Other".
  const pending = gameState?.pendingChoice;
  // rule 383.3.d — simultaneous triggers you control may be re-ordered, but the
  // offer is soft: every other move stays legal and taking one keeps the listed
  // order. Surface it as a dismissable panel, never as a blocking modal.
  const softOrder = !pending ? gameState?.pendingTriggerOrder : null;
  if (softOrder && softOrder.playerId === viewingPlayer) {
    const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice");
    if (picks.length) {
      // Compact hint only — the arrangement itself is built in the draggable
      // stack popup over the board (modals.js renderTriggerOrderPopup).
      const n = Array.isArray(softOrder.items) ? softOrder.items.length : 0;
      html += `<div class="action-section-title trigger-order-title" data-trigger-order style="background:#2a3a4a;color:#a0e0ff;padding:6px;border-radius:3px;">
        ${esc(softOrder.prompt ?? "Order your triggers")} <span style="opacity:.7;font-weight:400">(optional — any other action keeps this order)</span>
      </div>`;
      html += `<button class="action-btn highlighted" data-trigger-order-open onclick="focusTriggerOrderPopup()">Reorder ${n} triggers in the chain popup…</button>`;
      html += `<button class="action-btn" data-trigger-order-pick onclick="sendTriggerOrder(null)">Keep this order</button>`;
    }
  }
  if (pending) {
    const mine = (pending.prompter ?? pending.playerId) === viewingPlayer;
    // Rule ogn-067-298: opt-in ("you may …") triggers get a Yes/No prompt.
    const verb = typeof pendingChoiceTitle === "function"
      ? pendingChoiceTitle(pending)
      : pending.type === "opt-in"
      ? `Decide: use ${findCard(pending.sourceCardId)?.name ?? "optional"} ability`
      : "Choose a card";
    // Prompt headlines carry cost tokens ("[rainbow]") — render them as icons, not literal text.
    const verbHtml = typeof promptTitleHtml === "function" ? promptTitleHtml(verb) : esc(verb);
    html += `<div class="action-section-title" data-pending-type="${esc(pending.type ?? "")}" style="background:#3a2a4a;color:#ffd070;padding:6px;border-radius:3px;">
      ${mine ? "⚠ " + verbHtml : "Waiting for opponent: " + verbHtml}
    </div>`;
    // rule-729 (ogn-174-298): reveal-and-pick from a hidden zone (deck/hand)
    // must show the revealed card(s) so the prompter can see what they are
    // choosing between — the resolvePendingChoice buttons alone only carry
    // the name text.
    if (mine && Array.isArray(pending.revealed) && pending.revealed.length) {
      html += `<div class="pending-choice visible" data-pending-choice style="display:flex;gap:4px;flex-wrap:wrap;padding:4px 0;">`;
      for (const rid of pending.revealed) {
        const rc = findCard(rid);
        const imgId = rc?.definitionId ?? rid;
        html += `<img class="card-img" src="/card-image/${esc(imgId)}" alt="${esc(rc?.name ?? rid)}"
          title="${esc(rc?.name ?? rid)}" style="width:90px;border-radius:4px;">`;
      }
      html += `</div>`;
    }
    if (mine) {
      const picks = availableMoves.filter(m => m.moveId === "resolvePendingChoice");
      // Composite answers (an order, a subset, an X amount, a card arrangement)
      // are built in the choice modal's stepper / sequence UI; the sidebar keeps
      // a pointer to it plus the always-safe defaults instead of 24 permutations.
      const composite = typeof isCompositePending === "function" && isCompositePending(pending);
      const shown = composite
        ? picks.filter(m => (Array.isArray(m.params?.orderedKeys) && m.params.orderedKeys.length === 0)
            || (Array.isArray(m.params?.pickedKeys) && m.params.pickedKeys.length === (pending.min ?? 0))
            || m.params?.accept === false).slice(0, 2)
        : picks;
      if (composite) {
        html += `<button class="action-btn highlighted" onclick="renderPendingChoiceModal(true)">Open the chooser…</button>`;
      }
      for (const m of shown) {
        const label = typeof pendingPickLabel === "function"
          ? pendingPickLabel(pending, m.params)
          : (findCard(m.params?.pickedCardId)?.name ?? m.params?.label ?? "Choose");
        html += `<button class="action-btn highlighted" data-pending-pick
          onclick='executeMove("resolvePendingChoice", ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
          ${esc(label)}
        </button>`;
      }
    }
  }

  for (const section of Object.values(sections)) {
    if (section.moves.length === 0) continue;

    html += `<div class="action-section-title">${esc(section.label)}</div>`;

    // Group moves within section by moveId
    const grouped = {};
    for (const move of section.moves) {
      if (!grouped[move.moveId]) grouped[move.moveId] = [];
      grouped[move.moveId].push(move);
    }

    for (const [moveId, moves] of Object.entries(grouped)) {
      const label = MOVE_LABELS[moveId] || moveId;
      const isPrimary = ["advancePhase", "endTurn", "channelRunes", "drawCard", "readyAll"].includes(moveId);

      // Check if any of these moves relate to the currently selected card
      const isHighlighted = interaction.sourceCardId &&
        moves.some(m =>
          m.params?.cardId === interaction.sourceCardId ||
          m.params?.unitIds?.includes(interaction.sourceCardId) ||
          m.params?.unitId === interaction.sourceCardId
        );

      if (TARGETABLE_MOVES.includes(moveId) && typeof moveTargetId === "function" && moves.some(m => moveTargetId(m))) {
        // Per-target variants: one button per source card (+ability) that
        // enters targeting mode — never a silent first-target pick.
        const groups = {};
        for (const m of moves) {
          const key = `${m.params?.cardId ?? m.params?.equipmentId ?? ""}#${m.params?.abilityIndex ?? ""}#${m.params?.sourceCardId ?? ""}`;
          (groups[key] ??= []).push(m);
        }
        for (const variants of Object.values(groups)) {
          const cid = variants[0].params?.cardId ?? variants[0].params?.equipmentId;
          const srcId = variants[0].params?.sourceCardId;
          const baseName = findCard(cid)?.name ?? cid ?? label;
          const name = srcId && srcId !== cid
            ? `${baseName} — ${findCard(srcId)?.name ?? srcId}`
            : baseName;
          const targetIds = [...new Set(variants.map(moveTargetId).filter(Boolean))];
          // An activated ability is identified by its printed cost + effect, not
          // by the bare card name (rule 331.1).
          const shown = moveId === "activateAbility"
            ? activatedAbilityLabel(cid, variants[0].params?.abilityIndex, srcId)
            : moveId === "equipCard"
            ? `${name}${equipCostText(cid) ? ` — ${equipCostText(cid)}` : ""} → choose a unit`
            : name;
          const detail = targetIds.length
            ? `${shown} — ${targetIds.length} target${targetIds.length === 1 ? "" : "s"}…`
            : shown;
          const highlighted = interaction.sourceCardId === cid;
          html += `
            <button class="action-btn ${highlighted ? "highlighted" : ""}"
                    data-target-play="${targetPlayGroups.length}">
              ${esc(label)}
              <div class="action-detail">${esc(detail)}</div>
            </button>`;
          targetPlayGroups.push({ moves: variants, sourceCardId: cid });
        }
      } else if (moves.length === 1 && moveId !== "recycleRune") {
        // recycleRune never takes this shortcut: a lone ready rune must still go
        // through the rune branch below so it auto-taps for +1 energy first
        // (rule 164.2) instead of forfeiting it.
        const m = moves[0];
        const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
        const onclick = `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;

        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick='${onclick}'>
            ${esc(label)}
            ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
          </button>
        `;
      } else if (PER_CARD_MOVES.includes(moveId)) {
        // One row per CARD, never "Play Spell (2 options)" hiding two different
        // spells: a card with ≥2 variants (base vs Accelerate / sacrifice /
        // destination) opens the play-options modal; other multi-variant
        // moves (Hide at either battlefield) list each variant by name.
        const byCard = {};
        for (const m of moves) {
          const key = m.params?.cardId ?? "__champion";
          (byCard[key] ??= []).push(m);
        }
        for (const [cid, variants] of Object.entries(byCard)) {
          const card = cid === "__champion"
            ? (typeof zoneForPlayer === "function" ? zoneForPlayer("championZone", viewingPlayer)[0] : null)
            : findCard(cid);
          const name = card?.name ?? (cid === "__champion" ? "Champion" : cid);
          const highlighted = interaction.sourceCardId === cid || (cid === "__champion" && interaction.sourceZone === "championZone");
          if (variants.length > 1 && COST_MODAL_MOVES.includes(moveId)) {
            html += `
              <button class="action-btn ${highlighted ? "highlighted" : ""}"
                      data-play-cost-card="${esc(cid)}">
                ${esc(moveId === "playFromChampionZone" ? `Play Champion ${name}` : `Play ${name}`)}
                <div class="action-detail">${variants.length} play options…</div>
              </button>`;
            continue;
          }
          for (const m of variants) {
            const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
            html += `
              <button class="action-btn ${highlighted ? "highlighted" : ""}"
                      onclick='executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})'>
                ${esc(label)}
                ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
              </button>`;
          }
        }
      } else if (moveId === "exhaustRune" || moveId === "recycleRune") {
        // Group rune moves by domain so we don't list 11+ individual runes.
        // [rule:ui-recycle-rune-ready-split] For recycleRune, a ready rune and an
        // exhausted rune of the same domain are NOT interchangeable (recycling the
        // ready one forfeits its energy) — split groups by exhausted state and list
        // exhausted runes first so the default click never burns a ready rune.
        const isExh = (m) => findCard(m.params?.runeId)?.meta?.exhausted === true;
        const splitByState = moveId === "recycleRune";
        // [rule:ui-recycle-rune-ready-autotap] Recycling a ready rune from the panel
        // routes through quickRecycleRune so it auto-taps for +1 energy first, same
        // as the right-click path — recycling it ready is strictly worse.
        const runeClick = (m) =>
          splitByState && !isExh(m) && typeof quickRecycleRune === "function"
            ? `quickRecycleRune(${JSON.stringify(m.params?.runeId)}, this)`
            : `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;
        const byDomain = {};
        for (const m of moves) {
          const card = findCard(m.params?.runeId);
          const domain = card?.domain || card?.meta?.domain || "unknown";
          const d = Array.isArray(domain) ? domain[0] : domain;
          const key = splitByState ? `${d}|${isExh(m) ? "exhausted" : "ready"}` : d;
          if (!byDomain[key]) byDomain[key] = [];
          byDomain[key].push(m);
        }
        const domainEntries = Object.entries(byDomain).sort(
          ([a], [b]) => Number(a.endsWith("|ready")) - Number(b.endsWith("|ready")),
        );
        if (domainEntries.length === 1) {
          // [rule:ui-rune-group-single-option] One distinct OPTION (not one move):
          // N interchangeable runes of the same domain+state collapse to a single
          // direct-execute button. Gating on move count instead left two identical
          // runes rendering a header that only toggled an submenu with one child,
          // so the first click looked dead.
          const domMoves = domainEntries[0][1];
          const m = domMoves[0];
          const paramStr =
            domMoves.length > 1
              ? `${domMoves.length} available`
              : formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick='${runeClick(m)}'>
              ${esc(label)}
              ${paramStr ? `<div class="action-detail">${esc(paramStr)}</div>` : ""}
            </button>
          `;
        } else {
          // Multiple runes — show grouped by domain
          const DOMAIN_DISPLAY = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
          const isExpanded = isHighlighted || _expandedMoveGroups.has(moveId);
          html += `
            <button class="action-btn ${isHighlighted ? "highlighted" : ""}"
                    onclick="toggleMoveGroup('${moveId}')">
              ${esc(label)} (${moves.length} available)
            </button>
            <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
              ${domainEntries.map(([key, domMoves]) => {
                const [domain, state] = key.split("|");
                const domLabel = `${DOMAIN_DISPLAY[domain] || domain} Rune${state ? ` (${state})` : ""}`;
                if (domMoves.length === 1) {
                  const m = domMoves[0];
                  return `
                    <button class="action-btn"
                            onclick='${runeClick(m)}'>
                      ${esc(domLabel)}
                    </button>
                  `;
                }
                // Multiple interchangeable runes (same domain + state) — show count, click uses first
                const m = domMoves[0];
                return `
                  <button class="action-btn"
                          onclick='${runeClick(m)}'>
                    ${esc(domLabel)} (${domMoves.length} available)
                  </button>
                `;
              }).join("")}
            </div>
          `;
        }
      } else {
        // Collapsible group
        // auto-expand if highlighted, and keep a hand-opened group open across
        // the re-renders that trailing state pushes trigger (see _expandedMoveGroups)
        const isExpanded = isHighlighted || _expandedMoveGroups.has(moveId);
        html += `
          <button class="action-btn ${isPrimary ? "primary" : ""} ${isHighlighted ? "highlighted" : ""}"
                  onclick="toggleMoveGroup('${moveId}')">
            ${esc(label)} (${moves.length} options)
          </button>
          <div id="move-group-${moveId}" class="${isExpanded ? "" : "hidden"}" style="padding-left:8px; display:flex; flex-direction:column; gap:2px;">
            ${moves.slice(0, 15).map((m, i) => {
              const paramStr = formatMoveDescription(moveId, m.params) || formatParamsFallback(m.params);
              const moveHighlighted = interaction.sourceCardId &&
                (m.params?.cardId === interaction.sourceCardId ||
                 m.params?.unitIds?.includes(interaction.sourceCardId) ||
                 m.params?.unitId === interaction.sourceCardId);
              const onclick = `executeMove(${JSON.stringify(moveId)}, ${JSON.stringify(m.params)}, ${JSON.stringify(m.playerId)})`;
              return `
                <button class="action-btn ${moveHighlighted ? "highlighted" : ""}"
                        onclick='${onclick}'>
                  ${esc(paramStr || `Option ${i + 1}`)}
                </button>
              `;
            }).join("")}
            ${moves.length > 15 ? `<div style="color:#6a6288;font-size:10px;padding:4px;">+${moves.length - 15} more...</div>` : ""}
          </div>
        `;
      }
    }
  }

  // A blank AVAILABLE ACTIONS panel is indistinguishable from a hung client.
  // When the legal-move set is empty — or is only `concede`, which is routed to
  // the sidebar header above — say so on screen and name the escape, so a dead
  if (payingCosts) {
    if (!panelMoves.length) {
      html += '<div style="color:#6a6288; font-size:11px; padding:4px;">No resources can be added right now.</div>';
    }
    html += `<button class="action-btn" onclick="cancelInteraction()">Cancel payment</button>`;
  }
  // end reads as a dead end rather than as a freeze.
  if (!html.trim()) {
    // rule 312.1 / 312.1.b: lacking priority (or Focus) means you may not take
    // Discretionary Actions — it is not a dead game. Since concede (650) is
    // always legal, a concede-only move set on a seat that is merely waiting is
    // the normal off-priority state, not "no plays left".
    const inter = (typeof gameState !== "undefined" ? gameState : null)?.interaction;
    const chain = inter?.chain;
    const showdown = inter?.showdown;
    const holder = (chain?.active && chain.activePlayer)
      || (showdown?.active && showdown.focusPlayer)
      || gameState?.turn?.activePlayer;
    const waitingOnOpponent = !!holder && holder !== viewingPlayer;
    const onlyConcede = availableMoves.length > 0 && !waitingOnOpponent &&
      availableMoves.every(m => m.moveId === "concede");
    html = `
      <div class="actions-empty">
        <div class="actions-empty-title">${onlyConcede ? "No plays left" : "Waiting — no actions for you right now"}</div>
        <div class="actions-empty-body">${onlyConcede
          ? "Conceding is your only legal move. Use <b>Concede</b> in the sidebar header above."
          : "The other player has priority. If this does not change, resync below."}</div>
        <button class="action-btn" onclick="if (typeof requestResync === 'function') requestResync()">Resync board</button>
      </div>
    `;
  }

  list.innerHTML = html;
  list.querySelectorAll("[data-play-cost-card]").forEach(el => {
    el.addEventListener("click", () => openPlayCostModal(el.dataset.playCostCard));
  });
  list.querySelectorAll("[data-target-play]").forEach(el => {
    el.addEventListener("click", () => {
      const g = targetPlayGroups[Number(el.dataset.targetPlay)];
      if (g) beginTargetingOrPlay(g.moves, g.sourceCardId);
    });
  });
}

// Groups the player has opened stay open across re-renders (state pushes rebuild
// the list; without this a click could be undone by the next frame).
const _expandedMoveGroups = new Set();

function toggleMoveGroup(moveId) {
  // Opening a sidebar action group is a new intent: drop any armed targeting mode
  // first so the target banner and a move submenu can never be live at once.
  // (The document click-cancel handler in interactions.js skips #actionsList.)
  if (typeof isChoosingTarget === "function" && isChoosingTarget()) {
    cancelInteraction(); // re-renders the action list, so re-look-up below
  }
  const el = document.getElementById(`move-group-${moveId}`);
  if (!el) return;
  const opened = el.classList.toggle("hidden") === false;
  if (opened) _expandedMoveGroups.add(moveId); else _expandedMoveGroups.delete(moveId);
  // The actions panel is height-capped and scrolls; a group expanded near the
  // bottom reveals its per-rune options below the fold, so they read as missing.
  // Pull them into view (block:"nearest" leaves an already-visible group alone).
  if (opened && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// Node/bun test harness only — the browser loads this as a classic script.
if (typeof module !== "undefined" && module && module.exports) {
  module.exports = { chainWhatText, expandedMoveGroups: _expandedMoveGroups, findEffectReference, humanizeEffect, renderActions, splitChainTargets, targetNoun, toggleMoveGroup };
}
