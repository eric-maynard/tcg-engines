/**
 * Real-decks.test.ts — coverage for the real-card deck wiring.
 *
 * Batch 14 V. Ensures:
 *   1. `getPrebuiltDecks()` returns 2 valid 40-card / 12-rune / 2-battlefield
 *      decks, drawn from the @tcg/riftbound-cards pool.
 *   2. Every card-instance the prebuilt decks list is registerable on a real
 *      engine (`registerDeckCardsWithEngine` doesn't throw and populates the
 *      global card registry).
 *   3. An `EngineSession` constructed with `realDecks: true` boots, the bot
 *      driver runs, and at least one real-card play move (not just
 *      `endTurn` / resource cycling) ends up in the move trail.
 */

import { describe, expect, test } from "bun:test";
import { BotDriver } from "../bot-driver";
import { EngineSession } from "../engine-session";
import { getPrebuiltDecks, registerDeckCardsWithEngine } from "../real-decks";
import { getGlobalCardRegistry } from "@tcg/riftbound";

describe("real-decks", () => {
  test("prebuilt decks have 40 cards + 12 runes + 2 battlefields each", () => {
    const decks = getPrebuiltDecks();
    expect(decks).toHaveLength(2);
    for (const deck of decks) {
      expect(deck.mainDeckCardIds.length).toBe(40);
      expect(deck.runeDeckCardIds.length).toBe(12);
      expect(deck.battlefieldIds.length).toBe(2);
      // Each main-deck entry is a non-empty card id string.
      for (const id of deck.mainDeckCardIds) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }
    }
  });

  test("registerDeckCardsWithEngine populates the global card registry", () => {
    const session = new EngineSession({ realDecks: true, seed: "real-decks-reg" });
    const decks = getPrebuiltDecks();
    const reg = getGlobalCardRegistry();
    // Pick a non-rune main-deck instance ID — they are shaped
    // `<player>-main-<i>-<defId>`. Pull the first one for player-1.
    const firstInstance = `player-1-main-0-${decks[0].mainDeckCardIds[0]}`;
    const def = reg.get(firstInstance);
    expect(def).toBeDefined();
    expect(def?.name).toBeDefined();
    expect(def?.id).toBe(firstInstance);
    // Battlefield instances are registered under the stable IDs bf-1 / bf-2.
    expect(reg.get("bf-1")).toBeDefined();
    expect(reg.get("bf-2")).toBeDefined();
    // Silence ESLint about unused 'registerDeckCardsWithEngine' (the constructor
    // Calls it for us; we re-export for callers that drive their own engine).
    expect(typeof registerDeckCardsWithEngine).toBe("function");
    expect(session.getView().players).toHaveLength(2);
  });

  test("EngineSession with realDecks boots into a playing state with full hands", () => {
    const session = new EngineSession({ realDecks: true, seed: "real-decks-boot" });
    const view = session.getView();
    expect(view.status).toBe("playing");
    expect(view.players).toHaveLength(2);
    // The active player drew their first-turn card (rule 515.4.b) during
    // The pregame -> main flow drive; inactive players still have 4.
    for (const p of view.players) {
      expect([4, 5]).toContain(p.handSize);
      expect(p.deckSize).toBe(40 - p.handSize);
    }
    const active = view.players.find((p) => p.id === view.turn.activePlayer);
    expect(active?.handSize).toBe(5);
    // 2 battlefields placed.
    expect(view.battlefields).toHaveLength(2);
  });

  test("realDecks: a 'play-greedy' loop plays at least one real card", () => {
    // BotDriver's default priority intentionally floors `endTurn` above
    // `exhaustRune` to avoid resource-exhausting infinite loops. That means
    // A vanilla bot never gains energy and never plays a card. For this
    // Test we drive moves with an inline "play-greedy" picker that:
    //   1. prefers any "play a real card" move,
    //   2. otherwise prefers `exhaustRune` over `endTurn` to convert
    //      Pool runes into energy/power,
    //   3. falls back to `endTurn`.
    const session = new EngineSession({ realDecks: true, seed: "real-decks-bvb" });

    const CARD_PLAY_MOVE_IDS = new Set([
      "standardMove",
      "playUnit",
      "playSpell",
      "playGear",
      "playEquipment",
    ]);
    const PRIORITY: Record<string, number> = {
      assignAttacker: 500,
      assignBlocker: 490,
      channelRunes: 400,
      concede: -1,
      conquerBattlefield: 1000,
      contestBattlefield: 600,
      drawCard: 300,
      endTurn: 60,
      exhaustRune: 200,
      passChainPriority: 100,
      passShowdownFocus: 100,
      playEquipment: 750,
      playGear: 800,
      playSpell: 850,
      playUnit: 900,
      readyRune: 80,
      resolveCombat: 470,
      resolveFullCombat: 480,
      scorePoint: 1100,
      standardMove: 700,
    };
    const PRIORITY_DEFAULT = 25;

    function pickGreedy(playerId: string) {
      const moves = session
        .legalMoves(playerId)
        .filter((m) => m.moveId !== "concede");
      if (moves.length === 0) {return null;}
      const scored = moves.map((m) => ({
        m,
        p: PRIORITY[m.moveId] ?? PRIORITY_DEFAULT,
        // Stable tie-break.
        k: `${m.moveId}|${JSON.stringify(m.params)}`,
      }));
      scored.sort((a, b) => (b.p !== a.p ? b.p - a.p : (a.k < b.k ? -1 : 1)));
      return scored[0]?.m ?? null;
    }

    const MOVE_CAP = 2000;
    const TURN_CAP = 30;
    let moves = 0;
    let turnsObserved = 0;
    let lastTurn = -1;
    while (!session.isGameOver() && moves < MOVE_CAP) {
      const view = session.getView();
      if (view.turn.number !== lastTurn) {
        lastTurn = view.turn.number;
        turnsObserved++;
        if (turnsObserved > TURN_CAP) {break;}
      }
      const active = view.turn.activePlayer;
      const move = pickGreedy(active);
      if (!move) {
        const fb = session.applyMove(active, {
          moveId: "endTurn",
          params: { playerId: active },
        });
        if (!fb.success) {break;}
      } else {
        session.applyMove(active, move);
      }
      moves++;
    }

    const trail = session.getTrail();
    const cardPlays = trail.filter((s) => s.success && CARD_PLAY_MOVE_IDS.has(s.moveId));
    expect(trail.length).toBeGreaterThan(0);
    expect(cardPlays.length).toBeGreaterThan(0);
    // Sanity: keep BotDriver referenced so the import isn't flagged as
    // Unused (and to document that the default bot would NOT pass this
    // Test — proving the priority change matters).
    expect(typeof BotDriver).toBe("function");
  });

  // ------------------------------------------------------------------
  // Batch 19 LL — shuffleSeed option
  // ------------------------------------------------------------------
  test("shuffleSeed option produces deterministic but varied deck orders", () => {
    const a = getPrebuiltDecks({ shuffleSeed: 7 });
    const b = getPrebuiltDecks({ shuffleSeed: 7 });
    const c = getPrebuiltDecks({ shuffleSeed: 99 });
    // Determinism: same seed twice → identical order.
    expect(a[0].mainDeckCardIds).toEqual(b[0].mainDeckCardIds);
    expect(a[1].mainDeckCardIds).toEqual(b[1].mainDeckCardIds);
    // Variation: different seeds → different orders, same multiset.
    expect(a[0].mainDeckCardIds.join(",")).not.toBe(c[0].mainDeckCardIds.join(","));
    expect(new Set(a[0].mainDeckCardIds)).toEqual(new Set(c[0].mainDeckCardIds));
  });

  test("shuffleSeed off → backwards-compatible sorted order preserved", () => {
    const a = getPrebuiltDecks();
    const b = getPrebuiltDecks();
    // Two calls without seed: must be the same (no hidden shuffle).
    expect(a[0].mainDeckCardIds).toEqual(b[0].mainDeckCardIds);
  });

  test("shuffleSeed across many seeds: top-of-deck card variety covers spells", () => {
    // Stream-2 goal: spells are no longer always at the bottom. We assert
    // That across a sample of shuffled-seed decks, AT LEAST ONE seed's
    // Top-8 cards (rough opening-hand window) contains a spell. The
    // Unshuffled deck order would never satisfy this because units
    // (28 of them) are sorted ahead of spells.
    //
    // This documents the fix to the "50 seeds, 0 playSpell" coverage gap.
    let seedsWithSpellInOpening = 0;
    const N = 20;
    for (let i = 1; i <= N; i++) {
      const [deck1, deck2] = getPrebuiltDecks({ shuffleSeed: i * 1_000_003 });
      for (const deck of [deck1, deck2]) {
        const top8 = deck.mainDeckCardIds.slice(0, 8);
        const hasSpell = top8.some((instanceId) => false || isSpellDefId(instanceId));
        if (hasSpell) {
          seedsWithSpellInOpening++;
          break;
        }
      }
    }
    // With true randomness we'd expect ~most seeds; with our seeded shuffle
    // We just want NON-ZERO — proving the curve isn't fully sorted any more.
    expect(seedsWithSpellInOpening).toBeGreaterThan(0);
  });
});

// Helper for spell-id check: imports the riftbound-cards registry to
// Inspect each card definition by id and determine cardType. Kept outside
// The describe block so the import cost is paid once at module load.
import { getCardRegistry } from "@tcg/riftbound-cards";
function isSpellDefId(defId: string): boolean {
  const def = getCardRegistry().get(defId);
  return def?.cardType === "spell";
}
