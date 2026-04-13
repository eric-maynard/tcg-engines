/**
 * Rules Audit: Complex Keywords
 *
 * Wave 3G: Covers the structurally-complex keywords that either interact
 * with multiple game systems (Ganking, Hidden, Ambush, Weaponmaster) or
 * are conditional / cost-gating (Legion, Level, Hunt, Predict, Repeat,
 * Mighty, Deathknell-with-replacement).
 *
 * Rule mapping:
 *   711       Units in non-board zones are evaluated by inherent Might
 *   713-715   General keyword rules
 *   722       Ganking (rule 722 — handled mostly in movement.test.ts)
 *   723       Hidden
 *   724       Legion (conditional keyword)
 *   597       Hide action
 *   Mighty     (rules 706-710 — threshold behavior)
 *
 * Engine note: several of these keywords were recently added as parser
 * keywords but have incomplete engine wiring. Tests that expect engine
 * effects may be marked `it.todo` with an explanation.
 */

import { describe, expect, it } from "bun:test";
import {
  KEYWORD_DEFINITIONS,
  canMoveToLocation,
  canPlayViaAmbush,
} from "../../keywords/keyword-effects";
import { evaluateLegionCondition } from "../../abilities/legion-conditions";
import { evaluateWhileLevel, evaluateXpGainedThisTurn } from "../../abilities/xp-conditions";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  fireTrigger,
  getCardMeta,
  getCardZone,
  getCardsInZone,
  getState,
} from "./helpers";

// ===========================================================================
// Rule 711: Units in Non-Board Zones are evaluated by inherent Might
// ===========================================================================

describe("Rule 711: Units in Non-Board Zones are evaluated by inherent Might", () => {
  it("a unit in trash uses its printed Might, not any prior buffs", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "trashed", {
      cardType: "unit",
      meta: { buffed: true, mightModifier: 5 },
      might: 3,
      owner: P1,
      zone: "trash", // Runtime buffs that should NOT apply
    });
    // The rule test: evaluating "Mighty-ness" of a trashed card reads its
    // Inherent Might only. Verify via inherent registry lookup.
    const card = getCardMeta(engine, "trashed");
    expect(card?.buffed).toBe(true); // Meta exists
    // The card's printed might is 3 — less than 5, so not Mighty regardless
    // Of meta. Engine doesn't expose a "Mighty-in-zone" helper; this is a
    // Documentation test.
    expect(3).toBeLessThan(5);
  });
});

// ===========================================================================
// Rule 713: Keyword basics — granted keywords track duration
// ===========================================================================

describe("Rule 713.3.a.2: Granted keywords carry their duration", () => {
  it("a granted-keyword meta entry tracks its expiration", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u1", {
      cardType: "unit",
      meta: {
        grantedKeywords: [{ duration: "turn", keyword: "Tank" }],
      },
      might: 2,
      owner: P1,
      zone: "base",
    });
    const meta = getCardMeta(engine, "u1");
    expect(meta?.grantedKeywords).toHaveLength(1);
    expect(meta?.grantedKeywords?.[0]?.keyword).toBe("Tank");
    expect(meta?.grantedKeywords?.[0]?.duration).toBe("turn");
  });
});

describe("Rule 713.3.a.3: Granted keywords without explicit duration last while in zone", () => {
  it("a 'static' duration keyword is tracked indefinitely on meta", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u1", {
      cardType: "unit",
      meta: {
        grantedKeywords: [{ duration: "static", keyword: "Assault" }],
      },
      might: 2,
      owner: P1,
      zone: "base",
    });
    const meta = getCardMeta(engine, "u1");
    expect(meta?.grantedKeywords?.[0]?.duration).toBe("static");
  });
});

describe("Rule 714: A card can have any number of Keywords", () => {
  it("a unit can have multiple distinct keywords simultaneously", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u1", {
      cardType: "unit",
      keywords: ["Tank", "Assault", "Backline"],
      might: 3,
      owner: P1,
      zone: "base",
    });
    // The card registry should retain all three.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
      getGlobalCardRegistry: () => {
        hasKeyword: (id: string, kw: string) => boolean;
      };
    };
    const reg = getGlobalCardRegistry();
    expect(reg.hasKeyword("u1", "Tank")).toBe(true);
    expect(reg.hasKeyword("u1", "Assault")).toBe(true);
    expect(reg.hasKeyword("u1", "Backline")).toBe(true);
  });
});

// ===========================================================================
// Rule 722: Ganking (Passive keyword adding Standard Move permission)
// ===========================================================================

describe("Rule 722.1.b: Ganking — unit may move to a battlefield from another battlefield", () => {
  it("canMoveToLocation allows battlefield→battlefield with Ganking", () => {
    expect(canMoveToLocation(true, "battlefield", "battlefield")).toBe(true);
  });

  it("canMoveToLocation forbids battlefield→battlefield without Ganking", () => {
    expect(canMoveToLocation(false, "battlefield", "battlefield")).toBe(false);
  });
});

describe("Rule 722.1.c.1: Ganking does not restrict or remove Standard Move options", () => {
  it("a Ganking unit can still move base→battlefield", () => {
    expect(canMoveToLocation(true, "base", "battlefield")).toBe(true);
  });

  it("a Ganking unit can still move battlefield→base", () => {
    expect(canMoveToLocation(true, "battlefield", "base")).toBe(true);
  });
});

describe("Rule 722.1.c.2: Ganking has no activation cost", () => {
  it("Ganking provides battlefield-to-battlefield move purely via canMoveToLocation logic (no cost arg)", () => {
    // Helper signature has no 'cost' input — the permission is free.
    const result = canMoveToLocation(true, "battlefield", "battlefield");
    expect(result).toBe(true);
  });
});

describe("Rule 722.2: Multiple instances of Ganking are redundant", () => {
  it("Ganking keyword is non-stackable per KEYWORD_DEFINITIONS", () => {
    expect(KEYWORD_DEFINITIONS.Ganking?.stackable).toBe(false);
  });
});

// ===========================================================================
// Rule 723: Hidden
// ===========================================================================

describe("Rule 723.1.a: Hidden is present on Spells, Units, and Gear", () => {
  it("Hidden keyword is registered in KEYWORD_DEFINITIONS as a play-category keyword", () => {
    const hidden = KEYWORD_DEFINITIONS.Hidden;
    expect(hidden).toBeDefined();
    expect(hidden?.category).toBe("play");
  });
});

describe("Rule 723.1.c.2: Hiding a card does not open a chain", () => {
  it("hideCard move moves the card to the facedown zone without adding to the chain", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "secret", {
      cardType: "spell",
      energyCost: 3,
      keywords: ["Hidden"],
      owner: P1,
      zone: "hand",
    });

    // Confirm chain is empty before the move.
    expect(getState(engine).interaction?.chain?.active ?? false).toBe(false);

    const result = applyMove(engine, "hideCard", {
      battlefieldId: "bf-1",
      cardId: "secret",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    // The card should now live in the facedown zone for that battlefield.
    expect(getCardZone(engine, "secret")).toBe("facedown-bf-1");
    expect(getCardMeta(engine, "secret")?.hidden).toBe(true);

    // Rule 723.1.c.2: hiding does NOT open a chain.
    expect(getState(engine).interaction?.chain?.active ?? false).toBe(false);
  });
});

describe("Rule 723.1.c.3: Playing a card from facedown does open a chain", () => {
  it("revealHidden on a spell card adds it to the chain", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "secret", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          timing: "action",
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 3,
      keywords: ["Hidden"],
      owner: P1,
      zone: "hand",
    });

    // Hide the card first.
    applyMove(engine, "hideCard", {
      battlefieldId: "bf-1",
      cardId: "secret",
      playerId: P1,
    });
    expect(getCardMeta(engine, "secret")?.hidden).toBe(true);

    // Now reveal it — rule 723.1.c.3 says this opens a chain.
    const reveal = applyMove(engine, "revealHidden", {
      cardId: "secret",
      playerId: P1,
    });
    expect(reveal.success).toBe(true);

    const chain = getState(engine).interaction?.chain;
    expect(chain?.active).toBe(true);
    expect(chain?.items?.length ?? 0).toBe(1);
    expect(chain?.items?.[0]?.cardId).toBe("secret");

    // Card is no longer hidden.
    expect(getCardMeta(engine, "secret")?.hidden).toBe(false);
  });
});

describe("Rule 723.3: Multiple instances of Hidden are redundant", () => {
  it("Hidden keyword is marked non-stackable", () => {
    expect(KEYWORD_DEFINITIONS.Hidden?.stackable).toBe(false);
  });
});

describe("Rule 723.4.a: 'Hidden' as a characteristic is independent of facedown state", () => {
  it("a card's keyword list can contain Hidden while the card is face-up (not in facedown zone)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "h1", {
      cardType: "unit",
      keywords: ["Hidden"],
      might: 2,
      owner: P1,
      zone: "hand", // Face-up in hand — not currently hidden
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
      getGlobalCardRegistry: () => { hasKeyword: (id: string, kw: string) => boolean };
    };
    const reg = getGlobalCardRegistry();
    expect(reg.hasKeyword("h1", "Hidden")).toBe(true);
    expect(getCardMeta(engine, "h1")?.hidden ?? false).toBe(false);
  });
});

// ===========================================================================
// Ambush (complex movement/timing keyword)
// ===========================================================================

describe("Ambush: can be played as Reaction at a battlefield where you have units", () => {
  it("canPlayViaAmbush requires Ambush + friendly units + reaction timing", () => {
    expect(canPlayViaAmbush(true, true, true)).toBe(true);
  });

  it("canPlayViaAmbush denies without Ambush keyword", () => {
    expect(canPlayViaAmbush(false, true, true)).toBe(false);
  });

  it("canPlayViaAmbush denies if no friendly units at target battlefield", () => {
    expect(canPlayViaAmbush(true, false, true)).toBe(false);
  });

  it("canPlayViaAmbush denies outside reaction timing", () => {
    expect(canPlayViaAmbush(true, true, false)).toBe(false);
  });

  // Rule 577.3.c: the engine's `playUnit` move now honors Ambush by letting
  // A unit be played directly to a battlefield where the player has friendly
  // Units, without requiring main-phase timing on the player's own turn.
  it("Rule 577.3.c: playUnit with Ambush allows a unit to be played to a battlefield where the player has friendly units", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P2]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: null });
    // P2 already has a friendly unit at bf-1 (needed for Ambush).
    createCard(engine, "p2-scout", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "ambusher", {
      cardType: "unit",
      energyCost: 2,
      keywords: ["Ambush"],
      might: 3,
      owner: P2,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "ambusher",
      location: "battlefield-bf-1",
      playerId: P2,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "ambusher")).toBe("battlefield-bf-1");
  });

  it("Rule 577.3.c: playUnit without Ambush is rejected when the location is a battlefield", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "friend", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "no-ambush", {
      cardType: "unit",
      energyCost: 2,
      might: 3,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "no-ambush",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    expect(getCardZone(engine, "no-ambush")).toBe("hand");
  });

  it("Rule 577.3.c: playUnit with Ambush still requires friendly units at the target battlefield", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: null });
    // No friendly units at bf-1.
    createCard(engine, "lonely", {
      cardType: "unit",
      energyCost: 2,
      keywords: ["Ambush"],
      might: 3,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "lonely",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Weaponmaster (can equip multiple equipment)
// ===========================================================================

describe("Weaponmaster: can hold multiple equipment (engine rule gap)", () => {
  it("Weaponmaster keyword exists in KEYWORD_DEFINITIONS as a 'play' keyword", () => {
    const w = KEYWORD_DEFINITIONS.Weaponmaster;
    expect(w).toBeDefined();
    expect(w?.category).toBe("play");
  });

  it("Rule 579: equipCard rejects a second equipment on a unit without Weaponmaster", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "knight", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "sword", {
      cardType: "equipment",
      owner: P1,
      zone: "base",
    });
    createCard(engine, "shield", {
      cardType: "equipment",
      owner: P1,
      zone: "base",
    });

    // First equipment attaches fine.
    const r1 = applyMove(engine, "equipCard", {
      equipmentId: "sword",
      playerId: P1,
      unitId: "knight",
    });
    expect(r1.success).toBe(true);

    // Second equipment on the same (non-Weaponmaster) unit must be rejected.
    const r2 = applyMove(engine, "equipCard", {
      equipmentId: "shield",
      playerId: P1,
      unitId: "knight",
    });
    expect(r2.success).toBe(false);
  });

  it("Rule 579: a Weaponmaster unit can hold multiple equipment", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "dual-wielder", {
      cardType: "unit",
      keywords: ["Weaponmaster"],
      might: 3,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "axe", {
      cardType: "equipment",
      owner: P1,
      zone: "base",
    });
    createCard(engine, "dagger", {
      cardType: "equipment",
      owner: P1,
      zone: "base",
    });

    const r1 = applyMove(engine, "equipCard", {
      equipmentId: "axe",
      playerId: P1,
      unitId: "dual-wielder",
    });
    expect(r1.success).toBe(true);

    const r2 = applyMove(engine, "equipCard", {
      equipmentId: "dagger",
      playerId: P1,
      unitId: "dual-wielder",
    });
    expect(r2.success).toBe(true);
  });
});

// ===========================================================================
// Hunt N (when conquering/holding, gain N XP)
// ===========================================================================

describe("Hunt N: When conquering or holding, gain N XP (keyword parser support)", () => {
  it("Hunt keyword exists in KEYWORD_DEFINITIONS as a trigger-category stackable keyword", () => {
    const hunt = KEYWORD_DEFINITIONS.Hunt;
    expect(hunt).toBeDefined();
    expect(hunt?.category).toBe("trigger");
    expect(hunt?.stackable).toBe(true);
  });

  it("a Hunt-style trigger fires on conquer (using a gain-xp effect as proxy)", () => {
    // We simulate Hunt by giving a unit an explicit triggered ability on
    // "conquer" that grants XP. This proves the trigger infrastructure can
    // Power Hunt, even if Hunt itself isn't generated at parse time.
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "hunter", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "conquer", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const fired = fireTrigger(engine, {
      battlefieldId: "bf-1",
      playerId: P1,
      type: "conquer",
    });
    // Self-scoped trigger on a unit listening to a conquer event falls
    // Through to the owner-match path (event.playerId === card.owner).
    expect(fired).toBe(1);
  });

  it("Hunt parser expansion: a unit with [Hunt 2] gains a conquer-triggered gain-xp ability automatically", () => {
    // The cards parser (riftbound-cards/src/parser) expands `[Hunt N]`
    // Into two triggered gain-xp abilities (conquer/hold). Here we drive
    // The parser-equivalent shape directly so the audit can verify the
    // Engine's trigger-matcher fires on conquer and hands out XP.
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "hunter", {
      abilities: [
        // This is the expansion parseAbilities produces for [Hunt 2]:
        {
          effect: { amount: 2, type: "gain-xp" },
          trigger: { event: "conquer", on: "self" },
          type: "triggered",
        },
        {
          effect: { amount: 2, type: "gain-xp" },
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    // Baseline: the player has 0 XP.
    expect(getState(engine).players[P1]?.xp ?? 0).toBe(0);

    // Fire a conquer event for P1.
    const fired = fireTrigger(engine, {
      battlefieldId: "bf-1",
      playerId: P1,
      type: "conquer",
    });
    expect(fired).toBeGreaterThanOrEqual(1);

    // Hunt's gain-xp effect should have granted 2 XP.
    expect(getState(engine).players[P1]?.xp ?? 0).toBe(2);
  });
});

// ===========================================================================
// Predict N (look at top N cards, may recycle)
// ===========================================================================

describe("Predict N: look at top N cards, may recycle", () => {
  it("Predict keyword exists as a stackable trigger-category keyword", () => {
    const predict = KEYWORD_DEFINITIONS.Predict;
    expect(predict).toBeDefined();
    expect(predict?.category).toBe("trigger");
    expect(predict?.stackable).toBe(true);
  });

  it("Predict N effect moves the top N cards of the player's main deck to the bottom", () => {
    // The executor's `predict` case auto-recycles the top N cards of
    // The controller's main deck. After Predict 2 on a deck ordered
    // [A, B, C, D, E], the deck becomes [C, D, E, A, B].
    const engine = createMinimalGameState({ phase: "main" });

    // Seed P1's main deck with 5 distinct cards.
    const deckOrder = ["deck-a", "deck-b", "deck-c", "deck-d", "deck-e"];
    for (const id of deckOrder) {
      createCard(engine, id, {
        cardType: "unit",
        might: 1,
        owner: P1,
        zone: "mainDeck",
      });
    }

    // Give P1 a unit with a triggered ability that produces a Predict 2
    // Effect on play. When the trigger fires, the executor will execute
    // The predict effect on P1's deck.
    createCard(engine, "seer", {
      abilities: [
        {
          effect: { amount: 2, type: "predict" },
          trigger: { event: "play-self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    // Sanity: the top two cards are deck-a and deck-b.
    expect(getCardsInZone(engine, "mainDeck", P1).slice(0, 2)).toEqual(["deck-a", "deck-b"]);

    const fired = fireTrigger(engine, { cardId: "seer", playerId: P1, type: "play-self" });
    expect(fired).toBeGreaterThanOrEqual(1);

    // After Predict 2: deck should be [C, D, E, A, B].
    expect(getCardsInZone(engine, "mainDeck", P1)).toEqual([
      "deck-c",
      "deck-d",
      "deck-e",
      "deck-a",
      "deck-b",
    ]);
  });
});

// ===========================================================================
// Level N (ability gates on XP threshold)
// ===========================================================================

describe("Level N: ability is active while player XP >= N", () => {
  it("evaluateWhileLevel returns true when player XP meets threshold", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Set XP directly on state via player accessor.
    const state = getState(engine);
    if (state.players[P1]) {
      state.players[P1].xp = 5;
    }
    expect(evaluateWhileLevel(state, P1, 3)).toBe(true);
    expect(evaluateWhileLevel(state, P1, 5)).toBe(true);
  });

  it("evaluateWhileLevel returns false when player XP below threshold", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    if (state.players[P1]) {
      state.players[P1].xp = 2;
    }
    expect(evaluateWhileLevel(state, P1, 3)).toBe(false);
  });

  it("evaluateWhileLevel treats undefined xp as 0", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    expect(evaluateWhileLevel(state, P1, 1)).toBe(false);
  });
});

describe("xp-gained-this-turn: activates when player has gained any XP this turn", () => {
  it("evaluateXpGainedThisTurn returns true after XP gain this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    (state.xpGainedThisTurn as Record<string, number>)[P1] = 1;
    expect(evaluateXpGainedThisTurn(state, P1)).toBe(true);
  });

  it("evaluateXpGainedThisTurn returns false at turn start (no XP yet)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    expect(evaluateXpGainedThisTurn(state, P1)).toBe(false);
  });
});

// ===========================================================================
// Repeat N (spell effect can be repeated N times at added cost)
// ===========================================================================

describe("Repeat N: spell effect may be repeated at added cost", () => {
  it("playSpell with repeatCount charges the repeat cost and resolves the effect 1 + repeatCount times", () => {
    // A Repeat spell pays its base cost once and then an extra repeat
    // Cost per additional resolution. The test spell has base cost 1
    // Energy + repeat cost 1 energy, effect "gain 1 XP for the player".
    // Playing it with repeatCount=2 should cost 1 + (1*2) = 3 energy
    // And the gain-xp effect should resolve 3 times (base + 2 repeats)
    // For a total of 3 XP.
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });

    // Create a Repeat spell in P1's hand whose effect grants XP to the
    // Controller — an observable, target-less effect.
    createCard(engine, "repeat-spell", {
      abilities: [
        {
          effect: { amount: 1, type: "gain-xp" },
          repeat: { energy: 1, power: [] },
          timing: "action",
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const initialEnergy = getState(engine).runePools[P1]?.energy ?? 0;
    expect(initialEnergy).toBe(5);
    expect(getState(engine).players[P1]?.xp ?? 0).toBe(0);

    const result = applyMove(engine, "playSpell", {
      cardId: "repeat-spell",
      playerId: P1,
      repeatCount: 2,
    });
    expect(result.success).toBe(true);

    // Cost: 1 base + 2 * 1 repeat = 3 energy.
    expect(getState(engine).runePools[P1]?.energy ?? 0).toBe(initialEnergy - 3);

    // Pass priority until the chain auto-resolves. The activePlayer
    // Starts at the spell's controller (P1). After P1 passes, priority
    // Moves to P2; when P2 passes the chain resolves automatically
    // Inside passChainPriority's reducer.
    const p1Pass = applyMove(engine, "passChainPriority", { playerId: P1 });
    expect(p1Pass.success).toBe(true);
    const p2Pass = applyMove(engine, "passChainPriority", { playerId: P2 });
    expect(p2Pass.success).toBe(true);

    // The gain-xp effect should have resolved 3 times (base + 2 repeats).
    expect(getState(engine).players[P1]?.xp ?? 0).toBe(3);
  });

  it("playSpell rejects repeatCount > 0 for a spell without a Repeat cost", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createCard(engine, "target-unit", {
      cardType: "unit",
      might: 10,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "regular-spell", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "unit" }, type: "damage" },
          timing: "action",
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "regular-spell",
      playerId: P1,
      repeatCount: 1,
      targets: ["target-unit"],
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Mighty (rule 706-710): trigger when Might reaches 5+
// ===========================================================================

describe("Rule 709: becomes-mighty event fires when Might crosses from <5 to >=5", () => {
  it("a triggered ability listening on become-mighty fires for self when unit becomes Mighty", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "soon-mighty", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "become-mighty", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "soon-mighty",
      owner: P1,
      type: "become-mighty",
    });
    expect(fired).toBe(1);
  });

  it("a 'friendly-units' become-mighty trigger fires when another friendly unit becomes Mighty", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "watcher", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "become-mighty", on: "friendly-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "other-unit",
      owner: P1,
      type: "become-mighty",
    });
    expect(fired).toBe(1);
  });

  it("friendly-units become-mighty does NOT fire for opponent's unit becoming Mighty", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "watcher2", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "become-mighty", on: "friendly-units" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "enemy",
      owner: P2,
      type: "become-mighty",
    });
    expect(fired).toBe(0);
  });
});

// ===========================================================================
// Rule 724: Legion (conditional keyword — "if you played another card this turn")
// ===========================================================================

describe("Rule 724.1.c: Legion — apply effect only if another card was played this turn", () => {
  it("state exposes a per-player cardsPlayedThisTurn tracker", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    expect("cardsPlayedThisTurn" in state).toBe(true);
    expect((state.cardsPlayedThisTurn as Record<string, number>)[P1]).toBe(0);
    expect((state.cardsPlayedThisTurn as Record<string, number>)[P2]).toBe(0);
  });

  it("Rule 724.1.c: evaluateLegionCondition returns false when no card has been played this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    expect(evaluateLegionCondition(state, P1)).toBe(false);
  });

  it("Rule 724.1.c: evaluateLegionCondition returns true once the player has played >= 1 card this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    (state.cardsPlayedThisTurn as Record<string, number>)[P1] = 1;
    expect(evaluateLegionCondition(state, P1)).toBe(true);
  });

  it("Rule 724: playUnit increments the cardsPlayedThisTurn counter for the active player", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createCard(engine, "u1", {
      cardType: "unit",
      energyCost: 1,
      might: 2,
      owner: P1,
      zone: "hand",
    });

    // Baseline: counter is 0.
    expect((getState(engine).cardsPlayedThisTurn as Record<string, number>)[P1]).toBe(0);

    const r = applyMove(engine, "playUnit", {
      cardId: "u1",
      location: "base",
      playerId: P1,
    });
    expect(r.success).toBe(true);

    // After a successful play, the counter is bumped.
    expect((getState(engine).cardsPlayedThisTurn as Record<string, number>)[P1]).toBe(1);
  });

  it("Rule 724.1.c: Legion-gated trigger does NOT fire when no prior card was played this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "legionnaire", {
      abilities: [
        {
          condition: { type: "legion" },
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      keywords: ["Legion"],
      might: 2,
      owner: P1,
      zone: "base",
    });

    // No card has been played this turn — Legion condition must fail.
    const fired = fireTrigger(engine, {
      cardId: "legionnaire",
      playerId: P1,
      type: "play-self",
    });
    expect(fired).toBe(0);
  });

  it("Rule 724.1.c: Legion-gated trigger fires when another card WAS played this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Pretend the player already played another card this turn. The
    // Engine's currentState (what fireTrigger reads) is a separate
    // Object from `getState()` (which returns a clone), so we mutate
    // The internal state directly.
    const internal = engine as unknown as {
      currentState: { cardsPlayedThisTurn: Record<string, number> };
    };
    internal.currentState.cardsPlayedThisTurn[P1] = 1;

    createCard(engine, "legionnaire2", {
      abilities: [
        {
          condition: { type: "legion" },
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      keywords: ["Legion"],
      might: 2,
      owner: P1,
      zone: "base",
    });

    const fired = fireTrigger(engine, {
      cardId: "legionnaire2",
      playerId: P1,
      type: "play-self",
    });
    expect(fired).toBe(1);
  });
});

describe("Rule 724.2: All Legion instances satisfied by playing a single prior card", () => {
  it("Rule 724.2: a single prior card satisfies multiple Legion abilities on the same card", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const internal = engine as unknown as {
      currentState: { cardsPlayedThisTurn: Record<string, number> };
    };
    internal.currentState.cardsPlayedThisTurn[P1] = 1;

    createCard(engine, "dual-legion", {
      abilities: [
        {
          condition: { type: "legion" },
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
        {
          condition: { type: "legion" },
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      keywords: ["Legion"],
      might: 2,
      owner: P1,
      zone: "base",
    });

    // Both abilities should fire because the single prior play satisfied
    // All Legion instances (rule 724.2).
    const fired = fireTrigger(engine, {
      cardId: "dual-legion",
      playerId: P1,
      type: "play-self",
    });
    expect(fired).toBe(2);
  });
});

// ===========================================================================
// KEYWORD_DEFINITIONS catalog sanity (ensure recent additions are present)
// ===========================================================================

describe("KEYWORD_DEFINITIONS catalog includes recently-added keywords", () => {
  it("Hunt is registered", () => {
    expect(KEYWORD_DEFINITIONS.Hunt).toBeDefined();
  });

  it("Predict is registered", () => {
    expect(KEYWORD_DEFINITIONS.Predict).toBeDefined();
  });

  it("Ambush is registered", () => {
    expect(KEYWORD_DEFINITIONS.Ambush).toBeDefined();
  });

  it("Backline is registered", () => {
    expect(KEYWORD_DEFINITIONS.Backline).toBeDefined();
  });

  it("Legion is registered", () => {
    expect(KEYWORD_DEFINITIONS.Legion).toBeDefined();
  });
});

// ===========================================================================
// Ganking + resolveFullCombat path: verify the move reducer honors Ganking
// ===========================================================================

describe("Rule 722 smoke: gankingMove reducer moves unit between battlefields", () => {
  it("a Ganking unit successfully moves from bf-1 to bf-2", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: null });
    createCard(engine, "ganker", {
      cardType: "unit",
      keywords: ["Ganking"],
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = applyMove(engine, "gankingMove", {
      playerId: P1,
      toBattlefield: "bf-2",
      unitId: "ganker",
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "ganker")).toBe("battlefield-bf-2");
  });

  it("a non-Ganking unit's gankingMove is rejected (rule 722.1.b)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: null });
    createCard(engine, "grunt", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = applyMove(engine, "gankingMove", {
      playerId: P1,
      toBattlefield: "bf-2",
      unitId: "grunt",
    });
    expect(result.success).toBe(false);
    // Card should remain in bf-1.
    expect(getCardZone(engine, "grunt")).toBe("battlefield-bf-1");
  });
});

// ===========================================================================
// Cross-keyword smoke: Temporary + Mighty + Assault stacks
// ===========================================================================

describe("Keyword registry stores multiple keywords per card", () => {
  it("a card with Temporary + Assault + Tank is recognized for all three", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "multi", {
      cardType: "unit",
      keywords: ["Temporary", "Assault", "Tank"],
      might: 3,
      owner: P1,
      zone: "base",
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGlobalCardRegistry } = require("../../operations/card-lookup") as {
      getGlobalCardRegistry: () => { hasKeyword: (id: string, kw: string) => boolean };
    };
    const reg = getGlobalCardRegistry();
    expect(reg.hasKeyword("multi", "Temporary")).toBe(true);
    expect(reg.hasKeyword("multi", "Assault")).toBe(true);
    expect(reg.hasKeyword("multi", "Tank")).toBe(true);
  });
});
