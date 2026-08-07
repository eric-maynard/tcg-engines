/**
 * Core rules — Showdowns & Focus rotation, showdown termination by all-pass, Action timing inside
 * showdowns, Focus non-rotation for trigger/Add chains, and triggered abilities as respondable
 * chain items (play effects, deathknell-style, combat attack triggers, simultaneous-trigger
 * ordering, triggers outside the Main Phase).
 *
 * CARD-INDEPENDENT: every unit / spell below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids):
 *   144.1.c / 144.2      Standard Move: not during a Showdown; exhausting is the cost
 *   303.2.a              simultaneous actions are sequenced in Turn Order from the Turn Player
 *   308.1.a / 343.1.a    Showdown State: only Action / Reaction cards may be played
 *   309.1.a / 338.1.a.2  Closed State: only Reaction; 358.4 the opener may be Action
 *   313.1-313.5          Focus: gains Priority; passing Priority keeps Focus; no Focus in Neutral
 *   315.2.b / 383.4.d.2  Hold in the Beginning Phase scores, Hold Effects go on the chain
 *   316.8.b.1 / 344.2    move to an empty uncontrolled battlefield → Non-Combat Showdown
 *   319.5 / 321.1 / 323.4-5  cleanup after a chain item resolves: death triggers noted, then kill
 *   323.8 / 323.12       Showdown Staged at cleanup, begins only in a Neutral Open State
 *   330.2                items played while a chain exists join THAT chain
 *   335 / 335.1          who receives priority when nothing is outstanding
 *   337.2 / 337.4        permanents resolve on finalize; newest item's controller gets Priority
 *   340.1 / 340.2.a / 340.4  LIFO resolution; focus passes when a PLAYED chain empties
 *   345 / 346 / 346.1    Focus to the contesting player; no focus pass for trigger / Add chains
 *   347.1 / 347.2 / 348 / 348.2.a(.1)  showdown actions, all-pass ends it, lone player conquers
 *   355.5.b / 402.2      trigger targets are chosen when the TRIGGER is finalized, not the unit
 *   359.3.c              other players may React before a chain item resolves
 *   383.3 / 383.3.a(.2) / 383.3.c / 383.3.d(.1)  triggered abilities on the chain, "you may" at
 *                        finalization, any phase, simultaneous ordering
 *   383.4.a.2 / 383.4.e.2(.a)  Play Effects after the permanent enters; Attack Triggers once/combat
 *   402.1 / 402.1.a      declined "may" trigger is removed from the chain
 *   429.2.a / 400.2      Add (rune) abilities pass neither Priority nor Focus
 *   464.2.c-g / 465.2    Combat opens with a Combat Showdown; attack triggers form the Combat
 *                        Chain; combat damage only when the showdown closes
 *   806.1.b-c / 813.1.c  Action / Reaction permissions
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** [Action] Draw 1. — costs nothing so resources never gate the timing under test. */
const ACTION_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Draw",
  timing: "action",
};

/** [Reaction] Give a unit +2 Might this turn. */
const REACTION_BUFF = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reaction Buff",
  timing: "reaction",
};

/** [Reaction] Deal N to a unit. */
const reactionPing = (amount: number) => ({
  abilities: [{ effect: { amount, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: `Filler Reaction Ping ${amount}`,
  timing: "reaction",
});

/** [Reaction] Move a friendly unit to a battlefield. */
const REACTION_MARCH = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reaction March",
  timing: "reaction",
};

/** [Action] Kill a unit. */
const ACTION_KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Kill",
  timing: "action",
};

/** A spell with NO timing keyword (standard speed). */
const STANDARD_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Filler Standard Draw",
  timing: "standard",
};

/** Unit · 2 Might · "When you play me, deal 2 to a unit." */
const PLAY_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Play Pinger",
};

/** Unit · 2 Might · "When you play me, you may draw 1." */
const MAY_DRAWER = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler May Drawer",
};

/** Unit · 2 Might · Deathknell-style "When I die, deal 2 to a unit." */
const DEATH_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { type: "unit" }, type: "damage" },
      trigger: { event: "die", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Death Pinger",
};

/** Unit · 3 Might · "When I attack, give me +1 Might this turn." */
const ATTACK_PUMPER = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "self" }, type: "modify-might" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 3,
  name: "Filler Attack Pumper",
};

/** Unit · 5 Might · "When a unit dies, deal 1 to an enemy unit." (sturdy so both watchers survive) */
const deathWatcher = (name: string) => ({
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "die", on: "any-unit" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 5,
  name,
});

/** Unit · 3 Might · "When I hold, deal 2 to an enemy unit." */
const HOLD_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 3,
  name: "Filler Hold Pinger",
};

// ---------------------------------------------------------------------------
// State readers (public game state only)
// ---------------------------------------------------------------------------

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type TurnState = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

/** The active (top-of-stack) showdown, if any. */
function showdownOf(game: G) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

/** Who holds Focus (undefined in a Neutral State — rule 313.5). */
function focusOf(game: G): string | undefined {
  return showdownOf(game)?.focusPlayer;
}

/** Who holds Priority on an existing chain (undefined when no chain exists). */
function priorityOf(game: G): string | undefined {
  const chain = game.gameState.interaction?.chain;
  return chain?.active ? chain.activePlayer : undefined;
}

function turnStateOf(game: G): TurnState {
  const hasShowdown = showdownOf(game) !== undefined;
  const hasChain = game.gameState.interaction?.chain?.active ?? false;
  if (hasShowdown) {
    return hasChain ? "showdown-closed" : "showdown-open";
  }
  return hasChain ? "neutral-closed" : "neutral-open";
}

function chainIds(game: G): string[] {
  return game.chain().map((c) => c.cardId);
}

function actionContext(d: Decision | null): string | undefined {
  return d && d.kind === "action" ? d.context : undefined;
}

// ---------------------------------------------------------------------------
// Shared positions
// ---------------------------------------------------------------------------

/**
 * P1's turn, Neutral Open. bf1 is empty and uncontrolled. P1 has ready unit U (2 Might) in base
 * and an [Action] spell A1 + a [Reaction] R1; P2 holds A (Action), R (Reaction), N (no keyword)
 * and a vanilla unit card. Nobody needs resources (everything costs 0).
 */
function emptyBattlefieldBoard() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
    .unit(P1, "base", { might: 2, name: "Filler U2" }, "U2")
    .unit(P2, "base", { might: 2, name: "Filler X" }, "X")
    .hand(P1, ACTION_DRAW, "A1")
    .hand(P1, REACTION_BUFF, "R1")
    .hand(P2, ACTION_DRAW, "A")
    .hand(P2, REACTION_BUFF, "R")
    .hand(P2, STANDARD_DRAW, "N")
    .hand(P2, { energyCost: 0, might: 1, name: "Filler P2 Recruit" }, "p2unit");
}

/** Same board, after P1 moved U to bf1 (showdown open, P1 focus) and passed → P2 has Focus. */
async function showdownWithP2Focus(): Promise<G> {
  const game = await emptyBattlefieldBoard().build();
  await game.p1.move("U", "bf1");
  await game.p1.passFocus();
  expect(focusOf(game)).toBe(P2);
  return game;
}

/** … and P2 opened a chain with its Action spell A. */
async function showdownChainOpenedByP2(): Promise<G> {
  const game = await showdownWithP2Focus();
  await game.p2.cast("A");
  expect(chainIds(game)).toEqual(["A"]);
  return game;
}

// ===========================================================================
// 1. Move to an empty battlefield opens a Non-Combat Showdown
// ===========================================================================

describe("316.8.b.1 / 344.2 / 345: standard move to an empty uncontrolled battlefield opens a Non-Combat Showdown; the mover gets Focus and Priority", () => {
  test("after the move + cleanup: U exhausted at bf1, bf1 contested by P1, Showdown Open at bf1, Focus = Priority holder = P1", async () => {
    const game = await emptyBattlefieldBoard().build();
    expect(turnStateOf(game)).toBe("neutral-open");
    await game.p1.move("U", "bf1");

    expect(game.locationOf("U")).toBe("bf1");
    expect(game.state("U").isExhausted).toBe(true); // 144.2 exhausting is the cost
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);

    const sd = showdownOf(game);
    expect(sd).toBeDefined();
    expect(sd?.battlefieldId).toBe("bf1");
    expect(turnStateOf(game)).toBe("showdown-open"); // no chain
    expect(game.chain()).toEqual([]);
    expect(focusOf(game)).toBe(P1); // 345
    expect(game.actingSeat()).toBe(P1); // 313.2 focus ⇒ priority
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("passFocus")).toBe(true);
  });

  test("MUST NOT: no conquer / point on arrival, P2 does not hold Focus first, and no Combat is staged (no opposing units)", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(focusOf(game)).not.toBe(P2);
    expect(game.p2.can("passFocus")).toBe(false);
    expect(showdownOf(game)?.isCombatShowdown).toBe(false);
    expect(game.state("U").combatRole).toBeNull();
  });
});

// ===========================================================================
// 2. Passing rotates Focus; all-pass ends the showdown → conquer
// ===========================================================================

describe("347.2 / 348 / 348.2.a: passing rotates Focus; when every player has passed in sequence the showdown ends and the lone occupant conquers", () => {
  test("P1 passes: showdown still in progress, Focus and Priority move to P2, still no conquer (347.2.b, 313.2)", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    // MUST NOT: focus staying on P1 after P1 passes.
    expect(game.p1.can("passFocus")).toBe(false);
    expect(game.p2.can("passFocus")).toBe(true);
  });

  test("P2 then passes: all passed with nothing played → showdown ends, P1 gains control of bf1 and conquers (+1), back to Neutral Open with P1 acting and nobody holding Focus (347.2.a, 348.2.a.1, 313.5)", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(game.p1.points()).toBe(0); // MUST NOT: point before P2's pass
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(focusOf(game)).toBeUndefined(); // 313.5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("passFocus")).toBe(false); // MUST NOT: P2 retaining focus in a Neutral State
  });

  test("MUST NOT: the showdown does not end after a single pass", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(turnStateOf(game)).toBe("showdown-open");
  });
});

// ===========================================================================
// 3. Non-turn player WITH Focus may play an Action spell; others may not
// ===========================================================================

describe("313.1 / 313.4 / 347.1 / 806.1.c.1: in a Showdown Open State the Focus holder (even the non-turn player) may play Action/Reaction cards — nothing else, nobody else", () => {
  test("P2 (Focus, not turn player): a spell with no timing keyword is rejected in a Showdown State (308.1.a, 313.1.a)", async () => {
    const game = await showdownWithP2Focus();
    expect(game.p2.can("cast", "N")).toBe(false);
    const r = await game.p2.try((p) => p.cast("N"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("N")).toBe("hand");
    expect(game.chain()).toEqual([]);
  });

  test("P2 (Focus): a vanilla unit (no Action) cannot be played during the showdown (343.1.a)", async () => {
    const game = await showdownWithP2Focus();
    expect(game.p2.can("play", "p2unit")).toBe(false);
    const r = await game.p2.try((p) => p.play("p2unit"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("p2unit")).toBe("hand");
  });

  test("no Standard Move for either player while the Showdown is in progress (144.1.c)", async () => {
    const game = await showdownWithP2Focus();
    expect(game.p1.can("move")).toBe(false);
    expect(game.p2.can("move")).toBe(false);
    const r1 = await game.p1.try((p) => p.move("U2", "bf1"));
    expect(r1.ok).toBe(false);
    const r2 = await game.p2.try((p) => p.move("X", "bf1"));
    expect(r2.ok).toBe(false);
    expect(game.locationOf("U2")).toBe("base");
    expect(game.locationOf("X")).toBe("base");
  });

  test("313.4 / 347 — the turn player WITHOUT Focus (P1, after passing) must not be able to play its own Action spell while P2 holds Focus", async () => {
    // Expected: only the Focus holder may take discretionary actions in a Showdown Open State,
    // so P1's cast is not legal (can === false) and attempting it is rejected; hand/chain unchanged.
    // Actual: playSpell only checks the turn state's timing class, so P1's Action spell is
    // enumerated as legal and the cast opens a chain under P1's control.
    const game = await showdownWithP2Focus();
    expect(game.p1.can("cast", "A1")).toBe(false);
    const r = await game.p1.try((p) => p.cast("A1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("A1")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(focusOf(game)).toBe(P2);
  });

  test("313.4 / 338.1 — before P1 passes, P2 (no Focus, no Priority) must not be able to play even a Reaction into the open showdown", async () => {
    // Expected: in a Showdown OPEN State the Focus holder also holds Priority (335.1); a player
    // with neither cannot start a chain, Reaction keyword notwithstanding. Actual: accepted.
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    expect(focusOf(game)).toBe(P1);
    expect(game.p2.can("cast", "R")).toBe(false);
    const r = await game.p2.try((p) => p.cast("R", { targets: "U" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("P2 (Focus) plays Action spell A: accepted — chain [A], Showdown Closed, Priority = P2 (controller), Focus still P2 (347.1.a, 806.1.b)", async () => {
    const game = await showdownWithP2Focus();
    expect(game.p2.can("cast", "A")).toBe(true);
    await game.p2.cast("A");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "A", controller: P2, triggered: false })]);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(priorityOf(game)).toBe(P2);
    expect(focusOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });
});

// ===========================================================================
// 4. Inside a showdown chain only Reactions may follow the opener
// ===========================================================================

describe("358.4 / 309.1.a / 340: once a chain exists inside the showdown only Reactions may be added, and items resolve LIFO with a fresh priority round in between", () => {
  test("P2 passes priority → P1 has Priority in Showdown Closed; P1's Action-only spell is rejected, its Reaction is accepted on top: chain [A, R1], Priority P1 (338.1.a.2, 330.2)", async () => {
    const game = await showdownChainOpenedByP2();
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(focusOf(game)).toBe(P2); // 313.3 passing Priority retains Focus
    // Action-only spell may not enter an existing chain.
    expect(game.p1.can("cast", "A1")).toBe(false);
    const r = await game.p1.try((p) => p.cast("A1"));
    expect(r.ok).toBe(false);
    expect(chainIds(game)).toEqual(["A"]);
    // Reaction may.
    expect(game.p1.can("cast", "R1")).toBe(true);
    await game.p1.cast("R1", { targets: "U" });
    expect(chainIds(game)).toEqual(["A", "R1"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "R1", controller: P1 });
    expect(priorityOf(game)).toBe(P1);
  });

  test("P1 pass, P2 pass → R1 (newest) resolves first while A stays; Priority then goes to P2 (controller of A); P2 pass, P1 pass → A resolves; chain empty (340.1, 340.4)", async () => {
    const game = await showdownChainOpenedByP2();
    await game.p2.passPriority();
    await game.p1.cast("R1", { targets: "U" });
    const p2Hand = game.p2.hand().length;

    await game.p1.passPriority();
    expect(chainIds(game)).toEqual(["A", "R1"]); // one pass is not enough
    await game.p2.passPriority();
    // R1 resolved: U buffed; A still waiting — MUST NOT: A resolving before R1.
    expect(game.state("U").might).toBe(4);
    expect(chainIds(game)).toEqual(["A"]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // A's draw has not happened
    expect(priorityOf(game)).toBe(P2); // 340.4 controller of the newest remaining item
    expect(game.actingSeat()).toBe(P2);

    await game.p2.passPriority();
    expect(chainIds(game)).toEqual(["A"]);
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("R1")).toBe("trash");
    // Still inside the showdown.
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(turnStateOf(game)).toBe("showdown-open");
  });
});

// ===========================================================================
// 5. Focus passes when a PLAYED chain empties; the all-pass count restarts
// ===========================================================================

describe("346 / 347.1.b / 340.2.a: when a chain that a player OPENED empties during a showdown, Focus passes to the next player after the Focus holder and the pass sequence starts fresh", () => {
  /** Chain [A (P2), R1 (P1)] fully resolved inside the showdown P2 had Focus in. */
  async function afterP2sChainResolved(): Promise<G> {
    const game = await showdownChainOpenedByP2();
    await game.p2.passPriority();
    await game.p1.cast("R1", { targets: "U" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // R1 resolves
    await game.p2.passPriority();
    await game.p1.passPriority(); // A resolves
    expect(game.chain()).toEqual([]);
    return game;
  }

  test("after P2's chain resolves: Focus == Priority holder == P1 (next in turn order from focus holder P2), Showdown Open", async () => {
    const game = await afterP2sChainResolved();
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // MUST NOT: focus remaining with the player who opened the chain.
    expect(game.p2.can("passFocus")).toBe(false);
  });

  test("the 'all passed in sequence' count is fresh: P1's pass does NOT end the showdown (priority passes inside the chain are not showdown passes); P2's pass then does (347.2.a/b, 348)", async () => {
    const game = await afterP2sChainResolved();
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined(); // MUST NOT end on the first pass after a chain
    expect(focusOf(game)).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(turnStateOf(game)).toBe("neutral-open");
  });

  test("variant — 'next from the FOCUS HOLDER, not from the last actor': P1 (Focus) opens with Action A1, P2 adds Reaction R last; when the chain empties Focus goes to P2, not back to P1 (346, 313.3)", async () => {
    const game = await emptyBattlefieldBoard().build();
    await game.p1.move("U", "bf1");
    expect(focusOf(game)).toBe(P1);
    await game.p1.cast("A1");
    await game.p1.passPriority();
    await game.p2.cast("R", { targets: "U" }); // P2 is the last player to add to the chain
    expect(chainIds(game)).toEqual(["A1", "R"]);
    expect(focusOf(game)).toBe(P1); // adding to a chain never moves Focus
    await game.p2.passPriority();
    await game.p1.passPriority(); // R resolves
    expect(chainIds(game)).toEqual(["A1"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // A1 resolves
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P2);
    expect(focusOf(game)).not.toBe(P1);
    expect(game.actingSeat()).toBe(P2);
  });
});

// ===========================================================================
// 6. Rune Add during a showdown does not pass Focus
// ===========================================================================

describe("429.2.a / 346.1 / 400.2: exhausting a rune (an Add ability) during a showdown resolves immediately and passes neither Priority nor Focus", () => {
  function runeBoard() {
    return scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .rune(P1, "fury", { alias: "rune1" });
  }

  test("P1 (Focus, Showdown Open) taps its rune: energy +1, no chain remains, still Showdown Open, Focus and Priority still P1, pass counter untouched", async () => {
    const game = await runeBoard().build();
    await game.p1.move("U", "bf1");
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("tapRune", "rune1")).toBe(true);
    await game.p1.tapRune("rune1");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("rune1").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
    // MUST NOT: focus rotating to P2 off an Add.
    expect(game.p2.can("passFocus")).toBe(false);
  });

  test("after the Add, BOTH passes are still required: P1 passes → showdown continues with Focus P2; P2 passes → it ends and P1 conquers (348)", async () => {
    const game = await runeBoard().build();
    await game.p1.move("U", "bf1");
    await game.p1.tapRune("rune1");
    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P2);
    expect(game.p1.points()).toBe(0);
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.energy()).toBe(1); // the added energy is real and persists through the showdown
  });
});

// ===========================================================================
// 7. Play Effect trigger goes on the chain and can be answered (LIFO)
// ===========================================================================

describe("383.4.a.2 / 337.2 / 337.4 / 359.3.c: a unit's Play Effect is a triggered chain item added after the unit enters — the opponent gets a Reaction window before it resolves", () => {
  function playTriggerBoard() {
    return scenario()
      .unit(P2, "base", { might: 2, name: "Filler X" }, "X")
      .hand(P1, PLAY_PINGER, "T")
      .hand(P2, REACTION_BUFF, "B");
  }

  test("playing T: T is on the board (base, exhausted) immediately; its Play Effect sits on the chain as a triggered item controlled by P1; Neutral Closed; P1 has Priority first; X undamaged", async () => {
    const game = await playTriggerBoard().build();
    // The target is NOT part of playing T (355.5.b): the play option exposes no `targets` field.
    expect(game.p1.option("play", "T")?.fields.some((f) => f.arg === "targets")).toBe(false);
    await game.p1.play("T");
    expect(game.zoneOf("T")).toBe("base"); // MUST NOT: T itself waiting on the chain
    expect(game.state("T").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "T", controller: P1, triggered: true })]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("X").damage).toBe(0); // MUST NOT: trigger damage before P2 ever had priority
  });

  test.failing("BUG: 402.2 / 383.3 — the trigger's target is chosen while FINALIZING the trigger (before anyone receives Priority); engine defers the choice to resolution", async () => {
    // Expected: right after play(T) the pending Play Effect asks P1 to choose its target (pick
    // decision, seat P1, X among the options) and only then does P1 receive Priority with a
    // finalized item whose target is locked in. Actual: no prompt — P1 immediately holds chain
    // priority and the "Choose a target" prompt only appears when the item resolves.
    const game = await playTriggerBoard().build();
    await game.p1.play("T");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toContain("X");
    await game.p1.pick("X");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "T", controller: P1, triggered: true })]);
    expect(priorityOf(game)).toBe(P1);
    expect(game.state("X").damage).toBe(0);
  });

  test("LIFO with a response: P1 passes → P2 plays Reaction B (+2 Might on X) → chain [T-trigger, B]; all-pass resolves B first (X Might 4), Priority returns to P1, another all-pass resolves the trigger: X takes 2 and survives (340.1, 340.4)", async () => {
    const game = await playTriggerBoard().build();
    await game.p1.play("T");
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    expect(game.p2.can("cast", "B")).toBe(true);
    await game.p2.cast("B", { targets: "X" });
    expect(chainIds(game)).toEqual(["T", "B"]);
    expect(priorityOf(game)).toBe(P2);

    await game.p2.passPriority();
    await game.p1.passPriority(); // B resolves
    expect(game.state("X").might).toBe(4);
    expect(game.state("X").damage).toBe(0); // trigger still waiting
    expect(chainIds(game)).toEqual(["T"]);
    expect(priorityOf(game)).toBe(P1); // controller of the trigger

    await game.p1.passPriority();
    expect(game.state("X").damage).toBe(0);
    await game.p2.passPriority(); // trigger resolves (engine asks for the target now)
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card)).toContain("X");
      await game.p1.pick("X");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("X").damage).toBe(2);
    expect(game.state("X").might).toBe(4);
    expect(game.zoneOf("X")).toBe("base"); // survives (2 damage < 4 Might)
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

// ===========================================================================
// 8. Optional ("you may") trigger declined at finalization leaves no chain
// ===========================================================================

describe("383.3.a / 383.3.a.2 / 402.1: a 'you may' Play Effect is accepted or declined by its controller during FINALIZATION", () => {
  function mayBoard() {
    return scenario().hand(P1, MAY_DRAWER, "O").hand(P2, REACTION_BUFF, "B").unit(P2, "base", { might: 2 }, "X");
  }

  test.failing("BUG: branch A (383.3.a.2 / 402.1.a) — P1 is asked 'perform it?' while finalizing; declining removes the item: chain empty, Neutral Open, P1 acting, P2 never received Priority, hand unchanged. Engine only asks at resolution, after a full priority round", async () => {
    // Expected: play(O) → yes/no prompt for P1 immediately; no() → nothing on the chain, no
    // Closed-state priority round over a declined item. Actual: the trigger is finalized
    // unconditionally, P1 then P2 receive chain priority, and the opt-in prompt appears on resolve.
    const game = await mayBoard().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("O");
    expect(game.zoneOf("O")).toBe("base");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("passPriority")).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // O left the hand; nothing drawn
  });

  test.failing("BUG: branch B (383.3.a / 402.1) — accepting at finalization leaves a finalized trigger on the chain in a Closed State with P1 holding Priority and P2 still able to respond before the draw. Engine has no finalization prompt", async () => {
    // Expected: play(O) → yes/no for P1 → yes() → chain [O-trigger], Neutral Closed, priority P1,
    // hand not yet grown. Actual: no yes/no decision exists at this point (it is an action/chain
    // decision), so the expectation on the prompt fails.
    const game = await mayBoard().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("O");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "O", controller: P1, triggered: true })]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "B")).toBe(true);
  });

  test("branch B (order-agnostic): when P1 accepts, the draw still only happens after BOTH players have passed — P2 gets a priority window (and could React) while P1's hand is unchanged (340.1, 359.3.c)", async () => {
    const game = await mayBoard().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("O");
    expect(game.zoneOf("O")).toBe("base");
    let p2HadWindowBeforeDraw = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
        continue;
      }
      if (d.kind === "action" && d.context === "chain") {
        // MUST NOT: the draw executing before both players pass.
        expect(game.p1.hand()).toHaveLength(hand0 - 1);
        if (d.seat === P2) {
          p2HadWindowBeforeDraw = game.p2.can("cast", "B") && game.p2.can("passPriority");
        }
        await game.seat(d.seat).passPriority();
        continue;
      }
      throw new Error(`unexpected decision ${d.kind} for ${d.seat}`);
    }
    expect(p2HadWindowBeforeDraw).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0); // -1 (O played) +1 (drawn)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

// ===========================================================================
// 9. Death trigger raised mid-chain becomes the new top and is respondable
// ===========================================================================

describe("323.4-5 / 319.5 / 330.2 / 340.3-4: a death trigger raised by a resolving chain item is added to the EXISTING chain as its newest item and can be responded to before the older items resolve", () => {
  /**
   * P2's K (2 Might, "When I die, deal 2 to a unit"), P1's Y (2 Might). P1 opens with S0 (draw 1),
   * keeps priority and adds Reaction S1 (deal 2 → K). Both pass → S1 resolves and K takes lethal.
   */
  async function kDiesUnderS0(): Promise<{ game: G; p1Hand: number }> {
    const game = await scenario()
      .unit(P2, "base", DEATH_PINGER, "K")
      .unit(P1, "base", { might: 2, name: "Filler Y" }, "Y")
      .hand(P1, ACTION_DRAW, "S0")
      .hand(P1, reactionPing(2), "S1")
      .hand(P1, REACTION_BUFF, "buffY")
      .build();
    await game.p1.cast("S0");
    expect(priorityOf(game)).toBe(P1); // 338.1.a.5 the opener acts first and may add to its own chain
    await game.p1.cast("S1", { targets: "K" });
    expect(chainIds(game)).toEqual(["S0", "S1"]);
    const p1Hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // S1 resolves → K lethal → cleanup
    return { game, p1Hand };
  }

  test("after S1 resolves: K is killed to trash and its death trigger is the NEWEST item on the SAME chain — chain [S0, K-trigger] (triggered, controller P2); S0 has not resolved; no showdown/second chain (323.4, 323.5, 330.2, 808.1.d.2)", async () => {
    const { game, p1Hand } = await kDiesUnderS0();
    expect(game.zoneOf("K")).toBe("trash");
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "S0", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "K", controller: P2, triggered: true }),
    ]);
    expect(showdownOf(game)).toBeUndefined();
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(game.p1.hand()).toHaveLength(p1Hand); // MUST NOT: S0 resolving before the death trigger
    expect(game.state("Y").damage).toBe(0);
  });

  test("337.4 / 340.4 — once K's trigger is finalized its controller (P2, controller of the newest item) receives Priority first; engine hands Priority to P1", async () => {
    // Expected: priorityOf === P2 and P2 is the acting seat right after the trigger is appended.
    // Actual: the chain's activePlayer is reset to P1 (the turn player / S0's controller).
    const { game } = await kDiesUnderS0();
    expect(chainIds(game)).toEqual(["S0", "K"]);
    expect(priorityOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
  });

  test("P1 gets a response window and LIFO holds: P1 buffs Y (+2) in response → buff resolves first, then (fresh all-pass) K's trigger deals 2 to the now 4-Might Y (survives), then (fresh all-pass, Priority to P1) S0 resolves last (340.1, 340.4, 337.4)", async () => {
    const { game, p1Hand } = await kDiesUnderS0();
    // Rules: P2 (trigger controller) holds priority first and passes; engine: P1 already has it.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(priorityOf(game)).toBe(P1); // MUST NOT: the trigger resolving with no P1 response window
    expect(game.p1.can("cast", "buffY")).toBe(true);
    await game.p1.cast("buffY", { targets: "Y" });
    expect(chainIds(game)).toEqual(["S0", "K", "buffY"]);

    await game.p1.passPriority();
    await game.p2.passPriority(); // buff resolves
    expect(game.state("Y").might).toBe(4);
    expect(game.state("Y").damage).toBe(0);
    expect(chainIds(game)).toEqual(["S0", "K"]);
    expect(priorityOf(game)).toBe(P2); // controller of the newest remaining item (K's trigger)

    await game.p2.passPriority();
    await game.p1.passPriority(); // K's trigger resolves; P2 chooses Y if asked
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card)).toContain("Y");
      await game.p2.pick("Y");
    }
    expect(game.state("Y").damage).toBe(2);
    expect(game.zoneOf("Y")).toBe("base"); // 2 damage on a 4-Might unit
    expect(chainIds(game)).toEqual(["S0"]); // S0 is STILL waiting — it resolves last
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // buffY left the hand, nothing drawn yet
    expect(priorityOf(game)).toBe(P1);

    await game.p1.passPriority();
    await game.p2.passPriority(); // S0 resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand); // -1 buffY +1 draw
    expect(turnStateOf(game)).toBe("neutral-open");
  });
});

// ===========================================================================
// 10. Combat: attack trigger opens the Combat Chain; defender may React; Focus does not pass
// ===========================================================================

describe("464.2 / 383.4.e.2 / 346.1 / 465.2: moving into a defended battlefield opens Combat with a Combat Showdown; the attacker's Attack Trigger forms the Combat Chain, the defender may respond, and Focus does NOT pass when that chain empties", () => {
  function combatBoard() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Filler Defender" }, "Dv")
      .unit(P1, "base", ATTACK_PUMPER, "At")
      .hand(P2, reactionPing(1), "sting");
  }

  test("after the move + cleanup: bf1 contested by P1, Combat Showdown open with P1 = Attacker holding Focus, designations assigned, At's Attack Trigger on the Combat Chain (triggered, controller P1), Showdown Closed, Priority P1 (464.2.c-f)", async () => {
    const game = await combatBoard().build();
    await game.p1.move("At", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    const sd = showdownOf(game);
    expect(sd?.isCombatShowdown).toBe(true);
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
    expect(focusOf(game)).toBe(P1);
    expect(game.state("At").combatRole).toBe("attacker");
    expect(game.state("Dv").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "At", controller: P1, triggered: true })]);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("At").might).toBe(3); // trigger has not resolved yet
    expect(game.state("Dv").damage).toBe(0); // no combat damage yet
  });

  test("P1 passes → P2 may React (deal 1 to At) → LIFO: the Reaction resolves first after an all-pass, Priority returns to P1, another all-pass resolves the Attack Trigger (At Might 4); still no combat damage (464.2.g, 340.4)", async () => {
    const game = await combatBoard().build();
    await game.p1.move("At", "bf1");
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "At" });
    expect(chainIds(game)).toEqual(["At", "sting"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // sting resolves
    expect(game.state("At").damage).toBe(1);
    expect(game.state("At").might).toBe(3);
    expect(chainIds(game)).toEqual(["At"]);
    expect(priorityOf(game)).toBe(P1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // attack trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("At").might).toBe(4);
    // The showdown is still in progress and no combat damage has been dealt.
    expect(showdownOf(game)?.isCombatShowdown).toBe(true);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(game.state("Dv").damage).toBe(0);
    expect(game.zoneOf("Dv")).toBe("battlefield-bf1");
  });

  test("346.1 / 340.2.a — the Combat Chain was initiated by a triggered ability, so when it empties Focus stays with the Attacker (P1) who again holds Priority in Showdown Open; engine rotates Focus to P2", async () => {
    // Expected: focusOf === P1 and P1 is the acting seat after the attack-trigger chain resolves.
    // Actual: the engine treats every emptied chain during a showdown as a played chain and passes
    // Focus to P2.
    const game = await combatBoard().build();
    await game.p1.move("At", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves, chain empty
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
  });

  test("the showdown's own all-pass is still required before the Combat Damage Step: first Focus pass → showdown continues, no damage; second → combat resolves (Dv 2 vs At 4: Dv dies, At survives and conquers); the Attack Trigger fired exactly once this combat (465.2, 383.4.e.2.a)", async () => {
    const game = await combatBoard().build();
    await game.p1.move("At", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("At").might).toBe(4);
    const first = game.actingSeat() as string;
    await game.seat(first).passFocus();
    expect(showdownOf(game)).toBeDefined(); // MUST NOT: combat damage before the all-pass completes
    expect(game.state("Dv").damage).toBe(0);
    expect(game.chain()).toEqual([]); // MUST NOT: the attack trigger re-firing
    const second = game.actingSeat() as string;
    expect(second).not.toBe(first);
    await game.seat(second).passFocus();
    await game.settle(); // auto-runs the combat resolution procedure if surfaced
    expect(showdownOf(game)).toBeUndefined();
    expect(game.zoneOf("Dv")).toBe("trash");
    expect(game.zoneOf("At")).toBe("battlefield-bf1");
    expect(game.state("At").might).toBe(4); // +1 exactly once
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

// ===========================================================================
// 11. Simultaneous triggers: Turn Player stacks first ⇒ resolves last
// ===========================================================================

describe("383.3.d.1 / 303.2.a / 340: triggers controlled by different players that fire off one event are put on the chain in Turn Order (Turn Player first), so the non-turn player's resolves FIRST, each behind its own priority round", () => {
  /** W1 (P1) and W2 (P2) both have "When a unit dies, deal 1 to an enemy unit"; P1 kills P2's 1-Might victim. */
  async function bothWatchersTriggered(): Promise<G> {
    const game = await scenario()
      .unit(P1, "base", deathWatcher("Filler Watcher W1"), "W1")
      .unit(P2, "base", deathWatcher("Filler Watcher W2"), "W2")
      .unit(P2, "base", { might: 1, name: "Filler Victim" }, "victim")
      .hand(P1, ACTION_KILL, "kill")
      .build();
    await game.p1.cast("kill", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // kill resolves → victim dies → both triggers fire in the cleanup
    expect(game.zoneOf("victim")).toBe("trash");
    return game;
  }

  test("placement: chain [W1-trigger (P1, older), W2-trigger (P2, newest)]; Priority first to P2, the controller of the newest item (383.3.d.1, 337.4)", async () => {
    const game = await bothWatchersTriggered();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "W1", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "W2", controller: P2, triggered: true }),
    ]);
    expect(priorityOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("W1").damage).toBe(0);
    expect(game.state("W2").damage).toBe(0);
  });

  test("resolution: all-pass → W2's trigger resolves FIRST (W1 takes 1) while W1's trigger waits; Priority to P1; a SECOND all-pass resolves W1's trigger (W2 takes 1) — never both off one all-pass, never turn player's first (340.1, 340.4)", async () => {
    const game = await bothWatchersTriggered();
    await game.p2.passPriority();
    expect(chainIds(game)).toEqual(["W1", "W2"]); // a single pass resolves nothing
    await game.p1.passPriority();
    expect(game.state("W1").damage).toBe(1); // W2's effect (P2's trigger) happened first
    expect(game.state("W2").damage).toBe(0); // MUST NOT: turn player's trigger resolving first / both at once
    expect(chainIds(game)).toEqual(["W1"]);
    expect(priorityOf(game)).toBe(P1); // fresh priority window between the two
    expect(game.p2.can("passPriority")).toBe(false);
    await game.p1.passPriority();
    expect(game.state("W2").damage).toBe(0);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("W2").damage).toBe(1);
    expect(game.state("W1").damage).toBe(1);
    expect(game.zoneOf("W1")).toBe("base");
    expect(game.zoneOf("W2")).toBe("base");
    expect(turnStateOf(game)).toBe("neutral-open");
  });

  test("one player controlling two simultaneous triggers: both land on the chain under that player's control (the player orders them — via an 'order' prompt or a deterministic engine order) and still resolve one per all-pass (383.3.d)", async () => {
    const game = await scenario()
      .unit(P1, "base", deathWatcher("Filler Watcher Wa"), "Wa")
      .unit(P1, "base", deathWatcher("Filler Watcher Wb"), "Wb")
      .unit(P2, "base", { might: 5, name: "Filler Big X" }, "X")
      .unit(P2, "base", { might: 1, name: "Filler Victim" }, "victim")
      .hand(P1, ACTION_KILL, "kill")
      .build();
    await game.p1.cast("kill", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "order" && d.seat === P1) {
      await game.p1.order(d.items.map((i) => i.key));
    } else {
      // No other seat may be asked to order P1's triggers.
      expect(d?.kind === "order").toBe(false);
    }
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    expect(new Set(chainIds(game))).toEqual(new Set(["Wa", "Wb"]));
    expect(priorityOf(game)).toBe(P1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const afterFirst = game.decision();
    if (afterFirst?.kind === "pick" && afterFirst.seat === P1) {
      await game.p1.pick("X");
    }
    expect(game.chain()).toHaveLength(1); // exactly one resolved
    expect(game.state("X").damage).toBe(1);
  });
});

// ===========================================================================
// 12. Showdown staged by a resolving spell does not open until the chain is empty
// ===========================================================================

describe("323.8 / 323.12 / 344: a spell-driven move contests the battlefield and STAGES a showdown, but the showdown only begins once the chain is empty and the turn is back in a Neutral Open State", () => {
  /** P1: S0 (draw 1) on the chain, then Reaction March moves U → bf1 on top of it. Both pass → March resolves. */
  async function marchResolvedUnderS0(): Promise<{ game: G; p1Hand: number }> {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .hand(P1, ACTION_DRAW, "S0")
      .hand(P1, REACTION_MARCH, "march")
      .hand(P2, REACTION_BUFF, "B")
      .build();
    await game.p1.cast("S0");
    await game.p1.cast("march", { targets: "U" });
    expect(chainIds(game)).toEqual(["S0", "march"]);
    const p1Hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // march resolves: U arrives at bf1
    return { game, p1Hand };
  }

  test("after March resolves with S0 still on the chain: U at bf1, bf1 Contested by P1, but NO showdown in progress, no Focus holder; Priority = P1 (controller of S0); P2 may still React onto this chain; no conquer (323.8, 344)", async () => {
    const { game, p1Hand } = await marchResolvedUnderS0();
    expect(game.locationOf("U")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(chainIds(game)).toEqual(["S0"]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(showdownOf(game)).toBeUndefined(); // MUST NOT: showdown/focus while S0 is unresolved
    expect(focusOf(game)).toBeUndefined();
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // MUST NOT: conquer before the showdown
    expect(game.p1.points()).toBe(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "B")).toBe(true);
  });

  test("323.12 / 344.2 — when S0 resolves and the chain empties (Neutral Open), the cleanup BEGINS the staged showdown at bf1 automatically with Focus + Priority to P1; engine leaves it staged and instead offers manual startShowdown / even an immediate conquerBattlefield", async () => {
    // Expected: showdown active at bf1, focus P1, P1's decision context "showdown", and no way to
    // conquer yet. Actual: no showdown; P1's main-phase menu lists `startShowdown:bf1` AND
    // `conquerBattlefield:bf1` (which would skip P2's showdown window entirely).
    const { game } = await marchResolvedUnderS0();
    await game.p1.passPriority();
    await game.p2.passPriority(); // S0 resolves → chain empty
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("conquer")).toBe(false);
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(focusOf(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // …then the usual all-pass ends it and P1 conquers.
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("the staged showdown is not simply dropped: after S0 resolves bf1 is still Contested by P1 with U present and P1 has NOT been handed control or a point without a showdown (323.8.a, 348.2.a)", async () => {
    const { game, p1Hand } = await marchResolvedUnderS0();
    await game.p1.passPriority();
    await game.p2.passPriority(); // S0 resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.locationOf("U")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });
});

// ===========================================================================
// 13. Hold trigger in the Beginning Phase opens a respondable chain outside the Main Phase
// ===========================================================================

describe("315.2.b / 383.4.d.2 / 383.3.c / 813.1.c.1 / 335: a Hold Effect in the Beginning Phase scores first, then goes on the chain in a Closed State where the opponent may React; when the chain empties the turn proceeds automatically to the Main Phase", () => {
  /** End of P2's turn 2; P1 controls bf1 with the Hold Pinger; P2 has V (2 Might) in base and a +2 Reaction. */
  function holdBoard() {
    return scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", HOLD_PINGER, "Hd")
      .unit(P2, "base", { might: 2, name: "Filler V" }, "V")
      .hand(P2, REACTION_BUFF, "B");
  }

  test("P2 ends the turn → P1's Beginning Phase: P1 holds bf1 and scores +1 BEFORE the trigger resolves; Hd's Hold Effect is a triggered chain item controlled by P1; state Closed; Priority P1; V untouched", async () => {
    const game = await holdBoard().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the point is not contingent on the trigger
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "Hd", controller: P1, triggered: true })]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("V").damage).toBe(0);
  });

  test("P1 passes → P2 may play its Reaction during P1's Beginning Phase (Closed State, any player's turn) → LIFO: buff resolves (V Might 4), fresh all-pass, hold trigger deals 2 to V (survives) — all while still in the Beginning Phase (813.1.c.1, 340.1, 340.4)", async () => {
    const game = await holdBoard().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "B")).toBe(true); // MUST NOT be rejected for "not main phase"
    await game.p2.cast("B", { targets: "V" });
    expect(chainIds(game)).toEqual(["Hd", "B"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // B resolves
    expect(game.state("V").might).toBe(4);
    expect(game.state("V").damage).toBe(0);
    expect(chainIds(game)).toEqual(["Hd"]);
    expect(game.phase()).toBe("beginning");
    expect(priorityOf(game)).toBe(P1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // hold trigger resolves (V is the only enemy unit)
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("V");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("V").damage).toBe(2);
    expect(game.zoneOf("V")).toBe("base"); // 2 damage on a 4-Might unit
    expect(game.p1.points()).toBe(1); // scored exactly once
  });

  test("when the chain empties outside the Main Phase nobody receives an open action window: the turn proceeds automatically Channel → Draw → Main, and only THEN is P1 the acting seat in Neutral Open (335)", async () => {
    const game = await holdBoard().build();
    const runes0 = game.p1.runes().length;
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    // Walk the chain by passing; record every phase in which a seat was offered a MAIN-context menu.
    const mainContextPhases: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (actionContext(d) === "main") {
        mainContextPhases.push(game.phase());
        break;
      }
      if (d.kind === "action" && d.context === "chain") {
        expect(game.phase()).toBe("beginning");
        await game.seat(d.seat).passPriority();
        continue;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("V");
        continue;
      }
      throw new Error(`unexpected decision ${d.kind} for ${d.seat} in ${game.phase()}`);
    }
    // MUST NOT: P1 getting a Neutral-Open action window inside the Beginning Phase.
    expect(mainContextPhases).toEqual(["main"]);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Channel (2 runes) and Draw (1 card) happened on the way.
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    // The hold trigger dealt 2 to the 2-Might V: lethal (520), so it died and
    // sits in the trash as a fresh object (124.1) — no stale damage store.
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.state("V").damage).toBe(0);
  });
});
