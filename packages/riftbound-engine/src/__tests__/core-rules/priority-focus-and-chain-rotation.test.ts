/**
 * Core rules: Priority, Focus & the Chain with THREE players (FFA) — turn-order rotation,
 * LIFO resolution, trigger placement and player-removal edges. CARD-INDEPENDENT: every unit,
 * spell, legend and ability below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids):
 *   142.4 / 144.1.b            lethal damage is compared at cleanup; no Standard Move on a chain
 *   303.2.a / 303.2.b          simultaneous actions are sequenced in Turn Order from the Turn Player
 *   305 / 316.9                a phase / turn cannot end while items sit on the Chain
 *   308.1.a / 313.1(.a)        Showdown State admits only [Action] / [Reaction]; Focus ⇒ Priority
 *   309.1.a / 310.1.a          cards & abilities: Priority, own turn, Neutral Open by default
 *   312.1.b(.1) / 321          no Priority → no Discretionary Actions; Limited Actions regardless
 *   312.2.a-d                  when a player receives Priority
 *   313.2 / 313.3 / 313.4 / 313.5  Focus grants Priority; passing Priority keeps Focus; none in Neutral
 *   316.5.b                    Neutral Open: only the Turn Player may act
 *   319.5 / 320(.1) / 322      Cleanup: deaths noted, triggers become Pending Items
 *   328 / 330(.1/.2) / 331.1(.a/.b)  the Chain zone; one chain; Open vs Closed
 *   333(.1) / 334.2.a / 335.1  chain steps; resolution-time choices; who gets Priority next
 *   337.1.a / 337.2 / 337.4    finalizing passes no Priority; permanents/Add resolve at once;
 *                              the controller of the newest item receives Priority
 *   338.1.a.1/.2/.7 / 338.1.b.1  Execute: legally-timed plays, or pass to the next in Turn Order
 *   339.1 / 339.2              all-pass-in-sequence with nothing added → Resolve
 *   340.1 / 340.2(.a) / 340.3 / 340.4  newest item resolves; empty chain → Open; else Priority to
 *                              the controller of the new newest item
 *   343.1.a/.b / 345 / 346(.1) / 347.1(.a/.b) / 347.2(.a/.b) / 348(.2.a.1)  Showdown & Focus
 *   344.2 / 316.8.b.1          a move onto an empty uncontrolled battlefield opens a Showdown
 *   351.1 / 354.3 / 355.5 / 355.12  permanents leave the chain at once; resolution choices
 *   358.4 / 358.5              an illegal play is undone in full at Check Legality
 *   359.2.c/.d / 359.3.e.5 / 359.3.f.2/.f.4  units enter exhausted, gear ready; item info is carried
 *   383.2.a.1 / 383.3(.c/.d/.d.1)  a finalized item survives its source; trigger placement order
 *   400.2 / 429.2(.a)          Add (rune) abilities are not respondable
 *   410.1.a/.b / 410.2.a/.b    Discretionary vs Limited Actions
 *   425.1.a(.1) / 425.1.c      a countered item leaves the chain without effect and with no refund
 *   469.1 / 470                Control & Conquer
 *   650 / 651(.2/.3) / 652.1 / 652.3 / 652.4 / 652.5.a.1 / 652.5.b.1/.b.2 / 652.5.c.1/.c.2
 *                              concession and Removal of a Player
 *   806.1.b/.c.1 / 813.1.c.1   [Action] = Open + Showdown; [Reaction] additionally Closed states
 */

import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../harness";
import { P1, P2, P3, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions (no printed cards)
// ---------------------------------------------------------------------------

/** Plain (no timing keyword) spell: "Draw N." */
const draw = (n: number, cost = 0): InlineCardDef => ({
  abilities: [{ effect: { amount: n, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: cost,
  name: `Filler Insight ${n}`,
  rulesText: `Draw ${n}.`,
  timing: "standard",
});

/** [Action] spell: "Draw N." */
const actionDraw = (n = 1): InlineCardDef => ({
  abilities: [{ effect: { amount: n, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: `Filler Quick Insight ${n}`,
  rulesText: `[Action] Draw ${n}.`,
  timing: "action",
});

/** [Reaction] spell: "Draw N." */
const reactionDraw = (n = 1): InlineCardDef => ({
  abilities: [{ effect: { amount: n, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  keywords: ["Reaction"],
  name: `Filler Snap Insight ${n}`,
  rulesText: `[Reaction] Draw ${n}.`,
  timing: "reaction",
});

/** Plain spell: "Deal N to a unit." */
const bolt = (n: number): InlineCardDef => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: `Filler Bolt ${n}`,
  rulesText: `Deal ${n} to a unit.`,
  timing: "standard",
});

/** [Reaction] spell: "Deal N to a unit." */
const reactionBolt = (n: number): InlineCardDef => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: `Filler Snap Bolt ${n}`,
  rulesText: `[Reaction] Deal ${n} to a unit.`,
  timing: "reaction",
});

/** [Reaction] spell: "Give a unit +2 [M] this turn." */
const REACTION_BUFF: InlineCardDef = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Brace",
  rulesText: "[Reaction] Give a unit +2 [M] this turn.",
  timing: "reaction",
};

/** [Reaction] spell: "Kill a unit." */
const REACTION_KILL: InlineCardDef = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Snap Execution",
  rulesText: "[Reaction] Kill a unit.",
  timing: "reaction",
};

/** [Action] spell: "Kill a unit." */
const ACTION_KILL: InlineCardDef = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Quick Execution",
  rulesText: "[Action] Kill a unit.",
  timing: "action",
};

/** [Reaction] spell: "Counter a spell or ability." */
const NULLIFY: InlineCardDef = {
  abilities: [{ effect: { type: "counter" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Nullify",
  rulesText: "[Reaction] Counter a spell or ability.",
  timing: "reaction",
};

/** [Reaction] spell: "An opponent reveals their hand. Choose a card from it. They discard it." */
const REACTION_PILFER: InlineCardDef = {
  abilities: [
    { effect: { onPicked: "discard", target: { type: "player", which: "opponent" }, type: "reveal-hand" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Snap Pilfer",
  rulesText: "[Reaction] An opponent reveals their hand. Choose a card from it. They discard that card.",
  timing: "reaction",
};

/** Legend with a plain (non-timed) activated ability: "[1]: Draw 1." */
const LEGEND_PLAIN: InlineCardDef = {
  abilities: [{ cost: { energy: 1 }, effect: { amount: 1, type: "draw" }, type: "activated" }],
  cardType: "legend",
  domain: ["mind", "calm"],
  name: "Filler Sage",
  rulesText: "[1]: Draw 1.",
};

/** Unit · 2 Might · activated "Deal 2 to a unit." (a source that can be killed off the chain) */
const ZAPPER: InlineCardDef = {
  abilities: [{ cost: {}, effect: { amount: 2, target: { type: "unit" }, type: "damage" }, type: "activated" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Zapper",
  rulesText: "Deal 2 to a unit.",
};

/** Unit · 2 Might · Deathknell "When I die, deal 2 to an enemy unit." */
const DEATH_PINGER: InlineCardDef = {
  abilities: [
    { effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Death Pinger",
  rulesText: "When I die, deal 2 to an enemy unit.",
};

/** Unit · 2 Might · Deathknell "When I die, draw N." (no targeting — order is observable by hand size) */
const deathDrawer = (n: number, name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: n, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name,
  rulesText: `When I die, draw ${n}.`,
});

/** Unit · 5 Might · "When a unit dies, draw N." (sturdy: every watcher survives the event) */
const deathWatcher = (n: number, name: string): InlineCardDef => ({
  abilities: [{ effect: { amount: n, type: "draw" }, trigger: { event: "die", on: "any-unit" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 5,
  name,
  rulesText: `When a unit dies, draw ${n}.`,
});

const VANILLA_UNIT: InlineCardDef = { cardType: "unit", domain: "fury", energyCost: 0, might: 3, name: "Filler Bruiser" };
const VANILLA_GEAR: InlineCardDef = { abilities: [], cardType: "gear", domain: "fury", energyCost: 0, name: "Filler Trinket" };

// ---------------------------------------------------------------------------
// State readers (public state only)
// ---------------------------------------------------------------------------

type TurnState = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

function showdownOf(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

/** Who holds Focus (undefined in a Neutral State — rule 313.5). */
function focusOf(game: Game): string | undefined {
  return showdownOf(game)?.focusPlayer;
}

/** Who holds chain Priority per the engine (undefined when no chain). */
function priorityOf(game: Game): string | undefined {
  const chain = game.gameState.interaction?.chain;
  return chain?.active ? chain.activePlayer : undefined;
}

function turnStateOf(game: Game): TurnState {
  const hasShowdown = showdownOf(game) !== undefined;
  const inter = game.gameState.interaction;
  const hasChain = inter?.chain?.active === true && (inter.chain.items?.length ?? 0) > 0;
  if (hasShowdown) {
    return hasChain ? "showdown-closed" : "showdown-open";
  }
  return hasChain ? "neutral-closed" : "neutral-open";
}

function chainIds(game: Game): string[] {
  return game.chain().map((i) => i.cardId);
}

/** Chain items that are still live (a countered item has left the chain in rules terms). */
function liveChainIds(game: Game): string[] {
  return game.chain().filter((i) => !i.countered).map((i) => i.cardId);
}

function resourceSnapshot(game: Game) {
  return { p1: game.p1.resources(), p2: game.p2.resources(), p3: game.seat(P3).resources() };
}

function handSizes(game: Game) {
  return { p1: game.p1.hand().length, p2: game.p2.hand().length, p3: game.seat(P3).hand().length };
}

/** Every seat passes Priority in the current rotation order (three passes = one full round). */
async function allPass(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const holder = priorityOf(game);
    if (holder === undefined) {
      return;
    }
    await game.seat(holder).passPriority();
  }
}

// ===========================================================================
// 1. Neutral Open: only the Turn Player may act
// ===========================================================================

describe("1. Neutral Open in a 3-player game: only the Turn Player may act — both non-turn seats are frozen (310.1.a, 312.2.a, 316.5.b, 410.1.a/.b, 813.1.c.1, 806.1.c.1)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .resources(P3, { energy: 3 })
      .hand(P1, draw(1), "p1plain")
      .hand(P2, draw(1), "p2plain")
      .hand(P2, actionDraw(), "p2action")
      .hand(P2, reactionDraw(), "p2react")
      .hand(P3, draw(1), "p3plain")
      .hand(P3, actionDraw(), "p3action")
      .hand(P3, reactionDraw(), "p3react")
      .unit(P2, "base", { might: 2, name: "Filler Scout" }, "p2unit")
      .unit(P3, "base", { might: 2, name: "Filler Ranger" }, "p3unit")
      .legend(P1, LEGEND_PLAIN, "p1legend")
      .legend(P2, LEGEND_PLAIN, "p2legend")
      .legend(P3, LEGEND_PLAIN, "p3legend");
  }

  test("the position is Neutral Open with P1 acting and BOTH other seats holding an empty action menu", async () => {
    const game = await board().build();
    expect(game.seats()).toEqual([P1, P2, P3]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    for (const seat of [P2, P3]) {
      expect(game.seat(seat).isActing()).toBe(false);
      // Only the always-legal concede (rule 650) survives; nothing else is enumerated.
      expect(game.seat(seat).legal().filter((o) => o.verb !== "concede" && o.moveId !== "invitePlayer")).toEqual([]);
    }
  });

  test("every discretionary action by P2 and P3 is rejected and nothing changes (Reaction grants Closed/Showdown permission only)", async () => {
    const game = await board().build();
    const before = resourceSnapshot(game);
    const hash = game.stateHash();
    for (const seat of [P2, P3]) {
      const s = game.seat(seat);
      const tag = seat === P2 ? "p2" : "p3";
      expect(s.can("cast", `${tag}plain`)).toBe(false);
      expect((await s.try((x) => x.do("playSpell", { cardId: `${tag}plain` }))).ok).toBe(false);
      expect(s.can("cast", `${tag}action`)).toBe(false);
      expect((await s.try((x) => x.do("playSpell", { cardId: `${tag}action` }))).ok).toBe(false);
      // 813.1.c.1 — [Reaction] adds Closed-state and Showdown permission, never permission to act
      // in another player's Neutral Open turn.
      expect(s.can("cast", `${tag}react`)).toBe(false);
      expect((await s.try((x) => x.do("playSpell", { cardId: `${tag}react` }))).ok).toBe(false);
      expect((await s.try((x) => x.move(`${tag}unit`, "bf1"))).ok).toBe(false);
      expect((await s.try((x) => x.do("standardMove", { destination: "bf1", unitIds: [`${tag}unit`] }))).ok).toBe(false);
      expect(s.can("activate", `${tag}legend`)).toBe(false);
      expect((await s.try((x) => x.do("activateAbility", { abilityIndex: 0, cardId: `${tag}legend` }))).ok).toBe(false);
      expect((await s.try((x) => x.endTurn())).ok).toBe(false);
      expect((await s.try((x) => x.do("endTurn", {}))).ok).toBe(false);
      // MUST NOT: any of that creating a chain, spending anything or emptying a hand.
      expect(game.chain()).toEqual([]);
      expect(game.zoneOf(`${tag}plain`)).toBe("hand");
      expect(game.zoneOf(`${tag}action`)).toBe("hand");
      expect(game.zoneOf(`${tag}react`)).toBe("hand");
      expect(game.locationOf(`${tag}unit`)).toBe("base");
      expect(game.state(`${tag}unit`).isReady).toBe(true);
    }
    expect(resourceSnapshot(game)).toEqual(before);
    expect(game.stateHash()).toBe(hash);
    expect(game.actingSeat()).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("positive control: in the very same position P1 may cast the identical plain spell and activate the identical legend ability", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "p1legend")).toBe(true);
    await game.p1.activate("p1legend", 0);
    await allPass(game);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "p1plain")).toBe(true);
    await game.p1.cast("p1plain");
    expect(chainIds(game)).toEqual(["p1plain"]);
  });
});

// ===========================================================================
// 2. Opening a chain: controller first, then all three must pass
// ===========================================================================

describe("2. Opening a chain: the CONTROLLER holds Priority first and ALL THREE seats must pass before the item resolves (328, 330, 331.1, 337.1.a, 337.4, 339.1, 340.1, 340.2, 312.2.c/.d, 338.1.b.1, 313.5)", () => {
  function board() {
    return scenario({ players: 3 })
      .resources(P1, { energy: 3 })
      .hand(P1, draw(1, 1), "S1");
  }

  test("right after the cast: one finalized item, cost paid, effect not executed, Closed, Priority with P1 — not P2", async () => {
    const game = await board().build();
    const hand0 = handSizes(game);
    const deck0 = game.p1.deck().length;
    await game.p1.cast("S1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "S1", controller: P1, countered: false, triggered: false, type: "spell" }),
    ]);
    expect(game.zoneOf("S1")).toBe("chain");
    expect(turnStateOf(game)).toBe("neutral-closed");
    // Cost already paid, effect pending.
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand().length).toBe(hand0.p1 - 1);
    expect(game.p1.deck().length).toBe(deck0);
    // 337.4 / 312.2.c — the controller of the newest item, NOT the next seat.
    expect(priorityOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.isActing()).toBe(false);
    expect(game.seat(P3).isActing()).toBe(false);
    expect(game.p2.can("passPriority")).toBe(false);
    expect(game.seat(P3).can("passPriority")).toBe(false);
  });

  test("P1 passes → P2; P2 passes → P3; the item MUST NOT resolve on two passes; P3's pass resolves it exactly once", async () => {
    const game = await board().build();
    const hand0 = handSizes(game);
    const deck0 = game.p1.deck().length;
    await game.p1.cast("S1");
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.zoneOf("S1")).toBe("chain");
    await game.p2.passPriority();
    // MUST NOT: the two-player all-pass resolving the item with P3 never consulted.
    expect(priorityOf(game)).toBe(P3);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.zoneOf("S1")).toBe("chain");
    expect(game.p1.hand().length).toBe(hand0.p1 - 1);
    expect(game.p1.deck().length).toBe(deck0);
    await game.seat(P3).passPriority();
    // Resolved exactly once.
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.trash()).toContain("S1");
    expect(game.p1.hand().length).toBe(hand0.p1 - 1 + 1);
    expect(game.p1.deck().length).toBe(deck0 - 1);
    expect(game.p2.hand().length).toBe(hand0.p2);
    expect(game.seat(P3).hand().length).toBe(hand0.p3);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(focusOf(game)).toBeUndefined(); // 313.5 — no Focus in a Neutral State
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 3. Closed state gates every seat identically
// ===========================================================================

describe("3. Closed state gates every seat identically: only [Reaction] may be added (309.1.a, 331.1.a/.b, 338.1.a.1/.2, 358.4, 358.5, 305, 316.9, 144.1.b, 806.1.b, 813.1.c.1)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .hand(P1, draw(1), "S1")
      .hand(P1, draw(2), "p1plain")
      .hand(P1, actionDraw(), "p1action")
      .hand(P1, reactionDraw(), "p1react")
      .unit(P1, "base", { might: 2, name: "Filler Runner" }, "p1unit")
      .hand(P3, draw(2), "p3plain")
      .hand(P3, actionDraw(), "p3action")
      .hand(P3, reactionDraw(), "p3react")
      .hand(P3, VANILLA_UNIT, "p3unitcard")
      .unit(P3, "base", { might: 2, name: "Filler Walker" }, "p3unit");
  }

  /** Chain [S1] with Priority handed to P3. */
  async function toP3Priority(): Promise<Game> {
    const game = await board().build();
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P3);
    expect(turnStateOf(game)).toBe("neutral-closed");
    return game;
  }

  test("P3 with Priority: plain spell, [Action] spell, vanilla unit, Standard Move and endTurn are all rejected with nothing spent", async () => {
    const game = await toP3Priority();
    const before = resourceSnapshot(game);
    const hands = handSizes(game);
    for (const id of ["p3plain", "p3action"]) {
      expect(game.seat(P3).can("cast", id)).toBe(false);
      expect((await game.seat(P3).try((s) => s.do("playSpell", { cardId: id }))).ok).toBe(false);
      expect(game.zoneOf(id)).toBe("hand");
    }
    expect(game.seat(P3).can("play", "p3unitcard")).toBe(false);
    expect((await game.seat(P3).try((s) => s.do("playUnit", { cardId: "p3unitcard", location: "base" }))).ok).toBe(false);
    expect(game.zoneOf("p3unitcard")).toBe("hand");
    expect(game.seat(P3).can("move")).toBe(false);
    expect((await game.seat(P3).try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["p3unit"] }))).ok).toBe(false);
    expect(game.locationOf("p3unit")).toBe("base");
    expect(game.state("p3unit").isReady).toBe(true);
    expect((await game.seat(P3).try((s) => s.do("endTurn", {}))).ok).toBe(false);
    // Nothing moved, nothing was spent, Priority did not budge (358.4 / 358.5).
    expect(chainIds(game)).toEqual(["S1"]);
    expect(handSizes(game)).toEqual(hands);
    expect(resourceSnapshot(game)).toEqual(before);
    expect(priorityOf(game)).toBe(P3);
    expect(game.turnNumber()).toBe(2);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("P3's [Reaction] IS accepted: chain [S1, R] with R newest, still Closed, Priority to P3 as its controller", async () => {
    const game = await toP3Priority();
    expect(game.seat(P3).can("cast", "p3react")).toBe(true);
    await game.seat(P3).cast("p3react");
    expect(chainIds(game)).toEqual(["S1", "p3react"]);
    expect(game.chain()[1]).toEqual(expect.objectContaining({ cardId: "p3react", controller: P3 }));
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P3);
    expect(game.actingSeat()).toBe(P3);
  });

  test("the Turn Player is bound by the same gate: back on Priority, P1 may add only its [Reaction]", async () => {
    const game = await toP3Priority();
    await game.seat(P3).passPriority(); // all three passed → S1 resolves
    expect(turnStateOf(game)).toBe("neutral-open");
    await game.p1.cast("p1plain"); // fresh chain, P1 holds the first Priority
    expect(priorityOf(game)).toBe(P1);
    expect(turnStateOf(game)).toBe("neutral-closed");
    const before = resourceSnapshot(game);
    expect(game.p1.can("cast", "p1action")).toBe(false);
    expect((await game.p1.try((s) => s.do("playSpell", { cardId: "p1action" }))).ok).toBe(false);
    expect(game.p1.can("move")).toBe(false);
    expect((await game.p1.try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["p1unit"] }))).ok).toBe(false);
    // MUST NOT: end the turn or advance the phase while an item sits on the chain (305 / 316.9).
    const d = game.decision();
    expect(d && d.kind === "action" ? d.endTurnKey : "x").toBeUndefined();
    expect((await game.p1.try((s) => s.do("endTurn", {}))).ok).toBe(false);
    expect(chainIds(game)).toEqual(["p1plain"]);
    expect(resourceSnapshot(game)).toEqual(before);
    expect(game.p1.can("cast", "p1react")).toBe(true);
    await game.p1.cast("p1react");
    expect(chainIds(game)).toEqual(["p1plain", "p1react"]);
    expect(priorityOf(game)).toBe(P1);
  });
});

// ===========================================================================
// 4. Adding an item restarts the pass sequence
// ===========================================================================

describe("4. Adding an item restarts the pass sequence — the seat that was skipped gets a fresh window (339.1, 339.2, 338.1.a.7, 338.1.b.1, 340.1, 340.4, 312.2.c)", () => {
  test("P1 and P2 have passed; P3 reacts instead of passing → R needs its own complete round, and S1 another after that", async () => {
    const game = await scenario({ players: 3 })
      .hand(P1, draw(1), "S1")
      .hand(P3, reactionDraw(1), "R")
      .build();
    const hands0 = handSizes(game);
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).cast("R");
    expect(chainIds(game)).toEqual(["S1", "R"]);
    expect(priorityOf(game)).toBe(P3); // 337.4
    expect(game.gameState.interaction?.chain?.passedPlayers ?? []).toEqual([]);
    await game.seat(P3).passPriority();
    expect(priorityOf(game)).toBe(P1);
    await game.p1.passPriority();
    // MUST NOT: R resolving — P2 has not passed since R was added.
    expect(chainIds(game)).toEqual(["S1", "R"]);
    expect(game.zoneOf("R")).toBe("chain");
    expect(priorityOf(game)).toBe(P2);
    await game.p2.passPriority();
    // R resolved alone; S1 did NOT resolve in the same round.
    expect(game.zoneOf("R")).toBe("trash");
    expect(game.seat(P3).hand().length).toBe(hands0.p3 - 1 + 1);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.zoneOf("S1")).toBe("chain");
    expect(game.p1.hand().length).toBe(hands0.p1 - 1);
    expect(priorityOf(game)).toBe(P1); // controller of the new newest item
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(chainIds(game)).toEqual(["S1"]);
    await game.seat(P3).passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.hand().length).toBe(hands0.p1);
    expect(turnStateOf(game)).toBe("neutral-open");
  });
});

// ===========================================================================
// 5. LIFO with a third player in the middle
// ===========================================================================

describe("5. LIFO with a third player: one item per all-pass round, Priority to the controller of the new top (340.1, 340.4, 312.2.c, 339.1, 337.4, 330.1)", () => {
  test("chain [S1(P1 draw1), R2(P2 draw2), R3(P3 draw3)] resolves exactly R3, R2, S1 — one per round, Priority never snapping back to the turn player", async () => {
    const game = await scenario({ players: 3 })
      .hand(P1, draw(1), "S1")
      .hand(P2, reactionDraw(2), "R2")
      .hand(P3, reactionDraw(3), "R3")
      .build();
    const hands0 = handSizes(game);
    const order: string[] = [];
    const track = () => {
      for (const id of ["S1", "R2", "R3"]) {
        if (game.zoneOf(id) === "trash" && !order.includes(id)) {
          order.push(id);
        }
      }
    };
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.cast("R2");
    await game.p2.passPriority();
    await game.seat(P3).cast("R3");
    expect(chainIds(game)).toEqual(["S1", "R2", "R3"]);
    expect(priorityOf(game)).toBe(P3);

    // Round 1: P3, P1, P2.
    await game.seat(P3).passPriority();
    await game.p1.passPriority();
    track();
    expect(order).toEqual([]);
    await game.p2.passPriority();
    track();
    expect(order).toEqual(["R3"]);
    expect(game.seat(P3).hand().length).toBe(hands0.p3 - 1 + 3);
    expect(chainIds(game)).toEqual(["S1", "R2"]);
    // Priority to the controller of the new newest item — NOT the turn player, NOT the last passer.
    expect(priorityOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);

    // Round 2: P2, P3, P1.
    await game.p2.passPriority();
    await game.seat(P3).passPriority();
    track();
    expect(order).toEqual(["R3"]);
    await game.p1.passPriority();
    track();
    expect(order).toEqual(["R3", "R2"]);
    expect(game.p2.hand().length).toBe(hands0.p2 - 1 + 2);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(priorityOf(game)).toBe(P1);

    // Round 3: P1, P2, P3.
    await game.p1.passPriority();
    await game.p2.passPriority();
    track();
    expect(order).toEqual(["R3", "R2"]);
    await game.seat(P3).passPriority();
    track();
    expect(order).toEqual(["R3", "R2", "S1"]);
    expect(game.p1.hand().length).toBe(hands0.p1 - 1 + 1);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 6. LIFO is load-bearing: a third seat's Reaction buff saves the target
// ===========================================================================

describe("6. LIFO is load-bearing: an uninvolved third seat's [Reaction] buff resolves before the damage spell under it (340.1, 340.4, 339.1, 142.4, 323.4, 323.5)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Filler Target" }, "X")
      .hand(P1, bolt(2), "D")
      .hand(P3, REACTION_BUFF, "B");
  }

  test("P3's buff resolves first: X is Might 4 with D still pending, then D deals 2 and X survives with 2 damage", async () => {
    const game = await board().build();
    await game.p1.cast("D", { targets: "X" });
    expect(chainIds(game)).toEqual(["D"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).cast("B", { targets: "X" });
    expect(chainIds(game)).toEqual(["D", "B"]);
    expect(priorityOf(game)).toBe(P3);
    await allPass(game);
    // B resolved FIRST; D has dealt nothing.
    expect(game.zoneOf("B")).toBe("trash");
    expect(chainIds(game)).toEqual(["D"]);
    expect(game.state("X").might).toBe(4);
    expect(game.state("X").damage).toBe(0);
    expect(priorityOf(game)).toBe(P1);
    await allPass(game);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // 2 on Might 4 is NOT lethal.
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(2);
    expect(game.state("X").might).toBe(4);
    expect(game.p2.trash()).not.toContain("X");
  });

  test("control branch: with no buff from P3, the same 2 damage on Might 2 is lethal and the cleanup kills X", async () => {
    const game = await board().build();
    await game.p1.cast("D", { targets: "X" });
    await allPass(game);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
  });
});

// ===========================================================================
// 7. Permanents and Add abilities resolve immediately
// ===========================================================================

describe("7. Permanents and Add abilities finalize and resolve immediately — no seat ever receives Priority (337.2, 351.1, 359.2.c/.d, 340.2, 400.2, 429.2, 429.2.a)", () => {
  function board() {
    return scenario({ players: 3 })
      .runes(P1, "mind", 2)
      .hand(P1, VANILLA_UNIT, "U")
      .hand(P1, VANILLA_GEAR, "G")
      .hand(P1, draw(1), "S1")
      .hand(P2, reactionDraw(), "p2react")
      .hand(P3, reactionDraw(), "p3react");
  }

  test("(a) a vanilla unit enters the base EXHAUSTED with no chain and no window for P2 or P3", async () => {
    const game = await board().build();
    await game.p1.play("U");
    expect(game.zoneOf("U")).toBe("base");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toEqual(expect.objectContaining({ context: "main", kind: "action", seat: P1 }));
    for (const seat of [P2, P3]) {
      expect(game.seat(seat).isActing()).toBe(false);
      expect(game.seat(seat).can("cast", seat === P2 ? "p2react" : "p3react")).toBe(false);
      expect((await game.seat(seat).try((s) => s.do("playSpell", { cardId: seat === P2 ? "p2react" : "p3react" }))).ok).toBe(false);
      expect((await game.seat(seat).try((s) => s.do("passChainPriority", {}))).ok).toBe(false);
    }
  });

  test("(b) a vanilla gear enters READY, likewise with no chain and no window", async () => {
    const game = await board().build();
    await game.p1.play("G");
    expect(game.zoneOf("G")).toBe("base");
    expect(game.state("G").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "p2react")).toBe(false);
    expect(game.seat(P3).can("cast", "p3react")).toBe(false);
  });

  test("(c) a rune [Add] during an existing chain adds energy at once, stacks no item and hands no window to P2 or P3", async () => {
    const game = await board().build();
    await game.p1.cast("S1");
    expect(chainIds(game)).toEqual(["S1"]);
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    // MUST NOT: the Add becoming a respondable chain item or moving Priority.
    expect(chainIds(game)).toEqual(["S1"]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.p2.isActing()).toBe(false);
    expect(game.seat(P3).isActing()).toBe(false);
    // The pass sequence is untouched: three passes still resolve S1.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("S1")).toBe("chain");
    await game.seat(P3).passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(turnStateOf(game)).toBe("neutral-open");
  });
});

// ===========================================================================
// 8. A triggered ability from a third player joins the EXISTING chain
// ===========================================================================

describe("8. A triggered ability joins the EXISTING chain and gets its own response window (319.5, 323.4, 323.5, 330.1, 330.2, 383.3, 383.3.c, 337.4, 340.3, 340.4, 354.3, 321)", () => {
  function board() {
    return scenario({ players: 3 })
      .unit(P2, "base", DEATH_PINGER, "D")
      .unit(P1, "base", { might: 5, name: "Filler Wall" }, "w1")
      .hand(P1, bolt(2), "K")
      .hand(P3, reactionDraw(1), "r3");
  }

  test("K kills D; D's Deathknell is added to the SAME chain as a Pending Item controlled by P2, and P2 gets Priority first", async () => {
    const game = await board().build();
    await game.p1.cast("K", { targets: "D" });
    expect(chainIds(game)).toEqual(["K"]);
    await allPass(game);
    // K resolved and D died in the cleanup; the trigger is now the newest item on the SAME chain.
    expect(game.zoneOf("K")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "D", controller: P2, triggered: true, type: "ability" }),
    ]);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    // MUST NOT: the trigger resolving without a priority round.
    expect(game.state("w1").damage).toBe(0);
  });

  test("P3 gets a genuine window on that trigger: its [Reaction] goes on top and resolves first (LIFO)", async () => {
    const game = await board().build();
    await game.p1.cast("K", { targets: "D" });
    await allPass(game);
    expect(priorityOf(game)).toBe(P2);
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P3);
    const hands = handSizes(game);
    expect(game.seat(P3).can("cast", "r3")).toBe(true);
    await game.seat(P3).cast("r3");
    expect(chainIds(game)).toEqual(["D", "r3"]);
    expect(game.chain()).toHaveLength(2); // one chain, never two
    await allPass(game);
    // P3's Reaction resolved FIRST; the Deathknell is still pending.
    expect(game.zoneOf("r3")).toBe("trash");
    expect(game.seat(P3).hand().length).toBe(hands.p3 - 1 + 1);
    expect(chainIds(game)).toEqual(["D"]);
    expect(game.state("w1").damage).toBe(0);
    expect(priorityOf(game)).toBe(P2);
    await allPass(game);
    // Then the Deathknell resolves onto P2's only enemy unit.
    expect(game.chain()).toEqual([]);
    expect(game.state("w1").damage).toBe(2);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
  });
});

// ===========================================================================
// 9. Three simultaneous triggers from three controllers
// ===========================================================================

describe("9. Three simultaneous triggers stack in Turn Order (turn player first) and therefore resolve in reverse (383.3.d, 383.3.d.1, 303.2.a, 303.2.b, 337.4, 340.1, 340.4)", () => {
  test("one death triggers W1(P1), W2(P2), W3(P3): placement is P1→P2→P3 bottom-to-top and resolution is exactly W3, W2, W1 — one per all-pass round", async () => {
    const game = await scenario({ players: 3 })
      .unit(P1, "base", deathWatcher(1, "Filler Watcher One"), "W1")
      .unit(P2, "base", deathWatcher(2, "Filler Watcher Two"), "W2")
      .unit(P3, "base", deathWatcher(3, "Filler Watcher Three"), "W3")
      .unit(P2, "base", { might: 1, name: "Filler Victim" }, "V")
      .hand(P1, bolt(2), "K")
      .build();
    await game.p1.cast("K", { targets: "V" });
    await allPass(game);
    expect(game.zoneOf("V")).toBe("trash");
    // 383.3.d — the turn player's trigger goes on FIRST, then the others in Turn Order.
    expect(chainIds(game)).toEqual(["W1", "W2", "W3"]);
    expect(game.chain().map((i) => i.controller)).toEqual([P1, P2, P3]);
    expect(priorityOf(game)).toBe(P3);
    const hands = handSizes(game);

    await allPass(game);
    // W3 (newest) resolved alone: only P3 drew, and by 3.
    expect(handSizes(game)).toEqual({ p1: hands.p1, p2: hands.p2, p3: hands.p3 + 3 });
    expect(chainIds(game)).toEqual(["W1", "W2"]);
    expect(priorityOf(game)).toBe(P2);

    await allPass(game);
    expect(handSizes(game)).toEqual({ p1: hands.p1, p2: hands.p2 + 2, p3: hands.p3 + 3 });
    expect(chainIds(game)).toEqual(["W1"]);
    expect(priorityOf(game)).toBe(P1);

    await allPass(game);
    // MUST NOT: the turn player's trigger resolving first, or more than one per round.
    expect(handSizes(game)).toEqual({ p1: hands.p1 + 1, p2: hands.p2 + 2, p3: hands.p3 + 3 });
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
  });

  test("variant — when ONE player controls two of the simultaneous triggers, they still resolve one per all-pass round", async () => {
    const game = await scenario({ players: 3 })
      .unit(P3, "base", deathWatcher(1, "Filler Watcher A"), "WA")
      .unit(P3, "base", deathWatcher(3, "Filler Watcher B"), "WB")
      .unit(P2, "base", { might: 1, name: "Filler Victim" }, "V")
      .hand(P1, bolt(2), "K")
      .build();
    await game.p1.cast("K", { targets: "V" });
    await allPass(game);
    // 383.3.d — the controller of both triggers orders them: either an explicit (defaultable) order
    // prompt addressed to P3, or a deterministic engine order.
    const ordering = game.decision();
    if (ordering?.kind === "order") {
      expect(ordering.seat).toBe(P3);
      expect(await game.acceptTriggerOrder()).toBe(true);
    }
    expect(game.zoneOf("V")).toBe("trash");
    expect(chainIds(game).sort()).toEqual(["WA", "WB"]);
    expect(game.chain().every((i) => i.controller === P3)).toBe(true);
    expect(priorityOf(game)).toBe(P3);
    const hands = handSizes(game);
    const top = chainIds(game)[1] as string;
    await allPass(game);
    // Exactly one of P3's two triggers resolved.
    expect(chainIds(game)).toHaveLength(1);
    expect(game.seat(P3).hand().length).toBe(hands.p3 + (top === "WA" ? 1 : 3));
    await allPass(game);
    expect(game.chain()).toEqual([]);
    expect(game.seat(P3).hand().length).toBe(hands.p3 + 4);
    expect(handSizes(game).p1).toBe(hands.p1);
    expect(handSizes(game).p2).toBe(hands.p2);
  });
});

// ===========================================================================
// 10. Killing the source does not remove the item; countering does
// ===========================================================================

describe("10. Killing the source of a finalized chain item does not remove the item — only a counter does (383.2.a.1, 359.3.e.5, 359.3.f.2, 359.3.f.4, 425.1.a, 425.1.a.1, 425.1.c, 340.1, 340.4)", () => {
  test("P2 kills P3's Src in response: Src dies but its finalized ability still resolves for 2 on the same target", async () => {
    const game = await scenario({ players: 3 })
      .active(P3)
      .unit(P3, "base", ZAPPER, "Src")
      .unit(P1, "base", { might: 3, name: "Filler Y" }, "Y")
      .hand(P2, REACTION_KILL, "kill")
      .build();
    await game.seat(P3).activate("Src", 0, { targets: "Y" });
    expect(chainIds(game)).toEqual(["Src"]);
    await game.seat(P3).passPriority();
    await game.p1.passPriority();
    await game.p2.cast("kill", { targets: "Src" });
    expect(chainIds(game)).toEqual(["Src", "kill"]);
    await allPass(game);
    // The source is dead; the item is untouched and keeps its LIFO position.
    expect(game.zoneOf("Src")).toBe("trash");
    expect(game.seat(P3).trash()).toContain("Src");
    expect(chainIds(game)).toEqual(["Src"]);
    expect(game.chain()[0]).toEqual(expect.objectContaining({ countered: false, controller: P3 }));
    expect(priorityOf(game)).toBe(P3);
    expect(game.state("Y").damage).toBe(0);
    await allPass(game);
    // MUST NOT: the item being discarded with its source, or re-targeting.
    expect(game.chain()).toEqual([]);
    expect(game.state("Y").damage).toBe(2);
    expect(game.zoneOf("Y")).toBe("base"); // 2 on Might 3 is not lethal
  });

  test("contrast: a [Reaction] counter DOES remove the item — no effect, no refund, Priority to the controller of the new newest item", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 3 })
      .unit(P2, "bf1", { might: 3, name: "Filler Guard" }, "X")
      .hand(P1, draw(1, 1), "S0")
      .hand(P1, { ...bolt(3), energyCost: 1 }, "S1")
      .hand(P3, NULLIFY, "C")
      .build();
    await game.p1.cast("S0");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).passPriority();
    expect(game.zoneOf("S0")).toBe("trash");
    const hand0 = game.p1.hand().length;
    await game.p1.cast("S1", { targets: "X" });
    expect(game.p1.energy()).toBe(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).cast("C", { targets: "S1" });
    expect(chainIds(game)).toEqual(["S1", "C"]);
    await allPass(game);
    expect(game.zoneOf("C")).toBe("trash");
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.trash()).toContain("S1");
    expect(liveChainIds(game)).toEqual([]);
    // MUST NOT: any part of the countered spell's effect, or a refund.
    expect(game.state("X").damage).toBe(0);
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand().length).toBe(hand0 - 1);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
  });
});

// ===========================================================================
// 11. Showdown focus rotation with three players
// ===========================================================================

describe("11. Showdown focus rotation with three players: only the THIRD pass ends the showdown (316.8.b.1, 344.2, 345, 347.2, 347.2.a/.b, 348, 348.2.a.1, 313.2, 313.5, 469.1, 470)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U");
  }

  test("the move opens the showdown with P1 holding Focus and Priority; two passes do not end it; the third does and P1 conquers", async () => {
    const game = await board().build();
    await game.p1.move("U", "bf1");
    expect(game.locationOf("U")).toBe("bf1");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);

    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);

    await game.p2.passFocus();
    // MUST NOT: two passes ending a three-player showdown.
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P3);
    expect(game.actingSeat()).toBe(P3);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);

    await game.seat(P3).passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(focusOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.seat(P3).points()).toBe(0);
    expect(game.actingSeat()).toBe(P1);
  });
});

// ===========================================================================
// 12. Only the Focus holder may open a chain; passing Priority keeps Focus
// ===========================================================================

describe("12. Inside a showdown only the Focus holder may open a chain, and passing Priority does not surrender Focus (308.1.a, 313.1, 313.1.a, 313.3, 313.4, 343.1.a/.b, 347.1, 338.1.a.2, 358.4, 339.1)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .hand(P2, actionDraw(), "A")
      .hand(P2, draw(1), "p2plain")
      .hand(P2, VANILLA_UNIT, "p2unitcard")
      .hand(P1, reactionDraw(), "p1react")
      .hand(P3, reactionDraw(), "p3react")
      .hand(P3, actionDraw(), "p3action");
  }

  /** Showdown at bf1 with Focus rotated to P2. */
  async function focusOnP2(): Promise<Game> {
    const game = await board().build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(focusOf(game)).toBe(P2);
    return game;
  }

  test("the Focus holder is limited to [Action]/[Reaction]; the seats WITHOUT Focus may not even play a [Reaction]", async () => {
    const game = await focusOnP2();
    // Focus but wrong timing.
    expect(game.p2.can("cast", "p2plain")).toBe(false);
    expect((await game.p2.try((s) => s.do("playSpell", { cardId: "p2plain" }))).ok).toBe(false);
    expect(game.p2.can("play", "p2unitcard")).toBe(false);
    expect((await game.p2.try((s) => s.do("playUnit", { cardId: "p2unitcard", location: "base" }))).ok).toBe(false);
    // Right timing but no Focus (313.1 / 313.3 — Focus without Priority and Priority without Focus both fail).
    expect(game.p1.can("cast", "p1react")).toBe(false);
    expect((await game.p1.try((s) => s.do("playSpell", { cardId: "p1react" }))).ok).toBe(false);
    expect(game.seat(P3).can("cast", "p3react")).toBe(false);
    expect((await game.seat(P3).try((s) => s.do("playSpell", { cardId: "p3react" }))).ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(focusOf(game)).toBe(P2);
    expect(turnStateOf(game)).toBe("showdown-open");
  });

  test("P2's [Action] opens the chain; passing PRIORITY around does not move Focus and does not count toward the showdown tally", async () => {
    const game = await focusOnP2();
    await game.p2.cast("A");
    expect(chainIds(game)).toEqual(["A"]);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(priorityOf(game)).toBe(P2);
    expect(focusOf(game)).toBe(P2);
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P3);
    expect(focusOf(game)).toBe(P2); // 313.4 — passing Priority retains Focus
    // Closed state: even the Priority holder may add only a [Reaction].
    expect(game.seat(P3).can("cast", "p3action")).toBe(false);
    expect((await game.seat(P3).try((s) => s.do("playSpell", { cardId: "p3action" }))).ok).toBe(false);
    await game.seat(P3).passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(focusOf(game)).toBe(P2);
    await game.p1.passPriority();
    expect(game.zoneOf("A")).toBe("trash");
    // MUST NOT: those three priority passes ending the showdown.
    expect(showdownOf(game)).toBeDefined();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

// ===========================================================================
// 13. Focus passes from the FOCUS HOLDER when a played chain empties
// ===========================================================================

describe("13. When a chain opened in the showdown empties, Focus passes from the FOCUS HOLDER to the next in turn order, who also gains Priority (346, 347.1.a/.b, 340.2, 340.2.a, 335.1, 313.2, 313.3, 347.2.a)", () => {
  test("Focus P2 opens with [Action] A, P3 stacks [Reaction] R: both resolve, then Focus goes to P3 — not to the turn player, not staying on P2 — and the showdown tally restarts", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .hand(P2, actionDraw(), "A")
      .hand(P3, reactionDraw(), "R")
      .build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(focusOf(game)).toBe(P2);
    await game.p2.cast("A");
    await game.p2.passPriority();
    await game.seat(P3).cast("R");
    expect(chainIds(game)).toEqual(["A", "R"]);
    await allPass(game); // R resolves
    expect(game.zoneOf("R")).toBe("trash");
    expect(chainIds(game)).toEqual(["A"]);
    expect(focusOf(game)).toBe(P2);
    await allPass(game); // A resolves, chain empties
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    // Focus passes from the FOCUS HOLDER (P2) to the next in turn order.
    expect(focusOf(game)).toBe(P3);
    expect(game.actingSeat()).toBe(P3);
    expect(game.seat(P3).can("passFocus")).toBe(true);
    // The showdown tally is fresh: only the third pass ends it.
    await game.seat(P3).passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P1);
    await game.p1.passFocus();
    expect(showdownOf(game)).toBeDefined();
    expect(focusOf(game)).toBe(P2);
    await game.p2.passFocus();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("mirror variant: Focus P1 opens the chain and P2 plays the last item on it — Focus still moves from the FOCUS HOLDER (P1 → P2), not to whoever played last", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .hand(P1, actionDraw(), "A")
      .hand(P2, reactionDraw(), "R")
      .build();
    await game.p1.move("U", "bf1");
    expect(focusOf(game)).toBe(P1);
    await game.p1.cast("A");
    await game.p1.passPriority();
    await game.p2.cast("R");
    expect(chainIds(game)).toEqual(["A", "R"]);
    await allPass(game);
    await allPass(game);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
  });
});

// ===========================================================================
// 14. Focus passes exactly once per chain that empties
// ===========================================================================

describe("14. Focus passes exactly once per chain that empties — a trigger that keeps the chain alive must not cause a second pass (319.5, 320, 320.1, 321.1, 322, 334.2.a, 340.2, 340.2.a, 340.3, 346, 346.1)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .unit(P1, "base", deathDrawer(2, "Filler Death Drawer"), "D")
      .hand(P2, ACTION_KILL, "A");
  }

  /** Showdown at bf1, Focus on P2, P2's [Action] kill of D resolved and the Deathknell now pending. */
  async function toPendingTrigger(): Promise<Game> {
    const game = await board().build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(focusOf(game)).toBe(P2);
    await game.p2.cast("A", { targets: "D" });
    await allPass(game);
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    return game;
  }

  test("the trigger keeps the chain alive: it is the newest item, its controller holds Priority, and the showdown is still in progress", async () => {
    const game = await toPendingTrigger();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "D", controller: P1, triggered: true }),
    ]);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(showdownOf(game)).toBeDefined();
  });

  test("340.2 / 346 — Focus must NOT pass while a Pending Item keeps the chain non-empty; the engine passes Focus P2→P3 the instant the played item leaves the chain", async () => {
    // Expected: focusOf === P2 while D's Deathknell is still on the chain (Focus and Priority are
    // neither passed nor awarded while a cleanup runs; the chain never became empty).
    // Actual: the showdown's focusPlayer is already P3 at that instant.
    const game = await toPendingTrigger();
    expect(chainIds(game)).toEqual(["D"]);
    expect(focusOf(game)).toBe(P2);
  });

  test("after the trigger resolves the chain empties and Focus has passed exactly ONCE — P2 → P3, never P2 → P3 → P1", async () => {
    const game = await toPendingTrigger();
    const hand0 = handSizes(game);
    await allPass(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(hand0.p1 + 2);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(focusOf(game)).toBe(P3);
    expect(game.actingSeat()).toBe(P3);
    // MUST NOT: the showdown ending early.
    expect(showdownOf(game)).toBeDefined();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

// ===========================================================================
// 15. A resolution-time choice freezes all three seats
// ===========================================================================

describe("15. A resolution-time choice is a Limited Action that freezes all three seats, then LIFO resumes with a fresh round (312.1.b, 312.1.b.1, 333, 333.1, 334.2.a, 321, 355.5, 355.12, 410.2.a, 410.2.b, 340.4)", () => {
  function board() {
    return scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2 })
      .resources(P3, { energy: 2 })
      .runes(P1, "chaos", 1)
      .runes(P2, "mind", 1)
      .runes(P3, "calm", 1)
      .hand(P1, draw(1), "S1")
      .hand(P1, reactionDraw(), "p1react")
      .hand(P1, draw(2), "p1fodder")
      .unit(P1, "base", { might: 2, name: "Filler Runner" }, "p1unit")
      .hand(P2, reactionDraw(), "p2react")
      .unit(P2, "base", { might: 2, name: "Filler Walker" }, "p2unit")
      .hand(P3, REACTION_PILFER, "H")
      .hand(P3, reactionDraw(), "p3react")
      .unit(P3, "base", { might: 2, name: "Filler Rider" }, "p3unit");
  }

  test("while P3's pick is open no seat holds Priority, every discretionary move by all three is rejected, and only P3 may answer", async () => {
    const game = await board().build();
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).cast("H");
    // The Reaction names its player object as it is played (355.5).
    expect(game.decision()).toEqual(expect.objectContaining({ kind: "pick", seat: P3 }));
    await game.seat(P3).pick(P1);
    expect(chainIds(game)).toEqual(["S1", "H"]);
    await allPass(game);

    // H is resolving: P3 must choose a card from P1's revealed hand.
    expect(game.gameState.pendingChoice?.type).toBe("reveal-and-pick");
    expect(game.actingSeat()).toBe(P3);
    const d = game.decision();
    expect(d).toEqual(expect.objectContaining({ kind: "pick", seat: P3 }));
    expect(d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["p1fodder", "p1react"]);
    // No seat holds Priority during a resolution step.
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.seat(P3).legal()).toEqual([]);
    const hash = game.stateHash();
    for (const seat of [P1, P2, P3]) {
      const s = game.seat(seat);
      const react = seat === P1 ? "p1react" : seat === P2 ? "p2react" : "p3react";
      const unit = seat === P1 ? "p1unit" : seat === P2 ? "p2unit" : "p3unit";
      const rune = game.cardsAt("runePool", seat)[0] as string;
      expect((await s.try((x) => x.do("playSpell", { cardId: react }))).ok).toBe(false);
      expect((await s.try((x) => x.do("standardMove", { destination: "bf1", unitIds: [unit] }))).ok).toBe(false);
      expect((await s.try((x) => x.do("exhaustRune", { runeId: rune }))).ok).toBe(false);
      expect((await s.try((x) => x.do("passChainPriority", {}))).ok).toBe(false);
      expect((await s.try((x) => x.do("endTurn", {}))).ok).toBe(false);
    }
    expect(game.stateHash()).toBe(hash);
    // MUST NOT: another seat answering P3's choice.
    expect((await game.p1.try((s) => s.pick("p1fodder"))).ok).toBe(false);
    expect((await game.p1.try((s) => s.do("resolvePendingChoice", { pickedCardId: "p1fodder" }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("resolvePendingChoice", { pickedCardId: "p1fodder" }))).ok).toBe(false);
    expect(game.gameState.pendingChoice?.type).toBe("reveal-and-pick");
    expect(game.zoneOf("p1fodder")).toBe("hand");
  });

  test("P3 answers despite holding no Priority (a Limited Action is taken when instructed); afterwards S1 needs a FRESH three-pass round", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.seat(P3).cast("H");
    await game.seat(P3).pick(P1);
    await allPass(game);
    await game.seat(P3).pick("p1fodder");
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.zoneOf("p1fodder")).toBe("trash");
    expect(game.p1.trash()).toContain("p1fodder");
    expect(game.zoneOf("H")).toBe("trash");
    // MUST NOT: S1 resolving in the round that answered the choice.
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.zoneOf("S1")).toBe("chain");
    expect(game.p1.deck().length).toBe(deck0);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("S1")).toBe("chain");
    await game.seat(P3).passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.deck().length).toBe(deck0 - 1);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
  });
});

// ===========================================================================
// 16. Concession mid-chain in a 3-player game
// ===========================================================================

describe("16. Concession mid-chain: the conceder's items are countered and Priority / Focus re-establish without them (650, 651, 651.2, 651.3, 652.1, 652.3, 652.4, 652.5.a.1, 652.5.b.1, 652.5.b.2, 652.5.c.1, 652.5.c.2, 425.1.c)", () => {
  /** Chain [S1(P1), R2(P2), R3(P3)] with P3 and P1 already passed, so Priority sits on P2. */
  async function chainWithP2OnPriority(): Promise<Game> {
    const game = await scenario({ players: 3 })
      .unit(P1, "base", { might: 5, name: "Filler Wall" }, "w")
      .unit(P2, "base", { might: 5, name: "Filler P2 Wall" }, "w2")
      .hand(P1, bolt(1), "S1")
      .hand(P2, reactionBolt(2), "R2")
      .hand(P3, reactionBolt(4), "R3")
      .build();
    await game.p1.cast("S1", { targets: "w" });
    await game.p1.passPriority();
    await game.p2.cast("R2", { targets: "w" });
    await game.p2.passPriority();
    await game.seat(P3).cast("R3", { targets: "w" });
    expect(chainIds(game)).toEqual(["S1", "R2", "R3"]);
    await game.seat(P3).passPriority();
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    return game;
  }

  test("the game CONTINUES with two players left; P2's permanents are banished, its cards leave the game and its chain item is countered without effect or refund", async () => {
    const game = await chainWithP2OnPriority();
    await game.p2.concede();
    // 651.2 / 651.3 — two players remain, so no winner is declared.
    expect(game.gameState.status).toBe("playing");
    expect(game.winner()).toBeUndefined();
    expect(game.isOver()).toBe(false);
    // 652.1 / 652.3 — everything P2 owned or controlled has left the game.
    expect(game.zoneOf("w2")).toBe("gone");
    expect(game.zoneOf("R2")).not.toBe("hand");
    // 652.5.c.2 — the remaining players had both passed, so R3 (the newest item) resolved.
    expect(game.zoneOf("R3")).toBe("trash");
    expect(game.state("w").damage).toBe(4);
    // 652.4 / 425.1.c — R2 is countered: no damage from it, no refund to a removed player.
    expect(liveChainIds(game)).toEqual(["S1"]);
    expect(game.chain().find((i) => i.cardId === "R2")?.countered ?? true).toBe(true);
    expect(game.state("w").damage).not.toBe(6);
  });

  test("652.5.c.1 — Priority must move off the removed player; the engine leaves Priority (and the only decision) with the conceded seat, deadlocking P1 and P3", async () => {
    // Expected: after P2's removal Priority sits with a player still in the game (the controller of
    // the new newest item, P1) and P1 + P3 can complete a round to resolve S1.
    // Actual: interaction.chain.activePlayer stays "player-2"; P1 and P3 enumerate no pass at all.
    const game = await chainWithP2OnPriority();
    await game.p2.concede();
    expect(priorityOf(game)).not.toBe(P2);
    expect(game.actingSeat()).not.toBe(P2);
    expect(game.p1.can("passPriority") || game.seat(P3).can("passPriority")).toBe(true);
  });

  test("652.5.b.1 — a conceder holding Focus hands it to the NEXT player in order (P2 → P3); the engine hands it back to P1, who had already passed", async () => {
    // Expected: focusOf === P3 after P2 (the focus holder) is removed mid-showdown.
    // Actual: focus is re-seated on P1.
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .hand(P2, actionDraw(), "A")
      .build();
    await game.p1.move("U", "bf1");
    await game.p1.passFocus();
    expect(focusOf(game)).toBe(P2);
    await game.p2.concede();
    expect(game.gameState.status).toBe("playing");
    expect(focusOf(game)).toBe(P3);
  });
});
