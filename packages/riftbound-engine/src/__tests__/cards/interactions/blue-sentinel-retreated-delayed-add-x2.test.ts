/**
 * Interaction: Blue Sentinel (unl-087-219) · Unit · Mind · 4 · 4 Might
 *     "[Shield 2] Your hold effects for holding here trigger an additional time. When I hold, [Add]
 *      [rainbow] at the start of your next Main Phase. (Abilities that add resources can't be reacted to.)"
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (+ an inline P2 Reaction "Smite: Deal 6 to a unit at a battlefield" for the kill line, and an inline
 *    P1 legend "Watchful Elder: When you hold, draw 1." used ONLY to open a Beginning-Phase chain window.)
 *
 * Question: P1 controls bf1 with Blue Sentinel alone. P1's turn starts; P1 Holds bf1.
 *   (a) What goes on the chain (how many Sentinel items), who has priority?
 *   (b) Before the hold items resolve P1 Retreats the Sentinel (to hand; channels 1 rune exhausted). The
 *       source of the hold trigger AND of the doubling passive is gone — do 0/1/2 items resolve, and with
 *       the Sentinel in hand at the start of the Main Phase does P1 get 0/1/2 [rainbow] (before/after the
 *       pools empty)? Hold point kept? Who controls bf1 entering the Main Phase?
 *   (c) Same but P2 kills the Sentinel in response — any difference?
 *   (d) NO side: Sentinel in P1's base, a vanilla unit holds bf1.
 *
 * Rules: 469.2 (Hold = +1 point), 471.2.b / 383.4.d.2.a (hold effects trigger), 383.3.d, 429.2 / 429.2.a
 * (TRIGGERED abilities that Add resolve as soon as they are finalized — no chain item, no priority),
 * 390.2 / 392 / 359.3.f.3.a (a delayed ability executes at its time regardless of whether its source is
 * still on the board; its information is fixed at creation), 383.2.a.1 (Sona: removed in reaction → still
 * resolves), 316.3 → 316.4 (pools empty, THEN start-of-Main-Phase effects), 323.6 (no unit → control
 * lapses at the next Open cleanup), 124 (zone change = new object).
 *
 * Expected: the doubled "When I hold" fires twice → two delayed [Add]s keyed to P1's next Main Phase;
 * bouncing or killing the Sentinel afterwards changes nothing: P1 opens the Main Phase at (0,{rainbow:2}),
 * keeps the hold point, and bf1 is Uncontrolled. NO side: 1 point, 0 rainbow.
 *
 * RULING-CONFLICT (facet a/b framing): the question expects TWO Sentinel items waiting on the chain with
 * P1 holding priority, and Retreat cast "with both items still on the chain". CR 429.2 (echoed by the
 * card's own reminder text) says a triggered [Add] ability resolves as soon as it is finalized — it never
 * waits on the chain and opens no priority window (green core test: papertree-float-wiped-316-3-sentinel-
 * add-316-4). The engine follows the CR: zero Sentinel chain items; both delayed Adds already exist before
 * anyone could act. The "respond before the Main Phase" lines therefore use the inline legend's ordinary
 * hold trigger (doubled by the Sentinel → 2 items) as the window in which Retreat / Smite are played.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";
const RETREAT = "ogn-104-298";

/** P1's inline legend — an ordinary (non-Add) hold trigger, present only to open a Beginning-Phase window. */
const WATCHFUL_ELDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "hold", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  name: "Watchful Elder",
  rulesText: "When you hold, draw 1.",
} as const;

/** P2's inline removal: 2-cost Fury Reaction, "Deal 6 to a unit at a battlefield." */
const SMITE = {
  abilities: [{ effect: { amount: 6, target: { location: "battlefield", type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  name: "Smite",
  rulesText: "[Reaction] Deal 6 to a unit at a battlefield.",
  timing: "reaction",
} as const;

interface Opts {
  /** Where the Sentinel is: alone at bf1 (default) or in P1's base with a vanilla Holder on bf1. */
  at?: "bf1" | "base";
  /** Give P1 the Watchful Elder legend (opens a chain window in the Beginning Phase). */
  elder?: boolean;
}

/**
 * P2 about to end turn 2. bf1 (inert) controlled by P1 via the Sentinel (or a 2-Might Holder). P1: 2 ready
 * Mind runes m1/m2, Retreat in hand. P2: 2 ready Fury runes r1/r2, Smite in hand. Pools empty.
 */
function board(o: Opts = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .rune(P1, "mind", { alias: "m1" })
    .rune(P1, "mind", { alias: "m2" })
    .rune(P2, "fury", { alias: "r1" })
    .rune(P2, "fury", { alias: "r2" })
    .hand(P1, RETREAT, "retreat")
    .hand(P2, SMITE, "smite");
  if ((o.at ?? "bf1") === "bf1") {
    b.unit(P1, "bf1", BLUE_SENTINEL, "sentinel");
  } else {
    b.unit(P1, "base", BLUE_SENTINEL, "sentinel").unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
  }
  if (o.elder) {
    b.legend(P1, WATCHFUL_ELDER, "elder");
  }
  return b;
}

interface DelayedView {
  playerId?: string;
  sourceCardId?: string;
  effect?: { type?: string; power?: string[] };
  trigger?: { event?: string };
}

/** P1's pending delayed abilities (the Sentinel's "[Add] [rainbow] at the start of your next Main Phase"). */
function delayedAdds(game: Game): DelayedView[] {
  const all = ((game.gameState as { playerDelayedTriggers?: DelayedView[] }).playerDelayedTriggers ?? []) as DelayedView[];
  return all.filter((d) => d.playerId === P1 && d.effect?.type === "add-resource");
}

/** Window board: P2 ends the turn → P1 holds bf1; the two (doubled) Elder items wait on the chain with P1 on priority. */
async function inHoldWindow(): Promise<Game> {
  const game = await board({ elder: true }).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.p1.points()).toBe(1);
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "elder", controller: P1, triggered: true }),
    expect.objectContaining({ cardId: "elder", controller: P1, triggered: true }),
  ]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Blue Sentinel holds alone, then leaves before its delayed [Add]s fire", () => {
  // ---- (a) what the hold produces ------------------------------------------------------------------------------

  // RULING-CONFLICT: the question expects two Sentinel chain items and a P1 priority window; CR 429.2 says a
  // triggered [Add] ability resolves as soon as it is finalized — engine follows CR: no chain item at all.
  test("(a) P1 Holds bf1: +1 point (469.2); the Sentinel's 'When I hold' [Add] — triggered TWICE by its own doubler (471.2.b, 383.4.d.2.a) — finalizes and resolves at once (429.2): ZERO chain items, TWO delayed [Add]s created; with nothing else triggering the turn runs straight into P1's Main Phase", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.p1.points()).toBe(1); // the hold point is never doubled
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main"); // no Beginning-Phase window existed
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(delayedAdds(game)).toHaveLength(2);
    for (const d of delayedAdds(game)) {
      expect(d).toMatchObject({ effect: { power: ["rainbow"], type: "add-resource" }, sourceCardId: "sentinel", trigger: { event: "main-phase" } });
    }
  });

  test("(a) into the Main Phase: 316.3 empties the pools, THEN 316.4 runs both delayed Adds → P1 opens at (0,{rainbow:2}); the Sentinel still holds bf1 for P1", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.state("sentinel")).toMatchObject({ controller: P1, location: "bf1", might: 4 });
    // real, spendable power that lasts the turn
    await game.p1.tapRune("m1");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 2 } });
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) Retreat the Sentinel before the Main Phase ------------------------------------------------------------

  test("(b) window board: at the hold the Elder's ordinary hold trigger is doubled by the Sentinel → TWO P1 items on the chain, P1 (turn player) has priority first, then P2 (383.3.d); the two delayed Sentinel Adds already exist and nothing was added to any pool yet", async () => {
    const game = await inHoldWindow();
    expect(game.chain().some((i) => i.cardId === "sentinel")).toBe(false);
    expect(delayedAdds(game)).toHaveLength(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) in that window P1 taps m1 (Reaction [Add], no chain item) and Retreat becomes castable on the Sentinel; it resolves: Sentinel → P1's HAND, P1 channels 1 rune EXHAUSTED (3 runes, 2 exhausted); the two Elder items are untouched underneath", async () => {
    const game = await inHoldWindow();
    expect(game.p1.can("cast", "retreat")).toBe(false); // pool empty — DESIGN: manual payment
    await game.p1.tapRune("m1");
    expect(game.chain()).toHaveLength(2);
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.cast("retreat", { targets: "sentinel" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["elder", "elder", "retreat"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat (top) resolves
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("hand");
    expect(game.state("sentinel").owner).toBe(P1);
    expect(game.p1.hand()).toContain("sentinel");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: false })).toHaveLength(2); // m1 tapped + the channeled-exhausted rune
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["elder", "elder"]);
    expect(game.phase()).toBe("beginning");
  });

  test("(b) with the Sentinel (source of the trigger AND of the doubling passive) gone: BOTH already-triggered items still resolve (Elder draws 2 — 383.2.a.1 Sona example) and BOTH delayed Adds survive (392, 359.3.f.3.a) → P1 opens the Main Phase at (0,{rainbow:2}) with the Sentinel sitting in hand", async () => {
    const game = await inHoldWindow();
    const handBefore = game.p1.hand().length; // includes Retreat
    await game.p1.tapRune("m1");
    await game.p1.tapRune("m2"); // 1 for Retreat + 1 floated: the float must be wiped by 316.3
    await game.p1.cast("retreat", { targets: "sentinel" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.energy()).toBe(1); // the float, still in the Beginning Phase
    expect(delayedAdds(game)).toHaveLength(2);
    const r = await game.settle(); // both Elder items resolve → Channel → Draw → Main
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sentinel")).toBe("hand");
    // 316.3 wiped the floated energy; 316.4 then added BOTH rainbow — not 0, not 1.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    // hand: −Retreat +Sentinel +2 (Elder ×2) +1 (Draw Phase)
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1 + 2 + 1);
  });

  test("(b) P1 KEEPS the hold point (a Score is not undone), and bf1 — now empty — is Uncontrolled entering the Main Phase (323.6); P1's channel step still added 2 ready runes (5 total: 2 ready + m1, m2, Retreat's exhausted one)", async () => {
    const game = await inHoldWindow();
    await game.p1.tapRune("m1");
    await game.p1.tapRune("m2");
    await game.p1.cast("retreat", { targets: "sentinel" });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.runes()).toHaveLength(5);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) P2 kills it instead -------------------------------------------------------------------------------------

  test("(c) P2 kills the Sentinel in the window instead (taps r1+r2, Smite for 6 — Shield 2 is defender-only, it is a 4): Sentinel → P1's trash; no difference — both Elder items resolve, BOTH delayed Adds fire → (0,{rainbow:2}), point kept, bf1 Uncontrolled", async () => {
    const game = await inHoldWindow();
    const handBefore = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.p2.can("cast", "smite")).toBe(false);
    await game.p2.tapRune("r1");
    await game.p2.tapRune("r2");
    expect(game.p2.can("cast", "smite")).toBe(true);
    await game.p2.cast("smite", { targets: "sentinel" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["elder", "elder", "smite"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.state("sentinel").owner).toBe(P1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["elder", "elder"]);
    expect(delayedAdds(game)).toHaveLength(2);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // P2's Beginning-Phase spend/float is gone too
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.hand()).toHaveLength(handBefore + 2 + 1); // Elder ×2 + Draw Phase (Retreat still in hand)
    expect(game.violations()).toEqual([]);
  });

  test("(b)/(c) contrast: nobody acts in the window — Sentinel stays, both Elder items resolve, (0,{rainbow:2}), bf1 still P1's", async () => {
    const game = await inHoldWindow();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.state("sentinel")).toMatchObject({ controller: P1, location: "bf1" });
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
  });

  // ---- (d) NO side: Sentinel in base -----------------------------------------------------------------------------

  test("(d) Sentinel in P1's BASE, a vanilla Holder holds bf1: 1 hold point, the Sentinel neither holds nor is 'here' → no delayed Add, no chain item, P1 opens the Main Phase at (0,{})", async () => {
    const game = await board({ at: "base" }).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(delayedAdds(game)).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.power()).toBe(0);
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.state("sentinel").location).toBe("base");
  });

  test("(d) …and with the Elder legend: exactly ONE Elder item (the doubler only counts 'for holding HERE' where the Sentinel is) → 1 card drawn from it, still 0 rainbow", async () => {
    const game = await board({ at: "base", elder: true }).build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P1, triggered: true })]);
    expect(delayedAdds(game)).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.hand()).toHaveLength(handBefore + 1 + 1); // Elder ×1 + Draw Phase
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
