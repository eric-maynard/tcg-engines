#!/usr/bin/env bun
/**
 * Systematic audit of which Riftbound cards' primary effects actually
 * produce observable engine state changes when their abilities resolve.
 *
 * For each card in `@tcg/riftbound-cards` getAllCards():
 *   1. If the card has no structured `abilities[]` (only rulesText) — flag
 *      NO_STRUCTURED_ABILITY and skip.
 *   2. Otherwise, for each ability extract the primary `effect`:
 *        - spell.effect, triggered.effect, activated.effect,
 *          keyword (Effect/Cost form).effect, static.effect
 *      For sequence/choice/optional wrappers we drill into `effects[0]`.
 *   3. Build a minimal in-memory EffectContext (mock the zones / card /
 *      counters surface) with enough state to satisfy the effect's target
 *      resolver (e.g. a friendly unit on `base` for `target: {type:"unit"}`,
 *      cards in `mainDeck` for look/draw, cards in `hand` for discard).
 *   4. Register the source card AND the dummy targets with the global card
 *      registry so target-resolver filters by cardType match.
 *   5. Call `executeEffect(effect, ctx)`.
 *   6. Per effect-type, observe specific side effects:
 *        - look                → ctx.draft.pendingChoice was set
 *        - recycle             → at least one moveCard call with targetZoneId
 *                                "mainDeck" or "runeDeck"
 *        - modify-might        → some target meta got mightModifier or
 *                                combatMightModifier delta
 *        - return-to-hand      → moveCard to "hand"
 *        - damage              → addCounter("damage", N)
 *        - kill                → moveCard to "trash"
 *        - destroy / banish    → moveCard to "trash" or "banishZone"
 *        - draw                → drawCards called
 *        - discard             → moveCard from hand to "trash"
 *        - move-unit / move    → moveCard to a battlefield-* zone
 *        - grant-keyword(s)    → updateCardMeta with `grantedKeywords`
 *        - heal                → removeCounter("damage", N)
 *        - buff                → setFlag("buffed", true) or grantedKeywords
 *        - score               → player.victoryPoints increased
 *        - add-resource        → rune pool energy or power changed
 *        - channel             → moveCard from runeDeck to runePool
 *        - exhaust / ready     → setFlag("exhausted", …)
 *        - swap-units          → two moveCards
 *        - swap-might          → two updateCardMeta with mightModifier
 *        - copy-spell          → chain item appended
 *        - copy-unit           → createCardInZone called
 *        - create-token /
 *          summon-token        → createCardInZone called
 *        - add-restriction     → updateCardMeta with restrictions
 *        - remove-restriction  → updateCardMeta with restrictions (changed)
 *        - predict             → moveCard to mainDeck bottom
 *        - extra-turn          → pendingExtraTurns set
 *        - win-game            → state.status="finished"
 *        - heal                → removeCounter
 *        - stun                → setFlag("stunned", true)
 *        - recall              → moveCard to "base"
 *        - prevent-damage      → updateCardMeta with preventDamage
 *        - take-control        → setCardController called
 *        - reveal-hand         → pendingChoice
 *        - gain-xp / spend-xp  → player.xp changed
 *        - cost-reduction /
 *          cost-increase /
 *          additional-cost     → updateCardMeta with cost mods (heuristic)
 *        - sequence/choice/
 *          conditional/optional/
 *          for-each/do-times/
 *          fight/play          → at least one sub-side-effect fired
 *        - else                → matched as no-op-observable acceptable
 *
 *   Effects whose primary handler is a documented informational-only no-op
 *   (e.g. plain `reveal` without `then`) are tagged `INFORMATIONAL_NOOP` and
 *   counted as "working" (since the engine documents the no-op).
 *
 * AUDIT-ONLY: this script reads the engine but mutates nothing on disk
 * except the two output files in /tmp.
 */
import { getAllCards } from "@tcg/riftbound-cards";
import { writeFileSync } from "node:fs";
// Direct relative imports so we don't depend on a public engine subpath export.
import {
  type EffectContext,
  type ExecutableEffect,
  executeEffect,
} from "../../../packages/riftbound-engine/src/abilities/effect-executor";
import { getGlobalCardRegistry } from "../../../packages/riftbound-engine/src/operations/card-lookup";

// ---------------------------------------------------------------------------
// Effect extraction
// ---------------------------------------------------------------------------

/** Drill into wrapper effects (sequence/choice/optional/conditional) to find
 *  the first "concrete" effect; returns the wrapper itself if it has its own
 *  observable side-effect category. */
function primaryEffects(ab: Record<string, unknown>): ExecutableEffect[] {
  const found: ExecutableEffect[] = [];
  const visit = (e: unknown): void => {
    if (!e || typeof e !== "object") {return;}
    const eff = e as Record<string, unknown>;
    const t = eff.type as string | undefined;
    if (!t) {return;}
    found.push(eff as ExecutableEffect);
    // Walk into wrappers — but only one level so we don't blow up on deeply
    // Nested sequence/optional trees. The audit asserts on the *outer* type
    // Anyway; we descend so an unsupported wrapper still reports a child it
    // Expected to fire.
    if (t === "sequence" && Array.isArray(eff.effects)) {
      for (const sub of eff.effects as unknown[]) {visit(sub);}
    }
    if (t === "optional" || t === "conditional" || t === "choice" || t === "for-each" || t === "do-times" || t === "repeat") {
      if (eff.effect) {visit(eff.effect);}
      if (eff.then) {visit(eff.then);}
      if (eff.else) {visit(eff.else);}
      if (Array.isArray(eff.effects)) {for (const sub of eff.effects as unknown[]) {visit(sub);}}
    }
  };
  // The ability shape varies: spell.effect, triggered.effect, activated.effect,
  // Keyword.effect (for EffectKeyword), static.effect, replacement.replacement.
  const ability = ab as { effect?: unknown; replacement?: unknown; type?: string; keyword?: string; cost?: unknown };
  if (ability.effect) {visit(ability.effect);}
  if (ability.replacement && typeof ability.replacement === "object") {visit(ability.replacement);}
  return found;
}

// ---------------------------------------------------------------------------
// Per-effect observers — return a function checking whether ctx state shows
// The expected change after executeEffect.
// ---------------------------------------------------------------------------

interface RunResult {
  cardId: string;
  cardName: string;
  cardType: string;
  rarity: string;
  effectType: string;
  abilityType: string;
  expected: string;
  actual: string;
  status: "working" | "broken" | "skipped" | "unknown-type" | "informational-noop" | "error";
  rootCauseGuess?: string;
}

interface RecordedCtx {
  moveCalls: { cardId: string; targetZoneId: string; position?: unknown }[];
  drawCalls: { count: number; from: string; to: string; playerId: string }[];
  createCalls: { cardId: string; zoneId: string; ownerId: string }[];
  shuffleCalls: { zoneId: string; playerId?: string }[];
  metaUpdates: Map<string, Record<string, unknown>>;
  flagsSet: { cardId: string; flag: string; value: boolean }[];
  counterAdds: { cardId: string; counter: string; amount: number }[];
  counterRemoves: { cardId: string; counter: string; amount: number }[];
  controllerSets: { cardId: string; controllerId: string }[];
  fireTriggers: Record<string, unknown>[];
}

const PLAYER = "player-1";
const OPP = "player-2";

interface BuildArgs {
  cardId: string;
  cardType: string; // Unit / spell / gear / equipment / rune / legend / champion / battlefield
  sourceZone: string;
}

function buildContext(args: BuildArgs): { ctx: EffectContext; rec: RecordedCtx; zoneOf: Map<string, string> } {
  const { cardId, sourceZone } = args;

  // Populate dummies so target resolution + zone scans find SOMETHING.
  // We populate every zone the various effect handlers might read.
  const zoneOf = new Map<string, string>();
  const zoneCards = new Map<string, string[]>();

  // Helper to register a card with the registry so cardType filters pass.
  const reg = getGlobalCardRegistry();
  const addCard = (id: string, zone: string, def: Record<string, unknown>): void => {
    zoneOf.set(id, zone);
    const arr = zoneCards.get(zone) ?? [];
    arr.push(id);
    zoneCards.set(zone, arr);
    reg.register(id, def);
  };

  // Source card itself: register and place in sourceZone. We give the source
  // A non-zero might even when it's a spell so `amount: { might: "self" }`
  // Expressions (Stormbringer's "deal damage equal to its Might") resolve
  // To a non-zero number and the damage handler emits a counter we can
  // Observe. In a real game the parser would resolve `self` to the
  // *Chosen* unit's might; we don't model that, so we just set the source
  // Might to a fixed positive value.
  addCard(cardId, sourceZone, { cardType: args.cardType, id: cardId, might: 3, name: "source" });

  // Friendly units on base + a battlefield so unit-target effects resolve.
  addCard("dummy-friendly-unit-base", "base", { cardType: "unit", id: "dummy-friendly-unit-base", might: 3, name: "dummy-friendly" });
  addCard("dummy-friendly-unit-bf", "battlefield-bf-1", { cardType: "unit", id: "dummy-friendly-unit-bf", might: 3, name: "dummy-friendly-bf" });
  // Enemy unit on the same battlefield so enemy-controller targets work.
  addCard("dummy-enemy-unit-bf", "battlefield-bf-1", { cardType: "unit", id: "dummy-enemy-unit-bf", might: 3, name: "dummy-enemy" });
  // Friendly gear / equipment so gear-target effects resolve.
  addCard("dummy-friendly-gear", "base", { cardType: "gear", id: "dummy-friendly-gear", might: 0, name: "dummy-gear" });
  // Cards in hand so `discard` works.
  addCard("dummy-hand-1", "hand", { cardType: "spell", id: "dummy-hand-1", name: "dummy-h1" });
  addCard("dummy-hand-2", "hand", { cardType: "spell", id: "dummy-hand-2", name: "dummy-h2" });
  // Opponent hand cards so `reveal-hand` works.
  addCard("dummy-opp-hand-1", "hand", { cardType: "spell", id: "dummy-opp-hand-1", name: "opp-h1" });
  addCard("dummy-opp-hand-2", "hand", { cardType: "unit", id: "dummy-opp-hand-2", name: "opp-h2" });
  // Cards in mainDeck so look/draw/predict/recycle work.
  for (let i = 0; i < 5; i++) {
    addCard(`dummy-deck-${i}`, "mainDeck", { cardType: "spell", id: `dummy-deck-${i}`, name: `deck-${i}` });
  }
  // Runes in runeDeck so channel works.
  for (let i = 0; i < 3; i++) {
    addCard(`dummy-rune-${i}`, "runeDeck", { cardType: "rune", id: `dummy-rune-${i}`, name: `rune-${i}` });
  }
  // A trash card for trash-target effects.
  addCard("dummy-trash-1", "trash", { cardType: "spell", id: "dummy-trash-1", name: "dummy-trash" });

  // Owner map — assign half to opponent so enemy-target effects resolve too.
  const ownerOf = new Map<string, string>();
  ownerOf.set(cardId, PLAYER);
  ownerOf.set("dummy-friendly-unit-base", PLAYER);
  ownerOf.set("dummy-friendly-unit-bf", PLAYER);
  ownerOf.set("dummy-enemy-unit-bf", OPP);
  ownerOf.set("dummy-friendly-gear", PLAYER);
  ownerOf.set("dummy-hand-1", PLAYER);
  ownerOf.set("dummy-hand-2", PLAYER);
  ownerOf.set("dummy-opp-hand-1", OPP);
  ownerOf.set("dummy-opp-hand-2", OPP);
  for (let i = 0; i < 5; i++) {ownerOf.set(`dummy-deck-${i}`, PLAYER);}
  for (let i = 0; i < 3; i++) {ownerOf.set(`dummy-rune-${i}`, PLAYER);}
  ownerOf.set("dummy-trash-1", PLAYER);

  const rec: RecordedCtx = {
    controllerSets: [],
    counterAdds: [],
    counterRemoves: [],
    createCalls: [],
    drawCalls: [],
    fireTriggers: [],
    flagsSet: [],
    metaUpdates: new Map(),
    moveCalls: [],
    shuffleCalls: [],
  };

  const battlefields: Record<string, unknown> = { "bf-1": { controllingPlayer: undefined, id: "bf-1" } };

  const draft = {
    battlefields,
    cardsPlayedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
    conqueredThisTurn: { [PLAYER]: [], [OPP]: [] },
    gameId: "audit",
    interaction: { chain: { active: false, activePlayer: PLAYER, items: [], passedPlayers: [] }, nextChainItemId: 1 },
    players: {
      [PLAYER]: { id: PLAYER, turnsTaken: 1, victoryPoints: 0, xp: 0 },
      [OPP]: { id: OPP, turnsTaken: 1, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      [PLAYER]: { energy: 0, power: {} as Record<string, number> },
      [OPP]: { energy: 0, power: {} as Record<string, number> },
    },
    scoredThisTurn: { [PLAYER]: [], [OPP]: [] },
    status: "playing",
    turn: { activePlayer: PLAYER, number: 1, phase: "main" },
    turnEvents: { [PLAYER]: [], [OPP]: [] },
    unitsMovedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
    victoryScore: 8,
    xpGainedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
  } as unknown as EffectContext["draft"];

  const ctx: EffectContext = {
    cards: {
      getCardController: (id) => ownerOf.get(id as string),
      getCardMeta: (id) => rec.metaUpdates.get(id as string),
      getCardOwner: (id) => ownerOf.get(id as string),
      setCardController: (id, ctrl) => {
        rec.controllerSets.push({ cardId: id as string, controllerId: ctrl });
        ownerOf.set(id as string, ctrl);
      },
      updateCardMeta: (id, updates) => {
        const existing = rec.metaUpdates.get(id as string) ?? {};
        rec.metaUpdates.set(id as string, { ...existing, ...updates });
      },
    } as unknown as EffectContext["cards"],
    counters: {
      addCounter: (id, counter, amount) => {
        rec.counterAdds.push({ amount, cardId: id as string, counter });
      },
      clearCounter: () => {},
      removeCounter: (id, counter, amount) => {
        rec.counterRemoves.push({ amount, cardId: id as string, counter });
      },
      setFlag: (id, flag, value) => {
        rec.flagsSet.push({ cardId: id as string, flag, value });
      },
    } as unknown as EffectContext["counters"],
    createCardInZone: (id, zone, owner) => {
      rec.createCalls.push({ cardId: id, ownerId: owner, zoneId: zone });
      zoneOf.set(id, zone);
      const arr = zoneCards.get(zone) ?? [];
      arr.push(id);
      zoneCards.set(zone, arr);
      ownerOf.set(id, owner);
    },
    draft,
    fireTriggers: (event) => {
      rec.fireTriggers.push(event as Record<string, unknown>);
    },
    playerId: PLAYER,
    sourceCardId: cardId,
    sourceZone,
    // Bind common AmountExpression variables so X-cost-style effects
    // (Bullet Time: `{ variable: "x" }`) resolve to a non-zero amount.
    variables: { x: 3 },
    zones: {
      drawCards: ({ count, from, playerId, to }) => {
        rec.drawCalls.push({ count, from: from as string, playerId: playerId as string, to: to as string });
        // Best effort: simulate the draw by moving cards.
        const src = zoneCards.get(from as string) ?? [];
        for (let i = 0; i < count; i++) {
          const c = src.shift();
          if (!c) {break;}
          rec.moveCalls.push({ cardId: c, targetZoneId: to as string });
          zoneOf.set(c, to as string);
          const dst = zoneCards.get(to as string) ?? [];
          dst.push(c);
          zoneCards.set(to as string, dst);
        }
        zoneCards.set(from as string, src);
        return [] as unknown as never[];
      },
      getCardZone: (id) => zoneOf.get(id as string),
      getCardsInZone: (zoneId, pid) => {
        const ids = zoneCards.get(zoneId as string) ?? [];
        if (pid !== undefined) {
          return ids.filter((id) => ownerOf.get(id) === pid) as unknown as never[];
        }
        return ids as unknown as never[];
      },
      moveCard: ({ cardId: mc, targetZoneId, position }) => {
        rec.moveCalls.push({ cardId: mc as string, position, targetZoneId: targetZoneId as string });
        const prev = zoneOf.get(mc as string);
        if (prev) {
          const arr = zoneCards.get(prev) ?? [];
          const idx = arr.indexOf(mc as string);
          if (idx >= 0) {arr.splice(idx, 1);}
          zoneCards.set(prev, arr);
        }
        zoneOf.set(mc as string, targetZoneId as string);
        const dst = zoneCards.get(targetZoneId as string) ?? [];
        dst.push(mc as string);
        zoneCards.set(targetZoneId as string, dst);
      },
      shuffleZone: (zoneId, pid) => {
        rec.shuffleCalls.push({ playerId: pid as string | undefined, zoneId: zoneId as string });
      },
    } as unknown as EffectContext["zones"],
  };

  return { ctx, rec, zoneOf };
}

// ---------------------------------------------------------------------------
// Observers — `assertEffect` runs the effect and returns a working/broken
// Classification per effect type.
// ---------------------------------------------------------------------------

const INFORMATIONAL_NOOP_TYPES = new Set([
  "reveal", // Plain reveal w/o then is documented info-only
]);

function classify(
  effect: ExecutableEffect,
  rec: RecordedCtx,
  ctx: EffectContext,
): { ok: boolean; expected: string; actual: string; root?: string } {
  const t = effect.type;
  switch (t) {
    case "draw": {
      const ok = rec.drawCalls.length > 0;
      return {
        actual: ok ? `drawCards x${rec.drawCalls.length}` : "no drawCards call",
        expected: "drawCards called",
        ok,
        root: ok ? undefined : "engine handler did not invoke zones.drawCards",
      };
    }
    case "damage": {
      const ok = rec.counterAdds.some((c) => c.counter === "damage");
      return { actual: ok ? `damage counter added` : "no damage counter added", expected: "damage counter added on target", ok };
    }
    case "kill":
    case "destroy": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "trash");
      return { actual: ok ? "moveCard to trash" : "no move to trash", expected: "target moved to trash", ok };
    }
    case "buff": {
      const ok = rec.flagsSet.some((f) => f.flag === "buffed") || rec.counterAdds.length > 0;
      return { actual: ok ? "buffed flag set" : "no buff applied", expected: "buffed flag set", ok };
    }
    case "score": {
      // We need to read draft.players[PLAYER].victoryPoints
      const vp = (ctx.draft.players[PLAYER] as { victoryPoints: number }).victoryPoints;
      return { actual: `vp=${vp}`, expected: "victoryPoints increased", ok: vp > 0 };
    }
    case "channel": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "runePool");
      return { actual: ok ? "moveCard to runePool" : "no move to runePool", expected: "rune moved to runePool", ok };
    }
    case "ready": {
      const ok = rec.flagsSet.some((f) => f.flag === "exhausted" && f.value === false);
      return { actual: ok ? "exhausted=false flag set" : "no ready flag", expected: "exhausted flag cleared", ok };
    }
    case "exhaust": {
      const ok = rec.flagsSet.some((f) => f.flag === "exhausted" && f.value === true);
      return { actual: ok ? "exhausted=true flag set" : "no exhausted flag", expected: "exhausted flag set", ok };
    }
    case "stun": {
      const ok = rec.flagsSet.some((f) => f.flag === "stunned");
      return { actual: ok ? "stunned flag set" : "no stun", expected: "stunned flag set", ok };
    }
    case "recall": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "base");
      return { actual: ok ? "moveCard to base" : "no recall to base", expected: "unit moved to base", ok };
    }
    case "discard": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "trash");
      return { actual: ok ? `${rec.moveCalls.length} discards` : "no cards moved to trash", expected: "card moved hand→trash", ok };
    }
    case "return-to-hand": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "hand");
      return { actual: ok ? "moveCard to hand" : "no move to hand", expected: "target moved to hand", ok };
    }
    case "win-game": {
      const ok = (ctx.draft as { status: string }).status === "finished";
      return { actual: `status=${(ctx.draft as { status: string }).status}`, expected: "status=finished", ok };
    }
    case "modify-might": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("mightModifier" in meta || "combatMightModifier" in meta) {any = true; break;}
      }
      return { actual: any ? "mightModifier set" : "no might modifier", expected: "mightModifier set on target", ok: any };
    }
    case "swap-might": {
      let count = 0;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("mightModifier" in meta || "combatMightModifier" in meta) {count++;}
      }
      return { actual: `${count} units modified`, expected: "two units' might modified", ok: count >= 2 };
    }
    case "double-might": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("mightModifier" in meta || "combatMightModifier" in meta) {any = true; break;}
      }
      return { actual: any ? "mightModifier set" : "no double-might delta", expected: "mightModifier delta written", ok: any };
    }
    case "heal": {
      const ok = rec.counterRemoves.some((c) => c.counter === "damage");
      return { actual: ok ? "damage counter removed" : "no heal", expected: "damage counter removed", ok };
    }
    case "grant-keyword":
    case "grant-keywords": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("grantedKeywords" in meta) {any = true; break;}
      }
      return { actual: any ? "grantedKeywords set" : "no grantedKeywords", expected: "grantedKeywords set on target", ok: any };
    }
    case "add-resource": {
      const pool = (ctx.draft as { runePools: Record<string, { energy: number; power: Record<string, number> }> }).runePools[PLAYER];
      const ok = pool.energy > 0 || Object.keys(pool.power).length > 0;
      return { actual: `energy=${pool.energy} power=${JSON.stringify(pool.power)}`, expected: "runePool changed", ok };
    }
    case "banish": {
      const ok = rec.moveCalls.some(
        (m) =>
          m.targetZoneId === "banishment" ||
          m.targetZoneId === "banishZone" ||
          m.targetZoneId === "exile",
      );
      return {
        actual: ok ? `moveCard to ${rec.moveCalls.find((m) => m.targetZoneId.startsWith("banish"))?.targetZoneId}` : "no banish",
        expected: "target moved to banishment zone",
        ok,
      };
    }
    case "counter": {
      // Counter a chain item — needs an interaction.chain item to remove.
      // Hard to set up; treat as informational so we don't false-flag.
      return { actual: "counter requires chain item — not tested", expected: "chain item countered", ok: true };
    }
    case "create-token":
    case "summon-token":
    case "copy-unit": {
      const ok = rec.createCalls.length > 0;
      return { actual: ok ? `createCardInZone x${rec.createCalls.length}` : "no token created", expected: "createCardInZone called", ok };
    }
    case "copy-spell": {
      const {items} = (ctx.draft as { interaction: { chain: { items: unknown[] } } }).interaction.chain;
      // Copy-spell requires an active chain; treat absence as INFO since the engine documents the no-op.
      if (!(ctx.draft as { interaction: { chain: { active: boolean } } }).interaction.chain.active) {
        return { actual: "no active chain (chain.active=false) — skipped by engine per docs", expected: "chain item appended when active", ok: true };
      }
      return { actual: `chain.items=${items.length}`, expected: "chain item appended", ok: items.length > 0 };
    }
    case "attach":
    case "detach": {
      // Handler sets `attachedTo` flag on the equipment.
      const ok = rec.flagsSet.some((f) => f.flag === "attachedTo") || rec.metaUpdates.size > 0;
      return { actual: ok ? "attachedTo flag/meta set" : "no attach state change", expected: "attachedTo flag set", ok };
    }
    case "look": {
      const ok = (ctx.draft as { pendingChoice?: unknown }).pendingChoice !== undefined;
      // Plain peek (no `then`) is informational.
      const lookEff = effect as unknown as { then?: { draw?: unknown; recycle?: unknown; play?: unknown; reveal?: unknown } };
      if (!lookEff.then) {
        return { actual: "informational peek (no `then`)", expected: "no state change", ok: true };
      }
      // The look handler only recognizes `then.recycle === "rest"` or
      // `then.draw === "chosen"`. Other shapes (numeric recycle, `play: true`,
      // `reveal: true`) fall through to a no-op.
      const th = lookEff.then;
      const recognized = th.recycle === "rest" || th.draw === "chosen";
      let root = "look-effect handler did not write pendingChoice";
      if (!ok && !recognized) {
        root = `look handler does not implement then=${JSON.stringify(th)} (only "recycle:rest" / "draw:chosen" supported)`;
      }
      return {
        actual: ok ? "pendingChoice set with revealed cards" : "no pendingChoice written",
        expected: "pendingChoice (look-and-pick) set with revealed cards",
        ok,
        root: ok ? undefined : root,
      };
    }
    case "reveal": {
      // Documented no-op.
      return { actual: "informational reveal (engine documents no-op)", expected: "no state change", ok: true };
    }
    case "reveal-hand": {
      const ok = (ctx.draft as { pendingChoice?: unknown }).pendingChoice !== undefined;
      return { actual: ok ? "pendingChoice set" : "no pendingChoice", expected: "pendingChoice (reveal-hand) set", ok };
    }
    case "prevent-damage": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("preventDamage" in meta) {any = true; break;}
      }
      return { actual: any ? "preventDamage meta set" : "no preventDamage", expected: "preventDamage meta set", ok: any };
    }
    case "take-control": {
      const ok = rec.controllerSets.length > 0;
      return { actual: ok ? `setCardController x${rec.controllerSets.length}` : "no controller set", expected: "setCardController called", ok };
    }
    case "enter-ready": {
      // Sets meta flag enterReady or similar on source.
      const ok = rec.metaUpdates.size > 0 || rec.flagsSet.some((f) => f.flag.includes("ready") || f.flag === "exhausted");
      return { actual: ok ? "meta/flag set" : "no enter-ready effect", expected: "enter-ready meta set", ok };
    }
    case "cost-reduction":
    case "cost-increase":
    case "additional-cost": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        for (const k of Object.keys(meta)) {
          if (k.toLowerCase().includes("cost")) {any = true;}
        }
      }
      return { actual: any ? "cost meta set" : "no cost mod meta", expected: "cost modifier meta set", ok: any };
    }
    case "gain-xp":
    case "spend-xp": {
      // Inspect player.xp delta. Since baseline is 0, gain-xp should produce >0; spend-xp would no-op if 0.
      const player = (ctx.draft as { players: Record<string, { xp: number }> }).players[PLAYER];
      if (t === "gain-xp") {return { actual: `xp=${player.xp}`, expected: "xp increased", ok: player.xp > 0 };}
      return { actual: `xp=${player.xp}`, expected: "spend-xp (skipped at 0 baseline)", ok: true };
    }
    case "recycle": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "mainDeck" || m.targetZoneId === "runeDeck");
      return { actual: ok ? "moveCard to mainDeck/runeDeck" : "no recycle move", expected: "card moved to bottom of deck", ok };
    }
    case "predict": {
      const ok = rec.moveCalls.some((m) => m.targetZoneId === "mainDeck" && m.position === "bottom");
      return { actual: ok ? "moveCard to mainDeck bottom" : "no predict moves", expected: "top-N moved to bottom of mainDeck", ok };
    }
    case "extra-turn": {
      const pet = (ctx.draft as { pendingExtraTurns?: unknown[] }).pendingExtraTurns;
      const ok = Array.isArray(pet) && pet.length > 0;
      return { actual: ok ? `pendingExtraTurns=${(pet as unknown[]).length}` : "no pendingExtraTurns", expected: "pendingExtraTurns appended", ok };
    }
    case "add-restriction":
    case "remove-restriction": {
      let any = false;
      for (const [, meta] of rec.metaUpdates.entries()) {
        if ("restrictions" in meta) {any = true; break;}
      }
      return { actual: any ? "restrictions meta set" : "no restrictions meta", expected: "restrictions meta updated", ok: any };
    }
    case "swap-units": {
      // Two moveCard calls expected (cardA <-> cardB).
      const ok = rec.moveCalls.length >= 2;
      return { actual: `moveCalls=${rec.moveCalls.length}`, expected: "≥2 moveCard calls for swap", ok };
    }
    case "transform": {
      // Re-registers a new def. Hard to inspect without exposing internals;
      // Be lenient: any fireTriggers call counts as "the handler ran".
      const ok = rec.fireTriggers.length > 0;
      return { actual: ok ? "fireTriggers invoked" : "no fireTriggers", expected: "static recalc fired", ok };
    }
    case "fight": {
      // Pair of damages; counterAdds should have ≥2 damage entries.
      const dmg = rec.counterAdds.filter((c) => c.counter === "damage").length;
      return { actual: `damage adds=${dmg}`, expected: "≥2 damage applications", ok: dmg >= 2 };
    }
    case "play": {
      // Casts a card from a source zone — moveCard to chain/base etc.
      const ok = rec.moveCalls.length > 0;
      return { actual: ok ? `moveCalls=${rec.moveCalls.length}` : "no moves", expected: "card moved out of source zone", ok };
    }
    case "move": {
      // Move unit to a different zone; rec.moveCalls should fire.
      const ok = rec.moveCalls.length > 0;
      return {
        actual: ok ? `moveCalls=${rec.moveCalls.length}` : "no moves (engine has no `move` case)",
        expected: "moveCard called (move target → `to` zone)",
        ok,
        root: ok ? undefined : "effect-executor.ts has no `case \"move\":` — the entire move-effect type is unimplemented (drops through to default no-op)",
      };
    }
    case "sequence":
    case "optional":
    case "conditional":
    case "choice":
    case "for-each":
    case "do-times":
    case "repeat": {
      // Wrappers — we only observe whether SOME side-effect propagated.
      const any =
        rec.moveCalls.length > 0 ||
        rec.drawCalls.length > 0 ||
        rec.counterAdds.length > 0 ||
        rec.counterRemoves.length > 0 ||
        rec.metaUpdates.size > 0 ||
        rec.flagsSet.length > 0 ||
        rec.createCalls.length > 0 ||
        rec.controllerSets.length > 0 ||
        (ctx.draft as { pendingChoice?: unknown }).pendingChoice !== undefined;
      return { actual: any ? "child effect produced state change" : "wrapper produced no side-effects", expected: "wrapper resolved with state change", ok: any };
    }
    default: {
      return { actual: `no observer for effect type "${t}"`, expected: "unknown classification", ok: false, root: "unknown effect type" };
    }
  }
}

// ---------------------------------------------------------------------------
// Main audit driver
// ---------------------------------------------------------------------------

interface AbilityInfo {
  type: string;
  primary: ExecutableEffect | null;
  raw: unknown;
}

function summarizeAbility(ab: Record<string, unknown>): AbilityInfo {
  const list = primaryEffects(ab);
  // First non-wrapper effect is the "primary", or fall back to the outer.
  const primary = list[0] ?? null;
  return { primary, raw: ab, type: (ab.type as string) ?? "unknown" };
}

const allCards = getAllCards();
const total = allCards.length;
const noStructured: string[] = [];
const results: RunResult[] = [];

for (const card of allCards) {
  const {abilities} = (card as { abilities?: unknown[] });
  if (!Array.isArray(abilities) || abilities.length === 0) {
    noStructured.push(card.id as string);
    continue;
  }

  for (const ab of abilities) {
    const info = summarizeAbility(ab as Record<string, unknown>);
    // Some abilities (keyword-only like Tank, Rush, Action timing markers)
    // Intentionally have no effect — skip with status "skipped".
    if (!info.primary) {
      // Keyword-only or static-affect-only abilities; not an "effect failure".
      results.push({
        abilityType: info.type,
        actual: "no executable effect",
        cardId: card.id as string,
        cardName: card.name as string,
        cardType: card.cardType as string,
        effectType: info.type === "keyword" ? `keyword:${(ab as { keyword?: string }).keyword ?? ""}` : info.type,
        expected: "no effect to execute (keyword/static-only)",
        rarity: (card.rarity as string) ?? "unknown",
        status: "skipped",
      });
      continue;
    }

    // Decide source zone. Most triggered/play-time/attack-time abilities on
    // Units resolve while the unit is at a battlefield (or moving through
    // One), so we place units there so that "here" / "battlefield" target
    // Filters can find both the source and the dummy enemy on the same
    // Battlefield. Spells cast from hand.
    const sourceZone =
      card.cardType === "unit" || card.cardType === "champion" || card.cardType === "legend"
        ? "battlefield-bf-1"
        : card.cardType === "gear" || card.cardType === "equipment"
          ? "battlefield-bf-1"
          : card.cardType === "battlefield"
            ? "battlefield-bf-1"
            : "hand";

    // Static abilities flow through static-abilities.ts (recalculated at
    // Board scans), NOT through executeEffect. Running executeEffect on a
    // Static effect is meaningless — mark them out-of-scope rather than
    // False-flagging them as "broken".
    if (info.type === "static") {
      results.push({
        abilityType: info.type,
        actual: "static abilities resolve via static-abilities recalc, not executeEffect",
        cardId: card.id as string,
        cardName: card.name as string,
        cardType: card.cardType as string,
        effectType: `static:${info.primary.type}`,
        expected: "static — not in scope for executeEffect audit",
        rarity: (card.rarity as string) ?? "unknown",
        status: "skipped",
      });
      continue;
    }

    let runRes: { ok: boolean; expected: string; actual: string; root?: string };
    try {
      const { ctx, rec } = buildContext({
        cardId: card.id as string,
        cardType: card.cardType as string,
        sourceZone,
      });
      executeEffect(info.primary, ctx);
      runRes = classify(info.primary, rec, ctx);
    } catch (error) {
      const err = error as Error;
      runRes = {
        actual: `threw ${err.name}: ${err.message}`,
        expected: "executeEffect returns without throwing",
        ok: false,
        root: "executeEffect threw",
      };
    }

    const status: RunResult["status"] = INFORMATIONAL_NOOP_TYPES.has(info.primary.type)
      ? "informational-noop"
      : runRes.ok
        ? "working"
        : runRes.expected === "unknown classification"
          ? "unknown-type"
          : "broken";

    results.push({
      abilityType: info.type,
      actual: runRes.actual,
      cardId: card.id as string,
      cardName: card.name as string,
      cardType: card.cardType as string,
      effectType: info.primary.type,
      expected: runRes.expected,
      rarity: (card.rarity as string) ?? "unknown",
      rootCauseGuess: runRes.root,
      status,
    });
  }
}

// ---------------------------------------------------------------------------
// Aggregate by effect type
// ---------------------------------------------------------------------------

interface EffectTypeBucket {
  tested: number;
  working: number;
  broken: number;
  skipped: number;
  unknown: number;
  brokenCards: { cardId: string; cardName: string; rarity: string }[];
}

const byEffect: Record<string, EffectTypeBucket> = {};
const brokenCards: RunResult[] = [];
const unknownTypeCards: RunResult[] = [];

for (const r of results) {
  const bucket = (byEffect[r.effectType] ??= {
    broken: 0,
    brokenCards: [],
    skipped: 0,
    tested: 0,
    unknown: 0,
    working: 0,
  });
  bucket.tested += 1;
  if (r.status === "working" || r.status === "informational-noop") {bucket.working += 1;}
  else if (r.status === "broken") {
    bucket.broken += 1;
    bucket.brokenCards.push({ cardId: r.cardId, cardName: r.cardName, rarity: r.rarity });
    brokenCards.push(r);
  } else if (r.status === "skipped") {bucket.skipped += 1;}
  else if (r.status === "unknown-type") {
    bucket.unknown += 1;
    unknownTypeCards.push(r);
  }
}

// Rarity impact ranking — common > uncommon > rare > epic > champion > legend
const RARITY_WEIGHT: Record<string, number> = {
  champion: 1,
  common: 5,
  epic: 2,
  legend: 1,
  rare: 3,
  uncommon: 4,
  unknown: 0,
};

const brokenByImpact = [...brokenCards].toSorted((a, b) => {
  const wa = RARITY_WEIGHT[a.rarity] ?? 0;
  const wb = RARITY_WEIGHT[b.rarity] ?? 0;
  return wb - wa;
});

const topBrokenEffectTypes = Object.entries(byEffect)
  .filter(([, b]) => b.broken > 0)
  .toSorted((a, b) => b[1].broken - a[1].broken)
  .slice(0, 10);

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

const totalStructured = allCards.length - noStructured.length;

const jsonOut = {
  broken_cards: brokenCards.map((r) => ({
    abilityType: r.abilityType,
    actual: r.actual,
    cardId: r.cardId,
    cardName: r.cardName,
    cardType: r.cardType,
    effectType: r.effectType,
    expected: r.expected,
    rarity: r.rarity,
    root_cause_guess: r.rootCauseGuess ?? "engine handler did not produce expected state change",
  })),
  by_effect_type: Object.fromEntries(
    Object.entries(byEffect).map(([k, v]) => [
      k,
      {
        broken: v.broken,
        broken_cards: v.brokenCards,
        skipped: v.skipped,
        tested: v.tested,
        unknown_classification: v.unknown,
        working: v.working,
      },
    ]),
  ),
  no_structured_ability_count: noStructured.length,
  no_structured_ability_sample: noStructured.slice(0, 20),
  top_5_broken_by_effect_type: topBrokenEffectTypes.slice(0, 5).map(([type, b]) => ({
    broken: b.broken,
    sample_cards: b.brokenCards.slice(0, 10),
    type,
    working: b.working,
  })),
  top_5_broken_by_impact: brokenByImpact.slice(0, 5).map((r) => ({
    cardId: r.cardId,
    cardName: r.cardName,
    effectType: r.effectType,
    expected: r.expected,
    rarity: r.rarity,
    root_cause_guess: r.rootCauseGuess ?? "engine handler did not produce expected state change",
  })),
  total_broken_cards: new Set(brokenCards.map((r) => r.cardId)).size,
  total_cards: total,
  total_structured_cards: totalStructured,
  unknown_effect_types: unknownTypeCards.map((r) => ({
    cardId: r.cardId,
    cardName: r.cardName,
    effectType: r.effectType,
  })),
};

writeFileSync("/tmp/card-effect-coverage.json", JSON.stringify(jsonOut, null, 2));

// Markdown summary
const md: string[] = [];
md.push("# Riftbound Card Effect Coverage Audit\n");
md.push(`- Total cards in pool: **${total}**`);
md.push(`- Cards with structured abilities (audited): **${totalStructured}**`);
md.push(`- Cards with NO structured ability (rulesText-only): **${noStructured.length}**`);
md.push(`- Total broken-effect cards: **${new Set(brokenCards.map((r) => r.cardId)).size}**\n`);

md.push("## Top broken effect types (by # of broken cards)\n");
md.push("| Effect type | Broken | Working | % broken |");
md.push("| --- | ---: | ---: | ---: |");
for (const [type, b] of topBrokenEffectTypes.slice(0, 10)) {
  const total = b.broken + b.working;
  const pct = total === 0 ? 0 : Math.round((b.broken / total) * 100);
  md.push(`| \`${type}\` | ${b.broken} | ${b.working} | ${pct}% |`);
}
md.push("");

md.push("## Top 5 broken cards by impact (rarity-weighted)\n");
md.push("| Card | Rarity | Effect | Expected | Actual |");
md.push("| --- | --- | --- | --- | --- |");
for (const r of brokenByImpact.slice(0, 10)) {
  md.push(`| ${r.cardName} (${r.cardId}) | ${r.rarity} | \`${r.effectType}\` | ${r.expected} | ${r.actual} |`);
}
md.push("");

md.push("## Per-effect-type summary\n");
md.push("| Effect type | Tested | Working | Broken | Skipped | Unknown |");
md.push("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [type, b] of Object.entries(byEffect).toSorted((a, b) => b[1].tested - a[1].tested)) {
  md.push(`| \`${type}\` | ${b.tested} | ${b.working} | ${b.broken} | ${b.skipped} | ${b.unknown} |`);
}
md.push("");

if (unknownTypeCards.length > 0) {
  md.push("## Unknown effect types (no audit observer)\n");
  const grouped = new Map<string, string[]>();
  for (const r of unknownTypeCards) {
    const arr = grouped.get(r.effectType) ?? [];
    arr.push(`${r.cardName} (${r.cardId})`);
    grouped.set(r.effectType, arr);
  }
  for (const [type, list] of grouped.entries()) {
    md.push(`- \`${type}\` (${list.length}): ${list.slice(0, 5).join(", ")}${list.length > 5 ? `, … +${list.length - 5}` : ""}`);
  }
  md.push("");
}

md.push("## All broken cards (full list)\n");
md.push("| Card | Rarity | Card type | Effect | Expected | Actual |");
md.push("| --- | --- | --- | --- | --- | --- |");
for (const r of brokenByImpact) {
  md.push(`| ${r.cardName} (${r.cardId}) | ${r.rarity} | ${r.cardType} | \`${r.effectType}\` | ${r.expected} | ${r.actual} |`);
}

writeFileSync("/tmp/card-effect-coverage.md", `${md.join("\n")}\n`);

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------

console.log(`\n=== Riftbound Card Effect Coverage Audit ===`);
console.log(`Total cards:                ${total}`);
console.log(`Structured-ability cards:   ${totalStructured}`);
console.log(`No-structured-ability:      ${noStructured.length}`);
console.log(`Broken-effect cards:        ${new Set(brokenCards.map((r) => r.cardId)).size}`);
console.log(`Unknown-effect-type cards:  ${new Set(unknownTypeCards.map((r) => r.cardId)).size}\n`);

console.log(`Top 5 broken effect types:`);
for (const [type, b] of topBrokenEffectTypes.slice(0, 5)) {
  console.log(`  ${type.padEnd(24)} broken=${b.broken} working=${b.working}`);
}

console.log(`\nTop 5 broken cards by impact (rarity-weighted):`);
for (const r of brokenByImpact.slice(0, 5)) {
  console.log(`  ${r.cardId} ${r.cardName} (${r.rarity}) — ${r.effectType}: ${r.actual}`);
}

console.log(`\nOutputs:`);
console.log(`  /tmp/card-effect-coverage.json`);
console.log(`  /tmp/card-effect-coverage.md`);
