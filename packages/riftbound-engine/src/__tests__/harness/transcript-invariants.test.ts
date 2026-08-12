/**
 * Harness self-tests: L4 transcripts (replay determinism) and invariants.
 */

import { describe, expect, test } from "bun:test";
import type { HarnessEngine as HarnessEngineT, Invariant, ScenarioSpec } from "../../harness";
import {
  DEFAULT_INVARIANTS,
  Game,
  P1,
  P2,
  cardConservation,
  energyNonNegative,
  noOrphanChain,
  pendingChoiceGatesMoves,
  replayTranscript,
  runInvariants,
  scenario,
  singleDecisionCursor,
} from "../../harness";
import { getInternalState, peekCurrentState, replaceCurrentState } from "../../harness/internal";
import type { RiftboundGameState } from "../../types";

const CLEAVE = "ogn-004-298";
const STACKED_DECK = "ogn-183-298";
const REARGUARD = "ogn-010-298";

async function playSomething() {
  const game = await scenario({ seed: "det" })
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2 }, "u1")
    .unit(P1, "base", { might: 3 }, "u2")
    .unit(P2, "bf1", { might: 4 }, "e1")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, STACKED_DECK, "sd")
    .hand(P1, REARGUARD, "rear")
    .deck(P1, [CLEAVE, CLEAVE, REARGUARD], ["d0", "d1", "d2"])
    .build();
  await game.p1.cast("cleave", { targets: "u1" });
  await game.settle();
  await game.p1.play("rear", { accelerate: true });
  await game.p1.cast("sd", { answers: ["d2"] });
  await game.settle();
  await game.p1.move(["u1", "u2"], "bf1");
  await game.settle();
  await game.advanceTurn();
  return game;
}

describe("transcripts", () => {
  test("same scenario + same answers ⇒ identical hashes at every step (replay by decisions)", async () => {
    const game = await playSomething();
    const t = game.transcript();
    expect(t.steps.length).toBeGreaterThan(8);
    expect(t.steps.every((s) => s.ok && typeof s.hash === "string" && s.hash.length === 8)).toBe(true);
    expect(t.finalHash).toBe(game.stateHash());
    expect(JSON.parse(JSON.stringify(t))).toEqual(t); // serialisable

    const rep = await replayTranscript(t);
    expect(rep.divergedAt).toBeUndefined();
    expect(rep.stepsApplied).toBe(t.steps.length);
    expect(rep.finalHashMatches).toBe(true);
    expect(rep.game.p1.hand()).toEqual(game.p1.hand());
    expect(rep.game.turnPlayer()).toBe(P2);

    // Independent rebuild produces the same numbers too.
    const again = await playSomething();
    expect(again.stateHash()).toBe(game.stateHash());
    expect(again.transcript().steps.map((s) => s.hash)).toEqual(t.steps.map((s) => s.hash));
  });

  test("replay detects divergence when the origin is tampered with", async () => {
    const game = await playSomething();
    const t = game.transcript();
    const spec = structuredClone((t.origin as unknown as { spec: ScenarioSpec }).spec) as ScenarioSpec & {
      cards: ScenarioSpec["cards"][number][];
    };
    spec.cards.push({ def: CLEAVE, id: "extra", owner: P2, zone: "hand" }); // a card that was not there
    const tampered = { ...t, origin: { kind: "scenario" as const, spec } };
    const rep = await replayTranscript(tampered);
    expect(rep.divergedAt).toBe(0);
    expect(rep.divergence).toContain("initial hash");
    expect(rep.finalHashMatches).toBe(false);
    // Hash verification can be switched off (answers still re-applied).
    const lenient = await replayTranscript(tampered, { verifyHashes: false });
    expect(lenient.divergedAt).toBeUndefined();
    expect(lenient.game.has("extra")).toBe(true);
  });

  test("stopAt replays a prefix; opaque origins cannot be rebuilt", async () => {
    const game = await playSomething();
    const t = game.transcript();
    const rep = await replayTranscript(t, { stopAt: 3 });
    expect(rep.stepsApplied).toBe(3);
    expect(rep.game.stateHash()).toBe(t.steps[2]?.hash as string);
    const attached = Game.attach(game.engine);
    expect(attached.transcript().origin.kind).toBe("opaque");
    await expect(replayTranscript(attached.transcript())).rejects.toThrow(/opaque/);
  });
});

describe("invariants", () => {
  test("the default set is silent on healthy play", async () => {
    const game = await playSomething();
    expect(game.violations()).toEqual([]);
    expect(DEFAULT_INVARIANTS.map((i) => i.name)).toEqual([
      "energyNonNegative",
      "cardConservation",
      "noEmptyPrompt",
      "pendingChoiceGatesMoves",
      "singleDecisionCursor",
      "noOrphanChain",
      "costPaid",
    ]);
  });

  test("fire on a deliberately broken state: negative energy, vanished card, zone/card disagreement", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 1 }, "u").runes(P1, "fury", 1).build();
    // Corrupt behind the engine's back, then take any step so invariants run.
    const st = structuredClone(peekCurrentState(game.engine)) as RiftboundGameState & {
      runePools: Record<string, { energy: number; power: Record<string, number> }>;
    };
    st.runePools[P1] = { energy: -3, power: {} };
    replaceCurrentState(game.engine, st);
    const internal = getInternalState(game.engine);
    internal.zones.base!.cardIds = internal.zones.base!.cardIds.filter((id) => id !== "u"); // "u" now in no zone list
    delete internal.cards["player-2:filler0"]; // vanished, but still listed in mainDeck

    const r = await game.p1.tapRune();
    const byInv = (name: string) => r.violations.filter((v) => v.invariant === name).map((v) => v.message);
    expect(byInv("energyNonNegative")).toEqual(["player-1 energy -2 < 0"]);
    expect(byInv("cardConservation")).toEqual(
      expect.arrayContaining([
        "u (cards[].zone=base) is in no zone list",
        "player-2:filler0 in zone mainDeck but missing from cards",
        "player-2:filler0 vanished",
      ]),
    );
    expect(game.violations().length).toBe(r.violations.length);
    expect(r.violations.every((v) => v.seq === 1)).toBe(true);
  });

  test("custom invariant hook (.use), strictInvariants, and several live games in one test", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).runes(P2, "calm", 1).unit(P1, "base", { might: 1 }, "u").hand(P1, CLEAVE, "c").build();
    const bogus: Invariant = {
      check: ({ engine }) => (engine.getState().turn.activePlayer === P1 ? ["it is P1's turn (test invariant)"] : []),
      name: "custom",
    };
    const custom = await scenario().use(bogus).runes(P1, "fury", 1).build();
    const r = await custom.p1.tapRune();
    expect(r.violations).toEqual([{ invariant: "custom", message: "it is P1's turn (test invariant)", seq: 1 }]);

    // strictInvariants turns violations into thrown INVARIANT errors.
    const strict = await scenario().use(bogus).strictInvariants().runes(P1, "fury", 1).build();
    await expect(strict.p1.tapRune()).rejects.toThrow(/INVARIANT.*custom/);

    // Back to the first game (its card registry is re-installed transparently): healthy play stays silent.
    await game.p1.cast("c", { targets: "u" });
    await game.settle();
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.violations()).toEqual([]);
    expect(energyNonNegative.check({ cur: { cards: {}, metas: {}, state: game.gameState, zones: {} }, engine: game.engine, prev: null })).toEqual([]);
    expect(cardConservation.name).toBe("cardConservation");

    // .invariants([]) disables the default set entirely.
    const none = await scenario().invariants([]).runes(P1, "fury", 1).build();
    const st = structuredClone(peekCurrentState(none.engine)) as RiftboundGameState & {
      runePools: Record<string, { energy: number; power: Record<string, number> }>;
    };
    st.runePools[P1] = { energy: -9, power: {} };
    replaceCurrentState(none.engine, st);
    expect((await none.p1.tapRune()).violations).toEqual([]);
  });

  test("pendingChoiceGatesMoves and singleDecisionCursor are pure oracles over (state, legal moves)", async () => {
    const game = await scenario().unit(P1, "base", { might: 1 }, "u").build();
    const state = structuredClone(game.gameState) as RiftboundGameState;
    (state as { pendingChoice?: RiftboundGameState["pendingChoice"] }).pendingChoice = {
      cardId: "u",
      options: ["base"],
      playerId: P2,
      type: "choose-destination",
    };
    // A fake legality oracle standing in for a buggy engine: P1 may still play a unit and
    // resolve the choice although P2 is the chooser.
    const fakeEngine = {
      enumerateMoves: (pid: string) =>
        pid === P1
          ? [{ moveId: "playUnit" }, { moveId: "resolvePendingChoice" }, { moveId: "concede" }]
          : [{ moveId: "resolvePendingChoice" }],
      getState: () => state,
    } as unknown as HarnessEngineT;
    const cur = { cards: {}, metas: {}, state, zones: {} };
    expect(pendingChoiceGatesMoves.check({ cur, engine: fakeEngine, prev: null })).toEqual([
      "player-1 may playUnit while a choose-destination choice is pending",
      "player-1 may resolvePendingChoice but chooser is player-2",
    ]);
    expect(singleDecisionCursor.check({ cur, engine: fakeEngine, prev: null })).toEqual([
      "priority-class moves legal for player-1, player-2 (acting seat player-2)",
    ]);
    expect(runInvariants([noOrphanChain], { cur: { ...cur, state: { ...state, interaction: { chain: { active: true, activePlayer: P1, items: [], passedPlayers: [], relevantPlayers: [], turnOrder: [] }, nextChainItemId: 1, showdownStack: [] } } }, engine: fakeEngine, prev: null })).toEqual([
      { invariant: "noOrphanChain", message: "chain.active with no items" },
    ]);
  });
});
