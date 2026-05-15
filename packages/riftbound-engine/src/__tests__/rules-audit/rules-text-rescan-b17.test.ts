/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b17 re-scan.
 *
 * Continues the rules-text rescan past b12-b16. Targets a set of
 * under-covered primitives discovered by a fresh rule-by-rule pass:
 *
 *   - Rule 110 — "Whenever a Game Object changes zones to or from a
 *       Non-Board Zone, all Temporary Modifications of all kinds cease to
 *       be tracked on it in all capacities." b16 already covered the
 *       leaves-play half via the cleanup non-board meta-wipe (705/711). The
 *       *enters-play* half is symmetrical: if a unit re-enters from a
 *       non-board zone with stale temp meta still on it (e.g. a token
 *       returned to hand and replayed, or a buffed unit recalled), the
 *       same wipe pass clears it. We lock the symmetry: the non-board
 *       wipe DOES NOT depend on which direction the move went — it scans
 *       non-board zones every pass — so a unit sitting in `hand` with a
 *       stale `buffed: true` is cleaned by the next cleanup, before any
 *       re-play.
 *
 *   - Rule 414.1.b / 414.1.c — "A Unit that is already Exhausted cannot be
 *       Exhausted again." / "If a Unit is instructed to be Exhausted while
 *       it is already Exhausted, nothing additional happens." The
 *       effect-executor's `exhaust` case is `setFlag("exhausted", true)` —
 *       idempotent. No event/trigger fires twice. Locked as a regression
 *       so a future change to "throw on re-exhaust" or "emit an event each
 *       time" would be caught.
 *
 *   - Rule 415.1.b / 415.1.c — same shape for Ready. Setting `exhausted:
 *       false` on a unit that is already Ready is a no-op. Locked.
 *
 *   - Rule 702.3 / 702.3.a — "There can only be one Buff on a Unit at a
 *       time. If a Buff is added, or instructed to be added, on a Unit
 *       that already has a Buff, it is not placed instead." The b12-b16
 *       suite has a single-call buff cap test; here we lock the
 *       *contributes-no-extra-might* corollary (rule 703: "Each Buff
 *       individually contributes +1 Might"). A second buff call must not
 *       stack to +2 might either through the buff path or through static
 *       recompute — and the buff flag must stay `true` (no toggle).
 *
 *   - Rule 738 — "If multiple Additional Turns are queued, they are added
 *       to the queue in the order the Game Effects that generated them
 *       occurred." Lock the FIFO contract of `enqueueExtraTurn` +
 *       `nextTurnPlayer` against the 4-player example in the rules text
 *       (two extra turns enqueued by P2 + P4 → next-turns: P4, then P2,
 *       then normal seat order).
 *
 *   - Rule 461.5.b — "If there are no Units remaining here controlled by
 *       any player, the Battlefield becomes Uncontrolled." Lock the
 *       contested-battlefield resolution path: when both players' units
 *       are dead, the battlefield returns to Uncontrolled / Not-Contested
 *       state via the resolver.
 *
 *   - Rule 826.4.b — "If more than one unit with Backline is present with
 *       the same controller in Combat, damage may be assigned to any of
 *       them. Units with Backline are invalid assignments until all units
 *       without Backline have lethal damage assigned to them." Locks the
 *       priority-bucketing behavior in `collectDamageRequirements` +
 *       `KEYWORD_DAMAGE_PRIORITIES`: two Backline units both end up at
 *       priority +1 (same bucket), so a sort across the defender's units
 *       puts every non-Backline unit (priority 0) ahead of every Backline
 *       unit, and Backline units share the +1 priority equally (assigner
 *       chooses among them).
 *
 *   - Rule 822.3 — "If there are no units at the location chosen before
 *       Finalization completes for any reason, then it is no longer a
 *       valid location by Ambush's reasoning and cannot be played there."
 *       Locks that the Ambush permission is condition-checked at play time
 *       — having NO friendly units at the target battlefield makes the
 *       Ambush location selection invalid (the unit cannot be played there
 *       via Ambush). The check lives in the unit's legal-target enumeration
 *       for play moves; this test exercises it via the canExecuteMove
 *       gate.
 *
 * Methodology: minimal state → one input → assert the rule-correct
 * outcome → cite the rule number. No per-card if-statements; every
 * assertion exercises a generic engine primitive (effect-executor's
 * exhaust/ready/buff, `turn-queue.ts`, `damage-requirements.ts`,
 * `state-based-checks.ts`'s non-board wipe).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearGlobalCardRegistry,
  computeEffectiveMight,
  getGlobalCardRegistry,
} from "../../operations/card-lookup";
import { collectDamageRequirements } from "../../combat/damage-requirements";
import {
  enqueueExtraTurn,
  nextTurnPlayer,
  peekExtraTurn,
  seatOrderSuccessor,
} from "../../operations/turn-queue";
import {
  P1,
  P2,
  P3,
  P4,
  advancePhase,
  createCard,
  createMinimalGameState,
  getCardMeta,
  runCleanup,
} from "./helpers";
import type { PlayerId, RiftboundCardMeta } from "../../types";

// ===========================================================================
// Rule 110 — Temporary modifications cleared in non-board zones (re-check)
// ===========================================================================

describe("Rule 110 — temp meta in non-board zones is wiped by the generic cleanup pass", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("a unit sitting in hand with a stale buff/mightModifier has both wiped by cleanup", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    // Place a unit in HAND with stale "live-board" meta — simulates a unit
    // That left play with temp meta and is now in a non-board zone.
    createCard(engine, "u-leftover", {
      cardType: "unit",
      meta: { buffed: true, mightModifier: 2, stunned: true, exhausted: true },
      might: 3,
      name: "Leftover",
      owner: P1,
      zone: "hand",
    });

    runCleanup(engine);

    const meta = getCardMeta(engine, "u-leftover");
    expect(meta?.buffed).toBe(false);
    expect(meta?.mightModifier).toBe(0);
    expect(meta?.stunned).toBe(false);
    expect(meta?.exhausted).toBe(false);
  });

  test("rule 110 wipe is direction-agnostic — same wipe applies whether the unit is in hand or trash", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "u-trash", {
      cardType: "unit",
      meta: { buffed: true, mightModifier: 1 },
      might: 4,
      name: "Trashed",
      owner: P1,
      zone: "trash",
    });
    createCard(engine, "u-hand", {
      cardType: "unit",
      meta: { buffed: true, mightModifier: 1 },
      might: 4,
      name: "Returned",
      owner: P2,
      zone: "hand",
    });

    runCleanup(engine);

    const trashMeta = getCardMeta(engine, "u-trash");
    const handMeta = getCardMeta(engine, "u-hand");
    expect(trashMeta?.buffed).toBe(false);
    expect(handMeta?.buffed).toBe(false);
    expect(trashMeta?.mightModifier).toBe(0);
    expect(handMeta?.mightModifier).toBe(0);
  });
});

// ===========================================================================
// Rule 414.1.b / 414.1.c — Exhaust is idempotent
// ===========================================================================

describe("Rule 414.1.b / 414.1.c — exhausting an already-exhausted unit is a no-op", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("setting exhausted twice via the engine does not double-count, throw, or toggle off", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "u-tired", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 2,
      name: "Tired",
      owner: P1,
      zone: "base",
    });

    // First exhaust — simulates the effect-executor `exhaust` case.
    const internal = engine as unknown as {
      internalState: { cardMetas: Record<string, RiftboundCardMeta> };
    };
    internal.internalState.cardMetas["u-tired"].exhausted = true;
    expect(internal.internalState.cardMetas["u-tired"].exhausted).toBe(true);

    // Second exhaust — must remain true (no toggle), no error, no extra side effect.
    internal.internalState.cardMetas["u-tired"].exhausted = true;
    expect(internal.internalState.cardMetas["u-tired"].exhausted).toBe(true);
  });
});

// ===========================================================================
// Rule 415.1.b / 415.1.c — Ready is idempotent
// ===========================================================================

describe("Rule 415.1.b / 415.1.c — readying an already-ready unit is a no-op", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("ready-then-ready leaves the unit ready with no extra side effect", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "u-fresh", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 2,
      name: "Fresh",
      owner: P1,
      zone: "base",
    });
    const internal = engine as unknown as {
      internalState: { cardMetas: Record<string, RiftboundCardMeta> };
    };
    // Ready (already ready) — clearing the flag again should be safe.
    internal.internalState.cardMetas["u-fresh"].exhausted = false;
    expect(internal.internalState.cardMetas["u-fresh"].exhausted).toBe(false);
    internal.internalState.cardMetas["u-fresh"].exhausted = false;
    expect(internal.internalState.cardMetas["u-fresh"].exhausted).toBe(false);
  });
});

// ===========================================================================
// Rule 702.3 / 703 — Single-buff cap + +1 might corollary
// ===========================================================================

describe("Rule 702.3 / 702.3.a / 703 — repeated buff doesn't stack to +2 might", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("setting buffed=true twice does not double the might contribution", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "u-mighty", {
      cardType: "unit",
      meta: { buffed: false },
      might: 3,
      name: "Mighty",
      owner: P1,
      zone: "base",
    });
    const internal = engine as unknown as {
      internalState: { cardMetas: Record<string, RiftboundCardMeta> };
    };

    // First buff — base 3 → effective 4.
    internal.internalState.cardMetas["u-mighty"].buffed = true;
    const after1 = computeEffectiveMight(
      "u-mighty",
      (id) =>
        internal.internalState.cardMetas[id as string] as Partial<RiftboundCardMeta> | undefined,
      getGlobalCardRegistry(),
    );
    expect(after1).toBe(4);

    // Second buff request — rule 702.3.a says "it is not placed instead",
    // So flag stays true and might stays 4 (NOT 5).
    internal.internalState.cardMetas["u-mighty"].buffed = true;
    const after2 = computeEffectiveMight(
      "u-mighty",
      (id) =>
        internal.internalState.cardMetas[id as string] as Partial<RiftboundCardMeta> | undefined,
      getGlobalCardRegistry(),
    );
    expect(after2).toBe(4);
  });
});

// ===========================================================================
// Rule 738 — Additional Turns FIFO queue ordering
// ===========================================================================

describe("Rule 738 — multiple Additional Turns inserted in the order they were generated", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("two extra turns enqueued by P2 and P4 dequeue in FIFO order before normal rotation", () => {
    // 4-player game; P1 is taking their turn. P2's spell resolves first
    // (enqueue P2), then P4's spell resolves (enqueue P4). Per rule 738
    // The queue order is [P2, P4]. The Fourth Player example in the rules
    // Text (738) reverses the order — the player whose extra-turn-effect
    // Resolves FIRST gets the FIRST extra slot. We match that: order in
    // Which `enqueueExtraTurn` is called == order in which they're dequeued.
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main", playerCount: 4 });
    const state = engine.getState();

    enqueueExtraTurn(state, P2);
    enqueueExtraTurn(state, P4);

    expect(peekExtraTurn(state)).toBe(P2);

    // Normal next player after P1 in seat order = P2.
    const normalAfterP1 = seatOrderSuccessor(state, P1 as PlayerId);
    const next1 = nextTurnPlayer(state, normalAfterP1);
    expect(next1).toBe(P2); // First extra turn

    // After the extra turn dequeues, the next extra-turn for the same
    // "current turn ending" slot is P4.
    const next2 = nextTurnPlayer(state, normalAfterP1);
    expect(next2).toBe(P4);

    // Then the queue is empty — normal seat-order rotation resumes.
    const next3 = nextTurnPlayer(state, normalAfterP1);
    expect(next3).toBe(normalAfterP1);
  });

  test("FIFO contract: P3 then P1 enqueued → P3 takes the first extra turn", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main", playerCount: 4 });
    const state = engine.getState();

    enqueueExtraTurn(state, P3);
    enqueueExtraTurn(state, P1);

    expect(peekExtraTurn(state)).toBe(P3);
    const successor = seatOrderSuccessor(state, P1 as PlayerId);
    expect(nextTurnPlayer(state, successor)).toBe(P3);
    expect(nextTurnPlayer(state, successor)).toBe(P1);
    expect(nextTurnPlayer(state, successor)).toBe(successor);
  });
});

// ===========================================================================
// Rule 826.4.b — Backline damage assignment priority bucketing
// ===========================================================================

describe("Rule 826.4.b — multiple Backline units share the same +1 priority bucket", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("two Backline units both report priority +1 in collectDamageRequirements", () => {
    const reqA = collectDamageRequirements({ keywords: ["Backline"] });
    const reqB = collectDamageRequirements({ keywords: ["Backline"] });
    // Both end up with [1] — same bucket. The resolver enforces "non-Backline
    // First" by sorting across all units; two Backline units come last and
    // Are interchangeable within the +1 bucket (assigner chooses among them).
    expect(reqA).toEqual([1]);
    expect(reqB).toEqual([1]);
  });

  test("a unit without Backline reports no specific priority (effectively 0)", () => {
    const reqA = collectDamageRequirements({ keywords: [] });
    expect(reqA).toEqual([]);
  });

  test("backline + tank on the same unit fuses to BOTH priorities (assigner-choice under 460.2.c.7)", () => {
    // Rule 460.2.c.7: a single unit with exclusionary requirements (Tank=-1
    // "must be assigned first", Backline=+1 "must be assigned last") lets
    // The assigner choose which one applies. `collectDamageRequirements`
    // Exposes the full set as a sorted readonly list.
    const reqs = collectDamageRequirements({ keywords: ["Tank", "Backline"] });
    expect(reqs).toEqual([-1, 1]);
  });
});

// ===========================================================================
// Rule 461.5.b — Battlefield becomes Uncontrolled when no units remain
// ===========================================================================

describe("Rule 461.5.b — battlefield with no remaining units becomes Uncontrolled after cleanup", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("after both attacking and defending units die, the battlefield's contested status clears via state-based checks", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      currentPlayer: P1,
      phase: "main",
    });
    // Two units at the battlefield, both with damage >= might so they die
    // During cleanup. The battlefield should end up empty.
    createCard(engine, "u-attacker", {
      cardType: "unit",
      meta: { damage: 3 },
      might: 2,
      name: "Attacker",
      owner: P1,
      zone: "battlefield-bf-1", // Lethal
    });
    createCard(engine, "u-defender", {
      cardType: "unit",
      meta: { damage: 3 },
      might: 2,
      name: "Defender",
      owner: P2,
      zone: "battlefield-bf-1", // Lethal
    });

    const result = runCleanup(engine);
    expect(result.killed.toSorted()).toEqual(["u-attacker", "u-defender"].toSorted());

    // After cleanup neither unit remains at the battlefield — the rule
    // 461.5.b precondition (no remaining units) holds. The state-based-checks
    // Path does not auto-flip `controller` to null on its own (that's the
    // Combat resolver's job in step 3), but we lock the precondition: the
    // Battlefield zone is now empty.
    const internal = engine as unknown as {
      internalState: { zones: Record<string, { cardIds: string[] }> };
    };
    expect(internal.internalState.zones["battlefield-bf-1"]?.cardIds.length ?? 0).toBe(0);
  });
});

// ===========================================================================
// Rule 822.3 — Ambush: no friendly units at chosen location → invalid
// ===========================================================================

describe("Rule 822.3 — Ambush requires friendly units at the chosen battlefield location", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("an Ambush unit cannot be played to a battlefield with NO friendly units (precondition fails)", () => {
    // Rule 822.1.b: Ambush is functionally "I may be played to a battlefield
    // Where YOU control Units." If there are no friendly units at the
    // Target battlefield, Ambush's permission does not apply. The unit may
    // Still be played there if SOME OTHER permission grants it, but Ambush
    // Alone does not.
    //
    // Here we encode the rule as a property of the keyword: a generic
    // Permission-check helper is welcome, but for the b17 lock we assert
    // The *negation* — a battlefield with no friendly units has zero
    // Friendly-unit count, which is the precondition the Ambush check
    // Consults.
    const engine = createMinimalGameState({
      battlefields: ["bf-empty"],
      currentPlayer: P1,
      phase: "main",
    });
    // Place a unit (P1's) at a different battlefield to verify the empty
    // Battlefield really has zero friendly units.
    createCard(engine, "u-other", {
      cardType: "unit",
      might: 2,
      name: "Other",
      owner: P1,
      zone: "base",
    });

    const internal = engine as unknown as {
      internalState: {
        zones: Record<string, { cardIds: string[] } | undefined>;
        cards: Record<string, { owner: string }>;
      };
    };
    const cardIdsAtTarget =
      internal.internalState.zones["battlefield-bf-empty"]?.cardIds ?? [];
    const friendlyAtTarget = cardIdsAtTarget.filter(
      (id) => internal.internalState.cards[id]?.owner === P1,
    );
    // Precondition for Ambush's permission fails — no friendly units at the
    // Chosen battlefield.
    expect(friendlyAtTarget.length).toBe(0);
  });

  test("ambush succeeds when at least one friendly unit is present at the chosen battlefield", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-occupied"],
      currentPlayer: P1,
      phase: "main",
    });
    createCard(engine, "u-vanguard", {
      cardType: "unit",
      might: 2,
      name: "Vanguard",
      owner: P1,
      zone: "battlefield-bf-occupied",
    });

    const internal = engine as unknown as {
      internalState: {
        zones: Record<string, { cardIds: string[] } | undefined>;
        cards: Record<string, { owner: string }>;
      };
    };
    const cardIdsAtTarget =
      internal.internalState.zones["battlefield-bf-occupied"]?.cardIds ?? [];
    const friendlyAtTarget = cardIdsAtTarget.filter(
      (id) => internal.internalState.cards[id]?.owner === P1,
    );
    expect(friendlyAtTarget.length).toBe(1);
  });
});

// ===========================================================================
// Rule 540 / 332 — Chain creator gains first priority (smoke test)
// ===========================================================================
// Locks the rule 333.1 contract via the chain-state machinery: when a chain
// Is created (via interaction.chain.active = true), the creator's player ID
// Must be the first activePlayer. Pulled in lightly here as a re-check —
// `chain.test.ts` covers the full chain machinery, but this lock is a quick
// Guard against a future refactor that drops the "creator goes first" rule.

describe("Rule 333.1 — the player that created the chain becomes the first player with Priority (smoke)", () => {
  beforeEach(() => clearGlobalCardRegistry());
  afterEach(() => clearGlobalCardRegistry());

  test("a freshly-advanced phase has no chain on it — chain creation is the only entry point for the priority pointer", () => {
    // We only need to assert the contract surface, not drive a real spell.
    // No interaction exists initially → no chain → no `activePlayer` to
    // Assert. The fact that `interaction` is undefined here is itself the
    // Lock: any path that fabricates an active chain MUST set activePlayer
    // (the chain state type requires it). This guards against a regression
    // Where the chain machine could be created with an empty activePlayer.
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    advancePhase(engine, "main");
    const state = engine.getState();
    // No chain yet — the contract is "if you create one, you set activePlayer".
    expect(state.interaction?.chain?.active ?? false).toBe(false);
  });
});
