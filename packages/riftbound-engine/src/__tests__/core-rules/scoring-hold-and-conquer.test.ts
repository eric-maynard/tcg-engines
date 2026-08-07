/**
 * Core rules: Scoring — Hold at the Scoring Step, Conquer on establishing Control,
 * once-per-battlefield-per-turn (tracked per player), Score triggers, point denial.
 *
 * Rules covered (riftbound-rules):
 *   315.2.b / 315.2.b.2   Beginning Phase → Scoring Step: the Turn Player Holds every battlefield they control
 *   315.3.b / 315.4.b     Channel Phase (2 runes) and Draw Phase (draw 1) come AFTER the Scoring Step
 *   485.7                 the player going second channels one extra rune in their first Channel Phase only
 *   190.2 / 190.4 / 190.4.c  Control is binary; established at the end of a Showdown/Combat; lost at cleanup when empty
 *   190.3.a / 190.3.a.1   a unit arriving where its controller does not control applies Contested
 *   323.6                 cleanup: lose control of a battlefield with none of your units (Open state, nothing ongoing)
 *   344.2 / 345 / 348.2.a / 348.2.a.1  Non-Combat Showdown: opener gets Focus; all pass → sole player establishes
 *                         Control → a Conquer only if they have not scored that battlefield this turn
 *   466.3.a / 466.5 / 466.5.a / 466.5.d / 466.5.e / 466.7.a  combat result → establish Control → Conquer; clear
 *                         Contested; remove attacker/defender designations
 *   468 / 468.1 / 469 / 469.1 / 469.2  Scoring = Conquer or Hold (a Limited Action, never discretionary)
 *   470                   a player may Score each battlefield at most once per turn (either method)
 *   471 / 471.1 / 471.2 / 471.2.a-c    a Score = gain up to 1 point + trigger Hold/Conquer abilities AT THAT battlefield,
 *                         at most once per battlefield per turn per player
 *   383.4.c / 383.4.c.2.c / 383.4.d / 383.4.d.2.a / 383.4.d.2.c  Conquer/Hold Effects; they still trigger when
 *                         the point itself is negated or replaced
 *   194.1.c               points gained by an ability are a Gain, not a Score
 *   317.2.c               "this turn" bookkeeping expires at end of turn
 *
 * All units, spells and legends are inline filler definitions; the two printed cards used as
 * cross-checks (Tianna Crownguard, Ahri Alluring) live in their own tests.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { Game, P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Legend: "When you hold, draw 1." — player-referencing Hold Effect (383.4.d.2.b). */
const HOLD_DRAW_LEGEND = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "hold", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  domain: "fury",
  name: "Castellan (inline legend: When you hold, draw 1)",
};

/** Legend: "When you conquer, draw 1." — player-referencing Conquer Effect (383.4.c.2.b). */
const CONQUER_DRAW_LEGEND = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  domain: "fury",
  name: "Warlord (inline legend: When you conquer, draw 1)",
};

/** Unit: "When I conquer, draw 1." */
const CONQUER_DRAW_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" }],
  might,
  name: "Raider (inline: When I conquer, draw 1)",
});

/** Unit: "When I hold, draw 1." */
const HOLD_DRAW_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "hold", on: "self" }, type: "triggered" }],
  might,
  name: "Sentinel (inline: When I hold, draw 1)",
});

/** Unit: "When I hold, you gain 1 point." (cf. Ahri, Alluring — "When I hold, you score 1 point.") */
const HOLD_POINT_UNIT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "score" }, trigger: { event: "hold", on: "self" }, type: "triggered" }],
  might,
  name: "Charmer (inline: When I hold, you gain 1 point)",
});

/** Unit: "While I'm at a battlefield, opponents can't gain points." (cf. Tianna Crownguard). */
const POINT_DENIER_UNIT = (might: number) => ({
  abilities: [
    {
      condition: { type: "while-at-battlefield" },
      effect: { restriction: "opponents can't gain points.", type: "restriction" },
      type: "static",
    },
  ],
  might,
  name: "Warden (inline: While I'm at a battlefield, opponents can't gain points)",
});

/** Spell: "Kill a friendly unit." */
const KILL_FRIENDLY_SPELL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Cull (inline spell: Kill a friendly unit)",
  timing: "action",
};

/** Spell: "Recall a friendly unit." */
const RECALL_FRIENDLY_SPELL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Retreat (inline spell: Recall a friendly unit)",
  timing: "action",
};

/** Spell: "Draw 1." — any filler spell to open a chain. */
const DRAW_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Ponder (inline spell: Draw 1)",
  timing: "action",
};

/** Spell: "[Reaction] Kill a unit at a battlefield." */
const KILL_AT_BATTLEFIELD_REACTION = {
  abilities: [{ effect: { target: { location: "battlefield", type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snipe (inline Reaction: Kill a unit at a battlefield)",
  timing: "reaction",
};

/** Spell: "[Reaction] Move a friendly unit to a battlefield." */
const MOVE_TO_BATTLEFIELD_REACTION = {
  abilities: [
    { effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Flank (inline Reaction: Move a friendly unit to a battlefield)",
  timing: "reaction",
};

/** A vanilla constructed deck for a real fresh-game start (no legend → no start-of-turn triggers). */
const VANILLA_DECK = {
  battlefieldIds: ["ogn-277-298"],
  mainDeckCardIds: Array.from({ length: 40 }, () => "ogn-175-298"),
  runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-007-298"),
};

function contextOf(game: Game): string | undefined {
  const d = game.decision();
  return d && d.kind === "action" ? d.context : undefined;
}

// ---------------------------------------------------------------------------
// Hold — Beginning Phase / Scoring Step
// ---------------------------------------------------------------------------

describe("Hold: the Turn Player scores each controlled battlefield once at the Scoring Step (315.2.b, 469.2, 470, 471)", () => {
  test("holding A scores exactly +1 for P1 before the Channel and Draw phases; enemy-held B gives P1 nothing and P2's points do not move", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P2, "B", { might: 2 }, "p2AtB")
      .legend(P1, HOLD_DRAW_LEGEND, "castellan") // pauses the Beginning Phase with a Hold trigger on the chain
      .build();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    const handBefore = game.p1.hand().length;

    await game.p2.endTurn();
    // We are inside P1's Beginning Phase: the Hold already happened (Scoring Step) …
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    // … exactly one Hold Effect went on the chain (one Score event, for A only) …
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "castellan", controller: P1, triggered: true })]);
    // … and neither the Channel Phase nor the Draw Phase has run yet (315 order: Awaken → Beginning → Channel → Draw).
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(handBefore);

    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // no second Hold, nothing during Awaken/Channel/Draw
    expect(game.p2.points()).toBe(0);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 2); // legend draw + Draw Phase
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.gameState.battlefields.B?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("variant: controlling both A and B yields two separate Hold scores (+2) and two distinct Hold triggers, one per battlefield (470, 471.2.b)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .unit(P1, "B", { might: 2 }, "p1AtB")
      .legend(P1, HOLD_DRAW_LEGEND, "castellan")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(2);
    expect([...game.gameState.scoredThisTurn[P1] ?? []].sort()).toEqual(["A", "B"]);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((i) => i.cardId === "castellan" && i.triggered && i.controller === P1)).toBe(true);
    await game.settle();
    expect(game.p1.points()).toBe(2); // never a third point
    expect(game.p1.hand()).toHaveLength(handBefore + 3); // two legend draws + Draw Phase
  });

  test("only the TURN player holds: on P2's turn P1's controlled battlefield scores nothing for anybody (315.2.b.2)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "p1AtA")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
  });

  test("units in base and uncontrolled battlefields hold nothing: P1 starts their turn at 0 and stays at 0", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("A", { controller: null })
      .battlefield("B", { controller: null })
      .unit(P1, "base", { might: 3 }, "idle1")
      .unit(P1, "base", { might: 3 }, "idle2")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.gameState.battlefields.A?.controller).toBeNull();
  });

  test.failing("BUG: 468/469/410.2 — Scoring is a Limited Action (only Hold/Conquer); engine offers a discretionary `scorePoint` main-phase action that awards a point on demand", async () => {
    // Expected: a player who merely controls A during their Main Phase has no way to "score" it — the
    // only routes are the Scoring Step (Hold) and establishing Control (Conquer). No such option exists.
    // Actual: `scorePoint:A` is enumerated for the turn player and executing it grants +1.
    const game = await scenario().battlefield("A", { controller: P1 }).unit(P1, "A", { might: 2 }, "p1AtA").build();
    expect(game.p1.legal().some((o) => o.moveId === "scorePoint")).toBe(false);
    const r = await game.p1.try((p) => p.choose("scorePoint:A"));
    expect(r.ok).toBe(false);
    expect(game.p1.points()).toBe(0);
  });
});

describe("Fresh game: nothing to hold on turn one; second player's first Channel Phase gets the extra rune (315.2.b, 315.3.b, 315.4.b, 485.7)", () => {
  test("P1 T1: 0 points, 2 runes, drew 1; P2 T1: 0 points, 3 runes (2 + going-second extra), drew 1; P2 T2 channels only 2 more; P1 never gets the extra", async () => {
    const game = await Game.fromDecks({ p1: VANILLA_DECK, p2: VANILLA_DECK });
    // P1's first turn, main phase (Scoring Step and Channel/Draw already done).
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p2.runes()).toHaveLength(0);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    expect(p1Hand).toBe(p2Hand + 1); // P1 has taken its Draw Phase, P2 has not
    for (const bf of Object.values(game.gameState.battlefields)) {
      expect(bf.controller).toBeNull();
    }

    // P2's first turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.runes()).toHaveLength(3); // 2 + the going-second extra rune (485.7)
    expect(game.p1.runes()).toHaveLength(2); // P1 never receives the extra
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);

    // P1's second turn: 2 more (no extra for the first player, ever).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p2.runes()).toHaveLength(3);

    // P2's second turn: only 2 more — the extra rune is a one-off.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Conquer — establishing Control
// ---------------------------------------------------------------------------

describe("Conquer: establishing Control of a battlefield not yet scored this turn (469.1, 471.1)", () => {
  test("empty uncontrolled battlefield: move → Contested → Non-Combat Showdown (P1 Focus) → both pass → P1 establishes Control = Conquer, +1 exactly once (190.3.a, 344.2, 345, 348.2.a.1)", async () => {
    const game = await scenario()
      .battlefield("A", { controller: null })
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "base", { might: 2 }, "bystander")
      .build();
    expect(game.p1.points()).toBe(0);

    await game.p1.move("scout", "A");
    // The move itself scores nothing and grants no control (190.4.b) — it only applies Contested and opens the showdown.
    expect(game.locationOf("scout")).toBe("A");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toHaveLength(0);
    const sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ active: true, battlefieldId: "A", focusPlayer: P1, isCombatShowdown: false });
    let d = game.decision() as ActionDecision;
    expect(d.kind).toBe("action");
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P1); // the player who applied Contested gains Focus (345)
    expect(game.state("scout").combatRole).toBeFalsy(); // no combat: no opposing units

    await game.p1.passFocus();
    d = game.decision() as ActionDecision;
    expect(d.context).toBe("showdown");
    expect(d.seat).toBe(P2);
    expect(game.p1.points()).toBe(0); // still nothing until the showdown closes
    expect(game.gameState.battlefields.A?.controller).toBeNull();

    await game.p2.passFocus();
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(contextOf(game)).toBe("main");
    expect(game.actingSeat()).toBe(P1);
    // Nothing further to score: settling changes nothing.
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("combat win: attacker survives, defender dies → P1 establishes Control = Conquer 2→3; the loser P2 keeps all 3 points; Contested and designations cleared (466.3.a, 466.5, 466.5.d, 466.7.a)", async () => {
    const game = await scenario()
      .points(P1, 2)
      .points(P2, 3)
      .battlefield("A", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "bruiser")
      .unit(P2, "A", { might: 1 }, "sentry")
      .build();

    await game.p1.move("bruiser", "A");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({ battlefieldId: "A", focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("bruiser").combatRole).toBe("attacker");
    expect(game.state("sentry").combatRole).toBe("defender");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.points()).toBe(2); // nothing before the Resolution Step
    expect(game.p2.points()).toBe(3);

    await game.p1.passFocus();
    expect(game.p1.points()).toBe(2);
    await game.p2.passFocus(); // showdown closes → combat damage → resolution (auto procedure)

    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-A");
    expect(game.state("bruiser").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.A?.contestedBy).toBeUndefined();
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(3); // losing a battlefield never deducts points
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.state("bruiser").combatRole).toBeFalsy(); // 466.7.a
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(contextOf(game)).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 470 — once per battlefield per turn (per player)
// ---------------------------------------------------------------------------

describe("Once per battlefield per turn: re-establishing Control of an already-scored battlefield is not a Conquer (470, 348.2.a.1, 466.5.d, 471.2.c)", () => {
  test("Hold A (3→4), kill own unit → lose A at cleanup (323.6), move a fresh unit in → showdown → Control regained but NO point: stays 4; A still marked scored; P1 controls A", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 3)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", { might: 2 }, "holder")
      .unit(P1, "base", { might: 2 }, "reserve")
      .hand(P1, KILL_FRIENDLY_SPELL, "cull")
      .build();

    await game.advanceTurn(); // → P1's turn; Scoring Step holds A
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    await game.p1.cast("cull", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    // Open state, no showdown/combat at A → P1 loses control in the following cleanup.
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(4);

    await game.p1.move("reserve", "A");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(contextOf(game)).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.passFocus();
    await game.p2.passFocus();

    // Control ≠ scoring: P1 controls A again, but already Scored A this turn → not a Conquer.
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(contextOf(game)).toBe("main");
  });

  test("471.2.c / 383.4.c.2.a — re-taking an already-scored battlefield must NOT put the unit's 'When I conquer' ability on the chain; engine fires the conquer trigger (draws) even though no Conquer/point occurred", async () => {
    // Expected: after Hold A then losing and re-taking A the same turn, "reserve"'s conquer ability does not
    // trigger (A was already Scored; Conquer Effects fire only when the battlefield is Scored) → hand unchanged.
    // Actual: the engine emits a "conquer" event on every control gain, so P1 draws a card.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 3)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", CONQUER_DRAW_UNIT(2), "holder")
      .unit(P1, "base", CONQUER_DRAW_UNIT(2), "reserve")
      .hand(P1, KILL_FRIENDLY_SPELL, "cull")
      .build();
    await game.advanceTurn();
    await game.p1.cast("cull", { targets: "holder" });
    await game.settle();
    const handBefore = game.p1.hand().length;
    await game.p1.move("reserve", "A");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain()).toHaveLength(0); // nothing was put on the chain
    await game.settle();
    expect(game.gameState.battlefields.A?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.p1.hand()).toHaveLength(handBefore); // no draw
  });

  test("Conquer A by combat (0→1); opponent's Reaction kills the conqueror mid-chain (LIFO); A empties → uncontrolled; second unit re-takes A via showdown → NOT a Conquer (stays 1); next own turn Holds A normally (+1)", async () => {
    const game = await scenario()
      .battlefield("A", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "vanguard")
      .unit(P1, "base", { might: 2 }, "reserve")
      .unit(P2, "A", { might: 1 }, "sentry")
      .hand(P1, DRAW_SPELL, "ponder")
      .hand(P2, KILL_AT_BATTLEFIELD_REACTION, "snipe")
      .build();

    // Step 1: conquer by combat.
    await game.p1.move("vanguard", "A");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    // Step 2: P1 casts a filler spell; P2 responds with the Reaction kill; LIFO → kill resolves first.
    await game.p1.cast("ponder");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "snipe")).toBe(true);
    await game.p2.cast("snipe", { targets: "vanguard" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder", "snipe"]); // snipe on top
    await game.settle();
    expect(game.zoneOf("vanguard")).toBe("trash");
    expect(game.zoneOf("ponder")).toBe("trash");
    // Cleanup in Open state: A has no units → P1 loses control; nobody scores anything for that.
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);

    // Step 3: re-take A with the reserve — control yes, Conquer no.
    await game.p1.move("reserve", "A");
    expect(contextOf(game)).toBe("showdown");
    expect(game.decision()?.seat).toBe(P1);
    await game.settle(); // both pass focus
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // no second point for A this turn
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.chain()).toHaveLength(0);

    // Step 4: the once-per-turn limit resets — on P1's NEXT turn A is Held normally.
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0); // P2 does not hold P1's battlefield
    await game.advanceTurn(); // → P1: Scoring Step
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("reserve")).toBe("A");
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]); // freshly marked by this turn's Hold only
  });
});

describe("Scored-this-turn is tracked PER PLAYER: the opponent may Conquer a battlefield on your turn even though you already scored it (469.1, 466.5.e, 348.2.a)", () => {
  /**
   * P1 conquers A (0→1). P1 recalls the conqueror; in response P2's Reaction moves D2 onto A. After the chain:
   * U1 is in base, D2 stands alone at A which nobody controls → P2 applied Contested → cleanup stages a
   * Non-Combat Showdown at A. The engine surfaces the start of a staged showdown as the turn player's
   * `startShowdown:<bf>` step (323.12: "the Turn Player chooses one of those Battlefields"), so P1 takes it.
   */
  async function untilP2StandsAloneAtA() {
    const game = await scenario()
      .battlefield("A", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "u1")
      .unit(P1, "base", { might: 3 }, "u2")
      .unit(P2, "A", { might: 1 }, "d1")
      .unit(P2, "base", { might: 1 }, "d2")
      .hand(P1, RECALL_FRIENDLY_SPELL, "retreat")
      .hand(P2, MOVE_TO_BATTLEFIELD_REACTION, "flank")
      .build();
    // Step 1: P1 conquers A by combat.
    await game.p1.move("u1", "A");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    // Step 2: recall + reaction move.
    await game.p1.cast("retreat", { targets: "u1" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("flank", { targets: "d2" }); // only one battlefield → D2 goes straight to A
    await game.settle(); // flank resolves (D2 → A, Contested by P2), then retreat (U1 → base)
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("d2")).toBe("A");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.p2.points()).toBe(0); // arriving is not conquering
    return game;
  }

  test("P2 (not the turn player) establishes Control of A after the showdown and Conquers: P2 0→1 although P1 already scored A this turn; then P1 re-takes A by combat and does NOT score again (P1 stays 1)", async () => {
    const game = await untilP2StandsAloneAtA();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("startShowdown")).toBe(true);
    await game.p1.choose("startShowdown:A");
    expect(contextOf(game)).toBe("showdown");
    expect(game.gameState.interaction?.showdownStack?.[0]?.battlefieldId).toBe("A");
    await game.settle(); // everyone passes focus → showdown closes

    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1); // P2's own once-per-turn record for A was clean
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["A"]);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);

    // Step 3: P1 attacks A with U2 (3) vs D2 (1) and wins → Control, but no second point for A.
    expect(contextOf(game)).toBe("main");
    await game.p1.move("u2", "A");
    expect(game.state("u2").combatRole).toBe("attacker");
    expect(game.state("d2").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.zoneOf("u2")).toBe("battlefield-A");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
  });

  test.failing("BUG: 345 — as the staged Non-Combat Showdown at A begins, P2 (who applied Contested) must gain Focus even on P1's turn; engine hands Focus to the turn player and flags the showdown as a combat showdown", async () => {
    // Expected: showdownStack[0] = { battlefieldId: A, focusPlayer: P2, isCombatShowdown: false }; P2 is the acting seat.
    // Actual: focusPlayer = P1 (the player who executed startShowdown) and isCombatShowdown = true with no opposing units.
    const game = await untilP2StandsAloneAtA();
    await game.p1.choose("startShowdown:A");
    const sd = game.gameState.interaction?.showdownStack?.[0];
    expect(sd?.battlefieldId).toBe("A");
    expect(sd?.isCombatShowdown).toBe(false);
    expect(sd?.focusPlayer).toBe(P2);
    expect(game.decision()?.seat).toBe(P2);
    expect(contextOf(game)).toBe("showdown");
  });

  test.failing("BUG: 323.12 / 344.2 — once the chain has resolved and the turn is Neutral Open, the staged showdown at A must BEGIN as part of cleanup; engine leaves it staged behind a manual `startShowdown` while P1 may take unrelated discretionary actions", async () => {
    // Expected: immediately after the chain empties, a showdown is in progress at A (state = Showdown Open),
    // so P1 cannot, e.g., Standard Move (144.1.c) until it closes.
    // Actual: no showdown is open; `standardMove:to:A` and `startShowdown:A` sit side by side in P1's menu.
    const game = await untilP2StandsAloneAtA();
    expect(game.gameState.interaction?.showdownStack?.length ?? 0).toBe(1);
    expect(contextOf(game)).toBe("showdown");
    expect(game.p1.can("move")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Score triggers & point denial
// ---------------------------------------------------------------------------

describe("Score triggers fire once per battlefield and are tied to the scored battlefield; denying the POINT does not deny the Score (471.2, 383.4.d.2.c)", () => {
  test("'When I hold' fires only for the battlefield its unit is at: H at A triggers once; vanilla-held B triggers nothing; both battlefields still score (+2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P1 })
      .unit(P1, "A", HOLD_DRAW_UNIT(2), "sentinel")
      .unit(P1, "B", { might: 2 }, "grunt")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentinel", triggered: true })]); // exactly one, from A
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 2); // one trigger draw + Draw Phase (not two trigger draws)
  });

  test("Hold A with 'When I hold, you gain 1 point' + Hold B (vanilla) + a 'When you conquer' legend: 2 → 3 (A) → 4 (B) → 5 (ability); the ability point is a Gain, not a Score; the conquer legend never triggers on holds (471.2.a/b, 194.1.c, 468.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 2)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P1 })
      .unit(P1, "A", HOLD_POINT_UNIT(2), "charmer")
      .unit(P1, "B", { might: 2 }, "grunt")
      .legend(P1, CONQUER_DRAW_LEGEND, "warlord")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(4); // two Holds
    // Only the Charmer's Hold Effect is on the chain — nothing from B, nothing from the conquer legend.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charmer", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(5);
    expect([...game.gameState.scoredThisTurn[P1] ?? []].sort()).toEqual(["A", "B"]); // the bonus point marked nothing extra
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]); // a Hold is not a Conquer
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // Draw Phase only — the conquer legend did not draw
    expect(game.isOver()).toBe(false);
  });

  test("cross-check (printed card): Ahri, Alluring 'When I hold, you score 1 point' behaves like the inline Charmer — hold 0→1, trigger → 2", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", "ogn-066-298", "ahri")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
    await game.settle();
    expect(game.p1.points()).toBe(2);
  });

  test.failing("BUG: 471 / 471.1 / 383.4.d.2.c — with an enemy 'opponents can't gain points' unit at a battlefield, P1's Hold of A is still a Score (A marked scored, H's 'When I hold' triggers and draws) but the POINT is denied: P1 stays at 5; engine does not implement the restriction and awards 5→6", async () => {
    // Expected: points 5 → 5; scoredThisTurn[P1] = [A]; sentinel's hold trigger on the chain and resolving (draw 1).
    // Actual: the static "restriction" effect is ignored, so the hold point is granted (6).
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 5)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", HOLD_DRAW_UNIT(2), "sentinel")
      .unit(P2, "B", POINT_DENIER_UNIT(1), "warden")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    // The Score happened: trigger on the chain, A marked …
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentinel", triggered: true })]);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    // … but the point was denied.
    expect(game.p1.points()).toBe(5);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 2); // hold trigger draw + Draw Phase
    expect(game.p1.points()).toBe(5);
  });

  test.failing("BUG: cross-check (printed card) Tianna Crownguard 'While I'm at a battlefield, opponents can't gain points' — P1's hold point must be denied (stays 5); engine awards it", async () => {
    // Expected: 5 → 5. Actual: 5 → 6 (restriction not implemented).
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 5)
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", { might: 2 }, "grunt")
      .unit(P2, "B", "sfd-060-221", "tianna")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.p1.points()).toBe(5);
  });

  test("after the denier dies the NEXT score is granted normally, nothing is awarded retroactively, and A (already Scored this turn) cannot be re-scored: kill the Warden by conquering B (+1), recall H, re-take A → no point, no second hold/conquer trigger", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 5)
      .victoryScore(15) // keep Final Point rules out of the way regardless of the denial bug above
      .battlefield("A", { controller: P1 })
      .battlefield("B", { controller: P2 })
      .unit(P1, "A", HOLD_DRAW_UNIT(2), "sentinel")
      .unit(P2, "B", POINT_DENIER_UNIT(1), "warden")
      .unit(P1, "base", { might: 3 }, "bruiser")
      .unit(P1, "base", { might: 2 }, "reserve")
      .hand(P1, RECALL_FRIENDLY_SPELL, "retreat")
      .build();
    await game.advanceTurn(); // P1's turn: Hold A (point denied per rules; engine grants it — see BUG above)
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    const afterHold = game.p1.points();
    const handAfterHold = game.p1.hand().length;

    // Conquer B, killing the Warden in combat → its passive ends → this Conquer's point is granted normally.
    await game.p1.move("bruiser", "B");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.gameState.battlefields.B).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(afterHold + 1); // exactly +1: no retroactive point for the earlier denied hold
    expect([...game.gameState.scoredThisTurn[P1] ?? []].sort()).toEqual(["A", "B"]);

    // Recall H from A → A uncontrolled at cleanup; move the reserve in → showdown → control, but NOT a Conquer.
    await game.p1.cast("retreat", { targets: "sentinel" });
    await game.settle();
    expect(game.locationOf("sentinel")).toBe("base");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: null });
    await game.p1.move("reserve", "A");
    expect(contextOf(game)).toBe("showdown");
    await game.settle();
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(afterHold + 1); // A already Scored this turn (even though that Score yielded no point per rules)
    expect(game.chain()).toHaveLength(0); // no hold/conquer trigger re-fired for A (471.2.c)
    expect(game.p1.hand()).toHaveLength(handAfterHold - 1); // only the recall spell left the hand; no extra draws
  });
});
