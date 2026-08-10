/**
 * Interaction: Thrill of the Hunt (unl-184-219) · Spell · Fury/Body · 2+[power] · Reaction
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Vex, Apathetic (unl-150-219) · Champion Unit · Chaos · 4 · 4 Might   — P1's, at bf1
 *     "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Viktor, Innovator (ogn-117-298) · Champion Unit · Mind · 4 · 3 Might  — P2's, in base
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   with Stupefy (ogn-095-298) · Reaction · 1 — "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *
 * Rules: 354.2 / 354.3 (the replay is a Pending play that waits for Thrill to finish), 124.1 (banished and
 * replayed = a new object), 355.2.b ("to any battlefield" makes every battlefield a valid location, base is
 * not), 143.4 + 337.2 (enters exhausted, resolves at once), 419.4.a + 383.2.c (play-triggers fire when the
 * played item has resolved), 383.3.d.1 (simultaneous triggers of different controllers: TURN PLAYER's first),
 * 337.1.b / 337.4 (finalized in append order, priority only afterwards), 355.10.d ("it" is determined, not
 * chosen — no target prompt, Deflect moot), 340.1 (newest resolves first), 185.2.a / 350.2 (a token is
 * PLAYED — so Vex sees it — but is not a CARD — so Viktor does not), 359.3.e.4 / 359.3.e.5 (Stupefy's
 * target left the board and came back → no −1, but "Draw 1" still happens).
 *
 * Note: Thrill of the Hunt is itself a card P2 plays on P1's turn, so Viktor ALSO triggers once for Thrill
 * (when Thrill finishes resolving, 419.4.a) — Case A therefore ends with two Recruit tokens: one for
 * Thrill, one for the replayed U, and none for either token.
 *
 * Case A (P1's turn): P1 Stupefy → U; P2 reacts Thrill → U, replays U to bf2.
 *   Thrill resolves first; U (new object) enters bf2 exhausted for free. Off that entry Vex (P1) and Viktor
 *   (P2) trigger together → Vex's item goes on first, Viktor's on top; no targets asked; then priority.
 *   Viktor resolves first → Recruit token → Vex triggers again (token stunned, can't move) but Viktor does
 *   not re-trigger; then Vex's original item → U stunned, can't move; finally Stupefy: no −1 on U, P1 draws 1.
 * Case B (P2's turn): P2 casts Thrill on U in main phase → only Vex triggers (Viktor: own turn) → U stunned
 *   and P2 really cannot move it this turn; no Recruit.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL_OF_THE_HUNT = "unl-184-219";
const VEX_APATHETIC = "unl-150-219";
const VIKTOR_INNOVATOR = "ogn-117-298";
const STUPEFY = "ogn-095-298";
const FILLER = "ogn-175-298";

/**
 * P1: Vex at P1's bf1, Stupefy in hand, 1 energy, two known deck cards. P2: Viktor in base, Unit U (3 Might,
 * printed cost 4, carrying 1 damage so a fresh object is observable) at P2's bf2, Thrill in hand, exactly
 * 2 energy + [fury] for Thrill — nothing left to pay U's cost with.
 */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VEX_APATHETIC, "vex")
    .unit(P2, "base", VIKTOR_INNOVATOR, "viktor")
    .unit(P2, "bf2", { energyCost: 4, might: 3, name: "Unit U" }, "u", { damage: 1 })
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

const chainIds = (game: Game): string[] => game.chain().map((c) => c.cardId);
const recruits = (game: Game): string[] => game.p2.base().filter((id) => game.state(id).isToken);
const noMove = { duration: "turn", keyword: "NoMove" };
/** Units P2 could name in a standard/ganking move right now. */
const p2Movable = (game: Game): string[] => [
  ...new Set(
    game.p2
      .legal()
      .filter((o) => o.verb === "move" || o.verb === "gank")
      .flatMap((o) => (o.fields.find((f) => f.name === "unitIds")?.options ?? []).flat() as string[]),
  ),
];

/** Step (passes / forced answers only) until `pred` holds. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 40): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return game.decision();
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}
const isDestinationFor = (seat: string) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && /destination/i.test(d.prompt);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Case A up to Thrill's destination prompt: Stupefy → U, P1 passes, Thrill → U, both pass. */
async function caseAToDestination(): Promise<Game> {
  const game = await board(P1).build();
  await game.p1.cast("stupefy", { targets: "u" });
  await game.p1.passPriority();
  await game.p2.cast("thrill", { targets: "u" });
  expect(chainIds(game)).toEqual(["stupefy", "thrill"]);
  await until(game, isDestinationFor(P2));
  return game;
}

/** Case A up to the first priority window after U re-entered bf2 (all triggers finalized). */
async function caseAReplayed(): Promise<Game> {
  const game = await caseAToDestination();
  await game.p2.pick("battlefield-bf2");
  await until(game, isChainPriority);
  return game;
}

describe("Thrill of the Hunt × Vex, Apathetic × Viktor, Innovator — one replay, two controllers' triggers", () => {
  // ── Case A: P1's turn ──────────────────────────────────────────────────────────────────────────

  test("A: with Stupefy (→ U) on the chain P2 may react with Thrill of the Hunt; it offers only P2's own units (U, Viktor — never Vex) and costs P2 2 energy + [fury]", async () => {
    const game = await board(P1).build();
    await game.p1.cast("stupefy", { targets: "u" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stupefy", controller: P1, targets: ["u"] })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "thrill")).toBe(true);
    const offered = (game.p2.option("cast", "thrill")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["u", "viktor"]);
    await expect(game.p2.cast("thrill", { targets: "vex" })).rejects.toThrow();
    await game.p2.cast("thrill", { targets: "u" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["stupefy", P1],
      ["thrill", P2],
    ]);
  });

  test("A: Thrill (newest) resolves first: U is banished, Thrill is in the trash, Stupefy still waits — and U's OWNER (P2) is asked where to replay it: any battlefield (bf1 or bf2), never base (354.2/354.3, 355.2.b)", async () => {
    const game = await caseAToDestination();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect(game.zoneOf("u")).toBe("banishment");
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(chainIds(game)).toContain("stupefy");
    expect(chainIds(game)).toContain("u"); // the pending replay
    expect((await game.p2.try((p) => p.pick("base"))).ok).toBe(false);
  });

  test("A: replayed to bf2, U is a NEW object — old damage gone — that enters exhausted, for free (printed cost 4, P2 has nothing), under P2's control, and leaves the chain at once (124.1, 143.4, 337.2)", async () => {
    const game = await caseAToDestination();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p2.pick("battlefield-bf2");
    expect(game.zoneOf("u")).toBe("battlefield-bf2");
    expect(game.state("u")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, might: 3, owner: P2 });
    expect(chainIds(game)).not.toContain("u");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(2); // Thrill + U
  });

  test("A: U's entry triggers Vex (P1) and Viktor (P2) simultaneously — the TURN PLAYER's Vex item goes on first, Viktor's on top; nobody is asked for a target ('it' is determined); priority opens only once both are finalized (383.3.d.1, 355.10.d, 337.4)", async () => {
    const game = await caseAToDestination();
    await game.p2.pick("battlefield-bf2");
    // Straight from the placement to a priority window: no pick / order prompt in between.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.kind === "action" ? d.context : "").toBe("chain");
    // oldest → newest: Stupefy, Viktor's trigger for THRILL (P2 played a card on P1's turn), then the
    // simultaneous pair off U's entry: Vex (turn player P1) before Viktor (P2).
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["stupefy", P1, false],
      ["viktor", P2, true],
      ["vex", P1, true],
      ["viktor", P2, true],
    ]);
    expect(game.chain().filter((c) => c.triggered).every((c) => !c.targets || c.targets.length === 0)).toBe(true);
    expect(game.state("u").isStunned).toBe(false); // nothing has resolved yet
    expect(recruits(game)).toEqual([]);
  });

  test("A: newest first — Viktor's item resolves before Vex's: a Recruit token lands in P2's base while Vex's stun for U is still on the chain; that token PLAY re-triggers Vex (a second Vex item) but adds NO Viktor item — a token is not a card (340.1, 185.2.a, 350.2)", async () => {
    const game = await caseAReplayed();
    const viktorItemsBefore = game.chain().filter((c) => c.cardId === "viktor").length; // 2: Thrill's + U's
    await until(game, () => recruits(game).length === 1);
    expect(game.state("u").isStunned).toBe(false); // Vex's original item hasn't resolved
    expect(chainIds(game)).toEqual(["stupefy", "viktor", "vex", "vex"]);
    expect(game.chain().filter((c) => c.cardId === "viktor")).toHaveLength(viktorItemsBefore - 1);
    const [token] = recruits(game);
    expect(game.state(token as string)).toMatchObject({ controller: P2, might: 1, name: "Recruit" });
  });

  test("A: after the chain empties — U is Stunned with 'can't move this turn'; exactly TWO Recruit tokens exist (one for Thrill, one for U, none for a token) and each was stunned by its own Vex trigger", async () => {
    const game = await caseAReplayed();
    await until(game, isOpenMain);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("battlefield-bf2");
    expect(game.state("u").isStunned).toBe(true);
    expect(game.state("u").grantedKeywords).toEqual([expect.objectContaining(noMove)]);
    const tokens = recruits(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({ isStunned: true, name: "Recruit" });
      expect(game.state(t).grantedKeywords).toEqual([expect.objectContaining(noMove)]);
    }
    expect(game.state("viktor").isStunned).toBe(false);
    expect(game.state("vex").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("A: Stupefy resolves last against a unit that left the board and came back: U keeps its full 3 Might (illegal target — no −1), yet P1 still draws 1; Stupefy → P1's trash (359.3.e.4, 359.3.e.5)", async () => {
    const game = await caseAReplayed();
    await until(game, isOpenMain);
    expect(game.state("u")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p1.trash()).toContain("stupefy");
    expect(game.p1.energy()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("A: 'this turn' only — once P1's turn ends U un-stuns, the movement lock lapses, and on P2's turn U (readied) is an ordinary movable unit again", async () => {
    const game = await caseAReplayed();
    await until(game, isOpenMain);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("u")).toMatchObject({ isReady: true, isStunned: false });
    expect(game.state("u").grantedKeywords).toEqual([]);
    expect(p2Movable(game)).toContain("u");
  });

  // ── Case B: P2's own turn ──────────────────────────────────────────────────────────────────────

  test("B: on P2's turn P2 casts Thrill on U in the main phase and replays it to bf2 — only VEX triggers (P2 is Vex's opponent, Vex is at a battlefield); Viktor's 'on an opponent's turn' fails: the lone item is Vex's, controlled by P1", async () => {
    const game = await board(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("cast", "thrill")).toBe(true);
    await game.p2.cast("thrill", { targets: "u" });
    await until(game, isDestinationFor(P2));
    expect(game.zoneOf("u")).toBe("banishment");
    await game.p2.pick("battlefield-bf2");
    expect(game.zoneOf("u")).toBe("battlefield-bf2");
    expect(game.state("u")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([["vex", P1, true]]);
    expect(game.decision()?.kind).toBe("action"); // no target prompt for "it"
  });

  test("B: it resolves: U is Stunned and locked; NO Recruit token appears (neither Thrill nor U was played on an opponent's turn); P2 is back in an open main phase", async () => {
    const game = await board(P2).build();
    await game.p2.cast("thrill", { targets: "u" });
    await until(game, isDestinationFor(P2));
    await game.p2.pick("battlefield-bf2");
    await until(game, isOpenMain);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("u").isStunned).toBe(true);
    expect(game.state("u").grantedKeywords).toEqual([expect.objectContaining(noMove)]);
    expect(recruits(game)).toEqual([]);
    expect(game.p2.base()).toEqual(["viktor"]);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("B: 'They can't move it this turn' actually bites on P2's own turn: even readied, U is absent from P2's move options and move(U) is rejected, while Viktor may move freely", async () => {
    const game = await board(P2).build();
    await game.p2.cast("thrill", { targets: "u" });
    await until(game, isDestinationFor(P2));
    await game.p2.pick("battlefield-bf2");
    await until(game, isOpenMain);
    await game.p2.do("readyCard", { cardId: "u" }); // isolate the lock from mere exhaustion
    expect(game.state("u").isReady).toBe(true);
    expect(p2Movable(game)).toContain("viktor");
    expect(p2Movable(game)).not.toContain("u");
    expect((await game.p2.try((p) => p.move("u", "base"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.move("u", "bf1"))).ok).toBe(false);
    expect(game.zoneOf("u")).toBe("battlefield-bf2");
  });

  test("B: the lock is 'this turn': on P2's NEXT turn U is un-stunned, carries no restriction and is movable", async () => {
    const game = await board(P2).build();
    await game.p2.cast("thrill", { targets: "u" });
    await until(game, isDestinationFor(P2));
    await game.p2.pick("battlefield-bf2");
    await until(game, isOpenMain);
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("u")).toMatchObject({ isReady: true, isStunned: false });
    expect(game.state("u").grantedKeywords).toEqual([]);
    expect(p2Movable(game)).toContain("u");
  });
});
