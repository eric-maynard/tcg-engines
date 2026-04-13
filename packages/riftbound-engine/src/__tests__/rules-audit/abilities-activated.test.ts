/**
 * Rules Audit: Activated Abilities (rules 577-581)
 *
 * Rule 577: Activated abilities are repeatable effects with a cost that are
 * placed on the chain when activated. They're recognizable by the `cost:
 * effect` format ("[Exhaust]: Draw a card").
 *
 * Rule 578: The controlling player chooses when/whether to activate.
 * Rule 579: Activated abilities live on Game Objects (and some spells).
 * Rule 580: Can primarily be activated while on the Board.
 * Rule 581: Can only be activated on the controller's turn during an Open
 *           State — UNLESS the ability has the Reaction timing keyword.
 *
 * These tests validate the engine's `activateAbility` move honors the rules
 * for:
 *   - Cost payment validation (rule 577.2 — cost precedes effect)
 *   - Timing restrictions (rule 581 — Action vs Reaction)
 *   - Activation from different zones (base, battlefield, legendZone,
 *     championZone)
 *   - Re-activation gating by exhaust cost
 *
 * Wave 3E — engine-gap-aware: some tests mark behavior unresolved via
 * `it.todo` when the rule is ambiguous (e.g., championZone activation).
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
  getChainItems,
} from "./helpers";

/**
 * Read the `exhausted` flag for a card. The engine's `counters.setFlag`
 * writes to `cardMetas.__flags.exhausted`, not `cardMetas.exhausted`, so we
 * reach into the internal state directly.
 */
function isExhausted(engine: ReturnType<typeof createMinimalGameState>, cardId: string): boolean {
  const meta = (
    engine as unknown as {
      internalState: {
        cardMetas: Record<string, { __flags?: Record<string, boolean>; exhausted?: boolean }>;
      };
    }
  ).internalState.cardMetas[cardId];
  return meta?.__flags?.exhausted === true || meta?.exhausted === true;
}

// ---------------------------------------------------------------------------
// Rule 577: Activated abilities go on the chain and resolve
// ---------------------------------------------------------------------------

describe("Rule 577: Activating an ability places a chain item", () => {
  it("a 1-energy activated ability adds an 'ability' chain item on successful activation", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "wizard", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const r = applyMove(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "wizard",
      playerId: P1,
    });
    expect(r.success).toBe(true);

    const items = getChainItems(engine);
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("ability");
    expect(items[0]?.cardId).toBe("wizard");
  });
});

// ---------------------------------------------------------------------------
// Rule 577.2: Cost precedes effect; cost must be paid before resolution
// ---------------------------------------------------------------------------

describe("Rule 577.2: Activated abilities require paying a cost", () => {
  it("activating a 1-energy ability deducts 1 energy from the player's rune pool", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    createCard(engine, "wizard", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    applyMove(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "wizard",
      playerId: P1,
    });
    // 3 - 1 = 2
    expect(engine.getState().runePools[P1].energy).toBe(2);
  });

  it("activating an [Exhaust] cost ability flips the source card's exhausted flag", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "tapper", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const r = applyMove(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "tapper",
      playerId: P1,
    });
    expect(r.success).toBe(true);
    expect(isExhausted(engine, "tapper")).toBe(true);
  });

  it("cannot activate if the player can't pay the cost (insufficient energy)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "expensive", {
      abilities: [
        {
          cost: { energy: 3 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "expensive",
      playerId: P1,
    });
    expect(legal).toBe(false);
  });

  it("cannot activate a power-cost ability if player lacks the right power domain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 5, power: { calm: 0, fury: 0 } } },
    });
    createCard(engine, "mage", {
      abilities: [
        {
          cost: { energy: 0, power: ["fury"] },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "mage",
      playerId: P1,
    });
    expect(legal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 578 / 579: The controller chooses; abilities live on Game Objects
// ---------------------------------------------------------------------------

describe("Rule 578: The controlling player chooses whether to activate", () => {
  it("an opponent cannot activate a unit's ability (owner !== playerId fails)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: {
        [P1]: { energy: 1, power: {} },
        [P2]: { energy: 1, power: {} },
      },
    });
    createCard(engine, "p1-unit", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "p1-unit",
      playerId: P2,
    });
    expect(legal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 580: Activated abilities can "primarily be activated while on the Board"
// Tests: which zones count as "the board"?
// ---------------------------------------------------------------------------

describe("Rule 580: Activated abilities are primarily activated while on the board", () => {
  it("a unit in BASE can have its ability activated", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "baseunit", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "baseunit",
      playerId: P1,
    });
    expect(legal).toBe(true);
  });

  it("a unit in a battlefield zone can have its ability activated", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "front-line", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "front-line",
      playerId: P1,
    });
    expect(legal).toBe(true);
  });

  it("a card in HAND cannot have an activated ability used from hand (not on the board)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "hand-card", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "hand",
    });
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "hand-card",
      playerId: P1,
    });
    expect(legal).toBe(false);
  });

  it("a legend in legendZone CAN have its activated ability used (Wave 2 fix regression)", () => {
    // Wave 2 noted that legend activated abilities must be enumerable from
    // LegendZone — e.g., Daughter of the Void's rainbow add-power ability.
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "dotv", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { power: ["rainbow"], type: "add-resource" },
          type: "activated",
        },
      ],
      cardType: "legend",
      name: "Daughter of the Void",
      owner: P1,
      zone: "legendZone",
    });

    // Condition-level check.
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "dotv",
      playerId: P1,
    });
    expect(legal).toBe(true);

    // Enumerator-level check: the move should also show up in
    // EnumerateMoves so the UI offers it.
    const legalMoves = enumerateLegalMoves(engine, P1);
    const activate = legalMoves.filter(
      (m) => m.moveId === "activateAbility" && m.params?.cardId === "dotv",
    );
    expect(activate.length).toBeGreaterThan(0);
  });

  // Deferred: rule 580 championZone activation is ambiguous per rules primer
  it.todo(
    "Rule 580: championZone activation is ambiguous — needs human rules review",
  );
});

// ---------------------------------------------------------------------------
// Rule 581: Activated abilities — timing (controller's turn + Open State,
// Unless Reaction)
// ---------------------------------------------------------------------------

describe("Rule 581: Timing restrictions on activated abilities", () => {
  it("an Action-timed ability can be activated during the controller's main phase (Open State)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "actor", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "actor",
      playerId: P1,
    });
    expect(legal).toBe(true);
  });

  it("a Reaction-timed ability can be activated during a chain (Closed State)", () => {
    // Setup: player-1 plays an Action spell first to open the chain.
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "trigger", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "reactor", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          timing: "reaction",
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    // Open the chain with a spell.
    const played = applyMove(engine, "playSpell", {
      cardId: "trigger",
      playerId: P1,
    });
    expect(played.success).toBe(true);

    // Now the Reaction-timed ability should be legal (chain is in Closed State).
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "reactor",
      playerId: P1,
    });
    expect(legal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exhaust-based re-activation gating (rule 577.1 — cost validation)
// ---------------------------------------------------------------------------

describe("Rule 577: Re-activation requires cost to be payable again", () => {
  it("after activating an [Exhaust] ability, the source card is exhausted", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "tapper", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const r1 = applyMove(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "tapper",
      playerId: P1,
    });
    expect(r1.success).toBe(true);
    expect(isExhausted(engine, "tapper")).toBe(true);
  });

  it(
    "Rule 577.2: activateAbility.condition rejects an [Exhaust] activation " +
      "if the source card is already exhausted — the cost must be payable " +
      "at activation time, and exhausting an already-exhausted card is " +
      "not a valid cost payment.",
    () => {
      const engine = createMinimalGameState({
        phase: "main",
        runePools: { [P1]: { energy: 0, power: {} } },
      });
      createCard(engine, "tapper", {
        abilities: [
          {
            cost: { exhaust: true },
            effect: { amount: 1, type: "draw" },
            type: "activated",
          },
        ],
        cardType: "unit",
        meta: { exhausted: true },
        might: 2,
        owner: P1,
        zone: "base",
      });

      // Condition layer must reject: the card is already exhausted, so
      // The [Exhaust] cost cannot be paid.
      const legal = checkMoveLegal(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "tapper",
        playerId: P1,
      });
      expect(legal).toBe(false);

      // Actually trying the move must also fail.
      const r = applyMove(engine, "activateAbility", {
        abilityIndex: 0,
        cardId: "tapper",
        playerId: P1,
      });
      expect(r.success).toBe(false);

      // And the enumerator must not offer this activation as a legal option.
      const legalMoves = enumerateLegalMoves(engine, P1);
      const found = legalMoves.filter(
        (m) => m.moveId === "activateAbility" && m.params?.cardId === "tapper",
      );
      expect(found.length).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Enumerator: activateAbility should SHOW UP as an available move
// ---------------------------------------------------------------------------

describe("activateAbility enumerator: legal options are discoverable", () => {
  it("enumerates the activateAbility move for a ready unit with a payable ability", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "wizard", {
      abilities: [
        {
          cost: { energy: 1 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    const legalMoves = enumerateLegalMoves(engine, P1);
    const found = legalMoves.filter(
      (m) => m.moveId === "activateAbility" && m.params?.cardId === "wizard",
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("does NOT enumerate activateAbility for a unit whose cost cannot be paid", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "expensive", {
      abilities: [
        {
          cost: { energy: 5 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    const legalMoves = enumerateLegalMoves(engine, P1);
    const found = legalMoves.filter(
      (m) => m.moveId === "activateAbility" && m.params?.cardId === "expensive",
    );
    expect(found.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ChampionZone: unsettled rule — mark with it.todo so reviewers can decide
// ---------------------------------------------------------------------------

describe("championZone activation (unresolved)", () => {
  it("engine currently permits activating abilities on championZone cards — document this", () => {
    // Per rule 101 / primer, a champion in championZone is NOT on the board
    // Until the champion is "played" into championZone proper. The engine's
    // `activateAbility.condition` accepts championZone as a legal source zone.
    // This test documents the current behavior. Whether it's correct depends
    // On human rules review.
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "champ", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "championZone",
    });
    const legal = checkMoveLegal(engine, "activateAbility", {
      abilityIndex: 0,
      cardId: "champ",
      playerId: P1,
    });
    // Current engine behavior: championZone is accepted.
    expect(legal).toBe(true);
  });

  // Deferred: same championZone ambiguity — needs human rules review
  it.todo(
    "Rule 580 / 101: championZone activation legality — engine accepts it; needs human review",
  );
});
