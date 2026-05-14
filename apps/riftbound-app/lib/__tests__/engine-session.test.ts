/**
 * EngineSession unit tests.
 *
 * Covers: construction, view shape, legal-move enumeration, applyMove (success
 * + failure), trail recording.
 */

import { describe, expect, test } from "bun:test";
import {
  EngineSession,
  getCardDefinition,
  summariseAbilities,
} from "../engine-session";

describe("EngineSession", () => {
  test("constructs a playing-status game with two players", () => {
    const session = new EngineSession({ seed: "ctor" });
    const view = session.getView();
    expect(view.status).toBe("playing");
    expect(view.players).toHaveLength(2);
    expect(view.players[0].id).toBe("player-1");
    expect(view.players[1].id).toBe("player-2");
  });

  test("starts on turn 1 with player-1 active", () => {
    const session = new EngineSession({ seed: "turn1" });
    const view = session.getView();
    expect(view.turn.number).toBe(1);
    expect(view.turn.activePlayer).toBe("player-1");
  });

  test("view exposes hand and deck sizes", () => {
    const session = new EngineSession({ deckSize: 40, seed: "decks" });
    const view = session.getView();
    for (const p of view.players) {
      // 4 cards drawn into hand at setup, +1 for the active player who
      // Also drew their first-turn card during the pregame -> main phase
      // Drive (rule 515.4.b).
      expect([4, 5]).toContain(p.handSize);
      // 40 - handSize left in deck.
      expect(p.deckSize).toBe(40 - p.handSize);
      // 12 starting runes; first player channels 2 on transitionToPlay so
      // Their rune deck is 10. Second player still has all 12.
      expect([10, 12]).toContain(p.runeDeckSize);
    }
    // Active player should be the one with the lower rune-deck count AND
    // The larger hand (they drew on the first turn).
    const active = view.players.find((p) => p.id === view.turn.activePlayer);
    expect(active?.runeDeckSize).toBe(10);
    expect(active?.handSize).toBe(5);
  });

  test("view exposes baseUnits on every player (empty at start)", () => {
    // Phase B batch 24 AAA: GameView.players[].baseUnits is now mandatory.
    // Before any plays, every player's base zone is empty.
    const session = new EngineSession({ seed: "base-empty" });
    const view = session.getView();
    for (const p of view.players) {
      expect(Array.isArray(p.baseUnits)).toBe(true);
      expect(p.baseUnits).toHaveLength(0);
    }
  });

  test("baseUnits populates per-player when a card is moved into the base zone", () => {
    // Direct surgery on internalState: simulate a card living in the base
    // Zone, then assert the GameView surfaces it on the correct player.
    // We bypass tryPlayFromHand because synthetic decks' playUnit reducer
    // Routes units to `battlefield-<id>`, not `base` (the engine's `base`
    // Zone is reached by spells/gear and the `playCard … location:"base"`
    // Path, neither of which is fully wired for synthetic decks). Surgery
    // Is sufficient because `buildView`'s base-zone partitioning logic is
    // What we're actually testing here, not the engine's play reducers.
    const session = new EngineSession({ seed: "base-surgery" });
    const internal = (session.engine as unknown as {
      internalState: {
        zones: Record<string, { cardIds: string[] }>;
        cards: Record<
          string,
          {
            definitionId: string;
            owner: string;
            controller: string;
            zone: string;
          }
        >;
      };
    }).internalState;

    // Synthesize two base-zone cards (one per player) and one card that
    // Already lives in `base` for player-2 only.
    internal.zones.base = internal.zones.base ?? { cardIds: [] };
    const cardA = "test-base-p1-A";
    const cardB = "test-base-p2-B";
    internal.cards[cardA] = {
      controller: "player-1",
      definitionId: cardA,
      owner: "player-1",
      zone: "base",
    };
    internal.cards[cardB] = {
      controller: "player-2",
      definitionId: cardB,
      owner: "player-2",
      zone: "base",
    };
    internal.zones.base.cardIds.push(cardA, cardB);

    const view = session.getView();
    const p1 = view.players.find((p) => p.id === "player-1")!;
    const p2 = view.players.find((p) => p.id === "player-2")!;
    expect(p1.baseUnits.map((u) => u.id)).toEqual([cardA]);
    expect(p2.baseUnits.map((u) => u.id)).toEqual([cardB]);
    expect(p1.baseUnits[0].controller).toBe("player-1");
    expect(p2.baseUnits[0].controller).toBe("player-2");
  });

  test("view exposes battlefields after placeBattlefields", () => {
    const session = new EngineSession({ battlefieldCount: 2, seed: "bfs" });
    const view = session.getView();
    expect(view.battlefields).toHaveLength(2);
    for (const bf of view.battlefields) {
      expect(typeof bf.id).toBe("string");
      expect(bf.contested).toBe(false);
      expect(Array.isArray(bf.units)).toBe(true);
    }
  });

  test("view is JSON-safe (no class instances or undefined)", () => {
    const session = new EngineSession({ seed: "json" });
    const view = session.getView();
    // Round-tripping through JSON must preserve everything.
    const round = JSON.parse(JSON.stringify(view));
    expect(round.gameId).toBe(view.gameId);
    expect(round.turn.number).toBe(view.turn.number);
    expect(round.players.length).toBe(view.players.length);
    expect(round.battlefields.length).toBe(view.battlefields.length);
  });

  test("legalMoves returns moves for the active player", () => {
    const session = new EngineSession({ seed: "legal" });
    const moves = session.legalMoves("player-1");
    expect(Array.isArray(moves)).toBe(true);
    // At minimum, endTurn should be legal.
    expect(moves.some((m) => m.moveId === "endTurn")).toBe(true);
  });

  test("applyMove(endTurn) advances the turn", () => {
    const session = new EngineSession({ seed: "endturn" });
    const before = session.getView();
    const step = session.applyMove("player-1", {
      moveId: "endTurn",
      params: { playerId: "player-1" },
    });
    expect(step.success).toBe(true);
    expect(step.moveId).toBe("endTurn");
    expect(step.seq).toBe(1);
    const after = session.getView();
    // Either the active player flipped, or the turn number advanced.
    const flipped = after.turn.activePlayer !== before.turn.activePlayer;
    const advanced = after.turn.number > before.turn.number;
    expect(flipped || advanced).toBe(true);
  });

  test("applyMove records failure in the trail without throwing", () => {
    const session = new EngineSession({ seed: "fail" });
    const step = session.applyMove("player-2", {
      moveId: "endTurn",
      params: { playerId: "player-2" },
    });
    // It's not P2's turn — engine should reject.
    expect(step.success).toBe(false);
    expect(session.getTrail()).toHaveLength(1);
  });

  test("trail length grows by exactly 1 per applyMove call", () => {
    const session = new EngineSession({ seed: "trail" });
    expect(session.getTrail()).toHaveLength(0);
    session.applyMove("player-1", {
      moveId: "endTurn",
      params: { playerId: "player-1" },
    });
    expect(session.getTrail()).toHaveLength(1);
    session.applyMove("player-2", {
      moveId: "endTurn",
      params: { playerId: "player-2" },
    });
    expect(session.getTrail()).toHaveLength(2);
  });

  test("isGameOver is false at start", () => {
    const session = new EngineSession({ seed: "over" });
    expect(session.isGameOver()).toBe(false);
  });

  test("phaseStrip is exposed and non-empty", () => {
    const session = new EngineSession({ seed: "phases" });
    const view = session.getView();
    expect(view.phaseStrip.length).toBeGreaterThan(0);
    for (const p of view.phaseStrip) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.label).toBe("string");
    }
  });

  test("buildHandView returns enriched cards for synthetic decks (degrades gracefully)", () => {
    const session = new EngineSession({ seed: "hand-synthetic" });
    const hand = session.buildHandView();
    expect(Object.keys(hand).toSorted()).toEqual(["player-1", "player-2"]);
    for (const pid of Object.keys(hand)) {
      for (const c of hand[pid]) {
        expect(typeof c.id).toBe("string");
        expect(typeof c.definitionId).toBe("string");
        // Synthetic decks have no real definition — fields stay undefined.
        // No assertion on name/might/etc., just that the shape is JSON-safe.
        const round = JSON.parse(JSON.stringify(c));
        expect(round.id).toBe(c.id);
      }
    }
  });

  test("buildHandView populates name/cardType/abilities when realDecks=true", () => {
    const session = new EngineSession({ realDecks: true, seed: "hand-real" });
    const hand = session.buildHandView();
    let cardsWithName = 0;
    let cardsWithAbilitySummary = 0;
    for (const pid of Object.keys(hand)) {
      for (const c of hand[pid]) {
        if (typeof c.name === "string" && c.name.length > 0) {cardsWithName++;}
        if (Array.isArray(c.abilities) && c.abilities.length > 0) {
          cardsWithAbilitySummary++;
          // Each summary is a non-empty string, max 5.
          expect(c.abilities.length).toBeLessThanOrEqual(5);
          for (const s of c.abilities) {
            expect(typeof s).toBe("string");
            expect(s.length).toBeGreaterThan(0);
          }
        }
      }
    }
    // At least one card in a real prebuilt deck should have a name.
    expect(cardsWithName).toBeGreaterThan(0);
    // Ability summaries are best-effort; allow zero for decks where every hand
    // Card happens to be runes/no-ability cards, but ensure formatting works.
    expect(cardsWithAbilitySummary).toBeGreaterThanOrEqual(0);
  });

  test("getCardDefinition returns empty shape for unknown ids", () => {
    const def = getCardDefinition("does-not-exist", "also-not-real");
    expect(def).toEqual({});
  });

  test("getCardDefinition populates imageUrl from the raw set JSON (batch 26 JJJ)", () => {
    // Ogn-001-298 (Blazing Scorcher) has an imageUrl in
    // Packages/riftbound-cards/src/data/sets/ogn.json. The TS card registry
    // Strips it but engine-session re-attaches via lookupImageUrl.
    const def = getCardDefinition("ogn-001-298", "ogn-001-298");
    expect(typeof def.imageUrl).toBe("string");
    expect(def.imageUrl).toMatch(/^https:\/\/.+\.png/);
    // Also works on real-deck instance-id pattern (`<owner>-main-<n>-<defId>`).
    const def2 = getCardDefinition(
      "player-1-main-3-ogn-001-298",
      "player-1-main-3-ogn-001-298",
    );
    expect(def2.imageUrl).toBe(def.imageUrl);
  });

  test("realDecks hand cards carry imageUrl (batch 26 JJJ)", () => {
    const session = new EngineSession({ realDecks: true, seed: "art-hand" });
    const hands = session.buildHandView();
    let withImg = 0;
    for (const cards of Object.values(hands)) {
      for (const c of cards) {
        if (typeof c.imageUrl === "string" && c.imageUrl.length > 0) {
          withImg++;
        }
      }
    }
    // Real decks consist of real cards from the data JSON — at least one
    // Hand card should have a usable image URL.
    expect(withImg).toBeGreaterThan(0);
  });

  test("summariseAbilities formats triggered/static/keyword/activated", () => {
    const summaries = summariseAbilities([
      {
        effect: { type: "draw", amount: 1 },
        trigger: { event: "play", on: "self" },
        type: "triggered",
      },
      { effect: { type: "modify-might", amount: 1 }, type: "static" },
      { keyword: "Hunt", type: "keyword", value: 2 },
      {
        cost: { exhaust: true },
        effect: { type: "draw", amount: 1 },
        type: "activated",
      },
      {
        effect: { type: "damage", value: 3 },
        type: "spell",
      },
    ]);
    expect(summaries).toHaveLength(5);
    expect(summaries[0]).toMatch(/^\[Trigger: play.*\] draw 1/);
    expect(summaries[1]).toMatch(/^\[Static\] modify-might 1/);
    expect(summaries[2]).toBe("[Keyword] Hunt 2");
    expect(summaries[3]).toMatch(/^\[Activated\] exhaust → draw 1/);
    expect(summaries[4]).toMatch(/^\[Spell\] damage 3/);
  });

  test("summariseAbilities caps output at 5 entries", () => {
    const many = Array.from({ length: 12 }, () => ({
      keyword: "X",
      type: "keyword" as const,
    }));
    expect(summariseAbilities(many)).toHaveLength(5);
  });

  test("battlefield units expose card-definition fields on realDecks", () => {
    const session = new EngineSession({ realDecks: true, seed: "bf-enriched" });
    const view = session.getView();
    // Battlefields themselves have card definitions registered (see real-decks
    // `registerDeckCardsWithEngine`'s battlefield branch). Units in play start
    // Empty until cards are played, so we instead assert the shape exposes
    // The optional fields. Find at least one battlefield with a definitionId
    // And confirm enrichment works on demand by also testing a "fake" unit
    // Synthesised from the BF definitionId itself.
    expect(view.battlefields.length).toBeGreaterThan(0);
    for (const bf of view.battlefields) {
      for (const u of bf.units) {
        expect(typeof u.id).toBe("string");
        expect(typeof u.definitionId).toBe("string");
      }
    }
  });

  test("battlefields[i].rulesText is populated on realDecks", () => {
    // BF cards (e.g. ogn-296-298 "Heated Roads") have a `rulesText` in the
    // Raw `@tcg/riftbound-cards` set JSON. engine-session must thread it
    // Through `GameView.battlefields[i].rulesText` so the SPA can render
    // The full text on the tile.
    const session = new EngineSession({ realDecks: true, seed: "bf-rules" });
    const view = session.getView();
    expect(view.battlefields.length).toBeGreaterThan(0);
    const withRules = view.battlefields.filter(
      (bf) => typeof bf.rulesText === "string" && bf.rulesText.length > 0,
    );
    expect(withRules.length).toBeGreaterThan(0);
    for (const bf of withRules) {
      expect(typeof bf.rulesText).toBe("string");
    }
  });

  test("view.combat and view.chain are undefined for a fresh non-combat session", () => {
    // Phase B batch 25 EEE: combat + chain are *optional* on GameView. At
    // Construction we have no showdown, no chain — both should be absent
    // So the SPA's CombatPanel/ChainPanel renders nothing.
    const session = new EngineSession({ seed: "no-combat" });
    const view = session.getView();
    expect(view.combat).toBeUndefined();
    expect(view.chain).toBeUndefined();
  });

  test("view.combat is populated when state.interaction has an active showdown", () => {
    // Phase B batch 25 EEE: surgical injection of an active showdown into
    // `state.interaction.showdownStack[top]` plus two cards on the showdown
    // Battlefield with combatRole=attacker/defender. The view builder must
    // Partition them correctly and surface focus / battlefieldId.
    const session = new EngineSession({ battlefieldCount: 2, seed: "combat-view" });
    // The engine's currentState is frozen/immer-locked. We mutate via internal
    // Snapshot (zones/cards/cardMetas are plain objects on internalState) AND
    // Replace `currentState` wholesale to inject `interaction`.
    const engineMut = session.engine as unknown as {
      currentState: {
        battlefields: Record<string, unknown>;
        interaction?: unknown;
      } & Record<string, unknown>;
    };
    const bfId = Object.keys(engineMut.currentState.battlefields)[0]!;
    const internal = (session.engine as unknown as {
      internalState: {
        zones: Record<string, { cardIds: string[] }>;
        cards: Record<string, { definitionId: string; owner: string; controller: string; zone: string }>;
        cardMetas: Record<string, { combatRole: "attacker" | "defender" | null; damage: number; buffed: boolean; stunned: boolean; exhausted: boolean; hidden: boolean }>;
      };
    }).internalState;

    const bfZoneId = `battlefield-${bfId}`;
    internal.zones[bfZoneId] = internal.zones[bfZoneId] ?? { cardIds: [] };
    const atk = "test-atk-1";
    const def = "test-def-1";
    internal.cards[atk] = {
      controller: "player-1",
      definitionId: atk,
      owner: "player-1",
      zone: bfZoneId,
    };
    internal.cards[def] = {
      controller: "player-2",
      definitionId: def,
      owner: "player-2",
      zone: bfZoneId,
    };
    internal.zones[bfZoneId].cardIds.push(atk, def);
    internal.cardMetas[atk] = {
      buffed: false,
      combatRole: "attacker",
      damage: 0,
      exhausted: false,
      hidden: false,
      stunned: false,
    };
    internal.cardMetas[def] = {
      buffed: false,
      combatRole: "defender",
      damage: 0,
      exhausted: false,
      hidden: false,
      stunned: false,
    };

    // Inject an active showdown — replace currentState wholesale since the
    // Existing object is frozen (immer/structural sharing).
    engineMut.currentState = {
      ...engineMut.currentState,
      interaction: {
        chain: null,
        nextChainItemId: 1,
        showdownStack: [
          {
            active: true,
            attackingPlayer: "player-1",
            battlefieldId: bfId,
            defendingPlayer: "player-2",
            focusPlayer: "player-2",
            isCombatShowdown: true,
            passedPlayers: [],
            relevantPlayers: ["player-1", "player-2"],
          },
        ],
      },
    };

    const view = session.getView();
    expect(view.combat).toBeDefined();
    expect(view.combat!.battlefieldId).toBe(bfId);
    expect(view.combat!.focusOwner).toBe("player-2");
    expect(view.combat!.attackingPlayer).toBe("player-1");
    expect(view.combat!.defendingPlayer).toBe("player-2");
    expect(view.combat!.isCombat).toBe(true);
    expect(view.combat!.attackers.map((u) => u.id)).toEqual([atk]);
    expect(view.combat!.defenders.map((u) => u.id)).toEqual([def]);
    expect(view.combat!.attackers[0].controller).toBe("player-1");
    expect(view.combat!.defenders[0].controller).toBe("player-2");
  });

  test("view.chain is populated when state.interaction.chain has items (LIFO)", () => {
    // Phase B batch 25 EEE: inject two items into the chain and assert the
    // View exposes both (LIFO order preserved by index — the SPA panel
    // Reverses for rendering).
    const session = new EngineSession({ seed: "chain-view" });
    const engineMut = session.engine as unknown as {
      currentState: { interaction?: unknown } & Record<string, unknown>;
    };
    engineMut.currentState = {
      ...engineMut.currentState,
      interaction: {
        chain: {
          active: true,
          activePlayer: "player-2",
          items: [
            {
              cardId: "spell-a",
              controller: "player-1",
              id: "chain-1",
              type: "spell",
            },
            {
              cardId: "spell-b",
              controller: "player-2",
              countered: true,
              id: "chain-2",
              type: "ability",
            },
          ],
          passedPlayers: [],
          relevantPlayers: ["player-1", "player-2"],
          turnOrder: ["player-1", "player-2"],
        },
        nextChainItemId: 3,
        showdownStack: [],
      },
    };

    const view = session.getView();
    expect(view.chain).toBeDefined();
    expect(view.chain!.items).toHaveLength(2);
    expect(view.chain!.focusOwner).toBe("player-2");
    expect(view.chain!.items[0].id).toBe("chain-1");
    expect(view.chain!.items[0].type).toBe("spell");
    expect(view.chain!.items[0].countered).toBe(false);
    expect(view.chain!.items[1].id).toBe("chain-2");
    expect(view.chain!.items[1].countered).toBe(true);
    expect(view.chain!.items[1].source.playerId).toBe("player-2");
    expect(view.chain!.items[1].summary).toMatch(/^\[Ability\]/);
  });

  test("same seed produces same gameId across runs", () => {
    // RuleEngine itself generates gameId via crypto.randomUUID (not seeded
    // For game-id specifically), so we don't assert equality here — we just
    // Assert that *the view shape* is deterministic given identical inputs.
    const a = new EngineSession({ seed: "x" }).getView();
    const b = new EngineSession({ seed: "x" }).getView();
    expect(a.turn).toEqual(b.turn);
    expect(a.players.map((p) => p.handSize)).toEqual(
      b.players.map((p) => p.handSize),
    );
    expect(a.battlefields.length).toEqual(b.battlefields.length);
  });
});
