/**
 * Core rules — Turn structure: phases and resources (card-independent).
 *
 * Rules covered:
 *   315.1.b   Awaken Phase — the Turn Player readies all Game Objects they control (415.1.c, 415.3.a)
 *   315.2.a   Beginning Step — "start of Beginning Phase" effects happen first
 *   315.2.b   Scoring Step — the Turn Player Holds battlefields they control (469.2, 470, 471)
 *   315.3.b   Channel Phase — channel 2 (fewer if the rune deck is short: 315.3.b.1 / 430.3);
 *             485.7 second player channels 3 on their FIRST Channel Phase only (487.7: no 1v1 draw skip)
 *   315.4.b   Draw Phase — draw 1; 315.4.b.1–2 + 431 Burn Out (recycle trash, opponent gains 1, then draw;
 *             431.3 empty-trash loop feeds the opponent until they win, 431.3.c.1 immediately)
 *   316.1–3   Main Phase begins; task 1: EACH player's Rune Pool empties (166, 167.1, 161.1.a runes stay)
 *   316.5.b   Neutral Open state — Turn Player has priority (312.2.a)
 *   305/316.9 the turn cannot end while a Chain exists (309.1) or a Showdown is open
 *   317.1     Ending Step, then 317.2 Expiration Step: 3c heal all units → 3d "this turn" effects expire
 *             (710, 423.1.a.2 stun) → 3e each player's Rune Pool empties (317.2.d)
 *   323.1     win check at cleanup; 471.1.a.1/471.1.b final-point restriction is Conquer-only
 *   323.6     control of an empty battlefield is lost in an Open state
 *   734–738   Additional Turns: inserted directly after the current turn, full Start of Turn,
 *             turn order unchanged, later-created additional turn is taken first (738 ex. 2)
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { Game, P1, P2, basicRuneDef, loadDefaultCardPool, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Legend whose only job is to put a start-of-turn trigger on the chain (holds the Beginning Phase open). */
const START_OF_TURN_LEGEND = {
  abilities: [
    {
      effect: { amount: 1, type: "gain-xp" },
      trigger: { event: "start-of-turn", on: "controller", timing: "at" },
      type: "triggered",
    },
  ],
  cardType: "legend",
  domain: "fury",
  name: "Dawn Herald (test legend)",
};

/** Legend with an end-of-turn trigger (holds the Ending Step open so it can be observed). */
const END_OF_TURN_LEGEND = {
  abilities: [
    {
      effect: { amount: 1, type: "gain-xp" },
      trigger: { event: "end-of-turn", on: "controller", timing: "at" },
      type: "triggered",
    },
  ],
  cardType: "legend",
  domain: "fury",
  name: "Dusk Herald (test legend)",
};

/** Legend with a plain exhaust-cost activated ability. */
const EXHAUST_LEGEND = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 1, type: "gain-xp" }, type: "activated" }],
  cardType: "legend",
  domain: "fury",
  name: "Tapping Sage (test legend)",
};

const spell = (name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") => ({
  abilities: [{ effect, timing, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing,
});

const EXTRA_TURN = spell("Borrowed Time (test)", { type: "extra-turn" });
const EXTRA_TURN_REACTION = spell("Stolen Time (test)", { type: "extra-turn" }, "reaction");
const PLUS2_THIS_TURN = spell("Surge +2 (test)", { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" });
const PLUS3_THIS_TURN = spell("Surge +3 (test)", { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" });
const PLUS2_REACTION = spell("Snap Surge +2 (test)", { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, "reaction");
const STUN = spell("Daze (test)", { target: { type: "unit" }, type: "stun" });
const DEAL4 = spell("Bolt 4 (test)", { amount: 4, target: { type: "unit" }, type: "damage" });

const mainDecision = (game: Game) => game.decision() as ActionDecision | null;

// ---------------------------------------------------------------------------
// 315 / 316 — Start of Turn sequence
// ---------------------------------------------------------------------------

describe("Start of Turn: Awaken → Beginning → Channel → Draw → Main (315, 316)", () => {
  test("phase order is observable: readied before Beginning; hold scored, then 2 runes channeled, then top card drawn, then Main with priority and an empty pool", async () => {
    const game = await scenario()
      .turn(5)
      .active(P2)
      .points(P1, 2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2 }, "u1", { exhausted: true })
      .runes(P1, "fury", 4, { exhausted: true })
      .legend(P1, START_OF_TURN_LEGEND, "herald")
      .deckTop(P1, { cardType: "unit", energyCost: 3, might: 5, name: "Known Top Card" }, "X")
      .fillDecks({ main: 10, runes: 8 })
      .build();
    expect(game.p1.deck()[0]).toBe("X");
    expect(game.p1.deck()).toHaveLength(10);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(8);

    // P2 ends their turn → P1 becomes Turn Player. The start-of-turn trigger holds the Beginning Phase.
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toHaveLength(1);
    // (1) Awaken already happened: everything P1 controls is ready before the Beginning Phase proceeds.
    expect(game.state("u1").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
    // (3)/(4) have NOT happened yet: no rune channeled, no card drawn while the Beginning Phase is open.
    expect(game.p1.runeDeck()).toHaveLength(8);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(0);
    // Closed state during Beginning: P1 (turn player) holds priority on the chain; nobody has a Main-phase menu.
    const d = mainDecision(game);
    expect(d?.kind).toBe("action");
    expect(d?.context).toBe("chain");
    expect(d?.seat).toBe(P1);
    expect(game.p2.can("endTurn")).toBe(false);

    await game.settle();
    // (2) Hold scored exactly once.
    expect(game.p1.points()).toBe(3);
    // (3) exactly 2 runes channeled, ready.
    expect(game.p1.runeDeck()).toHaveLength(6);
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runes({ ready: true })).toHaveLength(6);
    // (4) drew the known top card.
    expect(game.p1.hand()).toEqual(["X"]);
    expect(game.p1.deck()).toHaveLength(9);
    // (5) Main Phase, Neutral Open, P1 has priority, pool empty.
    expect(game.phase()).toBe("main");
    const m = mainDecision(game);
    expect(m?.context).toBe("main");
    expect(m?.seat).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.can("endTurn")).toBe(false);
    expect(game.p2.points()).toBe(0);
  });

  test("Awaken readies every object the Turn Player controls (units anywhere, gear, legend, runes) and nothing the opponent controls (315.1.b, 415.1.c, 415.3.a)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "U1", { exhausted: true })
      .unit(P1, "bfA", { might: 2 }, "U2", { exhausted: true })
      .gear(P1, { domain: "fury", energyCost: 1, name: "Trinket (test gear)" }, "G1", { exhausted: true })
      .card("L1", { def: EXHAUST_LEGEND, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .runes(P1, "fury", 3, { exhausted: true })
      .rune(P1, "fury", { alias: "R4" })
      .unit(P2, "base", { might: 2 }, "E1", { exhausted: true })
      .runes(P2, "calm", 2, { exhausted: true })
      .build();
    expect(game.state("L1").isExhausted).toBe(true);
    expect(game.state("R4").isReady).toBe(true);
    const p1RuneDeck = game.p1.runeDeck().length;
    const p2RuneDeck = game.p2.runeDeck().length;

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    for (const id of ["U1", "U2", "G1", "L1", "R4"]) {
      expect(game.state(id).isReady).toBe(true);
    }
    // 3 previously exhausted + R4 + 2 freshly channeled = 6, all ready; nothing recycled or moved.
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runes({ ready: true })).toHaveLength(6);
    expect(game.p1.runeDeck()).toHaveLength(p1RuneDeck - 2);
    expect(game.locationOf("U2")).toBe("bfA");
    // Opponent's objects untouched.
    expect(game.state("E1").isExhausted).toBe(true);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.p2.runeDeck()).toHaveLength(p2RuneDeck);
    expect(game.violations()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 315.3 — Channel Phase
// ---------------------------------------------------------------------------

describe("Channel Phase (315.3.b, 430.3, 485.7, 487.7)", () => {
  test("fresh 1v1 game: P1 channels 2 and still draws on turn 1; P2 channels 3 on their first turn only, then 2", async () => {
    const pool = await loadDefaultCardPool();
    const rune = basicRuneDef(pool, "fury");
    const vanillaBf =
      pool.all().find((c) => c.cardType === "battlefield" && (!c.abilities || (c.abilities as unknown[]).length === 0)) ??
      pool.all().find((c) => c.cardType === "battlefield");
    expect(rune.id).toBeDefined();
    expect(vanillaBf?.id).toBeDefined();
    const deck = {
      battlefieldIds: [vanillaBf?.id as string],
      mainDeckCardIds: Array(40).fill("ogn-175-298") as string[], // Shipyard Skulker — vanilla 3-might unit
      runeDeckCardIds: Array(12).fill(rune.id as string) as string[],
    };
    const game = await Game.fromDecks({ p1: deck, p2: deck, seed: "channel-order" });
    await game.settle();

    // Turn 1 (P1): channels exactly 2, and (1v1) still drew 1 in the Draw Phase.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p1.hand().length).toBe(game.p2.hand().length + 1); // both drew opening hands; only P1 has had a Draw Phase
    expect(game.p1.hand().length + game.p1.deck().length).toBe(40);

    // Turn 2 (P2's first turn): 2 + 1 bonus = 3.
    const p2HandBefore = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    expect(game.p2.hand()).toHaveLength(p2HandBefore + 1);

    // Turn 3 (P1): 2 more (never 3 for the first player).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runeDeck()).toHaveLength(8);

    // Turn 4 (P2's second turn): exactly 2 — the bonus is not granted twice.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
  });

  test("a rune deck with 1 card channels 1; an empty rune deck channels 0 — no error, no penalty, Draw and Main still happen (315.3.b.1, 430.3)", async () => {
    // Scenario A: exactly 1 rune left in the deck.
    const a = await scenario().turn(4).active(P2).runes(P1, "fury", 11).fillDecks({ main: 10, runes: 1 }).build();
    expect(a.p1.runeDeck()).toHaveLength(1);
    const handA = a.p1.hand().length;
    await a.advanceTurn();
    expect(a.turnPlayer()).toBe(P1);
    expect(a.p1.runeDeck()).toHaveLength(0);
    expect(a.p1.runes()).toHaveLength(12);
    expect(a.p1.hand()).toHaveLength(handA + 1);
    expect(a.phase()).toBe("main");
    expect(mainDecision(a)?.seat).toBe(P1);
    expect(a.p2.points()).toBe(0); // no "rune burn out" penalty of any kind

    // Scenario B: empty rune deck.
    const b = await scenario().turn(4).active(P2).runes(P1, "fury", 12).fillDecks({ main: 10, runes: 0 }).build();
    expect(b.p1.runeDeck()).toHaveLength(0);
    const handB = b.p1.hand().length;
    await b.advanceTurn();
    expect(b.turnPlayer()).toBe(P1);
    expect(b.p1.runes()).toHaveLength(12);
    expect(b.p1.hand()).toHaveLength(handB + 1);
    expect(b.phase()).toBe("main");
    expect(mainDecision(b)?.context).toBe("main");
    expect(b.p2.points()).toBe(0);
    expect(b.isOver()).toBe(false);
  });

  test("second player's first Channel Phase with only 2 runes in the deck channels 2 without error (485.7 + 430.3)", async () => {
    const game = await scenario().turn(1).active(P1).fillDecks({ main: 10, runes: 2 }).build();
    // Contrive "P2 is the second player and turn 2 is their first turn" exactly as normal setup records it.
    game.engine.applyPatches([
      { op: "add", path: ["firstTurnNumber"], value: { [P2]: 2 } },
      { op: "add", path: ["secondPlayerExtraRune"], value: true },
    ] as never);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(2);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(0);
    expect(game.phase()).toBe("main");
    expect(mainDecision(game)?.seat).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// 315.4 / 431 — Draw Phase and Burn Out
// ---------------------------------------------------------------------------

describe("Draw Phase and Burn Out (315.4.b, 431)", () => {
  test("empty main deck: trash is recycled into the deck, the opponent gains 1 point, THEN the Turn Player draws 1; the game continues (431.2)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .points(P1, 4)
      .points(P2, 3)
      .fillDecks(false)
      .deck(P2, [{ might: 1 }, { might: 1 }])
      .trash(P1, { might: 1, name: "Card A" }, "A")
      .trash(P1, { might: 1, name: "Card B" }, "B")
      .trash(P1, { might: 1, name: "Card C" }, "C")
      .trash(P1, { might: 1, name: "Card D" }, "D")
      .trash(P1, { might: 1, name: "Card E" }, "E")
      .hand(P1, { might: 1 }, "h1")
      .hand(P1, { might: 1 }, "h2")
      .build();
    expect(game.p1.deck()).toHaveLength(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    // trash → deck (5), then 1 drawn from it.
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.deck()).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(3);
    const drawn = game.p1.hand().find((c) => c !== "h1" && c !== "h2");
    expect(["A", "B", "C", "D", "E"]).toContain(drawn as string);
    expect(new Set([...game.p1.deck(), drawn as string])).toEqual(new Set(["A", "B", "C", "D", "E"]));
    // The chosen opponent (only one in 1v1) gains the point; P1's score is untouched.
    expect(game.p2.points()).toBe(4);
    expect(game.p1.points()).toBe(4);
    // Game continues: P1 is in their Main Phase with priority.
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
    expect(mainDecision(game)?.seat).toBe(P1);
    expect(mainDecision(game)?.context).toBe("main");
  });

  test("a Burn Out point is not a Conquer, so it can be the opponent's winning 8th point (431.2.c, 471.1.a.1, 323.1)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 7)
      .battlefield("bfA", { controller: P1 }) // P2 has certainly NOT scored every battlefield
      .fillDecks(false)
      .deck(P2, [{ might: 1 }, { might: 1 }])
      .trash(P1, { might: 1 }, "A")
      .trash(P1, { might: 1 }, "B")
      .trash(P1, { might: 1 }, "C")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    // Not converted into a card draw for P2 (that restriction is Conquer-only).
    expect(game.p2.hand()).toHaveLength(p2Hand);
    // P1 does not get a Main Phase with priority.
    expect(game.decision()).toBeNull();
  });

  // Expected (431.3): deck AND trash empty → each draw attempt burns out again, P2 goes 5→6→7→8 and wins
  // immediately (431.3.c.1). Actual: the engine performs a single Burn Out (P2 = 6), draws nothing and
  // simply continues into P1's Main Phase.
  test.failing("BUG: 431.3 — with an empty deck and empty trash the engine burns out only once (opponent +1) instead of repeating until the opponent wins", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 5)
      .fillDecks(false)
      .deck(P2, [{ might: 1 }, { might: 1 }])
      .hand(P1, { might: 1 }, "h1")
      .build();
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.p1.trash()).toHaveLength(0);
    await game.p2.endTurn();
    await game.settle({ maxSteps: 50 }); // must terminate — no infinite loop
    expect(game.p1.hand()).toEqual(["h1"]);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// 316.3 / 317.2.d — Rune Pool emptying
// ---------------------------------------------------------------------------

describe("Rune Pool empties at the start of the Main Phase and at the end of the turn (316.3, 317.2.d, 166, 167.1)", () => {
  test("energy the Turn Player floats during the Beginning Phase is gone when the Main Phase opens; rune cards stay; energy added during Main persists across actions (316.3, 161.1.a)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .battlefield("bfA", { controller: null })
      .unit(P1, "base", { might: 2 }, "walker")
      .runes(P1, "fury", 3, { exhausted: true })
      .legend(P1, START_OF_TURN_LEGEND, "herald")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    // Reaction-speed Add while the start-of-turn trigger is on the chain (runes were readied in Awaken).
    await game.p1.tapRune();
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    // Emptying the pool is not recycling and does not touch the rune cards: 2 tapped stay tapped, 1 stays ready.
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(0);
    // During Main: add 1, take another action, still 1 (no mid-phase emptying).
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    await game.p1.move("walker", "bfA");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(1);
  });

  // Expected (316.3 "Each player's Rune Pool empties"): energy P2 floated as a Reaction during P1's Beginning
  // Phase is lost when P1's Main Phase starts. Actual: only the Turn Player's pool is emptied (draw.onEnd),
  // so P2 carries 1 energy into P1's Main Phase.
  test.failing("BUG: 316.3 — only the Turn Player's pool is emptied when the Main Phase starts; the opponent keeps energy floated during the Beginning Phase", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .runes(P1, "fury", 1, { exhausted: true })
      .runes(P2, "calm", 2)
      .legend(P1, START_OF_TURN_LEGEND, "herald")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune(); // P2 floats 1 energy in P1's Beginning Phase
    expect(game.p2.energy()).toBe(1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.runes()).toHaveLength(2); // rune cards untouched either way
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
  });

  test("at end of turn EACH player's Energy and Power are lost, rune cards stay on the board, and only the new Turn Player's runes ready (317.2.d, 315.1.b)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .resources(P2, { energy: 1 })
      .runes(P1, "calm", 4, { exhausted: true })
      .rune(P2, "fury", { alias: "p2rune", exhausted: true })
      .fillDecks({ main: 10, runes: 6 })
      .build();
    const p1RuneDeck = game.p1.runeDeck().length;
    const p2RuneDeck = game.p2.runeDeck().length;
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    // Both pools empty — P2 did not carry its floating 1 energy into its own turn.
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("calm")).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
    // Rune cards: nothing recycled.
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runeDeck()).toHaveLength(p1RuneDeck);
    expect(game.p2.runes()).toHaveLength(3); // 1 + 2 channeled
    expect(game.p2.runeDeck()).toHaveLength(p2RuneDeck - 2);
    // Only the Turn Player (P2) readied; P1's runes stay exhausted for the whole of P2's turn.
    expect(game.state("p2rune").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    // …and ready at P1's next Awaken.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes({ ready: true })).toHaveLength(6); // 4 readied + 2 channeled ready
  });
});

// ---------------------------------------------------------------------------
// 305 / 316.9 — Ending the turn requires an empty chain and no showdown
// ---------------------------------------------------------------------------

describe("The turn can only end from a Neutral Open state (305, 309.1, 310.1, 316.9)", () => {
  test("with a spell on the chain endTurn is unavailable; after it resolves (not discarded) endTurn works and the Ending Phase runs", async () => {
    const game = await scenario().unit(P1, "base", { might: 2 }, "u").hand(P1, PLUS2_THIS_TURN, "surge").build();
    await game.p1.cast("surge", { targets: "u" });
    expect(game.chain()).toHaveLength(1);
    expect(game.phase()).toBe("main");
    expect(game.p1.can("endTurn")).toBe(false);
    const refused = await game.p1.try((p) => p.endTurn());
    expect(refused.ok).toBe(false);
    expect(game.chain()).toHaveLength(1); // nothing silently discarded
    expect(game.phase()).toBe("main");
    // Closed state: the decision is a chain-priority window.
    expect(mainDecision(game)?.context).toBe("chain");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("u").might).toBe(4); // it resolved rather than being dropped
    expect(game.p1.can("endTurn")).toBe(true);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("u").might).toBe(2); // Ending Phase ran
  });

  test("with an activated legend ability on the chain endTurn is unavailable until it resolves", async () => {
    const game = await scenario().legend(P1, EXHAUST_LEGEND, "sage").build();
    await game.p1.activate("sage");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("endTurn")).toBe(false);
    expect((await game.p1.try((p) => p.endTurn())).ok).toBe(false);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.can("endTurn")).toBe(true);
  });

  test("while a (non-combat) Showdown is open endTurn is unavailable; once both pass Focus it closes and endTurn works", async () => {
    const game = await scenario().battlefield("bfA", { controller: null }).unit(P1, "base", { might: 2 }, "u").build();
    await game.p1.move("u", "bfA");
    const d = mainDecision(game);
    expect(d?.context).toBe("showdown");
    expect(d?.seat).toBe(P1); // the mover has Focus first
    expect(game.p1.can("endTurn")).toBe(false);
    expect((await game.p1.try((p) => p.endTurn())).ok).toBe(false);
    expect(game.phase()).toBe("main");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("endTurn")).toBe(false);
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.can("endTurn")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 317 — Ending Phase: Ending Step, then Expiration Step ordering
// ---------------------------------------------------------------------------

describe("Expiration Step: 'this turn' effects and stun expire at the end of the CURRENT turn (317.1, 317.2.c, 710, 423.1.a.2)", () => {
  test("a '+2 Might this turn' buff created on P1's turn is gone once P1's Expiration Step has run (start of P2's turn) and never returns", async () => {
    const game = await scenario().unit(P1, "base", { might: 2 }, "u").hand(P1, PLUS2_THIS_TURN, "surge").build();
    await game.p1.cast("surge", { targets: "u" });
    await game.settle();
    expect(game.state("u").might).toBe(4);
    // Not expired mid-Main by other actions.
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.state("u").might).toBe(2);
    expect(game.state("u").baseMight).toBe(2);
    expect(game.state("u").mightModifier).toBe(0);
    // …and it does not come back on P1's own next turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("u").might).toBe(2);
  });

  // Expected: 317.1 (Ending Step — "at the end of the turn" effects) precedes 317.2 (Expiration Step), so while
  // an end-of-turn trigger is still on the chain the '+2 Might this turn' must still apply (Might 4).
  // Actual: the engine expires all 'this turn' effects in the same hook that queues the end-of-turn trigger,
  // so the unit already reads Might 2 while the Ending Step chain is open.
  test.failing("BUG: 317.1/317.2.c — 'this turn' effects expire before end-of-turn triggers resolve (buff already gone during the Ending Step)", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 2 }, "u")
      .hand(P1, PLUS2_THIS_TURN, "surge")
      .legend(P1, END_OF_TURN_LEGEND, "dusk")
      .build();
    await game.p1.cast("surge", { targets: "u" });
    await game.settle();
    expect(game.state("u").might).toBe(4);
    await game.p1.endTurn();
    // The end-of-turn trigger holds the Ending Step open.
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    expect(game.state("u").might).toBe(4);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("u").might).toBe(2);
  });

  test("effects created during the OPPONENT's turn (a Reaction buff by P1, a stun by P2) both expire at the end of that turn, not at the end of P1's next turn", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", { might: 2 }, "U")
      .unit(P1, "base", { might: 2 }, "V", { exhausted: true })
      .hand(P1, PLUS2_REACTION, "snap")
      .hand(P2, STUN, "daze")
      .build();
    await game.p2.cast("daze", { targets: "V" });
    await game.p2.passPriority();
    // P1 reacts on P2's turn.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("snap", { targets: "U" });
    await game.settle();
    expect(game.state("U").might).toBe(4);
    expect(game.state("V").isStunned).toBe(true);
    expect(game.turnPlayer()).toBe(P2);
    // End of P2's turn: both gone by the time P1's turn opens.
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("U").might).toBe(2);
    expect(game.state("V").isStunned).toBe(false);
    expect(game.state("V").isReady).toBe(true); // readied at P1's Awaken
  });

  test("heal (3c) happens before 'this turn' buffs expire (3d): a unit with 4 damage and Might 3+3 survives the turn end at Might 3 and keeps its battlefield (317.2.b–d, 323.5, 324.2)", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 3 }, "u")
      .hand(P1, PLUS3_THIS_TURN, "surge")
      .hand(P1, DEAL4, "bolt")
      .build();
    await game.p1.cast("surge", { targets: "u" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "u" });
    await game.settle();
    expect(game.zoneOf("u")).toBe("battlefield-bfA");
    expect(game.state("u").might).toBe(6);
    expect(game.state("u").meta.damage).toBe(4);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    // Alive, unbuffed, healed, still holding bfA.
    expect(game.zoneOf("u")).toBe("battlefield-bfA");
    expect(game.state("u").might).toBe(3);
    expect(game.state("u").meta.damage ?? 0).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    // Survives follow-up cleanups during P2's turn as well.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("u")).toBe("battlefield-bfA");
    expect(game.p1.points()).toBe(1); // held bfA at the start of P1's next turn
  });

  // Expected (317.2.b "Heal all Units"): every damage store reads 0 after the Expiration Step. Actual: the
  // engine zeroes meta.damage but leaves the parallel `__counters.damage` store at 4, so the observable
  // CardState.damage (max of both) still reports 4 on the next turn.
  test.failing("BUG: 317.2.b — end-of-turn heal clears meta.damage but not the damage counter store, so the unit still reads 4 damage next turn", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 3 }, "u")
      .hand(P1, PLUS3_THIS_TURN, "surge")
      .hand(P1, DEAL4, "bolt")
      .build();
    await game.p1.cast("surge", { targets: "u" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "u" });
    await game.settle();
    expect(game.state("u").damage).toBe(4);
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("u")).toBe("battlefield-bfA");
    expect(game.state("u").damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 315.2.b — Hold scoring
// ---------------------------------------------------------------------------

describe("Hold in the Beginning Phase (315.2.b.2, 469–471, 323.6)", () => {
  test("Hold scores +1 once; re-taking the same battlefield later that turn is a Conquer of an already-scored battlefield → no point (470, 471.2.c); a different battlefield does score", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .points(P1, 3)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: null })
      .unit(P1, "bfA", { might: 2 }, "U1")
      .unit(P1, "base", { might: 2 }, "U2")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(4); // exactly +1 for holding bfA
    // Vacate bfA: control is lost at the next cleanup in an Open state (323.6).
    await game.p1.move("U1", "base");
    await game.settle();
    expect(game.locationOf("U1")).toBe("base");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    // Walk back in with U2: non-combat showdown, both pass, P1 controls bfA again — but no second point.
    await game.p1.move("U2", "bfA");
    expect(mainDecision(game)?.context).toBe("showdown");
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);

    // Cross-check: the same walk-in at bfB (not scored this turn) IS worth a point.
    const other = await scenario()
      .turn(4)
      .active(P2)
      .points(P1, 3)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: null })
      .unit(P1, "bfA", { might: 2 }, "U1")
      .unit(P1, "base", { might: 2 }, "U2")
      .build();
    await other.advanceTurn();
    expect(other.p1.points()).toBe(4);
    await other.p1.move("U2", "bfB");
    await other.settle();
    expect(other.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(other.p1.points()).toBe(5);
  });

  // Expected: Hold is not a Conquer, so at 7 points holding ONE battlefield awards the 8th point and the win
  // check at the next Cleanup (323.1, after the Beginning→Channel transition per 319.2) ends the game before
  // Channel/Draw. Actual: P1 reaches 8 points but the game keeps going (runes channeled, card drawn, Main
  // Phase opened) — no win is ever declared for a Hold point.
  test.failing("BUG: 323.1/471.1.a.1 — reaching the Victory Score via Hold does not end the game; the turn continues into Channel/Draw/Main", async () => {
    const game = await scenario()
      .turn(6)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 5)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 }) // P1 does NOT control every battlefield — irrelevant for Hold
      .unit(P1, "bfA", { might: 2 }, "U1")
      .unit(P2, "bfB", { might: 2 }, "E1")
      .fillDecks({ main: 10, runes: 6 })
      .build();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.runeDeck()).toHaveLength(6); // no Channel
    expect(game.p1.hand()).toHaveLength(hand); // no Draw (and no "draw instead of the point")
    expect(game.decision()).toBeNull(); // no Main Phase priority
  });

  // Expected (315.2.a before 315.2.b): the opponent's "start of Beginning Phase" trigger resolves first, kills
  // P1's only unit at bfA, control is lost at the following cleanup (323.6), so the Scoring Step finds no
  // controlled battlefield → no Hold point (P1 stays at 3). Actual: the engine awards the Hold point in the
  // same step that queues the trigger, before it resolves — P1 ends on 4 with an empty, uncontrolled bfA.
  test.failing("BUG: 315.2.a/315.2.b — Hold is scored before start-of-Beginning-Phase triggers resolve (unit killed by the trigger still earns the point)", async () => {
    const RAZER = {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" },
            type: "damage",
          },
          trigger: { event: "start-of-turn", on: "opponent", timing: "at" },
          type: "triggered",
        },
      ],
      cardType: "legend",
      domain: "fury",
      name: "Dawn Razer (test legend)",
    };
    const game = await scenario()
      .turn(4)
      .active(P2)
      .points(P1, 3)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 1 }, "u")
      .legend(P2, RAZER, "razer")
      .fillDecks({ main: 10, runes: 6 })
      .build();
    const runeDeck = game.p1.runeDeck().length;
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toHaveLength(1); // the trigger is pending…
    expect(game.p1.points()).toBe(3); // …so no Hold may have been awarded yet
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p1.points()).toBe(3);
    // The rest of the turn proceeds normally.
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 2);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.phase()).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// 734–738 — Additional turns
// ---------------------------------------------------------------------------

describe("Additional Turns (734, 736–738, 317.3)", () => {
  test("'take a turn after this one': the extra turn runs a full Start of Turn (ready, Hold again, channel exactly 2 even for the second player, draw 1), pools do not carry over, then normal alternation resumes", async () => {
    const game = await scenario()
      .turn(6)
      .active(P1)
      .points(P1, 2)
      .resources(P1, { energy: 1 })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2 }, "U", { exhausted: true })
      .runes(P1, "fury", 3, { exhausted: true })
      .hand(P1, EXTRA_TURN, "warp")
      .fillDecks({ main: 10, runes: 6 })
      .build();
    // P1 was the SECOND player of this game (their first turn was game turn 2) — the channel bonus is long spent.
    game.engine.applyPatches([
      { op: "add", path: ["firstTurnNumber"], value: { [P1]: 2 } },
      { op: "add", path: ["secondPlayerExtraRune"], value: true },
    ] as never);
    const hand = game.p1.hand().length; // includes warp
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("trash");
    await game.p1.endTurn();
    await game.settle();
    // P1 again, new turn number, full start of turn.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(7);
    expect(game.phase()).toBe("main");
    expect(game.state("U").isReady).toBe(true);
    expect(game.p1.runes()).toHaveLength(5); // 3 + exactly 2
    expect(game.p1.runes({ ready: true })).toHaveLength(5);
    expect(game.p1.runeDeck()).toHaveLength(4);
    expect(game.p1.points()).toBe(3); // held bfA again — per-turn limit resets on a new turn
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // cast warp, drew 1
    expect(game.p1.energy()).toBe(0); // Ending Phase emptied the pool; nothing carried across
    expect(mainDecision(game)?.seat).toBe(P1);
    expect(mainDecision(game)?.context).toBe("main");
    expect(game.p2.can("endTurn")).toBe(false);
    // Then P2, P1, P2 — the extra turn is consumed, not repeated.
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      order.push((await game.advanceTurn()).next);
    }
    expect(order).toEqual([P2, P1, P2]);
  });

  test("two additional turns created by the same player are both taken back-to-back before the opponent's turn (738 ex. 1)", async () => {
    const game = await scenario()
      .turn(5)
      .active(P1)
      .points(P1, 0)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2 }, "U")
      .hand(P1, EXTRA_TURN, "warp1")
      .hand(P1, EXTRA_TURN, "warp2")
      .fillDecks({ main: 10, runes: 8 })
      .build();
    await game.p1.cast("warp1");
    await game.settle();
    await game.p1.cast("warp2");
    await game.settle();
    const runeDeck = game.p1.runeDeck().length;
    const seq: string[] = [];
    const points: number[] = [];
    for (let i = 0; i < 4; i++) {
      seq.push((await game.advanceTurn()).next);
      points.push(game.p1.points());
    }
    expect(seq).toEqual([P1, P1, P2, P1]);
    // Each extra turn held bfA (+1 each) and channeled 2.
    expect(points.slice(0, 2)).toEqual([1, 2]);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 6); // three P1 turn starts × 2 runes
  });

  // Expected (738, second example): each Additional Turn is inserted DIRECTLY after the current turn, so the
  // one created later (P2's, via a Reaction) is taken first: after P1 ends → P2*, P1*, P2, P1.
  // Actual: the engine keeps a FIFO queue → P1*, P2*, P1, P2.
  test.failing("BUG: 738 — multiple additional turns are dequeued FIFO; the later-created additional turn should be taken first", async () => {
    const game = await scenario()
      .turn(5)
      .active(P1)
      .unit(P1, "base", { might: 1 }, "u")
      .hand(P1, EXTRA_TURN, "warpP1")
      .hand(P1, PLUS2_THIS_TURN, "surge")
      .hand(P2, EXTRA_TURN_REACTION, "warpP2")
      .build();
    // First: P1's additional turn.
    await game.p1.cast("warpP1");
    await game.settle();
    // Later in the same turn: P2 reacts to a P1 spell with their own additional-turn effect.
    await game.p1.cast("surge", { targets: "u" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("warpP2");
    await game.settle();
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) {
      seq.push((await game.advanceTurn()).next);
    }
    expect(seq).toEqual([P2, P1, P2, P1]);
  });

  test("an additional turn owned by the opponent (created on P1's turn) is taken immediately after P1's turn and does not re-grant the second-player channel bonus (734, 485.7)", async () => {
    const game = await scenario()
      .turn(5)
      .active(P1)
      .unit(P1, "base", { might: 1 }, "u")
      .hand(P1, PLUS2_THIS_TURN, "surge")
      .hand(P2, EXTRA_TURN_REACTION, "warpP2")
      .fillDecks({ main: 10, runes: 8 })
      .build();
    game.engine.applyPatches([
      { op: "add", path: ["firstTurnNumber"], value: { [P2]: 2 } },
      { op: "add", path: ["secondPlayerExtraRune"], value: true },
    ] as never);
    await game.p1.cast("surge", { targets: "u" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("warpP2");
    await game.settle();
    const first = await game.advanceTurn();
    expect(first.next).toBe(P2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(2); // not 3 — the bonus is for the first Channel Phase of the game only
    expect(mainDecision(game)?.seat).toBe(P2);
  });

  // Expected (737): the queue is [P1 > P2* > P2 > P1 > …]; after the additional turn P2* is removed the queue
  // "proceeds with its previously queued turns", i.e. P2's REGULAR turn, then P1. Actual: the engine resumes
  // seat rotation from the additional turn's owner, giving P2*, P1, P2 — P2's regular turn is skipped.
  test.failing("BUG: 737 — after an opponent-owned additional turn the engine rotates from that player (P2*, P1, …) instead of resuming the previously queued turn (P2*, P2, P1)", async () => {
    const game = await scenario()
      .turn(5)
      .active(P1)
      .unit(P1, "base", { might: 1 }, "u")
      .hand(P1, PLUS2_THIS_TURN, "surge")
      .hand(P2, EXTRA_TURN_REACTION, "warpP2")
      .fillDecks({ main: 10, runes: 8 })
      .build();
    await game.p1.cast("surge", { targets: "u" });
    await game.p1.passPriority();
    await game.p2.cast("warpP2");
    await game.settle();
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) {
      seq.push((await game.advanceTurn()).next);
    }
    // P1 ends → P2* (additional) → P2 (regular) → P1 → P2.
    expect(seq).toEqual([P2, P2, P1, P2]);
  });
});
