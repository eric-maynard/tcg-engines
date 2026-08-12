/**
 * Interaction: two cards that key off "within 3 points of the Victory Score" × a battlefield that
 * MOVES the Victory Score, across the two games of a Bo3.
 *
 *   Poppy, Paragon   (unl-116-219) — Champion Unit, Body, [5], 5 Might. "[Deflect] … When you play
 *                     me, if an opponent's score is within 3 points of the Victory Score, ready me
 *                     and gain 3 XP."
 *   Find Your Center (ogn-047-298) — Spell, Calm, [3], [Action]. "If an opponent's score is within
 *                     3 points of the Victory Score, this costs [2] less. Draw 1 and channel 1
 *                     rune exhausted."
 *   Aspirant's Climb (ogn-276-298) — Battlefield. "Increase the points needed to win the game by 1."
 *
 * Q: with the Climb in play in game 1, is "within 3" recomputed against 9 — so an opponent on 5 is
 * NOT within 3 (5 < 9−3) while an opponent on 6 flips both cards? And once the Climb is out of the
 * match for game 2 (486.5), does the SAME opponent score of 5 satisfy "within 3" of 8, flipping
 * Poppy's trigger and Find Your Center's pay line the other way?
 *
 * Rules: 194.3 / 194.3.a (the Victory Score is a live, board-derived value card effects may alter),
 * 486.3 / 485.3 (the mode default of 8), 486.5 (a decided game's battlefields leave the match),
 * 809.1.d ([Deflect]: the mandatory [rainbow] surcharge is shown in the CHOOSER's pay line, and an
 * entry is dropped only when nothing could fund it), 355.8 / 357.1.a / 358.3.a (an offer is never a
 * dead end: an unpayable play is listed with its pay line, or reachable with what is still owed),
 * 383.2.a.1 (an "if …" clause immediately after the trigger condition is part of the Condition, so
 * out of range the ability is never put on the chain at all).
 */
import { describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import type { RiftboundMoves } from "../../../game-definition/moves";
import type { ActionDecision, HarnessEngine } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";

const POPPY = "unl-116-219";
const FIND_YOUR_CENTER = "ogn-047-298";
const CLIMB = "ogn-276-298";

/** The app's battlefield-id shape (`${playerId}-bf-${defId}`) — server/match.ts reads the defId back out. */
const P1_CLIMB = `${P1}-bf-${CLIMB}`;
const P2_BF = `${P2}-bf-ogn-294-298`;

/** Inline 1-energy action spell, used only to look at an OPPONENT's pay line for [Deflect]. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * The same position in "game 1" (Aspirant's Climb seated as a real battlefield: Victory Score 9)
 * and in "game 2" (the Climb is out of the match under 486.5: Victory Score 8).
 */
function board(opts: { climb: boolean; oppPoints: number; energy?: number }) {
  const s = scenario()
    .victoryScore(8) // rule 485.3 / 486.3 — the mode default the Climb modifies
    .points(P2, opts.oppPoints)
    .resources(P1, { energy: opts.energy ?? 5 })
    .battlefield("bf1", opts.climb ? { controller: P1, def: CLIMB, inert: false, owner: P1 } : { controller: P1, owner: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, POPPY, "poppy");
  return s;
}

function fycBoard(opts: { climb: boolean; oppPoints: number; energy: number }) {
  return scenario()
    .victoryScore(8)
    .points(P2, opts.oppPoints)
    .resources(P1, { energy: opts.energy })
    .battlefield("bf1", opts.climb ? { controller: P1, def: CLIMB, inert: false, owner: P1 } : { controller: P1, owner: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, FIND_YOUR_CENTER, "fyc");
}

/** An opponent-side board where P2 wants to bolt Poppy — the [Deflect] pay line lives here. */
function deflectBoard(climb: boolean, power?: Record<string, number>) {
  const s = scenario()
    .victoryScore(8)
    .active(P2)
    .resources(P2, power ? { energy: 1, power } : { energy: 1 })
    .battlefield("bf1", climb ? { controller: P1, def: CLIMB, inert: false, owner: P1 } : { controller: P1, owner: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", POPPY, "poppy")
    .unit(P1, "base", { might: 3, name: "Plain" }, "plain")
    .hand(P2, BOLT, "bolt");
  if (!power) {
    s.runes(P2, "fury", 2);
  }
  return s;
}

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/** The `targets` field of P2's bolt: option order plus the per-option [Deflect] surcharge. */
function bolTargets(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  const f = game.p2.option("cast", "bolt")?.fields.find((x) => x.name === "targets");
  const options = (f?.options ?? []).map((v) => (Array.isArray(v) ? (v[0] as string) : (v as string)));
  const surcharge = f?.surcharge ?? [];
  const unaffordable = f?.unaffordable ?? [];
  return {
    needsAdd: f?.needsAdd,
    surchargeOf: (id: string) => surcharge[options.indexOf(id)],
    options,
    unaffordableOf: (id: string) => unaffordable[options.indexOf(id)],
  };
}

describe("Poppy / Find Your Center 'within 3 of the Victory Score' × Aspirant's Climb", () => {
  // -------------------------------------------------------------------------
  // 1 — the threshold itself
  // -------------------------------------------------------------------------
  test("194.3 / 194.3.a — the Climb makes the effective Victory Score 9 for BOTH seats; without it the mode default 8 stands", async () => {
    const g1 = await board({ climb: true, oppPoints: 5 }).build();
    expect(effectiveVictoryScore(g1.gameState, P1 as never)).toBe(9);
    expect(effectiveVictoryScore(g1.gameState, P2 as never)).toBe(9);
    // `state.victoryScore` stays the printed mode default — the Climb rides as a modifier,
    // so anything that caches the raw number reads a stale threshold.
    expect(g1.gameState.victoryScore).toBe(8);

    const g2 = await board({ climb: false, oppPoints: 5 }).build();
    expect(effectiveVictoryScore(g2.gameState, P1 as never)).toBe(8);
    expect(effectiveVictoryScore(g2.gameState, P2 as never)).toBe(8);
  });

  // -------------------------------------------------------------------------
  // 2 — game 1, opponent on 5: 9 − 5 = 4 > 3, so BOTH clauses are off
  // -------------------------------------------------------------------------
  test("game 1 (VS 9), opponent on 5 — Poppy enters EXHAUSTED with no XP", async () => {
    const game = await board({ climb: true, oppPoints: 5 }).build();
    expect(game.p1.xp()).toBe(0);
    await game.p1.play("poppy");
    // 383.2.a.1 — the "if …" clause sits immediately after the trigger condition, so it is part of
    // the Condition: out of range the ability is not put on the chain at all (this is what the
    // per-card test unl-116-219.test.ts pins too). Nothing to resolve, nothing to render.
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.state("poppy").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("game 1 (VS 9), opponent on 5 — Find Your Center is offered at its FULL printed [3]: 2 energy is not enough and 3 is charged", async () => {
    const short = await fycBoard({ climb: true, energy: 2, oppPoints: 5 }).build();
    expect(short.p1.can("cast", "fyc")).toBe(false);

    const game = await fycBoard({ climb: true, energy: 3, oppPoints: 5 }).build();
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0); // the full [3]
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
  });

  // -------------------------------------------------------------------------
  // 3 — game 1, opponent on 6: 9 − 6 = 3, so BOTH clauses flip on
  // -------------------------------------------------------------------------
  test("game 1 (VS 9), opponent on 6 — Poppy READIES and P1 gains exactly 3 XP", async () => {
    const game = await board({ climb: true, oppPoints: 6 }).build();
    await game.p1.play("poppy");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poppy", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("poppy").isReady).toBe(true);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
  });

  test("game 1 (VS 9), opponent on 6 — the [2] reduction is visible in the pay line BEFORE committing: 1 energy is enough and only 1 is charged", async () => {
    // The reduction has to be readable from the menu, not applied silently at resolution: at 1
    // energy the card is a legal action at all only because the discount is already priced in.
    const game = await fycBoard({ climb: true, energy: 1, oppPoints: 6 }).build();
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");

    const spare = await fycBoard({ climb: true, energy: 3, oppPoints: 6 }).build();
    await spare.p1.cast("fyc");
    expect(spare.p1.energy()).toBe(2); // charged 1, not 3
  });

  // -------------------------------------------------------------------------
  // 4 — [Deflect] in the OPPONENT's pay line, in both games
  // -------------------------------------------------------------------------
  test("809.1.d — an opponent choosing Poppy is shown the mandatory [rainbow] surcharge in ITS OWN pay line, in game 1 and in game 2 alike", async () => {
    for (const climb of [true, false]) {
      const rich = await deflectBoard(climb, { rainbow: 1 }).build();
      const t = bolTargets(rich);
      expect(t.options).toEqual(expect.arrayContaining(["poppy", "plain"]));
      expect(t.surchargeOf("poppy")).toBe(1); // the [Deflect] tax, priced per candidate
      expect(t.surchargeOf("plain")).toBe(0);
      await rich.p2.cast("bolt", { targets: "poppy" });
      expect(rich.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });

      // 809.1.d — with the power only REACHABLE (two ready runes, empty pool) Poppy stays listed
      // and dimmed with what is still owed; she is dropped only when nothing could fund her.
      const poor = await deflectBoard(climb).build();
      const p = bolTargets(poor);
      expect(p.options).toContain("poppy");
      expect(p.unaffordableOf("poppy")).toBe(true);
      expect(p.unaffordableOf("plain")).toBe(false);
      expect(p.needsAdd?.power).toEqual({ rainbow: 1 });
      expect((await poor.p2.try((s) => s.cast("bolt", { targets: "poppy" }))).ok).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // 5 — 486.5: the Climb leaves the match, and the identical score flips both cards
  // -------------------------------------------------------------------------
  test("486.5 — P1 wins game 1 AT the Climb, so the Climb is removed for the rest of the match and cannot be presented again", async () => {
    const game = await scenario()
      .victoryScore(8)
      .turn(2)
      .active(P2)
      .points(P1, 8) // one hold short of the Climb's 9
      .battlefield(P1_CLIMB, { controller: P1, def: CLIMB, inert: false, owner: P1 })
      .battlefield(P2_BF, { controller: P2, owner: P2 })
      .unit(P1, P1_CLIMB, { might: 2, name: "Holder" }, "holder")
      .unit(P2, P2_BF, { might: 2, name: "Blocker" }, "blocker")
      .build();
    expect(effectiveVictoryScore(game.gameState, P1 as never)).toBe(9);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);

    expect(mv(game.engine, "startNextGame", P1).success).toBe(true);
    const used = game.gameState.match?.usedBattlefields ?? [];
    expect(used).toContain(P1_CLIMB); // the Climb, by the id the picker would offer it under
    expect(used).toContain(P2_BF);
    expect(game.gameState.match?.gameNumber).toBe(2);
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);
  });

  test("game 2 (Climb gone, VS 8) — the SAME opponent score of 5 now IS within 3: Poppy readies + 3 XP and Find Your Center costs [1]", async () => {
    const poppy = await board({ climb: false, oppPoints: 5 }).build();
    await poppy.p1.play("poppy");
    expect(poppy.chain()).toEqual([expect.objectContaining({ cardId: "poppy", triggered: true })]);
    await poppy.settle();
    expect(poppy.state("poppy").isReady).toBe(true);
    expect(poppy.p1.xp()).toBe(3);

    const fyc = await fycBoard({ climb: false, energy: 1, oppPoints: 5 }).build();
    expect(fyc.p1.can("cast", "fyc")).toBe(true); // stale threshold of 9 would refuse this
    await fyc.p1.cast("fyc");
    expect(fyc.p1.energy()).toBe(0);
    await fyc.settle();
    expect(fyc.zoneOf("fyc")).toBe("trash");
  });

  // -------------------------------------------------------------------------
  // 6 — neither card ever produces a prompt with no legal answer
  // -------------------------------------------------------------------------
  test("355.8 / 357.1.a / 358.3.a — an unpayable Find Your Center is never hidden or dead-ended: it is listed as reachable with what is still owed, beside a legal menu", async () => {
    // Discounted to [1] (opponent on 6 of 8) but the pool is empty: the seat still has actions.
    const game = await scenario()
      .victoryScore(8)
      .points(P2, 6)
      .resources(P1, { energy: 0 })
      .runes(P1, "calm", 2)
      .hand(P1, FIND_YOUR_CENTER, "fyc")
      .build();
    expect(game.p1.can("cast", "fyc")).toBe(false);
    const d = game.p1.decision() as ActionDecision;
    const reachable = d.reachablePlays ?? [];
    expect(reachable.map((r) => r.card)).toContain("fyc");
    expect(reachable.find((r) => r.card === "fyc")?.needsAdd).toMatchObject({ energy: 1 });
    // and the menu that would satisfy it is right there — never an empty answer set.
    expect(game.p1.legal().some((o) => o.moveId === "exhaustRune")).toBe(true);
    expect(game.p1.legal().some((o) => o.moveId === "endTurn")).toBe(true);

    // Paying it off through the offered Add makes the very same play legal.
    await game.p1.tapRune();
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
