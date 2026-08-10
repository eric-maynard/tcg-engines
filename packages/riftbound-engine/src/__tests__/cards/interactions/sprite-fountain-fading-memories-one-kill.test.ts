/**
 * Interaction: Sprite Fountain (unl-078-219) · Gear · Mind · 2+[mind]
 *     "[Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)
 *      When you play this, play a ready 3 [Might] Sprite unit token with [Temporary] to your base.
 *      [Deathknell][>] Repeat this gear's play effect."
 *   × Fading Memories (ogn-180-298) · Action spell · Chaos · 4+[chaos]
 *     "Give a unit at a battlefield or a gear [Temporary]."
 *   × Sprite token (187.2) · 3 Might · [Temporary]
 *
 * Rules: 816.1.b/.c (Temporary = triggered "At the start of this permanent's controller's Beginning Phase,
 * before scoring, kill this"), 816.2 / 816.2.a (multiple instances of Temporary are REDUNDANT — it triggers
 * once), 315.2.a.1 → 315.2.b (Beginning Step precedes the Scoring Step), 383.2.c (an "at [moment]" condition
 * is evaluated once, when that moment is processed), 383.3 / 383.3.d (triggers are chain items; simultaneous
 * triggers of one controller are ordered by that player), 428.1.a.1.b / 808.1.d.2 (Deathknell is pended
 * before the killed permanent reaches the trash), 340.1 (LIFO), 187.2 (Sprite token), 186.1 (a token that
 * leaves the board ceases to exist), 469.2 (Hold requires control at the Scoring Step).
 *
 * Question: Turn N (P1): P1 plays Sprite Fountain → gear + a READY 3-Might Temporary Sprite in base; P1 moves
 * the Sprite to the empty bf1 and conquers it. Turn N (P2): P2 resolves Fading Memories on the Fountain (it
 * already has Temporary). Turn N+1 (P1), start of Beginning Phase:
 *   (a) how many Temporary triggers — 2 (Fountain, Sprite) or 3? Who orders them; can P2 respond?
 *   (b) resolving them: does the Fountain's Deathknell fire off a Temporary kill, and what does it make?
 *   (c) does the NEW Sprite also die in this same Beginning Phase?
 *   (d) Scoring Step: does P1 hold bf1? Final board?
 *
 * Expected: (a) exactly TWO items (816.2: the second Temporary instance is redundant), both P1's; P1 orders
 * them (383.3.d); P2 gets priority over each. (b) Fountain's kill → Deathknell pended and resolves next → a
 * READY 3-Might Temporary Sprite token in P1's base; the old Sprite's item kills it → ceases to exist. Either
 * order ends the same. (c) No — the phase-start moment predates the new token (383.2.c); it dies at P1's NEXT
 * Beginning Phase. (d) bf1 is empty → uncontrolled at the Cleanup → no Hold; P1's score unchanged. Final:
 * Fountain in P1's trash, old Sprite gone, one ready 3-Might Temporary Sprite in P1's base, bf1 uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_FOUNTAIN = "unl-078-219";
const FADING_MEMORIES = "ogn-180-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const sprites = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Sprite");

/**
 * Turn 1, P1 to act with exactly the Fountain's cost. Two empty, uncontrolled battlefields. P2 has six chaos
 * runes (4 to tap + 1 to recycle for the [chaos] pip of Fading Memories on its own turn) and a homebody so
 * the board is not degenerate.
 */
function board() {
  return scenario()
    .turn(1)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .runes(P2, "chaos", 6)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2Home")
    .hand(P1, SPRITE_FOUNTAIN, "fountain")
    .hand(P2, FADING_MEMORIES, "fm");
}

/**
 * Turn N (P1): play the Fountain, move its Sprite to bf1 (conquer). Turn N (P2): optionally resolve Fading
 * Memories on the Fountain. Returns at the moment P2 has ended the turn — P1's Beginning Phase has started and
 * whatever triggered is on the chain, nothing resolved. `oldSprite` is the token made on turn N.
 */
async function p1BeginningPhase(opts: { fadingMemories: boolean }): Promise<{ game: Game; oldSprite: string }> {
  const game = await board().build();
  await game.p1.play("fountain");
  await game.settle();
  const [oldSprite] = sprites(game);
  expect(oldSprite).toBeDefined();
  await game.p1.move(oldSprite!, "bf1");
  await game.settle();
  await game.advanceTurn(); // → P2's main phase
  if (opts.fadingMemories) {
    await game.p2.tapRunes(4);
    await game.p2.recycleRune({ domain: "chaos" }, "chaos");
    await game.p2.cast("fm", { targets: "fountain" });
    await game.settle();
  }
  await game.p2.endTurn(); // → P1's Beginning Phase starts
  return { game, oldSprite: oldSprite! };
}

/** Both players pass priority once → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Sprite Fountain × Fading Memories — a doubled Temporary still kills once; Deathknell Sprite outlives the phase", () => {
  // ── turn N setup ────────────────────────────────────────────────────────────────────────

  test("turn N (P1): playing Sprite Fountain puts the gear (Temporary, Deathknell) in base AND a READY 3-Might Sprite token with Temporary in base (play effect, 187.2)", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await game.settle();
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.p1.gear()).toEqual(["fountain"]);
    expect(game.state("fountain").keywords).toEqual(expect.arrayContaining(["Temporary", "Deathknell"]));
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(made[0]!).keywords).toContain("Temporary");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("turn N (P1): the ready Sprite moves to the empty bf1 and conquers it — P1 controls bf1 and scores 1", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await game.settle();
    const [s] = sprites(game);
    await game.p1.move(s!, "bf1");
    await game.settle();
    expect(game.locationOf(s!)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("turn N (P2): Fading Memories may target the Fountain (a gear) or the Sprite (a unit at a battlefield); resolving it on the Fountain grants a SECOND Temporary instance — the keyword list still reads Temporary once (816.2)", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await game.settle();
    const [s] = sprites(game);
    await game.p1.move(s!, "bf1");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(4);
    await game.p2.recycleRune({ domain: "chaos" }, "chaos");
    const field = game.p2.option("cast", "fm")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered.sort()).toEqual(["fountain", s!].sort()); // not the homebody in base
    await game.p2.cast("fm", { targets: "fountain" });
    await game.settle();
    expect(game.zoneOf("fm")).toBe("trash");
    expect(game.state("fountain").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(game.state("fountain").keywords.filter((k) => k === "Temporary")).toEqual(["Temporary"]);
    expect(game.zoneOf("fountain")).toBe("base"); // nothing dies on P2's turn — it is not the Fountain's controller's Beginning Phase
    expect(game.has(s!)).toBe(true);
  });

  // ── (a) how many triggers, whose, P2's window ───────────────────────────────────────────

  test("(a) start of P1's Beginning Phase: exactly TWO triggered items — one for the Fountain (not two, 816.2.a) and one for the Sprite — both controlled by P1; nothing has died yet", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["fountain", oldSprite].sort());
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.locationOf(oldSprite)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(a) NO-side contrast: without Fading Memories the very same two items appear — the extra Temporary instance added nothing", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: false });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["fountain", oldSprite].sort());
  });

  // Expected (383.3.d): the Fountain's and the Sprite's Temporary triggered simultaneously under one
  // controller, so P1 is offered a soft `order` decision listing exactly those two items (as for other
  // same-controller start-of-phase batches, e.g. Sprite Queen + Sprite). Actual: two Temporary items are
  // treated as interchangeable and pushed in scan order; P1 goes straight to a chain priority window.
  test("(a) P1 controls both simultaneous Temporary triggers and should be offered their ORDER on the chain (383.3.d)", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card ?? i.key).sort() : [];
    expect(items).toEqual(["fountain", oldSprite].sort());
  });

  test("(a) each item is a chain item P2 may respond to: P1 (controller of the newest item) holds priority first, and after P1 passes P2 gets priority before anything resolves (383.3, 337.4)", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.has(oldSprite)).toBe(true);
  });

  // ── (b) resolving: one batch of deaths; Deathknell repeats the play effect ──────────────

  // RULING-CONFLICT: riftjudge bd1e9b90cf899340 (Zhonya's Hourglass × two Fading Memories) reads as though
  // each [Temporary] item kills only its own permanent when it resolves, but riftjudge 6170c60083979825
  // (two [Temporary] Glasc Mixologists) requires every [Temporary] permanent of one Beginning Phase to reach
  // the trash SIMULTANEOUSLY, so each one's [Deathknell] trigger count (808.1.d.2) is read off ONE board
  // state — a unit a Deathknell brings back cannot grow the next death's count. The engine follows the
  // latter (`abilities/effects/temporary-kill.ts`, rule 428.1 one leave-board pass): the first item of the
  // batch to resolve kills the whole batch and the sibling items then resolve to nothing. rule 383.3.d
  // still gives the batch's controller the order — it decides whose [Deathknell] is pended first, not who
  // dies. Both orders below therefore reach the same board; only the chain differs.
  test("(b) Fountain-first: its item kills the whole Temporary batch — Fountain in the trash, old Sprite gone, the Sprite's spent item still under the Fountain's Deathknell", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    const d = game.decision();
    expect(d?.kind).toBe("order");
    if (d?.kind !== "order") {
      return;
    }
    const f = d.items.find((i) => i.card === "fountain")!.key;
    const s = d.items.find((i) => i.card === oldSprite)!.key;
    await game.p1.order([s, f]); // last = top → Fountain resolves first
    await resolveTop(game);
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.zoneOf(oldSprite)).toBe("gone"); // killed in the same pass (186.1 — a token ceases to exist)
    expect(game.chain().map((c) => c.cardId)).toEqual([oldSprite, "fountain"]); // bottom → top: the Sprite's spent item, the Fountain's Deathknell
    expect(sprites(game)).toEqual([]); // the new one is not made until the Deathknell resolves
  });

  // Same batching seen from the other end (see the RULING-CONFLICT note above): the old Sprite's item is on
  // top in the listed order, and resolving it takes the Fountain with it — so the Fountain's own item is
  // already spent and its [Deathknell] is on the chain by the time P1 next gets priority.
  test("(b) Sprite-first (listed order): the Sprite's item kills the Fountain too — the Fountain's spent item sits under its own Deathknell", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.chain().at(-1)?.cardId).toBe(oldSprite);
    await resolveTop(game);
    expect(game.has(oldSprite)).toBe(false);
    expect(game.zoneOf(oldSprite)).toBe("gone");
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fountain", "fountain"]); // its spent Temporary item, then its Deathknell
  });

  test("(b) the Fountain's Temporary death fires its Deathknell as a NEW triggered chain item controlled by P1 (808.1.d.2) — P2 again gets a priority window over it", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    // Resolve Temporary items until the Fountain has died.
    for (let i = 0; i < 2 && game.zoneOf("fountain") !== "trash"; i++) {
      await resolveTop(game);
    }
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.p1.trash()).toContain("fountain");
    const knell = game.chain().at(-1);
    expect(knell).toMatchObject({ cardId: "fountain", controller: P1, triggered: true });
    expect(sprites(game).filter((s) => s !== oldSprite)).toEqual([]); // not made yet — it is a chain item, not instantaneous
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) once everything has resolved: the Deathknell repeated the play effect → exactly one NEW Sprite token — READY, 3 Might, Temporary, in P1's BASE; the old Sprite ceased to exist (186.1); the Fountain is in P1's trash", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    while (game.chain().length > 0) {
      await resolveTop(game);
    }
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.has(oldSprite)).toBe(false);
    expect(game.zoneOf(oldSprite)).toBe("gone");
    const now = sprites(game);
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(oldSprite);
    expect(game.state(now[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(now[0]!).keywords).toContain("Temporary");
  });

  test("(b) the Deathknell fires exactly ONCE even though the Fountain carried two Temporary instances — one death, one repeat, one new Sprite (816.2, 808.2)", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    await game.settle();
    expect(sprites(game).filter((s) => s !== oldSprite)).toHaveLength(1);
    expect(game.p1.units()).toHaveLength(1);
  });

  // ── (c) the new Sprite is NOT killed this Beginning Phase ───────────────────────────────

  test("(c) the new Sprite gets no Temporary item this phase (383.2.c: the phase-start moment predates it) — after the last item resolves the chain is EMPTY and the token is alive and ready in base in P1's main phase", async () => {
    const { game } = await p1BeginningPhase({ fadingMemories: true });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    while (game.chain().length > 0) {
      await resolveTop(game);
    }
    const [tok] = sprites(game);
    expect(game.chain()).toEqual([]); // no third Temporary item was ever added for the new token
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok!)).toBe(true);
    expect(game.state(tok!)).toMatchObject({ isReady: true, location: "base", might: 3 });
  });

  test("(c) the new Sprite survives all of P2's turn and dies at the start of P1's NEXT Beginning Phase (turn N+2), before that turn's scoring", async () => {
    const { game } = await p1BeginningPhase({ fadingMemories: true });
    await game.settle();
    const [tok] = sprites(game);
    expect(tok).toBeDefined();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(tok!)).toBe(true);
    await game.p2.endTurn(); // → P1's next Beginning Phase
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((c) => c.cardId)).toEqual([tok!]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has(tok!)).toBe(false);
    expect(game.zoneOf(tok!)).toBe("gone");
    expect(sprites(game)).toEqual([]); // the Fountain is long gone — nothing makes another
  });

  // ── (d) Scoring Step: no Hold ───────────────────────────────────────────────────────────

  test("(d) all of this is 'before scoring': with the old Sprite dead bf1 holds nothing of P1's → control lapses at the Cleanup and the Scoring Step awards NO Hold — P1 stays at the 1 point from turn N's conquer", async () => {
    const { game } = await p1BeginningPhase({ fadingMemories: true });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("(d) final board: Fountain in P1's trash, Fading Memories in P2's trash, old Sprite gone, exactly one ready 3-Might Temporary Sprite in P1's base, bf1 empty and uncontrolled, no invariant violations", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: true });
    await game.settle();
    expect(game.p1.trash()).toContain("fountain");
    expect(game.p2.trash()).toContain("fm");
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf(oldSprite)).toBe("gone");
    const now = sprites(game);
    expect(now).toHaveLength(1);
    expect(game.state(now[0]!)).toMatchObject({ isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(now[0]!).keywords).toContain("Temporary");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.violations()).toEqual([]);
  });

  test("(d) NO-side contrast: without Fading Memories the end state is identical — the second Temporary instance changed nothing", async () => {
    const { game, oldSprite } = await p1BeginningPhase({ fadingMemories: false });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.trash()).toContain("fountain");
    expect(game.zoneOf(oldSprite)).toBe("gone");
    const now = sprites(game);
    expect(now).toHaveLength(1);
    expect(game.state(now[0]!)).toMatchObject({ isReady: true, location: "base", might: 3 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points()).toBe(1);
  });
});
