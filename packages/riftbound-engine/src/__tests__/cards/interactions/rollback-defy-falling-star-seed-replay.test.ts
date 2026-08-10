/**
 * Interaction (headless-harness invariants, no undo):
 *     Defy (ogn-045-298, Calm Reaction, 1+[calm]) "Counter a spell that costs no more than [4] and no
 *       more than [rainbow]."
 *   × Falling Star (ogn-029-298, Fury spell, 2+[fury][fury]) "Deal 3 to a unit. Deal 3 to a unit."
 *   × Stand United (ogn-053-298, Calm spell, 3) "[Hidden] [Action] Buff a friendly unit. …"
 *
 * Question: a scripted game with fixed seed S — a couple of turns of channel / draw / play, then P1 pays
 * for Falling Star out of its runes and casts it at two of P2's units and passes; P2 holds priority.
 * Snapshot X. Now submit, in order, and expect each to be REJECTED: (1) P2 Defy → Falling Star (2 power
 * > "no more than [rainbow]"); (2) P2 hides Stand United at a battlefield P2 does not control; (3) P2 casts
 * Stand United from hand now ([Action], Closed state, not P2's turn); (4) P1 — who does not hold priority
 * — casts a second Falling Star; (5) P2 Defy again after exhausting its calm rune. After each rejection
 * compare the state to X. Then P2 passes, Falling Star resolves, play on until P2 concedes. Finally re-run
 * the accepted-decision sequence from seed S in a fresh engine — with and without the illegal attempts
 * interleaved — and compare final states.
 *
 * Rules: 358.1 (target legality — Falling Star is not a legal choice for Defy), 358.2 (costs must be
 * paid), 358.4 (timing permission — an [Action] card cannot join an existing chain outside a showdown),
 * 358.5 ("the actions taken in this process are undone and the action is cancelled"), 421.1 / 811 (Hide
 * only at a battlefield you control), FEPR / 340 (only the priority holder adds to the chain), 650 / 651.1
 * (concession ends the game with a single winner), 196 (deterministic, reproducible game state).
 * Expected: every rejected submission is observationally a no-op — identical serialized state, no
 * accepted-log entry, same pending decision / priority holder / legal menu, no randomness consumed — the
 * engine is not wedged afterwards, and replay from S is byte-identical with or without the noise.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, FullSnapshot, Game, Seat } from "../../../harness";
import { P1, P2, replayTranscript, scenario, takeSnapshot } from "../../../harness";

const DEFY = "ogn-045-298";
const FALLING_STAR = "ogn-029-298";
const STAND_UNITED = "ogn-053-298";
const VOID_SEEKER = "ogn-024-298"; // 3+[fury] Action spell — a spell Defy CAN counter (contrast)
const RECRUIT = { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }; // P2's turn-3 draw & play
const SEED = "S-358.5-rollback";

function board() {
  return scenario({ seed: SEED })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "u1") // dies to 3
    .unit(P2, "bf1", { might: 4, name: "Four" }, "u2") // survives 3, healed at end of turn
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine") // P1 controls bf2 — P2 does NOT
    .runes(P1, "fury", 2) // + 2 channeled on turn 4 = 4 fury runes → 2 energy + [fury][fury]
    .rune(P2, "calm", { alias: "calmRune" }) // P2's only calm source
    .hand(P1, FALLING_STAR, "star")
    .hand(P1, FALLING_STAR, "star2")
    .hand(P2, DEFY, "defy")
    .hand(P2, STAND_UNITED, "stand")
    .deck(P2, [RECRUIT], ["recruit"]); // P2 draws and plays this on turn 3
}

/** Turns 2→4: P1 ends; P2 holds bf1, channels 2, draws Recruit, taps 2 fury runes, plays it, ends; P1 holds bf2, channels 2, draws. */
async function openingTurns(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.tapRune({ domain: "fury" });
  await game.p2.tapRune({ domain: "fury" });
  await game.p2.play("recruit", { to: "base" });
  await game.settle();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.turnNumber()).toBe(4);
}

/** P1 pays 2 + [fury][fury] out of its four fury runes, casts Falling Star at u1 + u2 and passes → P2 holds priority. */
async function castStarAndPass(game: Game): Promise<void> {
  await game.p1.tapRune();
  await game.p1.tapRune();
  await game.p1.recycleRune();
  await game.p1.recycleRune();
  expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  await game.p1.cast("star", { targets: ["u1", "u2"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

async function reachX(): Promise<Game> {
  const game = await board().build();
  await openingTurns(game);
  await castStarAndPass(game);
  return game;
}

interface Checkpoint {
  readonly hash: string;
  readonly snap: FullSnapshot;
  readonly seq: number;
  readonly steps: number;
  readonly decision: Decision | null;
  readonly acting: Seat | undefined;
  readonly p1Legal: string[];
  readonly p2Legal: string[];
  readonly historySuccesses: number;
}

function checkpoint(game: Game): Checkpoint {
  return {
    acting: game.actingSeat(),
    decision: game.decision(),
    hash: game.stateHash(),
    historySuccesses: game.engine.getHistory().filter((h) => (h as { success?: boolean }).success !== false).length,
    p1Legal: game.p1.legal().map((o) => o.key),
    p2Legal: game.p2.legal().map((o) => o.key),
    seq: game.seq,
    snap: takeSnapshot(game.engine),
    steps: game.transcript().steps.length,
  };
}

/** The state is byte-for-byte the checkpoint: nothing moved, nothing paid, nothing logged as accepted, same cursor. */
function expectUnchanged(game: Game, cp: Checkpoint): void {
  expect(game.stateHash()).toBe(cp.hash);
  expect(takeSnapshot(game.engine)).toEqual(cp.snap);
  expect(game.seq).toBe(cp.seq);
  expect(game.transcript().steps).toHaveLength(cp.steps);
  expect(game.decision()).toEqual(cp.decision);
  expect(game.actingSeat()).toBe(cp.acting);
  expect(game.p1.legal().map((o) => o.key)).toEqual(cp.p1Legal);
  expect(game.p2.legal().map((o) => o.key)).toEqual(cp.p2Legal);
  expect(game.engine.getHistory().filter((h) => (h as { success?: boolean }).success !== false).length).toBe(cp.historySuccesses);
}

/** Submit a raw move to the ENGINE (bypassing the harness menu) and demand a rejection. */
async function submitIllegal(game: Game, seat: Seat, moveId: string, params: Record<string, unknown>): Promise<void> {
  const r = await game.seat(seat).try((p) => p.do(moveId, { ...params }));
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe("ENGINE_REJECTED");
  }
}

/** The four attempts made at X, in order. */
const ILLEGAL_AT_X: readonly (readonly [Seat, string, Record<string, unknown>])[] = [
  [P2, "playSpell", { cardId: "defy", targets: ["star"] }], // (1) Defy → Falling Star
  [P2, "hideCard", { battlefieldId: "bf2", cardId: "stand" }], // (2) hide at a battlefield P2 does not control
  [P2, "playSpell", { cardId: "stand", targets: ["u2"] }], // (3) [Action] spell onto an existing chain, not P2's turn
  [P1, "playSpell", { cardId: "star2", targets: ["u2", "mine"] }], // (4) P1 without priority
];

/**
 * The whole scripted game. With `noise`, the five illegal submissions are interleaved at X / X' / X''
 * (each asserted to be a no-op); without it only the accepted decisions are taken.
 */
async function fullRun(noise: boolean): Promise<Game> {
  const game = await reachX();
  if (noise) {
    const x = checkpoint(game);
    for (const [seat, moveId, params] of ILLEGAL_AT_X) {
      await submitIllegal(game, seat, moveId, params);
      expectUnchanged(game, x);
    }
  }
  await game.p2.tapRune("calmRune"); // accepted: P2 exhausts its calm rune for 1 energy → X'
  if (noise) {
    const x1 = checkpoint(game);
    await submitIllegal(game, P2, "playSpell", { cardId: "defy", targets: ["star"] }); // (5)
    expectUnchanged(game, x1);
  }
  await game.p2.recycleRune("calmRune"); // accepted: now 1 energy + [calm] — Defy fully affordable → X''
  if (noise) {
    const x2 = checkpoint(game);
    await submitIllegal(game, P2, "playSpell", { cardId: "defy", targets: ["star"] }); // (1') cost is no excuse now
    expectUnchanged(game, x2);
  }
  await game.p2.passPriority(); // Falling Star resolves
  await game.settle();
  await game.advanceTurn(); // → P2's turn 5
  await game.p2.concede();
  return game;
}

describe("Defy × Falling Star × Stand United — rejected submissions are no-ops; seed replay is byte-identical", () => {
  test("snapshot X: turn 4, Falling Star (paid from P1's runes) is the only chain item naming u1+u2, P1 has passed, P2 holds priority in a Closed state; P2's menu is pass / concede / rune abilities only — no Defy, no Stand United (cast or hide); P1 has nothing to play", async () => {
    const game = await reachX();
    expect(game.turnNumber()).toBe(4);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1, targets: ["u1", "u2"], triggered: false })]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.legal().map((o) => o.key).sort()).toEqual(
      ["concede:-", "exhaustRune:calmRune", "passChainPriority:-", "recycleRune:calmRune", "recycleRune:player-2:rune0", "recycleRune:player-2:rune1"].sort(),
    );
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "stand")).toBe(false);
    expect(game.p2.can("hide", "stand")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("cast");
    expect(game.p1.can("cast", "star2")).toBe(false);
    // the opening really happened: both holds scored, Recruit played, P1 drew
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.p1.hand()).toEqual(["star2", "player-1:filler0"]);
  });

  test("(1) P2's Defy → Falling Star fails target legality (358.1: [fury][fury] > 'no more than [rainbow]'): the verb throws, the raw engine submission is REJECTED, and the state is byte-identical to X — Defy in hand, P2's pool and runes untouched, chain exactly [Falling Star], priority still P2's", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    await expect(game.p2.cast("defy", { targets: "star" })).rejects.toThrow();
    expectUnchanged(game, x);
    await submitIllegal(game, P2, "playSpell", { cardId: "defy", targets: ["star"] });
    expectUnchanged(game, x);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("calmRune")).toMatchObject({ isReady: true, zone: "runePool" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    expect(game.actingSeat()).toBe(P2);
  });

  test("(2) P2 hiding Stand United at bf2 — a battlefield P1 controls — is rejected (421.1 / 811): Stand United stays in hand, no [rainbow] paid, facedown-bf2 empty, state == X", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    await expect(game.p2.hide("stand", "bf2")).rejects.toThrow();
    await submitIllegal(game, P2, "hideCard", { battlefieldId: "bf2", cardId: "stand" });
    expectUnchanged(game, x);
    expect(game.zoneOf("stand")).toBe("hand");
    expect(game.p2.facedown("bf2")).toEqual([]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("(3) P2 casting Stand United from hand NOW is rejected (358.4: an [Action] card needs [Reaction] to join an existing chain; it is not P2's turn nor a showdown): full rollback, state == X", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    await expect(game.p2.cast("stand", { targets: "u2" })).rejects.toThrow();
    await submitIllegal(game, P2, "playSpell", { cardId: "stand", targets: ["u2"] });
    expectUnchanged(game, x);
    expect(game.zoneOf("stand")).toBe("hand");
    expect(game.state("u2").isBuffed).toBe(false);
  });

  test("(4) P1 — who passed and does not hold priority — submitting a second Falling Star is rejected (only the priority holder adds to the chain; Falling Star is neither Action nor Reaction): star2 in hand, chain still one item, P2 still to act, state == X", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    expect(game.p1.isActing()).toBe(false);
    await expect(game.p1.cast("star2", { targets: ["u2", "mine"] })).rejects.toThrow();
    await submitIllegal(game, P1, "playSpell", { cardId: "star2", targets: ["u2", "mine"] });
    expectUnchanged(game, x);
    expect(game.zoneOf("star2")).toBe("hand");
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P2);
  });

  test("(5) after P2 EXHAUSTS its calm rune (accepted → X′: 1 energy, no [calm]) Defy is still rejected with state == X′ (358.2 — nothing half-paid); after P2 also RECYCLES it (X″: exactly 1 + [calm], Defy fully affordable) Defy is STILL not offered and a raw submission is rejected with state == X″ — cost was never the reason, the target is (358.1)", async () => {
    const game = await reachX();
    await game.p2.tapRune("calmRune");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.actingSeat()).toBe(P2); // rune abilities do not pass priority
    const x1 = checkpoint(game);
    expect(game.p2.can("cast", "defy")).toBe(false);
    await submitIllegal(game, P2, "playSpell", { cardId: "defy", targets: ["star"] });
    expectUnchanged(game, x1);
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} }); // no partial payment / refund artefacts

    await game.p2.recycleRune("calmRune");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.zoneOf("calmRune")).toBe("runeDeck");
    const x2 = checkpoint(game);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.option("cast", "defy")).toBeUndefined(); // Falling Star is not even offered as a target
    await submitIllegal(game, P2, "playSpell", { cardId: "defy", targets: ["star"] });
    expectUnchanged(game, x2);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("all five rejections in sequence at X leave X intact each time, and the engine's own audit history only ever gained FAILED entries (no partial / accepted log lines); the accepted-decision transcript did not grow", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    const histBefore = game.engine.getHistory().length;
    for (const [seat, moveId, params] of ILLEGAL_AT_X) {
      await submitIllegal(game, seat, moveId, params);
      expectUnchanged(game, x);
    }
    const added = game.engine.getHistory().slice(histBefore) as { success?: boolean; moveId?: string }[];
    expect(added.every((h) => h.success === false)).toBe(true);
    expect(game.transcript().steps).toHaveLength(x.steps);
    expect(game.transcript().steps.every((s) => s.ok)).toBe(true);
  });

  test("not wedged: after the rejections P2 passes → Falling Star resolves normally (3 to u1 → killed by Cleanup; 3 to u2 (4) → survives damaged; star → trash), P1 is back in an open main phase; end of turn heals u2; P2 concedes → game over with exactly one winner, P1 (650/651.1); no invariant violations", async () => {
    const game = await reachX();
    const x = checkpoint(game);
    for (const [seat, moveId, params] of ILLEGAL_AT_X) {
      await submitIllegal(game, seat, moveId, params);
    }
    expectUnchanged(game, x);
    await game.p2.passPriority();
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.state("u2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("mine").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "star2")).toBe(false); // no resources left — but the menu is live
    expect(game.p1.legal().map((o) => o.key)).toContain("endTurn:-");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("u2").damage).toBe(0);
    expect(game.isOver()).toBe(false);
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("determinism — replaying the clean run's accepted-decision list from seed S in a FRESH engine reproduces every per-step hash and the final state (same winner, same deck/trash orders, same card ids)", async () => {
    const clean = await fullRun(false);
    const t = clean.transcript();
    expect(t.origin.kind).toBe("scenario");
    expect((t.origin as { spec?: { seed?: string } }).spec?.seed).toBe(SEED);
    expect(t.steps.length).toBeGreaterThanOrEqual(16);
    expect(t.steps.every((s) => s.ok)).toBe(true);
    expect(t.finalHash).toBe(clean.stateHash());

    const rep = await replayTranscript(t);
    expect(rep.divergedAt).toBeUndefined();
    expect(rep.divergence).toBeUndefined();
    expect(rep.stepsApplied).toBe(t.steps.length);
    expect(rep.finalHashMatches).toBe(true);
    expect(rep.game.stateHash()).toBe(clean.stateHash());
    expect(rep.game.winner()).toBe(P1);
    expect(rep.game.isOver()).toBe(true);
    expect(rep.game.p1.deck()).toEqual(clean.p1.deck());
    expect(rep.game.p2.deck()).toEqual(clean.p2.deck());
    expect(rep.game.p1.runeDeck()).toEqual(clean.p1.runeDeck());
    expect(rep.game.p2.runeDeck()).toEqual(clean.p2.runeDeck());
    expect(rep.game.p1.trash()).toEqual(clean.p1.trash());
    expect(rep.game.p2.trash()).toEqual(clean.p2.trash());
    expect(rep.game.transcript().steps.map((s) => s.hash)).toEqual(t.steps.map((s) => s.hash));

    // An independent rebuild of the same script produces the same numbers too.
    const again = await fullRun(false);
    expect(again.stateHash()).toBe(clean.stateHash());
    expect(again.transcript().steps).toEqual(t.steps);
  });

  test("determinism — the SAME script WITH the five illegal submissions interleaved ends in a state byte-identical to the clean run: identical accepted-step list (answers + per-step hashes), identical final hash, decks / trash / rune decks in the same order, same winner — and the RNG yields the same next value (rejected actions consumed no randomness)", async () => {
    const clean = await fullRun(false);
    const noisy = await fullRun(true);
    expect(noisy.transcript().steps).toEqual(clean.transcript().steps);
    expect(noisy.stateHash()).toBe(clean.stateHash());
    expect(noisy.transcript().finalHash).toBe(clean.transcript().finalHash);
    expect(noisy.winner()).toBe(P1);
    expect(noisy.winner()).toBe(clean.winner());
    expect(noisy.p1.deck()).toEqual(clean.p1.deck());
    expect(noisy.p2.deck()).toEqual(clean.p2.deck());
    expect(noisy.p1.runeDeck()).toEqual(clean.p1.runeDeck());
    expect(noisy.p2.runeDeck()).toEqual(clean.p2.runeDeck());
    expect(noisy.p1.trash()).toEqual(clean.p1.trash());
    expect(noisy.p2.trash()).toEqual(clean.p2.trash());
    expect(noisy.findAll({}).sort()).toEqual(clean.findAll({}).sort()); // same card instance ids
    expect(noisy.engine.getRNG().random()).toBe(clean.engine.getRNG().random());
    expect(noisy.violations()).toEqual([]);
    expect(clean.violations()).toEqual([]);
    // Only the noisy engine's audit history differs — and only by failed entries.
    const failed = (g: Game) => g.engine.getHistory().filter((h) => (h as { success?: boolean }).success === false).length;
    expect(failed(noisy) - failed(clean)).toBe(ILLEGAL_AT_X.length + 2);
  });

  // ---- with-condition contrasts: each rejection above is about ONE failed step, not a dead card ----

  test("contrast (358.1 vs 358.2): against a spell Defy CAN counter (Void Seeker, 3+[fury]) and with exactly 1 + [calm] in the pool, Defy IS offered naming it and resolves; with 1 energy but the calm rune merely sitting ready (not recycled) it is NOT offered, a raw submission is rejected and neither the pool nor the rune is touched (no auto/partial payment)", async () => {
    const mk = (pool: { energy: number; power?: Record<string, number> }) =>
      scenario({ seed: SEED })
        .resources(P1, { energy: 3, power: { fury: 1 } })
        .resources(P2, pool)
        .rune(P2, "calm", { alias: "calmRune" })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
        .hand(P1, VOID_SEEKER, "seeker")
        .hand(P2, DEFY, "defy");

    const yes = await mk({ energy: 1, power: { calm: 1 } }).build();
    await yes.p1.cast("seeker", { targets: "big" });
    await yes.p1.passPriority();
    expect(yes.p2.can("cast", "defy")).toBe(true);
    const field = yes.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect([...new Set((field?.options ?? []).flat() as string[])]).toEqual(["seeker"]);
    await yes.p2.cast("defy", { targets: "seeker" });
    expect(yes.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await yes.settle();
    expect(yes.zoneOf("seeker")).toBe("trash");
    expect(yes.state("big").damage).toBe(0); // countered
    expect(yes.chain()).toHaveLength(0);

    const no = await mk({ energy: 1 }).build();
    await no.p1.cast("seeker", { targets: "big" });
    await no.p1.passPriority();
    expect(no.p2.can("cast", "defy")).toBe(false);
    const x = checkpoint(no);
    await submitIllegal(no, P2, "playSpell", { cardId: "defy", targets: ["seeker"] });
    expectUnchanged(no, x);
    expect(no.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(no.state("calmRune")).toMatchObject({ isReady: true, zone: "runePool" });
    // Paying properly (recycle the rune → [calm]) makes the very same play legal.
    await no.p2.recycleRune("calmRune");
    expect(no.p2.can("cast", "defy")).toBe(true);
  });

  test("contrast (421.1 / 811): on P2's OWN turn with [rainbow] in the pool, Hide offers ONLY bf1 (P2-controlled); a raw hide at bf2 is a rejected no-op; hiding at bf1 succeeds — Stand United facedown at bf1, the power spent", async () => {
    const game = await scenario({ seed: SEED })
      .active(P2)
      .resources(P2, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Three" }, "u1")
      .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
      .hand(P2, STAND_UNITED, "stand")
      .build();
    const dests = (game.p2.option("hide", "stand")?.variants ?? []).map((v) => v.params.battlefieldId);
    expect(dests).toEqual(["bf1"]);
    const x = checkpoint(game);
    await expect(game.p2.hide("stand", "bf2")).rejects.toThrow();
    await submitIllegal(game, P2, "hideCard", { battlefieldId: "bf2", cardId: "stand" });
    expectUnchanged(game, x);
    await game.p2.hide("stand", "bf1");
    expect(game.zoneOf("stand")).toBe("facedown-bf1");
    expect(game.state("stand").isHidden).toBe(true);
    expect(game.p2.facedown("bf1")).toEqual(["stand"]);
    expect(game.p2.power()).toBe(0);
  });

  test("contrast (358.4): Stand United is a perfectly playable [Action] on P2's own turn in an Open state — 3 energy, buffs a friendly unit — so rejection (3) was purely timing", async () => {
    const game = await scenario({ seed: SEED })
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Three" }, "u1")
      .hand(P2, STAND_UNITED, "stand")
      .build();
    expect(game.p2.can("cast", "stand")).toBe(true);
    await game.p2.cast("stand", { targets: "u1" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("stand")).toBe("trash");
    expect(game.state("u1").isBuffed).toBe(true);
    expect(game.state("u1").might).toBe(3 + 1 + 1); // buff +1, and buffs give an additional +1 this turn
  });
});
