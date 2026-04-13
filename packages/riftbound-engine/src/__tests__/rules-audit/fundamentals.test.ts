/**
 * Rules Audit: Fundamentals (Deck construction, card types, zones, card
 * properties, game-object invariants).
 *
 * Wave 1 (Foundations) — the rule index maps 303 rules to this file. We
 * don't attempt all of them; this wave focuses on the highest-leverage
 * invariants that catch real engine bugs:
 *   - Zone ownership + visibility
 *   - Card type classification
 *   - Per-card state (damage, exhausted, buff)
 *   - Basic card property lookup (might, cost, domain, keywords)
 *
 * Less impactful rules (deck-construction legality, token semantics,
 * domain-identity rules) are left as `it.todo` for Wave 2.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  advancePhase,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardsInZone,
  getState,
  getZone,
} from "./helpers";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

// -----------------------------------------------------------------------------
// Rules 104-107: Zones (The Board, Non-Board Zones)
// -----------------------------------------------------------------------------

describe("Rule 106: The Board zones exist and are initialized on game start", () => {
  it("base, runePool, trash, banishment, legendZone, championZone, hand all exist", () => {
    const engine = createMinimalGameState();
    // These should all return an empty array (not throw / undefined).
    expect(getCardsInZone(engine, "base")).toEqual([]);
    expect(getCardsInZone(engine, "runePool")).toEqual([]);
    expect(getCardsInZone(engine, "trash")).toEqual([]);
    expect(getCardsInZone(engine, "banishment")).toEqual([]);
    expect(getCardsInZone(engine, "legendZone")).toEqual([]);
    expect(getCardsInZone(engine, "championZone")).toEqual([]);
    expect(getCardsInZone(engine, "hand")).toEqual([]);
  });
});

describe("Rule 106.2.d: Other players cannot have game objects in another player's Base", () => {
  it("getZone filters cards by owner so P2 does not see P1's base cards", () => {
    const engine = createMinimalGameState();
    createCard(engine, "poro", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });

    // P1's base contains poro; P2's base does not.
    expect(getZone(engine, P1, "base")).toContain("poro");
    expect(getZone(engine, P2, "base")).not.toContain("poro");
  });
});

describe("Rule 106.2.e: The Base also houses runes that are on the Board", () => {
  it("physical rune cards placed in runePool zone are visible as runes on board", () => {
    const engine = createMinimalGameState();
    createCard(engine, "fury-rune", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });

    const runes = getCardsInZone(engine, "runePool", P1);
    expect(runes).toContain("fury-rune");
  });
});

describe("Rule 107.1: Trash is per-player, public, and holds killed/discarded cards", () => {
  it("a card placed directly in trash is visible in that player's trash", () => {
    const engine = createMinimalGameState();
    createCard(engine, "dead-poro", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "trash",
    });

    expect(getZone(engine, P1, "trash")).toContain("dead-poro");
  });

  it("trash is visibility 'public' per zone config (every player sees it)", () => {
    const engine = createMinimalGameState();
    // Verify via the underlying zone config.
    const internal = engine as unknown as {
      internalState: { zones: Record<string, { config: { visibility: string } }> };
    };
    expect(internal.internalState.zones.trash?.config.visibility).toBe("public");
  });
});

describe("Rule 107: Hand is private to the owner", () => {
  it("hand zone has visibility 'private'", () => {
    const engine = createMinimalGameState();
    const internal = engine as unknown as {
      internalState: { zones: Record<string, { config: { visibility: string } }> };
    };
    expect(internal.internalState.zones.hand?.config.visibility).toBe("private");
  });
});

describe("Rule 103.2.e: Main Deck is Private Information (secret visibility)", () => {
  it("mainDeck zone has visibility 'secret'", () => {
    const engine = createMinimalGameState();
    const internal = engine as unknown as {
      internalState: { zones: Record<string, { config: { visibility: string } }> };
    };
    expect(internal.internalState.zones.mainDeck?.config.visibility).toBe("secret");
  });
});

describe("Rule 107: Rune Deck is Secret Information", () => {
  it("runeDeck zone has visibility 'secret'", () => {
    const engine = createMinimalGameState();
    const internal = engine as unknown as {
      internalState: { zones: Record<string, { config: { visibility: string } }> };
    };
    expect(internal.internalState.zones.runeDeck?.config.visibility).toBe("secret");
  });
});

// -----------------------------------------------------------------------------
// Rules 120-152: Game Objects & Card Types
// -----------------------------------------------------------------------------

describe("Rule 120-123: Game Objects include Main Deck cards, runes, legends, BFs, tokens", () => {
  it("cards of all major types can be registered and placed in zones", () => {
    const engine = createMinimalGameState();

    createCard(engine, "a-unit", { cardType: "unit", might: 2, owner: P1, zone: "base" });
    createCard(engine, "a-gear", { cardType: "gear", owner: P1, zone: "base" });
    createCard(engine, "a-spell", { cardType: "spell", owner: P1, zone: "hand" });
    createCard(engine, "a-rune", { cardType: "rune", domain: "fury", owner: P1, zone: "runePool" });
    createCard(engine, "a-legend", { cardType: "legend", owner: P1, zone: "legendZone" });
    createCard(engine, "a-champ", { cardType: "unit", owner: P1, zone: "championZone" });

    const reg = getGlobalCardRegistry();
    expect(reg.getCardType("a-unit")).toBe("unit");
    expect(reg.getCardType("a-gear")).toBe("gear");
    expect(reg.getCardType("a-spell")).toBe("spell");
    expect(reg.getCardType("a-rune")).toBe("rune");
    expect(reg.getCardType("a-legend")).toBe("legend");
  });
});

describe("Rule 140: Units have the inherent ability to perform a Standard Move", () => {
  it("units are registered with cardType 'unit'", () => {
    const engine = createMinimalGameState();
    createCard(engine, "ranger", { cardType: "unit", might: 3, owner: P1, zone: "base" });
    expect(getGlobalCardRegistry().getCardType("ranger")).toBe("unit");
  });
});

describe("Rule 144: Gear have intrinsic properties unique to them", () => {
  it("gear is a distinct card type from unit", () => {
    const engine = createMinimalGameState();
    createCard(engine, "helm", { cardType: "gear", owner: P1, zone: "base" });
    expect(getGlobalCardRegistry().getCardType("helm")).toBe("gear");
  });
});

describe("Rule 148-151: Spells are played on the owner's turn and go to Trash after resolving", () => {
  it("spell card type is distinct from units/gear", () => {
    const engine = createMinimalGameState();
    createCard(engine, "zap", { cardType: "spell", owner: P1, zone: "hand" });
    expect(getGlobalCardRegistry().getCardType("zap")).toBe("spell");
  });
});

describe("Rule 149: A spell is controlled by the player who played it", () => {
  it("a card's controller defaults to its owner when not specified", () => {
    const engine = createMinimalGameState();
    createCard(engine, "spell-1", { cardType: "spell", owner: P1, zone: "hand" });
    const internal = engine as unknown as {
      internalState: { cards: Record<string, { owner: string; controller: string }> };
    };
    expect(internal.internalState.cards["spell-1"]?.controller).toBe(P1);
    expect(internal.internalState.cards["spell-1"]?.owner).toBe(P1);
  });

  it("a card's controller can be overridden on creation", () => {
    const engine = createMinimalGameState();
    createCard(engine, "stolen", {
      cardType: "unit",
      controller: P2,
      might: 1,
      owner: P1,
      zone: "base",
    });
    const internal = engine as unknown as {
      internalState: { cards: Record<string, { owner: string; controller: string }> };
    };
    expect(internal.internalState.cards.stolen?.owner).toBe(P1);
    expect(internal.internalState.cards.stolen?.controller).toBe(P2);
  });
});

// -----------------------------------------------------------------------------
// Card Properties: Might, Cost, Domain, Keywords
// -----------------------------------------------------------------------------

describe("Card properties: Might, cost, domain, keywords", () => {
  it("unit might is read from the registry", () => {
    const engine = createMinimalGameState();
    createCard(engine, "bruiser", {
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "base",
    });
    expect(getGlobalCardRegistry().getMight("bruiser")).toBe(5);
  });

  it("energy cost is read from the registry", () => {
    const engine = createMinimalGameState();
    createCard(engine, "costly", {
      cardType: "spell",
      energyCost: 4,
      owner: P1,
      zone: "hand",
    });
    expect(getGlobalCardRegistry().getEnergyCost("costly")).toBe(4);
  });

  it("keywords are read from the registry", () => {
    const engine = createMinimalGameState();
    createCard(engine, "assault-unit", {
      cardType: "unit",
      keywords: ["Assault"],
      might: 2,
      owner: P1,
      zone: "base",
    });
    expect(getGlobalCardRegistry().hasKeyword("assault-unit", "Assault")).toBe(true);
    expect(getGlobalCardRegistry().hasKeyword("assault-unit", "Tank")).toBe(false);
  });

  it("cards with no energy cost default to 0", () => {
    const engine = createMinimalGameState();
    createCard(engine, "free", { cardType: "unit", might: 1, owner: P1, zone: "base" });
    expect(getGlobalCardRegistry().getEnergyCost("free")).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Zone invariants: cards have exactly one zone, owners are defined
// -----------------------------------------------------------------------------

describe("Invariant: Every created card has exactly one zone and one owner", () => {
  it("a created card appears in exactly one zone's cardIds list", () => {
    const engine = createMinimalGameState();
    createCard(engine, "solo", { cardType: "unit", might: 1, owner: P1, zone: "base" });

    const internal = engine as unknown as {
      internalState: { zones: Record<string, { cardIds: string[] }> };
    };
    const { zones } = internal.internalState;

    // Count occurrences of "solo" across all zones.
    let count = 0;
    for (const z of Object.values(zones)) {
      if (z.cardIds.includes("solo" as string)) {
        count++;
      }
    }
    expect(count).toBe(1);
  });

  it("each card has an owner", () => {
    const engine = createMinimalGameState();
    createCard(engine, "c1", { cardType: "unit", might: 1, owner: P1, zone: "base" });
    createCard(engine, "c2", { cardType: "unit", might: 1, owner: P2, zone: "base" });

    const internal = engine as unknown as {
      internalState: { cards: Record<string, { owner: string }> };
    };
    expect(internal.internalState.cards.c1?.owner).toBe(P1);
    expect(internal.internalState.cards.c2?.owner).toBe(P2);
  });
});

// -----------------------------------------------------------------------------
// Card metadata: damage, exhausted, stunned, buffed
// -----------------------------------------------------------------------------

describe("Card meta: damage, exhausted, stunned, buffed default to clean state", () => {
  it("damage defaults to 0", () => {
    const engine = createMinimalGameState();
    createCard(engine, "clean", { cardType: "unit", might: 2, owner: P1, zone: "base" });
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.clean;
    expect(meta?.damage).toBe(0);
  });

  it("exhausted defaults to false", () => {
    const engine = createMinimalGameState();
    createCard(engine, "ready", { cardType: "unit", might: 2, owner: P1, zone: "base" });
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas.ready;
    expect(meta?.exhausted).toBe(false);
  });

  it("meta overrides on createCard are applied", () => {
    const engine = createMinimalGameState();
    createCard(engine, "dinged", {
      cardType: "unit",
      meta: { damage: 2, exhausted: true },
      might: 3,
      owner: P1,
      zone: "base",
    });
    const meta = (
      engine as unknown as {
        internalState: {
          cardMetas: Record<string, { damage: number; exhausted: boolean }>;
        };
      }
    ).internalState.cardMetas.dinged;
    expect(meta?.damage).toBe(2);
    expect(meta?.exhausted).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Turn Structure Fundamentals: 515.1 Awaken, 517.2.a damage clear
// -----------------------------------------------------------------------------

describe("Rule 515.1: Awaken phase readies all exhausted game objects", () => {
  it("exhausted units become ready after awaken phase runs", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "tired", {
      cardType: "unit",
      meta: { exhausted: true },
      might: 2,
      owner: P1,
      zone: "base",
    });

    // Advance through ending → cleanup → (next turn's) awaken.
    advancePhase(engine, "awaken");

    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas.tired;
    expect(meta?.exhausted).toBe(false);
  });
});

describe("Rule 517.2.a: Damage on units clears at end of turn", () => {
  it("unit with 2 damage has damage cleared to 0 during ending phase", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "wounded", {
      cardType: "unit",
      meta: { damage: 2 },
      might: 5,
      owner: P1,
      zone: "base",
    });

    advancePhase(engine, "ending");

    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.wounded;
    expect(meta?.damage).toBe(0);
  });
});

describe("Rule 599.1.a.2: Stun clears at ending step", () => {
  it("a stunned unit is un-stunned after ending phase runs", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "shocked", {
      cardType: "unit",
      meta: { stunned: true },
      might: 2,
      owner: P1,
      zone: "base",
    });

    advancePhase(engine, "ending");

    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { stunned: boolean }> };
      }
    ).internalState.cardMetas.shocked;
    expect(meta?.stunned).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Battlefields (rules 165-168)
// -----------------------------------------------------------------------------

describe("Rule 165: Number of Battlefields is determined by Mode of Play", () => {
  it("a 1v1 game can set up with multiple battlefields", () => {
    const engine = createMinimalGameState({ battlefields: ["bf-a", "bf-b", "bf-c"] });
    const state = getState(engine);
    expect(Object.keys(state.battlefields)).toEqual(["bf-a", "bf-b", "bf-c"]);
  });
});

describe("Battlefield state invariants", () => {
  it("battlefields start uncontrolled and non-contested when controller=null", () => {
    const engine = createMinimalGameState();
    createBattlefield(engine, "bf-1", { controller: null });
    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBeNull();
    expect(state.battlefields["bf-1"].contested).toBe(false);
  });

  it("battlefields can be explicitly controlled by a player", () => {
    const engine = createMinimalGameState();
    createBattlefield(engine, "bf-1", { controller: P1 });
    expect(getState(engine).battlefields["bf-1"].controller).toBe(P1);
  });
});

// -----------------------------------------------------------------------------
// Per-turn tracking state
// -----------------------------------------------------------------------------

describe("Per-turn tracking: scoredThisTurn and conqueredThisTurn are initialized", () => {
  it("both players have empty scored/conquered lists at game start", () => {
    const engine = createMinimalGameState();
    const state = getState(engine);
    expect(state.scoredThisTurn[P1]).toEqual([]);
    expect(state.scoredThisTurn[P2]).toEqual([]);
    expect(state.conqueredThisTurn[P1]).toEqual([]);
    expect(state.conqueredThisTurn[P2]).toEqual([]);
  });
});

describe("Victory points start at 0 and are tracked per player", () => {
  it("both players start with 0 victory points", () => {
    const engine = createMinimalGameState();
    const state = getState(engine);
    expect(state.players[P1].victoryPoints).toBe(0);
    expect(state.players[P2].victoryPoints).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Deferred (Wave 2+): deck construction, tokens, domain identity
// -----------------------------------------------------------------------------

describe("Deferred fundamentals (Wave 2+)", () => {
  it.todo("Rule 103.1.b: Champion Legend dictates the Domain Identity of the Main Deck");
  it.todo("Rule 103.2.b: Main Deck may include up to 3 copies of a named card");
  it.todo("Rule 103.2.d: Main Deck may contain up to 3 Signature cards for its champion");
  it.todo("Rule 103.3.b: Rune Deck must be shuffled and kept separate from Main Deck");
  it.todo("Rule 109: Temporary Modifications expire when a game object changes zones");
  it.todo("Rule 170-178: Token semantics (owner, controller, leaving the board)");
  it.todo("Rule 180-183: Control vs owner for Game Objects");
  it.todo("Rule 002: Card text supersedes rules text when they conflict");
  it.todo("Rule 106.4.b: Each facedown zone has max occupancy of 1 card");
  it.todo("Rule 106.4.d: Hidden card is revealed when its controller loses the battlefield");
});
