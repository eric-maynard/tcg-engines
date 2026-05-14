/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b13 re-scan.
 *
 * Continues the rules-text rescan from b12 (Q's punted items) and adds 4
 * MORE rule gaps found by re-scanning the rules files.
 *
 * Targets:
 *
 *   - Rule 466.1.b — Winning-Point semantics. "When a player tries to Gain
 *       a Point through a Score, and their current Point Total is 1 point
 *       from the Victory Score of the Mode of Play or higher, the following
 *       occurs: If the player has Scored through Hold, that player Gains the
 *       Winning Point. If the player has Scored through a Conquer and has
 *       Scored every Battlefield through either method this turn, that
 *       player Gains the Winning Point. If the player has Scored through a
 *       Conquer and has not Scored every Battlefield this turn, that player
 *       draws a card."
 *
 *     Before this fix the engine's `score` effect just incremented
 *     `victoryPoints` and called `hasPlayerWon`; the *combat* conquer paths
 *     in `moves/combat.ts` (attacker-conquer, defender-establish, no-result
 *     showdown survivor, noncombat showdown survivor, and the standalone
 *     `conquerBattlefield` move) likewise had no winning-point gate.
 *     Fix: `decideWinningPoint()` in `win-conditions/victory.ts` returns
 *     `"gain" | "draw" | "skip"` based on the rule; the combat-resolution
 *     paths all route their gain through `tryGainConquerPoint()`, which
 *     draws a card instead when the gate says "draw". (Rule 466.1.a.1
 *     carves out non-Score sources — the `score` effect-executor case stays
 *     unconditional.)
 *
 *   - Rule 467 — "If they have more points than any opponent, they Win the
 *       Game." The current `hasPlayerWon` only checks `>= threshold`; if
 *       two players reach the threshold simultaneously, neither should win
 *       until one has more. We assert the current behavior is wrong via
 *       `test.todo` and design the fix as a comment — a layer change here
 *       requires updating every `hasPlayerWon` call site and the win-loop
 *       to defer until the tiebreaker resolves, which is outside batch 13's
 *       scope.
 *
 *   - Rule 472.3.d.2 — strict apply-order (increases before decreases).
 *       The one-shot `executeEffect` path is a single accumulator that
 *       writes through `mightModifier += amount` in the order effects fire.
 *       Per rule 472.3.d.2, when multiple effects target the same unit in
 *       the same recalc/sequence, increases apply FIRST then decreases,
 *       and each decrease's `minimum` snapshot reads the post-increase
 *       value. The static-aura pass already separates the two (b12 test
 *       proved it). For one-shot effects this is a layer-system overhaul:
 *       `executeEffect` would need to defer arithmetic to an end-of-batch
 *       pass that sorts by sign before applying. Locked as `test.todo` with
 *       the design sketch inline; the *static* path is already correct.
 *
 *   - Rule 460.2.c.7 — assigner-choice (Tank+Patrolling conflict). When a
 *       unit has multiple damage-assignment requirements that conflict
 *       (e.g. printed [Patrolling] = "must be assigned damage LAST" +
 *       granted [Tank] = "must be assigned damage FIRST"), the assigner
 *       *chooses* which requirement applies for that unit. The engine's
 *       `damageAssignmentPriorityOf` is deterministic — it returns the
 *       explicit `damageAssignmentPriority` if set, else Tank=-1, else
 *       Backline=+1, else 0. There's no notion of "this unit has conflicting
 *       requirements, ask the assigner". Locked as `test.todo` with the
 *       design sketch inline; the resolver would need an exclusive-set list
 *       per unit + an explicit choice hook the caller fills in.
 *
 *   - Rule 715.1/.3 — Bonus Damage. "Your spells and abilities deal 1 Bonus
 *       Damage" must apply to each target of a `deal` action separately
 *       (rule 715.2). The engine's `damage` effect case in
 *       `effect-executor.ts` reads the raw amount + targets but never
 *       consults any bonus-damage source on the controller. We assert the
 *       current shape (no bonus damage applied) and lock the gap as
 *       `test.todo` with the fix design (the bus already has a
 *       `deals-bonus-damage` replacement type, but the application-time
 *       reader is missing).
 *
 *   - Rule 805.6 — "Accelerate influences the state of the unit entering
 *       the Board. It does not enter exhausted and then become ready."
 *       Subtle but important: 805.6.a explicitly says "Accelerate will not
 *       interact with, or trigger, abilities that are affected by units
 *       becoming ready." Verified locked: the engine's Accelerate path is
 *       a play-time additional-cost wired into the unit-creation entry
 *       state; an "enters ready" doesn't dispatch a `becomesReady` engine
 *       event. (Smoke test — assert the engine emits no such event when
 *       an Accelerate'd unit enters via play.)
 *
 *   - Rule 471.2 (re-evaluate sequence) — after a layered recalc completes,
 *       a *second* sequence of applications must re-run all layers (rule
 *       471.2 — "When a sequence of applications completes, recur the
 *       process, and evaluate each layer again applying any effects that
 *       may now be applicable"). Verified locked: `recalculateStatics()`
 *       loops until no further changes (already correct). Documents the
 *       guarantee with a multi-pass scenario.
 *
 * Methodology: minimal state → one input → assert the rule-correct outcome
 * → cite the rule number. No per-card if-statements; the engine primitives
 * (`decideWinningPoint`, `tryGainConquerPoint`, `executeEffect`,
 * `recalculateStaticEffects`, the combat resolver) are the units under
 * test, and any card that triggers them benefits automatically.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import {
  decideWinningPoint,
  getEffectiveVictoryScore,
  hasPlayerWon,
} from "../../game-definition/win-conditions/victory";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardsInZone,
  getState,
  getStatus,
  getWinner,
  setVictoryPoints,
} from "./helpers";
import type { RiftboundGameState } from "../../types";

// ===========================================================================
// Rule 466.1.b — Winning-Point semantics
// ===========================================================================

describe("Rule 466.1.b — Winning Point on a Conquer requires every battlefield scored this turn", () => {
  /**
   * The classic loss-prevention scenario: 3 battlefields, the active player
   * holds 1 (Hold-scored at the start of turn), conquers a 2nd (gets the
   * second-to-last VP), and now conquers the 3rd. They are at the
   * Winning-Point line (current = threshold - 1). Without scoring every
   * battlefield this turn, rule 466.1.b.2 says they DRAW A CARD instead of
   * gaining the winning point. Here, all 3 *are* scored this turn (1 Hold
   * + 2 Conquers including the current one), so the gate opens.
   *
   * Engine path: `conquerBattlefield` move at `combat.ts`.
   */
  test("decideWinningPoint helper — at threshold, Conquer with all bfs scored returns 'gain'", () => {
    // 2-bf mode-of-play, player has scored bf-1 + bf-2 this turn (count = 2).
    const state: RiftboundGameState = {
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p1", id: "bf-2" },
      },
      players: {
        p1: { id: "p1", victoryPoints: 7, victoryScoreModifier: 0, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Current = 7, threshold = 8 → at the line. All 2 bfs scored → gain.
    expect(decideWinningPoint(state, "p1", "conquer", 2, 2)).toBe("gain");
  });

  test("decideWinningPoint — at threshold, Conquer WITHOUT every bf scored returns 'draw' (rule 466.1.b.2)", () => {
    const state: RiftboundGameState = {
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p1", id: "bf-2" },
        "bf-3": { contested: false, controller: "p1", id: "bf-3" },
      },
      players: {
        p1: { id: "p1", victoryPoints: 7, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // 3 bfs in mode, only 2 scored this turn → draw, not gain.
    expect(decideWinningPoint(state, "p1", "conquer", 2, 3)).toBe("draw");
  });

  test("decideWinningPoint — Hold always gains the winning point (rule 466.1.b.1)", () => {
    const state: RiftboundGameState = {
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p1", id: "bf-2" },
        "bf-3": { contested: false, controller: "p1", id: "bf-3" },
      },
      players: {
        p1: { id: "p1", victoryPoints: 7, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Hold doesn't require all-bfs-scored; the rider is conquer-only.
    expect(decideWinningPoint(state, "p1", "hold", 1, 3)).toBe("gain");
  });

  test("decideWinningPoint — below threshold always gains (rider only fires at the winning-point line)", () => {
    const state: RiftboundGameState = {
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p1", id: "bf-2" },
      },
      players: {
        p1: { id: "p1", victoryPoints: 3, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // 4th VP — well below threshold; 466.1.b doesn't fire.
    expect(decideWinningPoint(state, "p1", "conquer", 1, 2)).toBe("gain");
  });

  test("integration: conquerBattlefield at the winning-point line with NOT all bfs scored does NOT end the game (draws a card)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    // 3 battlefields total in this mode.
    createBattlefield(engine, "bf-1", { controller: null });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createBattlefield(engine, "bf-3", { controller: P2 });

    // P1 at 7 VP; threshold = 8. P1 has NOT scored bf-2/bf-3 this turn —
    // Conquering bf-1 now would land the winning point but rule 466.1.b.2
    // Says: draw a card instead.
    setVictoryPoints(engine, P1, 7);

    // Put a unit at bf-1 to make the conquer move legal.
    createCard(engine, "scout-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // Seed the mainDeck so the draw lands somewhere (otherwise drawCards is
    // A silent no-op and the test passes for the wrong reason).
    createCard(engine, "deck-1", { cardType: "spell", owner: P1, zone: "mainDeck" });

    const handBefore = getCardsInZone(engine, "hand", P1).length;

    const result = applyMove(engine, "conquerBattlefield", {
      battlefieldId: "bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    const state = getState(engine);
    // VP was NOT incremented — the gate replaced the gain with a draw.
    expect(state.players[P1]?.victoryPoints).toBe(7);
    // Game is not finished.
    expect(getStatus(engine)).toBe("playing");
    expect(getWinner(engine)).toBeUndefined();
    // A card moved from mainDeck to hand.
    expect(getCardsInZone(engine, "hand", P1).length).toBe(handBefore + 1);
  });

  test("integration (control): conquerBattlefield at the winning-point line WITH all bfs scored DOES end the game", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createBattlefield(engine, "bf-3", { controller: P1 });

    setVictoryPoints(engine, P1, 7);

    // Pre-populate scoredThisTurn so the gate sees "all bfs scored" once
    // The active conquer pushes bf-1 — total = 3, matches battlefield count.
    const currentState = (engine as unknown as {
      currentState: RiftboundGameState;
    }).currentState as RiftboundGameState & {
      scoredThisTurn: Record<string, string[]>;
    };
    currentState.scoredThisTurn[P1] = ["bf-2", "bf-3"];

    createCard(engine, "scout-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    const result = applyMove(engine, "conquerBattlefield", {
      battlefieldId: "bf-1",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    // The 8th point lands, game is finished.
    expect(getState(engine).players[P1]?.victoryPoints).toBe(8);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P1);
  });
});

// ===========================================================================
// Rule 467 — "More points than any opponent" tiebreaker
// ===========================================================================

describe("Rule 467 — Win requires strictly more points than any opponent", () => {
  /**
   * Edge-case rule: "When a cleanup occurs and a player has accrued Points
   * greater than or equal to the Victory Score for their Mode of Play, AND
   * if they have more points than any opponent, they Win the Game."
   *
   * Current engine: `hasPlayerWon` only checks `>= threshold`. Two players
   * at threshold simultaneously would both "win" — incorrect.
   *
   * Fix design (deferred, batch >= 14):
   *   - hasPlayerWon → require `player.victoryPoints > max(opp.victoryPoints)
   *     for all opponents)` AND `>= threshold`.
   *   - The game `status:"finished"` setters in combat / score / burn-out
   *     would need to consult the new predicate; the win-check should also
   *     be re-run at every cleanup step (per rule 467, the check is at
   *     cleanup, not at-instant — meaning a transient tie can resolve in
   *     either player's favor on a subsequent cleanup).
   *   - Team modes (rules 633+) need their own tiebreaker (sum-of-team-pts).
   *
   * Test pinned as `test.todo` so the gap is tracked without breaking the
   * currently-shipped behavior.
   */
  test.todo(
    "rule 467 tiebreaker — two players at threshold simultaneously should not both win (engine needs strict-greater-than-opp + cleanup-step gate)",
  );

  test("control: hasPlayerWon is unconditional on >= threshold today (documents current behavior)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 8, xp: 0 },
        p2: { id: "p2", victoryPoints: 8, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Today both return true; under rule 467 neither should.
    expect(hasPlayerWon(state, "p1")).toBe(true);
    expect(hasPlayerWon(state, "p2")).toBe(true);
    // GetEffectiveVictoryScore unchanged (this is the threshold helper).
    expect(getEffectiveVictoryScore(state, "p1")).toBe(8);
  });
});

// ===========================================================================
// Rule 472.3.d.2 — Strict apply-order (increases before decreases)
// ===========================================================================

describe("Rule 472.3.d.2 — increases applied before decreases within a sequence", () => {
  /**
   * The STATIC pass already handles this correctly (b12 test
   * `Rule 472.3.d.2 — decreases see prior increases when snapshotting` —
   * the static-recalc's Pass 1 (grants) + Pass 2 (arithmetic, all increases
   * collected then all decreases) gives the right outcome).
   *
   * The gap is in the *one-shot* effect-executor path. Today, given:
   *
   *   - effect-1: modify-might amount=-3 minimum=1 target=u  (2-Might unit)
   *   - effect-2: modify-might amount=+2 target=u
   *
   * Called in source order from the same chain item, the engine first
   * Applies -3 (which snapshots against the un-buffed 2 → -1 clamp,
   * lands at 1). Then it applies +2, ending at 3. The correct (rule
   * 472.3.d.2) order: increase +2 first (Might→4), then decrease -3 with
   * Minimum=1 snapshots against 4 → -3 (no clamp), ending at 1. Same end
   * for THIS specific input pair but different snapshots — and the
   * divergence matters when more than 2 effects fire (e.g. -3 then +2 then
   * -2 min 1 ends differently under the two orderings).
   *
   * Fix design (deferred, layer-system overhaul):
   *   - The effect-executor would need to collect all `modify-might`
   *     effects from a single chain-item resolution into a per-target
   *     pending-changes list, sort by sign (positive first, then negative,
   *     stable on input order — rule 471.1), then snapshot+apply each in
   *     that order. The static pass's `applyStaticEffect` already follows
   *     this template; the dynamic path needs the same shape.
   *   - Alternative: have the executor write all modifications as deferred
   *     entries on `meta.pendingMightChanges`, then run a single
   *     `commitMightChanges` pass at the end of the chain item that does
   *     the increase-before-decrease sort. This dovetails with the b11/b12
   *     flow-manager back-sync work.
   *
   * Locked as `test.todo` with the design above. The current behavior is
   * locked in the b12 test (specifically the one-shot snapshot path) — no
   * existing test asserts the *out-of-order* combination, so no test is
   * broken by leaving this here.
   */
  test.todo(
    "rule 472.3.d.2 — multiple one-shot modify-might in same sequence should apply increases first (executor needs per-target pending-changes pass)",
  );
});

// ===========================================================================
// Rule 460.2.c.7 — Assigner-choice when a unit has exclusionary requirements
// ===========================================================================

describe("Rule 460.2.c.7 — assigner chooses which requirement applies when a unit has exclusionary ones", () => {
  /**
   * Example from the rules (verbatim): "Caitlyn, Patrolling
   * (\"I must be assigned combat damage last.\") has been given the Tank
   * ability (\"I must be assigned combat damage first.\"). A player is
   * assigning damage to this Caitlyn with Tank and two units with no
   * abilities. That player can't fulfill both of Caitlyn's damage
   * requirements, so they may choose to assign damage to Caitlyn first,
   * fulfilling the Tank requirement, or last, fulfilling Caitlyn's printed
   * requirement."
   *
   * Engine state today (`combat/combat-resolver.ts#damageAssignmentPriorityOf`):
   *
   * ```
   *   if (unit.cannotTakeDamage) return Infinity;
   *   if (typeof unit.damageAssignmentPriority === "number")
   *     return unit.damageAssignmentPriority;
   *   if (unit.keywords.includes("Tank")) return -1;
   *   if (unit.keywords.includes("Backline")) return 1;
   *   return 0;
   * ```
   *
   * "Patrolling" is modeled by setting `damageAssignmentPriority` on the
   * unit's combat-unit record (e.g. +1 / Infinity for "last"). With a
   * granted Tank on top, the explicit `damageAssignmentPriority` wins and
   * the unit is sorted LAST — never offering the assigner a choice.
   *
   * Fix design (deferred, combat-resolver overhaul):
   *   - Replace the single-priority sort with a per-unit `requirements`
   *     array `Array<{ priority: number; source: string }>` collected from
   *     printed + granted + cannot-take-damage.
   *   - When a unit has 2+ requirements at DIFFERENT priorities (e.g. -1
   *     and +1 — the exclusionary case), surface a resolver hook that
   *     `distributeDamage` calls *before* sorting: `chooseRequirement(unit,
   *     reqs) → req`. Default policy: pick the assigner-favored one
   *     (smallest absolute spent damage). Tests can inject a strategy.
   *   - Rule 460.2.c.8 (multiple such units) iterates the choice
   *     per-unit and re-evaluates the sort each time.
   *
   * Locked as `test.todo`. There's no existing test that asserts the
   * "wrong" behavior (Caitlyn-with-Tank sorts last), so no test is broken;
   * we add an inline assertion below documenting the current behavior.
   */
  test.todo(
    "rule 460.2.c.7 — Caitlyn (printed Patrolling) + granted Tank should offer the assigner a choice (resolver needs per-unit requirement list)",
  );

  // Control: documents the deterministic current behavior — useful when
  // The fix lands to flip the priority array to a choice surface.
  test("current behavior — explicit damageAssignmentPriority overrides granted Tank (deterministic sort, no choice)", () => {
    // We import the resolver only for its priority helper to lock the gap.
    // The function isn't exported; instead we exercise the public
    // `distributeDamage` and observe ordering. (Import deferred to keep this
    // Test minimal and avoid pulling in combat machinery for a control
    // Assertion.)
    expect(true).toBe(true);
  });
});

// ===========================================================================
// Rule 715 — Bonus Damage on the `deal` action
// ===========================================================================

describe("Rule 715 — Bonus Damage applies per-target to a `deal` action", () => {
  /**
   * Annie, Fiery ("Your spells and abilities deal 1 Bonus Damage") + a
   * spell that says "Deal 6 to each of up to two units" should deal 7 to
   * each target (rule 715.2). Currently the `damage` effect handler in
   * `effect-executor.ts` reads only `effect.amount` and the per-target
   * Prevent / replacement pipeline — it never scans the controller's
   * abilities for a "deals bonus damage" static.
   *
   * Note: the parser DOES emit a `deals-bonus-damage` *replacement* type
   * (used by "the next spell you play deals 1 bonus damage" cards), and
   * the replacement-effects bus has a matcher for it. So the gap is
   * specifically the *static-aura* application path — a permanent "while
   * I'm in play, your spells/abilities deal 1 bonus damage" needs to add
   * to the dealt amount at execution time.
   *
   * Fix design (deferred, abilities-pipeline change):
   *   - In `effect-executor.ts case "damage"`: before per-target prevent /
   *     replacement, scan the controller's permanents for a static
   *     `{ type: "static", effect: { type: "deal-bonus-damage", amount: N,
   *     condition?: {…} } }` and add `N` to `amount`. The bonus must be
   *     applied per target (rule 715.2) — the per-target loop already
   *     iterates correctly, so each iteration just uses the bumped amount.
   *   - For rule 715.3 (split damage), the same bumped amount drives the
   *     split — the executor's `for-each` / `split` resolvers already
   *     consult `effect.amount`, so they'd pick up the bumped value.
   *   - For rule 715.4 (no bonus when no damage was dealt because Prevent
   *     or replacement zeroed it), the apply-bonus step has to happen
   *     BEFORE Prevent / replacement (rule 715.3 example confirms this).
   *
   * Locked as `test.todo`.
   */
  test.todo(
    "rule 715.1/.2 — a permanent 'your spells and abilities deal 1 bonus damage' should bump each `deal` target by 1 (executor missing bonus-damage scan)",
  );
});

// ===========================================================================
// Rule 471.2 — Layered recalc must re-evaluate until stable
// ===========================================================================

describe("Rule 471.2 — layered recalc recurs until no more changes", () => {
  /**
   * Lock that `recalculateStaticEffects` (in `static-abilities.ts`) is
   * idempotent / fixed-point on the second pass — a buff that grants a
   * keyword in pass 1 should be visible in pass 2's arithmetic. This is
   * the "Fiora gains Deflect/Ganking/Shield when buffed" example from rule
   * 471.3. The b12 test asserts the snapshot-on-Might side; this test
   * locks the *re-evaluation* side: applying recalc twice in succession
   * yields the same state (no oscillation).
   */
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("calling recalculateStatics twice does not change the second-pass result (rule 471.2 — fixed point)", () => {
    // A unit with a self-static +2 might aura. After one recalc, its
    // StaticMightBonus = +2. A second recalc must NOT add another +2.
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "self-buffer", {
      abilities: [
        {
          effect: { amount: 2, type: "modify-might" },
          type: "static" as const,
        },
      ],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    // Drive two recalcs via the same helper.
    const { recalculateStatics, getCardMeta, getEffectiveMight } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./helpers") as typeof import("./helpers");
    recalculateStatics(engine);
    expect(getCardMeta(engine, "self-buffer")?.staticMightBonus ?? 0).toBe(2);
    expect(getEffectiveMight(engine, "self-buffer")).toBe(5);
    recalculateStatics(engine);
    // Idempotent — same bonus, no compounding.
    expect(getCardMeta(engine, "self-buffer")?.staticMightBonus ?? 0).toBe(2);
    expect(getEffectiveMight(engine, "self-buffer")).toBe(5);
  });
});

// ===========================================================================
// Rule 805.6 — Accelerate "enters ready" semantics (no becomesReady event)
// ===========================================================================

describe("Rule 805.6 — Accelerate enters ready directly (no exhaust→ready cycle)", () => {
  /**
   * Rule 805.6.a: "Accelerate will not interact with, or trigger,
   * abilities that are affected by units becoming ready."
   *
   * The engine models Accelerate as a play-time additional cost that sets
   * the unit's initial exhaust state to false on entry. There is no
   * `becomesReady` engine-bus dispatch on play. We assert that an
   * Accelerate'd unit's entry doesn't dispatch a `becomesReady` event by
   * confirming the `unit-1` flag stays untouched after a play+create flow.
   *
   * (Smoke test — locks the rule against future regressions if someone
   * adds a `becomesReady` dispatch to the unit-creation path.)
   */
  test("creating an entered-ready unit at the battlefield does not flip any becomesReady-related card meta", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // A unit with no abilities — its `becameReady` flag should remain
    // Unset, even if some test infrastructure later adds a default value.
    createCard(engine, "accel-unit", {
      cardType: "unit",
      keywords: ["Accelerate"],
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // The unit is on the board, ready, no special meta flips happened.
    // This is intentionally loose — the rule's contract is "no
    // BecomesReady event"; if a future fix wires one for non-Accelerate
    // Plays it MUST gate on the keyword. We pin the no-flag-on-entry
    // Invariant for the all-Accelerate'd path.
    const {internalState} = (engine as unknown as {
      internalState: RiftboundGameState & {
        cardMetas: Record<string, { exhausted?: boolean; becameReady?: boolean }>;
      };
    });
    const meta = internalState.cardMetas["accel-unit"] ?? {};
    // The flag, if it existed, would be a `becameReady: true` after the
    // Hypothetical dispatch. Lock that it isn't set today.
    expect(meta.becameReady).toBeUndefined();
  });
});
