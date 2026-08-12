/**
 * Interaction: Drag Under (sfd-164-221) · Spell · Order · 5+[order] · [Action]
 *     "I cost [2] less to play from anywhere other than your hand. Kill a unit at a battlefield."
 *   × Fizz, Trickster (sfd-140-221) · Champion Unit · Chaos · 3+[chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *      ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Kai'Sa, Evolutionary (ogn-112-298) · Champion Unit · Mind · 6+[mind] · 6 Might · [Ganking]
 *     "When I conquer, you may play a spell from your trash with Energy cost less than your points
 *      without paying its Energy cost. Then recycle it. (You must still pay its Power cost.)"
 *   (+ Wind Wall ogn-064-298 "[Reaction] Counter a spell." as P2's answer.)
 *
 * Question: Drag Under is the ONLY spell in P1's trash. P2 has E (4 Might) and a [Deflect] unit F at
 * bf2. (a) NO side — P1 plays Fizz: is Drag Under (which "costs 3" from the trash) an eligible ≤[3]
 * pick; what does the trigger do? (b) YES side — Kai'Sa conquers bf1 and P1 then has 6 points:
 * eligible? exact cost vs E and vs F; does Drag Under's own −2 do anything; [Add] while paying; does
 * the Action tag matter? (c) Where does Drag Under go after resolving via Kai'Sa; if Wind-Walled?
 * (d) Boundary: exactly 5 points. (e) Contrast: cast from HAND the same turn.
 *
 * Rules: 206 / 356.1.c (eligibility reads the PRINTED Energy cost — 5), 356.4 (the −2 is a discount in
 * Determine Total Cost of an actual play, not a characteristic), 356.1.b.2 (ignore Energy only → base
 * Energy 0, Power still owed), 356.6 (floor 0 — the −2 never rebates), 356.2.a.2 + 809 (Deflect =
 * mandatory extra [A] per opposing chooser), 357.1.a ([Add] while paying), 355.10.a (the trash is
 * public → the spell is a TARGET of the trigger, named at finalization), 419.3 / 419.3.a-b (effect
 * play = Limited Action admitted by the resolving ability — the Action tag is irrelevant), 390.3.a
 * ("Then recycle it" = delayed replacement: leaving the chain otherwise than by its own execution →
 * recycled instead), 425.1.c (counter refunds nothing), 469.1 (the conquer point is scored before the
 * "When I conquer" trigger is even finalized — so a seat seeded at 5 reads 6 when Kai'Sa asks).
 *
 * Expected: (a) not eligible (5 > 3); with nothing else in the trash Fizz's trigger does nothing; Drag
 * Under stays put. (b) eligible (5 < 6); NAMED out of the trash as the trigger is finalized; Energy 0,
 * exactly [order] vs E, [order]+[A] vs F; the −2 does nothing; played as P1's chain item mid-resolution
 * regardless of its Action tag, target chosen at play time, P2 gets a Reaction window. DESIGN
 * (DESIGN.md §Paying costs): paying is manual/pool-only — F is offered only once the extra [A] is IN
 * the pool; the priority pass between finalization and resolution is where P1 recycles for it.
 * (c) bottom of P1's main deck, E dead; countered →
 * still recycled, E alive, [order] gone. (d) 5 < 5 false → never even named. (e) 5+[order] from hand
 * (not 3), and it is trashed, not recycled.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAG_UNDER = "sfd-164-221";
const FIZZ = "sfd-140-221";
const KAISA = "ogn-112-298";
const WIND_WALL = "ogn-064-298"; // [Reaction] 3+[calm][calm] "Counter a spell."

interface KaisaOpts {
  /** P1's points BEFORE the conquer (Kai'Sa's check sees this + 1). */
  readonly points?: number;
  readonly order?: number;
  readonly fury?: number;
  /** Ready fury runes in P1's rune pool. */
  readonly runes?: number;
}

/**
 * P1's turn, 0 energy. bf1 (P2's): Foe (1) — Kai'Sa (6, in P1's base) walks in and conquers. bf2
 * (P2's): E (4) and F (3, [Deflect]). P2's Homebody (2) sits in base. Drag Under is the only card in
 * P1's trash. P2 holds Wind Wall with exactly its cost.
 */
function kaisaBoard(opts: KaisaOpts = {}) {
  const b = scenario()
    .points(P1, opts.points ?? 5)
    .resources(P1, { energy: 0, power: { fury: opts.fury ?? 0, order: opts.order ?? 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 4, name: "E" }, "E")
    .unit(P2, "bf2", { keywords: ["Deflect"], might: 3, name: "F" }, "F")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "H")
    .trash(P1, DRAG_UNDER, "drag")
    .hand(P2, WIND_WALL, "ww");
  for (let i = 1; i <= (opts.runes ?? 0); i++) {
    b.rune(P1, "fury", { alias: `r${i}` });
  }
  return b;
}

/** Kai'Sa moved into bf1, combat done: Foe dead, bf1 conquered (+1 point), her trigger asks P1 "use it?". */
async function conquered(opts: KaisaOpts = {}): Promise<Game> {
  const game = await kaisaBoard(opts).build();
  await game.p1.move("kaisa", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.zoneOf("foe")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe((opts.points ?? 5) + 1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
  return game;
}

const offersDrag = (d: Decision | null): boolean =>
  d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "drag");

/**
 * …P1 accepted: rule 355.10.a / 402.2 — the trash spell is a TARGET, so it is NAMED while the
 * trigger is finalized and rides on the chain item; nothing is played yet.
 */
async function named(opts: KaisaOpts = {}): Promise<Game> {
  const game = await conquered(opts);
  await game.p1.yes();
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "kaisa", targets: ["drag"], triggered: true }),
  ]);
  expect(game.zoneOf("drag")).toBe("trash");
  return game;
}

const isDragTargetPick = (d: Decision | null): d is Extract<Decision, { kind: "pick" }> =>
  d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "drag" && d.semantics === "target";

/** …and everyone passed: the trigger resolves, plays the named spell (Power paid) and it asks for its own target. */
async function played(opts: KaisaOpts = {}): Promise<Game> {
  const game = await named(opts);
  for (let i = 0; i < 6 && !isDragTargetPick(game.decision()); i++) {
    const r = await game.settle();
    if (r.reason === "open") {
      break;
    }
  }
  expect(game.zoneOf("drag")).toBe("chain");
  return game;
}

describe("Drag Under from the trash — Fizz (no) vs Kai'Sa at six points (yes)", () => {
  // ── (a) NO side: Fizz reads the printed 5 ─────────────────────────────────────────────────────

  function fizzBoard() {
    return scenario()
      .resources(P1, { energy: 3, power: { chaos: 1, order: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "E" }, "E")
      .unit(P2, "bf2", { keywords: ["Deflect"], might: 3, name: "F" }, "F")
      .hand(P1, FIZZ, "fizz")
      .trash(P1, DRAG_UNDER, "drag");
  }

  test("(a) eligibility reads the PRINTED Energy cost: Drag Under is a 5-cost card wherever it sits — its '−2 elsewhere' is a play-time discount, not a characteristic (206, 356.1.c, 356.4)", async () => {
    const game = await fizzBoard().build();
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.state("drag").energyCost).toBe(5);
  });

  test("(a) Fizz's 'you may play a spell ≤[3] from your trash' finds nothing: Drag Under is never offered or played, it stays in the trash, E lives, the [order] is unspent — only Fizz's own 3+[chaos] was paid", async () => {
    const game = await fizzBoard().build();
    await game.p1.play("fizz");
    expect(game.zoneOf("fizz")).toBe("base");
    for (let i = 0; i < 8; i++) {
      const d: Decision | null = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes(); // even an eager "yes" must lead nowhere
      } else if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("drag");
        break;
      } else if (d?.kind === "action" && d.context === "chain") {
        expect(game.chain().flatMap((c) => c.targets ?? [])).not.toContain("drag");
        await game.acting().pass();
      } else {
        break;
      }
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.state("E")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  // ── (b) YES side: Kai'Sa at 6 points ───────────────────────────────────────────────────────────

  test("(b) 6 points (5 + the conquer): printed 5 < 6 → accepting Kai'Sa's trigger names exactly Drag Under out of the trash, and it stays there until the trigger resolves", async () => {
    const game = await named();
    expect(game.p1.trash()).toEqual(["drag"]);
    expect(game.zoneOf("drag")).toBe("trash"); // still there until the trigger resolves
  });

  // rule 355.10.a / 355.5 — the trash is a PUBLIC zone, so "a spell from your trash" is a TARGET of
  // Kai'Sa's trigger: named at finalization, right after the "you may", while the trigger is still on
  // the chain for both players to respond to (as the engine already does for Fizz).
  test("(b) the trash spell is a TARGET of the conquer trigger — P1 names Drag Under at finalization and Kai'Sa's chain item carries it before anyone gets priority (355.10.a)", async () => {
    const game = await conquered();
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.timing).toBe("FIN");
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["drag"]);
      await game.p1.pick("drag");
    }
    // (a lone legal target may also be locked without asking — either way the item now names it)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", targets: ["drag"], triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.zoneOf("drag")).toBe("trash"); // not played before the trigger resolves
  });

  test("(b) cost vs E: Energy is not paid at all (0 stays 0 — the '−2 elsewhere' has nothing to reduce and never rebates) and exactly the [order] Power is debited the moment the play is taken (356.1.b.2, 356.6)", async () => {
    const game = await named({ order: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 1 } });
    for (let i = 0; i < 6 && !isDragTargetPick(game.decision()); i++) {
      const r = await game.settle();
      if (r.reason === "open") {
        break;
      }
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.zoneOf("drag")).toBe("chain");
    expect(game.chain().find((c) => c.cardId === "drag")).toMatchObject({ controller: P1, triggered: false, type: "spell" });
  });

  test("(b) with an EMPTY Power pool the play cannot be paid for: Drag Under is not offered at all and stays in the trash (Power cost still owed — 'without paying its Energy cost' only)", async () => {
    const game = await conquered({ order: 0 });
    await game.p1.yes();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      expect(offersDrag(d)).toBe(false);
      const r = await game.settle();
      if (r.reason === "open") {
        break;
      }
    }
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.state("E").zone).toBe("battlefield-bf2");
  });

  test("(b) 'kill a unit at a battlefield' is chosen at PLAY time (FIN), by P1: E and even P1's own Kai'Sa are on offer, the base Homebody is not; the chain item then records E", async () => {
    const game = await played({ order: 1 });
    const d = game.decision();
    expect(isDragTargetPick(d)).toBe(true);
    expect(d?.timing).toBe("FIN");
    const offeredTargets = isDragTargetPick(d) ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offeredTargets).toEqual(expect.arrayContaining(["E", "kaisa"]));
    expect(offeredTargets).not.toContain("H");
    await game.p1.pick("E");
    expect(game.chain().find((c) => c.cardId === "drag")).toMatchObject({ controller: P1, targets: ["E"] });
  });

  // DESIGN (DESIGN.md §Paying costs): legal targets are pool-only — a [Deflect] unit is offered only
  // once the extra [A] is actually in the pool; nothing is auto-credited from ready runes.
  test("(b) vs [Deflect] F the mandatory extra [A] is owed (356.2.a.2, 809): with only [order] banked F is NOT a legal choice; with [order]+[fury] banked it is, and choosing it spends both", async () => {
    const poor = await played({ order: 1 });
    const dp = poor.decision();
    expect(isDragTargetPick(dp) ? dp.options.map((o) => o.card ?? o.key) : []).not.toContain("F");

    const rich = await played({ fury: 1, order: 1 });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { fury: 1, order: 0 } }); // [order] paid on the play
    const dr = rich.decision();
    expect(isDragTargetPick(dr) ? dr.options.map((o) => o.card ?? o.key) : []).toEqual(expect.arrayContaining(["E", "F", "kaisa"]));
    await rich.p1.pick("F");
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } }); // + the Deflect [A], any domain
    expect(rich.chain().find((c) => c.cardId === "drag")?.targets).toEqual(["F"]);
    await rich.settle();
    expect(rich.zoneOf("F")).toBe("trash");
    expect(rich.state("E").zone).toBe("battlefield-bf2");
  });

  // DESIGN (DESIGN.md §Paying costs — deliberate deviation from 357.1.a's Add sub-step): paying is
  // MANUAL, and the window for it is the PRIORITY pass that follows finalization: the spell is named
  // but not yet played, so P1 recycles a rune for the [A] there and the trigger then resolves with the
  // [fury] banked — after which the Deflect unit is a legal, payable choice.
  test("(b) [Add] while paying, engine-style: with the spell named but unplayed P1 recycles a fury rune (+[fury]) — then, and only then, F joins the legal targets and can be paid for", async () => {
    const game = await named({ order: 1, runes: 1 });
    expect(game.p1.legal().map((o) => o.key)).toEqual(expect.arrayContaining(["exhaustRune:r1", "recycleRune:r1"]));
    await game.p1.recycleRune("r1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, order: 1 } });
    expect(game.zoneOf("drag")).toBe("trash"); // still unplayed: the trigger has not resolved
    for (let i = 0; i < 6 && !isDragTargetPick(game.decision()); i++) {
      const r = await game.settle();
      if (r.reason === "open") {
        break;
      }
    }
    const d = game.decision();
    expect(isDragTargetPick(d) ? d.options.map((o) => o.card ?? o.key) : []).toContain("F");
    await game.p1.pick("F");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
  });

  test("(b) timing: Drag Under is played INSIDE the trigger's resolution on the strength of Kai'Sa's instruction (419.3.a/b) — it becomes P1's chain item, P1 holds priority first, and P2 gets a Reaction window (Wind Wall is legal) before it resolves", async () => {
    const game = await played({ order: 1 });
    await game.p1.pick("E");
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.state("E").zone).toBe("battlefield-bf2"); // nothing has resolved yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.can("cast", "ww")).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
  });

  // ── (c) where it goes ──────────────────────────────────────────────────────────────────────────

  test("(c) resolved via Kai'Sa: E dies and 'Then recycle it' puts Drag Under on the BOTTOM of P1's main deck instead of the trash (390.3.a); P1's trash is left empty", async () => {
    const game = await played({ order: 1 });
    await game.p1.pick("E");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.zoneOf("drag")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("drag");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["foe", "E"]));
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Wind-Walled: Drag Under leaves the chain unresolved and is STILL recycled to the bottom of P1's deck (not trashed); E survives; the [order] is not refunded (390.3.a, 425.1.c)", async () => {
    const game = await played({ order: 1 });
    await game.p1.pick("E");
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "drag" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["drag", "ww"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("E")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("drag")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("drag");
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ── (d) boundary ───────────────────────────────────────────────────────────────────────────────

  test("(d) exactly 5 points (4 + the conquer): 'less than your points' — 5 < 5 is false → the trigger has no legal target and is removed as it is finalized (402.4), so Drag Under is never offered, stays in the trash, E lives and the [order] is unspent", async () => {
    const game = await kaisaBoard({ order: 1, points: 4 }).build();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
    expect(game.chain()).toEqual([]);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    for (let i = 0; i < 6; i++) {
      expect(offersDrag(game.decision())).toBe(false);
      const r = await game.settle();
      if (r.reason === "open") {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.state("E").zone).toBe("battlefield-bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 1 } });
  });

  // ── (e) contrast: from hand ────────────────────────────────────────────────────────────────────

  function handBoard(energy: number) {
    return scenario()
      .resources(P1, { energy, power: { order: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "E" }, "E")
      .hand(P1, DRAG_UNDER, "drag");
  }

  test("(e) from HAND the '−2' does not apply: castable at the full 5+[order] (pool emptied), NOT at 3+[order]; it kills E and — with no recycle rider — goes to P1's TRASH", async () => {
    const cheap = await handBoard(3).build();
    expect(cheap.p1.can("cast", "drag")).toBe(false);

    const game = await handBoard(5).build();
    expect(game.p1.can("cast", "drag")).toBe(true);
    await game.p1.cast("drag", { targets: "E" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.p1.trash()).toEqual(["drag"]);
    expect(game.p1.deck()).not.toContain("drag");
  });
});
