/**
 * Rules Audit: Playing Cards (rules 554-565)
 *
 * Covers the "play a card" sequence:
 *
 *   555 — overview (play sequence)
 *   558 — remove card from source zone, add to chain (state becomes Closed)
 *   559 — choose targets / locations at announcement (NOT resolution)
 *   560 — additional costs / discounts
 *   561 — pay combined Energy + Power cost (plus non-standard costs)
 *   562 — final legality check (targets still legal, state legal)
 *   563 — proceed with play:
 *             permanents leave the chain and become Game Objects
 *             spells linger on the chain for response
 *   565 — spell is controlled by the player who played it
 *
 * Design notes
 * ------------
 * The helpers in `./helpers.ts` let us bypass setup and seed exactly the state
 * a specific rule needs. We drive everything through the real `playSpell`,
 * `playUnit`, and `playGear` moves so the engine's own validation path fires.
 *
 * These tests do NOT cover X-cost integer choice semantics (the engine uses
 * `xAmount` as a free parameter; there is no in-engine "Bullet Time" prompt
 * to verify). We test the cost-deduction half of X-cost, which is the part
 * the engine actually implements.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  drainChain,
  enumerateLegalMoves,
  getCardMeta,
  getCardZone,
  getCardsInZone,
  getChainItems,
  getState,
  isChainActive,
} from "./helpers";

// ---------------------------------------------------------------------------
// Rule 555: Playing a card is the act of a player utilizing their cards.
// Rule 555.1: A card is Played when it has finished this process in its entirety.
// ---------------------------------------------------------------------------

describe("Rule 555: Play sequence overview", () => {
  it("a unit that completes the play process is in its destination zone (base)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "grunt")).toBe("base");
  });

  it("a spell that completes the play process is on the chain, not still in hand", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "burn", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playSpell", {
      cardId: "burn",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardsInZone(engine, "hand", P1)).not.toContain("burn");
    const items = getChainItems(engine);
    expect(items.map((i) => i.cardId)).toContain("burn");
  });
});

// ---------------------------------------------------------------------------
// Rule 355.2.a: Valid locations include the controller's Base or a
// Battlefield the controller controls.
// ---------------------------------------------------------------------------

describe("Rule 355.2.a: a unit may be played to a battlefield its controller controls", () => {
  it("non-Ambush unit can be played to a controlled battlefield and is enumerated there", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });

    const offered = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playUnit" && m.params?.cardId === "grunt",
    );
    expect(offered.map((m) => m.params?.location)).toContain("battlefield-bf-1");

    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "grunt")).toBe("battlefield-bf-1");
  });

  it("non-Ambush unit cannot be played to a battlefield the opponent controls", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P2 });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    expect(getCardZone(engine, "grunt")).toBe("hand");
  });
});

// ---------------------------------------------------------------------------
// rule-id: ogn-193-298 (Miss Fortune, Buccaneer) — "Friendly units may be
// played to open battlefields": a board unit's static grant extends the
// open-battlefield play location to every unit its controller plays.
// ---------------------------------------------------------------------------

describe("ogn-193-298: friendly board unit grants 'may be played to open battlefields'", () => {
  const grant = [
    {
      effect: {
        allowedLocation: "an open battlefield",
        appliesTo: "friendly-units",
        type: "play-restriction",
      },
      type: "static",
    },
  ] as unknown as Parameters<typeof createCard>[2]["abilities"];

  it("plain unit is offered and allowed at an open battlefield while the granter is on board", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "miss-fortune", {
      abilities: grant,
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });

    const offered = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playUnit" && m.params?.cardId === "grunt",
    );
    expect(offered.map((m) => m.params?.location)).toContain("battlefield-bf-1");

    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "grunt")).toBe("battlefield-bf-1");
  });

  it("without the granter on board, a plain unit cannot be played to an open battlefield", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });
    const offered = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playUnit" && m.params?.cardId === "grunt",
    );
    expect(offered.map((m) => m.params?.location)).not.toContain("battlefield-bf-1");
    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "battlefield-bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rule-id: sfd-015-221 (Perched Grimwyrm) — "Play me only to a battlefield
// you conquered this turn."
// ---------------------------------------------------------------------------

describe("sfd-015-221: play only to a battlefield conquered this turn", () => {
  const restriction = [
    {
      effect: { keyword: "PlayOnlyToConqueredBattlefield", target: "self", type: "grant-keyword" },
      type: "static",
    },
  ] as unknown as Parameters<typeof createCard>[2]["abilities"];

  function setup() {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 4, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", {
      contested: true,
      contestedBy: P1,
      controller: null,
      showdownComplete: true,
    });
    createCard(engine, "atk", { cardType: "unit", might: 5, owner: P1, zone: "battlefield-bf-2" });
    createCard(engine, "def", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-2" });
    createCard(engine, "grimwyrm", {
      abilities: restriction,
      cardType: "unit",
      energyCost: 4,
      might: 5,
      owner: P1,
      zone: "hand",
    });
    return engine;
  }

  it("with no conquest this turn, it is not offered anywhere and base is rejected", () => {
    const engine = setup();
    const offered = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playUnit" && m.params?.cardId === "grimwyrm",
    );
    expect(offered).toEqual([]);
    expect(
      applyMove(engine, "playUnit", { cardId: "grimwyrm", location: "base", playerId: P1 }).success,
    ).toBe(false);
    expect(
      applyMove(engine, "playUnit", {
        cardId: "grimwyrm",
        location: "battlefield-bf-1",
        playerId: P1,
      }).success,
    ).toBe(false);
  });

  it("after conquering bf-2, it is offered only there and plays there", () => {
    const engine = setup();
    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-2" });
    expect(getState(engine).conqueredThisTurn[P1]).toContain("bf-2");

    const offered = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playUnit" && m.params?.cardId === "grimwyrm",
    );
    expect(offered.map((m) => m.params?.location)).toEqual(["battlefield-bf-2"]);

    expect(
      applyMove(engine, "playUnit", { cardId: "grimwyrm", location: "base", playerId: P1 }).success,
    ).toBe(false);
    const result = applyMove(engine, "playUnit", {
      cardId: "grimwyrm",
      location: "battlefield-bf-2",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "grimwyrm")).toBe("battlefield-bf-2");
  });
});

// ---------------------------------------------------------------------------
// Rule 556: Cards have different behaviors when played.
// Rule 556.1: Permanents become Game Objects when played.
// Rule 556.2: Spells create game effects that are executed, then card is
//             Placed in the trash when played.
// ---------------------------------------------------------------------------

describe("Rule 556.1: Permanents become game objects when played", () => {
  it("a played unit becomes a Game Object on the board (zone = base)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "unit", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playUnit", { cardId: "unit", location: "base", playerId: P1 });
    expect(getCardZone(engine, "unit")).toBe("base");
  });

  it("a played gear becomes a Game Object at the player's base", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "sword", {
      cardType: "gear",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playGear", { cardId: "sword", playerId: P1 });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "sword")).toBe("base");
  });
});

describe("Rule 556.2: Spells create game effects and are trashed on resolution", () => {
  // NOTE: Our helper `playSpell` reducer currently moves the spell card to
  // `trash` at the moment of play (the engine models resolution lazily on
  // The chain). We assert the observable: after play, the card is no longer
  // In hand and the chain holds the spell effect.
  it("spell card leaves hand and chain holds the spell entry", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "spark", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "spark", playerId: P1 });
    expect(getCardsInZone(engine, "hand", P1)).not.toContain("spark");
    expect(getChainItems(engine)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 558: Remove the card from the zone you are playing it from and put
//           It onto the Chain.
// Rule 558.1: This Closes the State.
// ---------------------------------------------------------------------------

describe("Rule 558: Spell moves to the chain and the state closes", () => {
  it("before play: chain is not active (Open state)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    expect(isChainActive(engine)).toBe(false);
  });

  it("playing a spell removes it from hand and adds it to the chain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "bolt", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "bolt", playerId: P1 });

    // Removed from hand
    expect(getCardsInZone(engine, "hand", P1)).not.toContain("bolt");
    // On the chain
    const items = getChainItems(engine);
    expect(items).toHaveLength(1);
    expect(items[0]?.cardId).toBe("bolt");
  });

  it("Rule 558.1: after a spell is played the turn state is Closed", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "zap", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "zap", playerId: P1 });
    expect(isChainActive(engine)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 559: Target selection and choices are made at announcement.
// Rule 559.3: If a card requires choosing specific Game Objects, that choice
//             Is made now (not at resolution).
// Rule 559.3.c.1-2: Those choices are "Targets". If a spell's required targets
//             All become illegal by resolution, the spell still resolves, the
//             Instruction is ignored.
// Rule 559.4: Choices cannot be changed after this step.
// Rule 559.5: A player may not make choices that will deterministically lead
//             To illegal later choices.
// ---------------------------------------------------------------------------

describe("Rule 559.3: A unit-targeting spell with no legal targets cannot be played", () => {
  // This is the "En Garde bug" scenario called out in the wave 4 brief:
  // Playing a unit-targeting spell when there are no real units on the board
  // Must fail at announcement per rule 559.3 (can't choose an illegal target).
  it("playSpell fails when no friendly unit exists to target", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    // No units on the board at all.
    createCard(engine, "en-garde", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "friendly", type: "unit" },
            type: "buff",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playSpell", {
      cardId: "en-garde",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    // Card stays in hand
    expect(getCardsInZone(engine, "hand", P1)).toContain("en-garde");
    // No chain was created
    expect(isChainActive(engine)).toBe(false);
  });

  it("playSpell succeeds for the same spell once a friendly unit is on the board", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "friendly-grunt", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "en-garde", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "friendly", type: "unit" },
            type: "buff",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playSpell", {
      cardId: "en-garde",
      playerId: P1,
    });
    expect(result.success).toBe(true);
  });

  it("a spell that targets an enemy unit fails when only a friendly unit exists", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "friendly-only", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "snipe", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", type: "unit" },
            type: "damage",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playSpell", {
      cardId: "snipe",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });
});

// rule-id: sfd-080-221 (Bellows Breath) — Rule 355.13: "up to N" lets the
// caster choose zero targets, and any subset up to N at the same location.
describe("Rule 355.13: 'up to N units' enumerates 0..N target subsets", () => {
  const bellows = {
    abilities: [
      {
        effect: {
          amount: 1,
          target: { location: "here", quantity: { upTo: 3 }, type: "unit" },
          type: "damage",
        },
        type: "spell",
      },
    ],
    cardType: "spell" as const,
    energyCost: 1,
    owner: P1,
    zone: "hand" as const,
  };

  it("offers a zero-target play alongside the single own-unit target", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "recruit", { cardType: "unit", might: 1, owner: P1, zone: "base" });
    createCard(engine, "bellows", bellows);

    const targetSets = enumerateLegalMoves(engine, P1)
      .filter((m) => m.moveId === "playSpell" && m.params?.cardId === "bellows")
      .map((m) => m.params?.targets);
    expect(targetSets).toContainEqual([]);
    expect(targetSets).toContainEqual(["recruit"]);

    // Zero-target play resolves without touching the caster's own unit.
    const result = applyMove(engine, "playSpell", { cardId: "bellows", playerId: P1, targets: [] });
    expect(result.success).toBe(true);
    drainChain(engine);
    expect(getCardMeta(engine, "recruit")?.damage ?? 0).toBe(0);
    expect(getCardZone(engine, "recruit")).toBe("base");
  });

  it("enumerates multi-target subsets only among units sharing a location", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "a", { cardType: "unit", might: 2, owner: P2, zone: "base" });
    createCard(engine, "b", { cardType: "unit", might: 2, owner: P2, zone: "base" });
    createCard(engine, "c", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "bellows", bellows);

    const targetSets = enumerateLegalMoves(engine, P1)
      .filter((m) => m.moveId === "playSpell" && m.params?.cardId === "bellows")
      .map((m) => ((m.params?.targets as string[] | undefined) ?? []).slice().sort().join(","));
    expect(targetSets).toContain("");
    expect(targetSets).toContain("a,b");
    expect(targetSets).not.toContain("a,c");
    expect(targetSets).not.toContain("a,b,c");
  });
});

// rule-id: ogn-256-298 (Fox-Fire) — "Kill any number of units at a battlefield
// with total Might 4 or less": the SUMMED Might of the chosen set is capped and
// all picks share one battlefield.
describe("ogn-256-298: 'any number of units ... with total Might N or less'", () => {
  const foxFire = {
    abilities: [
      {
        effect: {
          target: { location: "battlefield", quantity: "any", totalMight: { lte: 4 }, type: "unit" },
          type: "kill",
        },
        type: "spell",
      },
    ],
    cardType: "spell" as const,
    energyCost: 1,
    owner: P1,
    zone: "hand" as const,
  };

  it("enumerates only same-battlefield subsets whose total Might is ≤ 4 and rejects over-cap targets", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P2 });
    createCard(engine, "a", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "b", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "c", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "d", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-2" });
    createCard(engine, "big", { cardType: "unit", might: 5, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "foxfire", foxFire);

    const targetSets = enumerateLegalMoves(engine, P1)
      .filter((m) => m.moveId === "playSpell" && m.params?.cardId === "foxfire")
      .map((m) => ((m.params?.targets as string[] | undefined) ?? []).slice().sort().join(","));
    expect(targetSets).toContain("");
    expect(targetSets).toContain("a,b");
    expect(targetSets).toContain("b,c");
    expect(targetSets).not.toContain("a,b,c");
    expect(targetSets).not.toContain("a,d");
    expect(targetSets.some((s) => s.includes("big"))).toBe(false);

    const over = applyMove(engine, "playSpell", {
      cardId: "foxfire",
      playerId: P1,
      targets: ["a", "b", "c"],
    });
    expect(over.success).toBe(false);

    const ok = applyMove(engine, "playSpell", { cardId: "foxfire", playerId: P1, targets: ["a", "b"] });
    expect(ok.success).toBe(true);
    drainChain(engine);
    expect(getCardZone(engine, "a")).toBe("trash");
    expect(getCardZone(engine, "b")).toBe("trash");
    expect(getCardZone(engine, "c")).toBe("battlefield-bf-1");
  });

  // Unbound path (from Hidden / no play-time targets): resolution prompts a
  // multi-pick choose-target — zero is legal, picks accumulate, options are
  // pruned to one battlefield and the running total-Might cap.
  it("resolving with no bound targets prompts an any-number choose-target honouring the cap", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P2 });
    createCard(engine, "a", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "b", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "c", { cardType: "unit", might: 3, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "d", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-2" });
    createCard(engine, "big", { cardType: "unit", might: 5, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "foxfire", foxFire);

    const played = applyMove(engine, "playSpell", { cardId: "foxfire", playerId: P1 });
    expect(played.success).toBe(true);
    drainChain(engine);

    let pc = getState(engine).pendingChoice as
      | { type: string; anyNumber?: boolean; options: string[]; picked?: string[] }
      | undefined;
    expect(pc?.type).toBe("choose-target");
    expect(pc?.anyNumber).toBe(true);
    expect([...(pc?.options ?? [])].sort()).toEqual(["a", "b", "c", "d"]);
    // Declining immediately (zero targets) must be offered.
    expect(
      enumerateLegalMoves(engine, P1).some(
        (m) => m.moveId === "resolvePendingChoice" && m.params?.accept === false,
      ),
    ).toBe(true);

    expect(applyMove(engine, "resolvePendingChoice", { pickedCardId: "a", playerId: P1 }).success).toBe(true);
    pc = getState(engine).pendingChoice as typeof pc;
    // "d" (other battlefield) and "c" (2+3 > 4) drop out; "b" (2+2) remains.
    expect(pc?.options).toEqual(["b"]);
    expect(pc?.picked).toEqual(["a"]);

    expect(applyMove(engine, "resolvePendingChoice", { pickedCardId: "b", playerId: P1 }).success).toBe(true);
    // Cap reached — no legal additions remain, so the effect resolves.
    expect(getState(engine).pendingChoice).toBeUndefined();
    expect(getCardZone(engine, "a")).toBe("trash");
    expect(getCardZone(engine, "b")).toBe("trash");
    expect(getCardZone(engine, "c")).toBe("battlefield-bf-1");
    expect(getCardZone(engine, "d")).toBe("battlefield-bf-2");
  });

  it("any-number choose-target can be declined after a partial pick", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "a", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "b", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "foxfire", foxFire);

    expect(applyMove(engine, "playSpell", { cardId: "foxfire", playerId: P1 }).success).toBe(true);
    drainChain(engine);
    expect(applyMove(engine, "resolvePendingChoice", { pickedCardId: "a", playerId: P1 }).success).toBe(true);
    expect(getState(engine).pendingChoice).toBeDefined();
    expect(applyMove(engine, "resolvePendingChoice", { accept: false, playerId: P1 }).success).toBe(true);
    expect(getState(engine).pendingChoice).toBeUndefined();
    expect(getCardZone(engine, "a")).toBe("trash");
    expect(getCardZone(engine, "b")).toBe("battlefield-bf-1");
  });
});

describe("Rule 559.3: A self-target spell needs no external target", () => {
  it("playSpell succeeds for a self-target spell with an empty board", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "ritual", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "ritual",
      playerId: P1,
    });
    expect(result.success).toBe(true);
  });
});

describe("Rule 559.2: Unit play requires choosing a Location the player controls", () => {
  it("a unit can be played to the base zone", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "soldier", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "soldier",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "soldier")).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// Rule 560.5: Energy and Power costs can't be reduced below 0 — tested via
// The cost path in 561. Rule 560.1 (ignoring cost) and 560.4 (discounts) are
// Not exposed as a standalone API, so we don't test them directly here.
// ---------------------------------------------------------------------------

describe("Rule 560.5: Costs cannot be reduced below 0", () => {
  it("a cost-0 spell is affordable with an empty rune pool", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: {} } },
    });
    createCard(engine, "freebie", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 0,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "freebie",
      playerId: P1,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 561: Pay costs
// Rule 561.1: Combined Energy + Power cost paid in total.
// ---------------------------------------------------------------------------

describe("Rule 561.1: Paying the combined Energy and Power cost", () => {
  it("deducts the energy cost from the player's rune pool", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    createCard(engine, "two-cost", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playUnit", {
      cardId: "two-cost",
      location: "base",
      playerId: P1,
    });
    expect(getState(engine).runePools[P1].energy).toBe(1);
  });

  it("deducts power costs from the player's rune pool", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: { fury: 2 } } },
    });
    createCard(engine, "fury-bolt", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      powerCost: ["fury"],
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", { cardId: "fury-bolt", playerId: P1 });
    expect(result.success).toBe(true);
    expect(getState(engine).runePools[P1].power.fury ?? 0).toBe(1);
  });

  it("play fails when the player lacks enough energy", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "expensive", {
      cardType: "unit",
      energyCost: 5,
      might: 5,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "expensive",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    expect(getCardZone(engine, "expensive")).toBe("hand");
  });

  it("play fails when the player lacks the required power domain", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { calm: 2 } } }, // Plenty of calm, no fury
    });
    createCard(engine, "fury-bolt", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      powerCost: ["fury"],
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "fury-bolt",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });
});

describe("Rule 561.1.a (X cost): xAmount consumes additional energy", () => {
  it("a spell played with xAmount=2 consumes base cost + 2 extra energy", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 5, power: {} } },
    });
    createCard(engine, "bullet-time", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1, // Base X-cost spell
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "bullet-time",
      playerId: P1,
      xAmount: 2,
    });
    expect(result.success).toBe(true);
    // 5 - (1 base + 2 X) = 2
    expect(getState(engine).runePools[P1].energy).toBe(2);
  });

  it("X cost cannot be paid if energy is insufficient after adding xAmount", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "big-x", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "big-x",
      playerId: P1,
      xAmount: 5, // Needs 1 + 5 = 6 energy, only 2 available
    });
    expect(result.success).toBe(false);
  });

  it("X=0 behaves as base cost only", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "zero-x", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "zero-x",
      playerId: P1,
      xAmount: 0,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).runePools[P1].energy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 562: Legality check at the end of play sequence
// Rule 562.3: If the card would create an illegal state, play fails.
// ---------------------------------------------------------------------------

describe("Rule 562: Play fails when the card cannot be legally announced", () => {
  // Rule 103 / 555: only a card's owner may play it. `playUnit` verifies
  // That `context.cards.getCardOwner(cardId) === params.playerId`, so the
  // Active player cannot play a unit out of the opponent's hand.
  it("Rule 103: playing a unit owned by the opponent should fail", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} }, [P2]: { energy: 2, power: {} } },
    });
    createCard(engine, "p2-card", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P2,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "p2-card",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    // Card remains in hand, untouched.
    expect(getCardZone(engine, "p2-card")).toBe("hand");
  });

  it("Rule 103: playing a spell owned by the opponent should fail", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} }, [P2]: { energy: 2, power: {} } },
    });
    createCard(engine, "p2-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "p2-spell",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });

  it("Rule 103: playing gear owned by the opponent should fail", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} }, [P2]: { energy: 2, power: {} } },
    });
    createCard(engine, "p2-gear", {
      cardType: "gear",
      energyCost: 1,
      owner: P2,
      zone: "hand",
    });
    const result = applyMove(engine, "playGear", {
      cardId: "p2-gear",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });

  it("playing a card not in the hand zone fails", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "already-in-trash", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "trash",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "already-in-trash",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(false);
  });

  it("playUnit during the wrong phase fails", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "off-phase", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "off-phase",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    expect(getCardZone(engine, "off-phase")).toBe("hand");
  });
});

// ---------------------------------------------------------------------------
// Rule 563: Proceed with the card's category of Play
// Rule 563.1.c: A Unit enters the Board exhausted at the chosen Location
// Rule 563.1.d: A Gear enters the Board Ready at the player's base
// Rule 563.2: A Spell lingers on the chain
// ---------------------------------------------------------------------------

describe("Rule 563.1.c: A played unit enters the board exhausted", () => {
  it("played unit has exhausted=true set via counters.setFlag", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "summon-sickness", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playUnit", {
      cardId: "summon-sickness",
      location: "base",
      playerId: P1,
    });
    // Rule 563.1.c
    // The core engine persists boolean flags at cardMetas[id].__flags.<flag>.
    // See packages/core/src/operations/operations-impl.ts#L455.
    const internal = engine as unknown as {
      internalState: {
        cardMetas: Record<string, { __flags?: Record<string, boolean> }>;
      };
    };
    const flags = internal.internalState.cardMetas["summon-sickness"]?.__flags;
    expect(flags?.exhausted).toBe(true);
  });
});

describe("Rule 563.1.d: A played gear enters the board ready", () => {
  it("played gear does NOT get the exhausted flag set", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "axe", {
      cardType: "gear",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playGear", { cardId: "axe", playerId: P1 });
    const internal = engine as unknown as {
      internalState: {
        cardMetas: Record<string, { __flags?: Record<string, boolean> }>;
      };
    };
    // The playGear reducer never calls setFlag("exhausted", true), so the
    // Card enters Ready — we assert the exhausted flag is either missing or
    // Explicitly false (rule 563.1.d).
    const flags = internal.internalState.cardMetas.axe?.__flags;
    expect(flags?.exhausted ?? false).toBe(false);
  });
});

describe("Rule 563.2: A played spell lingers on the chain for reactions", () => {
  it("chain contains the spell as a reactable item right after play", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "linger-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", {
      cardId: "linger-spell",
      playerId: P1,
    });
    const items = getChainItems(engine);
    expect(items).toHaveLength(1);
    expect(items[0]?.cardId).toBe("linger-spell");
    expect(items[0]?.type).toBe("spell");
  });
});

// ---------------------------------------------------------------------------
// Rule 565: A spell is controlled by the player who played it.
// ---------------------------------------------------------------------------

describe("Rule 565: Controller of a played spell is the player who played it", () => {
  it("chain item's controller matches the caster", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} }, [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-spell", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "p1-spell", playerId: P1 });
    const items = getChainItems(engine);
    expect(items[0]?.controller).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// Non-active-player timing: Action spells can only be played by the active
// Player outside of a chain. Reaction spells can be played by either player
// During a Closed state but Actions cannot.
// ---------------------------------------------------------------------------

describe("Rule 530: non-active player can't play an Action spell mid-turn", () => {
  // Rule 530 (priority): In a Neutral Open state, only the active player
  // Holds priority, so they alone may play Action-timed spells. Reactions
  // Are always legal for any relevant player.
  it("Rule 530: P2 cannot play an Action spell during P1's Neutral Open main phase", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P2]: { energy: 1, power: {} } },
    });
    createCard(engine, "p2-action", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P2,
      timing: "action",
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "p2-action",
      playerId: P2,
    });
    expect(result.success).toBe(false);
    // Spell stays in hand; no chain was opened.
    expect(getCardsInZone(engine, "hand", P2)).toContain("p2-action");
    expect(isChainActive(engine)).toBe(false);
  });

  it("Rule 530: P1 (the active player) CAN play an Action spell in a Neutral Open state", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "p1-action", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      timing: "action",
      zone: "hand",
    });
    const result = applyMove(engine, "playSpell", {
      cardId: "p1-action",
      playerId: P1,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 562.2: Ensure that the outcome of the effect would not create an
// Illegal state. We exercise this by confirming that a correctly-legal play
// Produces a valid final state.
// ---------------------------------------------------------------------------

describe("Rule 562.2: A successful play leaves the game in a valid state", () => {
  it("after a successful playUnit the game status is still 'playing'", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf", { controller: null });
    createCard(engine, "squire", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    const result = applyMove(engine, "playUnit", {
      cardId: "squire",
      location: "base",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).status).toBe("playing");
  });
});
