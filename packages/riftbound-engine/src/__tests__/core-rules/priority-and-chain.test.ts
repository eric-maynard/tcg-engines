/**
 * Core rules: Priority & the Chain — CARD-INDEPENDENT.
 *
 * Rules covered (Riftbound Core Rules):
 *   144.1.a/b   Standard Move only in a Neutral Open State on your own turn
 *   305 / 316.9 a phase/turn cannot end while items are on the Chain
 *   309.1.a / 310.1.a  cards & abilities: by default only with Priority, own turn, Neutral Open
 *   312.1.b(.1) no Priority → no Discretionary Actions; Limited Actions (choices) regardless
 *   312.2.a-d   when a player receives Priority (Open / Focus / controller of next item / pass)
 *   316.5.b     Neutral Open: only the Turn Player may play spells or activate abilities
 *   328, 330, 331.1(.a/.b), 331.2  the Chain zone, one chain at a time, Closed vs Open
 *   333–335     Chain steps loop; 337.1.a finalizing does not pass Priority; 337.2 permanents
 *               and Add abilities resolve immediately; 337.4 controller of next item gains Priority
 *   338.1.a(.1/.2/.5/.7), 338.1.b.1  Execute: legally-timed (Reaction) plays or pass to next in Turn Order
 *   339.1 / 339.2  all-pass-in-sequence-with-nothing-added → Resolve, else keep passing
 *   340.1 / 340.2 / 340.4  newest item resolves; empty → Open; else controller of newest gains Priority
 *   351.1 / 354.1 / 359.2(.c/.d) / 359.3(.c/.d)  permanents leave the chain at once; spells wait
 *   355.17 / 354.3 / 321  resolution-time choices are made during resolution (Limited Actions)
 *   358.4 / 358.5  an illegal play is undone — nothing spent
 *   400.2 / 429.2(.a) / 429.3  Add (rune) abilities cannot be reacted to and resolve immediately
 *   410.1.a     Discretionary Actions need Priority
 *   425.1.a(.1) / 425.1.c  a countered card leaves the chain to trash, no refund
 *   806.1.b/.c.1, 813.1.c.1  [Action] = Open + Showdown; [Reaction] additionally Closed states
 *   142.4 / 159.2.b.3 / 323.5  lethal damage kills at cleanup; +might this turn changes lethality
 */

import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../harness";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions (no printed cards)
// ---------------------------------------------------------------------------

/** Plain (no timing keyword) 1-cost spell: "Draw 1." */
const DRAW1: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Filler Insight",
  rulesText: "Draw 1.",
  timing: "standard",
};

/** Plain 1-cost spell: "Draw 2." (distinguishable from DRAW1). */
const DRAW2: InlineCardDef = { ...DRAW1, abilities: [{ effect: { amount: 2, type: "draw" }, type: "spell" }], name: "Filler Deep Insight", rulesText: "Draw 2." };

/** [Action] 1-cost spell: "Draw 1." */
const ACTION_DRAW: InlineCardDef = { ...DRAW1, keywords: ["Action"], name: "Filler Quick Insight", rulesText: "[Action] Draw 1.", timing: "action" };

/** [Reaction] 1-cost spell: "Draw 1." */
const REACTION_DRAW: InlineCardDef = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  keywords: ["Reaction"],
  name: "Filler Snap Insight",
  rulesText: "[Reaction] Draw 1.",
  timing: "reaction",
};

/** Plain 1-cost spell: "Deal N to a unit." */
const bolt = (n: number): InlineCardDef => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: `Filler Bolt ${n}`,
  rulesText: `Deal ${n} to a unit.`,
  timing: "standard",
});

/** [Reaction] 1-cost spell: "Deal N to a unit." */
const reactionBolt = (n: number): InlineCardDef => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  keywords: ["Reaction"],
  name: `Filler Snap Bolt ${n}`,
  rulesText: `[Reaction] Deal ${n} to a unit.`,
  timing: "reaction",
});

/** [Reaction] 1-cost spell: "Give a unit +2 might this turn." */
const REACTION_BUFF: InlineCardDef = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  keywords: ["Reaction"],
  name: "Filler Brace",
  rulesText: "[Reaction] Give a unit +2 [M] this turn.",
  timing: "reaction",
};

/** [Reaction] 1-cost spell: "Counter a spell." */
const NULLIFY: InlineCardDef = {
  abilities: [{ effect: { type: "counter" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  keywords: ["Reaction"],
  name: "Filler Nullify",
  rulesText: "[Reaction] Counter a spell.",
  timing: "reaction",
};

/** Plain 1-cost spell: "Target opponent reveals their hand. Choose a card from it. They discard it." */
const PILFER: InlineCardDef = {
  abilities: [{ effect: { onPicked: "discard", target: { type: "player", which: "opponent" }, type: "reveal-hand" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Filler Pilfer",
  rulesText: "Your opponent reveals their hand. Choose a card from it. They discard that card.",
  timing: "standard",
};

/** [Reaction] version of PILFER (so it can be stacked on a chain by the non-turn player). */
const REACTION_PILFER: InlineCardDef = {
  ...PILFER,
  abilities: [{ effect: { onPicked: "discard", target: { type: "player", which: "opponent" }, type: "reveal-hand" }, timing: "reaction", type: "spell" }],
  keywords: ["Reaction"],
  name: "Filler Snap Pilfer",
  rulesText: "[Reaction] Your opponent reveals their hand. Choose a card from it. They discard that card.",
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

/** Vanilla hand unit / gear. */
const VANILLA_UNIT: InlineCardDef = { cardType: "unit", domain: "fury", energyCost: 2, might: 3, name: "Filler Bruiser" };
const VANILLA_GEAR: InlineCardDef = { abilities: [], cardType: "gear", domain: "fury", energyCost: 1, name: "Filler Trinket" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TurnState = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

function turnState(game: Game): TurnState {
  const inter = game.gameState.interaction;
  const hasChain = inter?.chain?.active === true && (inter.chain.items?.length ?? 0) > 0;
  const stack = inter?.showdownStack ?? [];
  const hasShowdown = stack.length > 0 && stack[stack.length - 1]?.active === true;
  if (hasShowdown) {
    return hasChain ? "showdown-closed" : "showdown-open";
  }
  return hasChain ? "neutral-closed" : "neutral-open";
}

function chainIds(game: Game): string[] {
  return game.chain().map((i) => i.cardId);
}

/** Who holds chain Priority per the engine (undefined when no chain). */
function priorityHolder(game: Game): string | undefined {
  const chain = game.gameState.interaction?.chain;
  return chain?.active ? chain.activePlayer : undefined;
}

function snapshotResources(game: Game) {
  return { p1: game.p1.resources(), p2: game.p2.resources() };
}

/**
 * Harness invariant violations minus `singleDecisionCursor` — that one trips on the known
 * "any player may play a Reaction during a Closed state regardless of who holds Priority" engine
 * bug, which has its own dedicated `test.failing` below.
 */
function rulesViolations(game: Game) {
  return game.violations().filter((v) => v.invariant !== "singleDecisionCursor");
}

// ---------------------------------------------------------------------------
// 1. Neutral Open: only the turn player has priority
// ---------------------------------------------------------------------------

describe("Neutral Open state: only the Turn Player has Priority (310.1.a, 312.2.a, 316.5.b, 410.1.a)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: null })
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 5 })
      .hand(P1, DRAW1, "p1plain")
      .hand(P2, DRAW1, "p2plain")
      .hand(P2, REACTION_DRAW, "p2react")
      .unit(P2, "base", { might: 2, name: "Filler Scout" }, "p2unit")
      .legend(P1, LEGEND_PLAIN, "p1legend")
      .legend(P2, LEGEND_PLAIN, "p2legend");
  }

  test("setup is Neutral Open with P1 acting; P2 has no action menu at all", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(turnState(game)).toBe("neutral-open");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.isActing()).toBe(false);
    // P2's whole legal menu (concede aside) is empty in a Neutral Open state on P1's turn.
    expect(game.p2.legal().filter((o) => o.verb !== "concede")).toEqual([]);
  });

  test("P2 cannot play a plain spell on P1's turn (316.5.b) — rejected, nothing spent, no chain", async () => {
    const game = await board().build();
    const before = snapshotResources(game);
    const hash = game.stateHash();
    const r = await game.p2.try((s) => s.cast("p2plain"));
    expect(r.ok).toBe(false);
    const raw = await game.p2.try((s) => s.do("playSpell", { cardId: "p2plain" }));
    expect(raw.ok).toBe(false);
    expect(game.zoneOf("p2plain")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(snapshotResources(game)).toEqual(before);
    expect(game.stateHash()).toBe(hash);
    expect(game.actingSeat()).toBe(P1);
  });

  test("P2 cannot play a [Reaction] spell in Neutral Open on P1's turn — Reaction adds Closed/Showdown permission only (813.1.c.1)", async () => {
    const game = await board().build();
    const hash = game.stateHash();
    expect(game.p2.can("cast", "p2react")).toBe(false);
    const r = await game.p2.try((s) => s.do("playSpell", { cardId: "p2react" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("p2react")).toBe("hand");
    expect(turnState(game)).toBe("neutral-open");
    expect(game.stateHash()).toBe(hash);
  });

  test("P2 cannot activate a legend ability, Standard Move, or end the turn on P1's turn (316.5.b, 144.1.a)", async () => {
    const game = await board().build();
    const hash = game.stateHash();
    expect(game.p2.can("activate", "p2legend")).toBe(false);
    expect((await game.p2.try((s) => s.do("activateAbility", { abilityIndex: 0, cardId: "p2legend" }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.move("p2unit", "bf1"))).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["p2unit"] }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.endTurn())).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("endTurn", {}))).ok).toBe(false);
    expect(game.locationOf("p2unit")).toBe("base");
    expect(game.state("p2unit").isReady).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.stateHash()).toBe(hash);
  });

  test("the Turn Player CAN play the same plain spell and activate the same legend ability (positive control)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "p1legend")).toBe(true);
    expect(game.p1.can("cast", "p1plain")).toBe(true);
    await game.p1.cast("p1plain");
    expect(chainIds(game)).toEqual(["p1plain"]);
    expect(game.p1.energy()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Playing a spell creates the chain; controller gets priority first
// ---------------------------------------------------------------------------

describe("Playing a spell creates a Chain, closes the state, and its CONTROLLER receives Priority first (328, 330, 331.1, 337.4, 338.1.a.5)", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .hand(P1, DRAW1, "s1")
      .hand(P1, REACTION_DRAW, "p1react")
      .hand(P2, REACTION_DRAW, "p2react");
  }

  test("after P1 plays S1: exactly one finalized chain item, cost paid, effect NOT executed, state Closed, priority with P1 (not P2)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("s1");
    // 328/330: one chain with one item, controller P1, a spell, not countered.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "s1", controller: P1, countered: false, triggered: false, type: "spell" }),
    ]);
    expect(game.zoneOf("s1")).toBe("chain");
    // 331.1: Closed.
    expect(turnState(game)).toBe("neutral-closed");
    // 354.1 / 359.3: cost paid, effect pending (no draw yet).
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand().length).toBe(handBefore - 1);
    expect(game.p1.deck().length).toBe(deckBefore);
    // 337.4 / 312.2.c: the controller of the newest item holds Priority first.
    expect(priorityHolder(game)).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.isActing()).toBe(false);
    // MUST NOT: P2 passing "priority" it does not hold.
    expect(game.p2.can("passPriority")).toBe(false);
    expect((await game.p2.try((s) => s.do("passChainPriority", {}))).ok).toBe(false);
    expect(chainIds(game)).toEqual(["s1"]);
  });

  test("312 / 312.2.c-d / 337.4 / 338.1 — engine lets the NON-priority player play a Reaction while the item's controller still holds Priority", async () => {
    // Expected: right after P1 finalizes S1, P1 (controller) alone has Priority; P2 may act only
    // once P1 passes (312.2.d, 338.1.b.1). Actual: playSpell's Closed-state gate checks timing only,
    // so P2's Reaction is enumerated AND executes (chain becomes [s1, p2react], priority jumps to P2).
    const game = await board().build();
    await game.p1.cast("s1");
    expect(priorityHolder(game)).toBe(P1);
    expect(game.p2.can("cast", "p2react")).toBe(false);
    const r = await game.p2.try((s) => s.do("playSpell", { cardId: "p2react" }));
    expect(r.ok).toBe(false);
    expect(chainIds(game)).toEqual(["s1"]);
    expect(priorityHolder(game)).toBe(P1);
  });

  test("while holding that first Priority, P1 may add a legally-timed item (Reaction) — same chain, not a second one (330.1/330.2, 338.1.a.5)", async () => {
    const game = await board().build();
    await game.p1.cast("s1");
    expect(game.p1.can("cast", "p1react")).toBe(true);
    expect(game.p1.can("passPriority")).toBe(true);
    await game.p1.cast("p1react");
    expect(chainIds(game)).toEqual(["s1", "p1react"]);
    expect(turnState(game)).toBe("neutral-closed");
    expect(priorityHolder(game)).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 3. Pass → next in turn order → all-pass resolves
// ---------------------------------------------------------------------------

describe("Passing Priority and all-pass resolution (338.1.b.1, 339, 340.1, 340.2, 359.3.d)", () => {
  function board() {
    return scenario().resources(P1, { energy: 2 }).resources(P2, { energy: 2 }).hand(P1, DRAW1, "s1").hand(P2, REACTION_DRAW, "p2react");
  }

  test("P1 passes → P2 holds Priority; S1 still unresolved; state still Closed", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("s1");
    await game.p1.passPriority();
    expect(priorityHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(chainIds(game)).toEqual(["s1"]);
    expect(turnState(game)).toBe("neutral-closed");
    // MUST NOT: S1 resolving after only P1's pass.
    expect(game.zoneOf("s1")).toBe("chain");
    expect(game.p1.hand().length).toBe(p1Hand - 1);
    // P2 now has a real decision: pass or react.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P2);
    expect(d && d.kind === "action" ? d.context : undefined).toBe("chain");
    expect(game.p2.can("passPriority")).toBe(true);
    expect(game.p2.can("cast", "p2react")).toBe(true);
  });

  test("P2 also passes → S1 resolves exactly once, goes to trash, chain empty, Neutral Open, P1 acts", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p1Deck = game.p1.deck().length;
    await game.p1.cast("s1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.p1.trash()).toContain("s1");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain ?? null).toBeNull();
    expect(turnState(game)).toBe("neutral-open");
    // Draw 1 executed exactly once.
    expect(game.p1.hand().length).toBe(p1Hand - 1 + 1);
    expect(game.p1.deck().length).toBe(p1Deck - 1);
    // 340.2 + 312.2.a: Open state in P1's Main Phase → P1 has priority; P2 does not.
    expect(game.actingSeat()).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p2.isActing()).toBe(false);
    expect(game.p2.can("cast", "p2react")).toBe(false);
    expect(rulesViolations(game)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Closed state: Reaction legal; Action / plain / units / moves illegal
// ---------------------------------------------------------------------------

describe("Closed state timing: only Reaction-timed plays are legal (331.1.a/b, 338.1.a.1/.2, 806.1.b, 813.1.c.1, 358.5)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: null })
      .resources(P1, { energy: 6 })
      .resources(P2, { energy: 6 })
      .hand(P1, DRAW1, "s1")
      .hand(P1, ACTION_DRAW, "p1A")
      .hand(P1, DRAW2, "p1N")
      .hand(P1, REACTION_DRAW, "p1R")
      .unit(P1, "base", { might: 2, name: "Filler Runner" }, "p1unit")
      .hand(P2, ACTION_DRAW, "A")
      .hand(P2, REACTION_DRAW, "R")
      .hand(P2, DRAW2, "N")
      .hand(P2, VANILLA_UNIT, "U")
      .unit(P2, "base", { might: 2, name: "Filler Walker" }, "p2unit");
  }

  async function toP2Priority() {
    const game = await board().build();
    await game.p1.cast("s1");
    await game.p1.passPriority();
    expect(priorityHolder(game)).toBe(P2);
    expect(turnState(game)).toBe("neutral-closed");
    return game;
  }

  test("P2 with Priority in Neutral Closed: plain spell N rejected, [Action] A rejected, unit U rejected, Standard Move rejected — chain and resources untouched", async () => {
    const game = await toP2Priority();
    const before = snapshotResources(game);
    for (const id of ["N", "A"]) {
      expect(game.p2.can("cast", id)).toBe(false);
      expect((await game.p2.try((s) => s.do("playSpell", { cardId: id }))).ok).toBe(false);
      expect(game.zoneOf(id)).toBe("hand");
      expect(chainIds(game)).toEqual(["s1"]);
    }
    expect(game.p2.can("play", "U")).toBe(false);
    expect((await game.p2.try((s) => s.do("playUnit", { cardId: "U", location: "base" }))).ok).toBe(false);
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.p2.can("move")).toBe(false);
    expect((await game.p2.try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["p2unit"] }))).ok).toBe(false);
    expect(game.locationOf("p2unit")).toBe("base");
    expect(game.state("p2unit").isReady).toBe(true);
    expect(chainIds(game)).toEqual(["s1"]);
    expect(snapshotResources(game)).toEqual(before);
    expect(priorityHolder(game)).toBe(P2);
  });

  test("P2 with Priority in Neutral Closed: [Reaction] R accepted → chain [S1, R], R newest, still Closed, Priority to P2 (controller of R)", async () => {
    const game = await toP2Priority();
    expect(game.p2.can("cast", "R")).toBe(true);
    await game.p2.cast("R");
    expect(chainIds(game)).toEqual(["s1", "R"]);
    expect(game.chain()[1]).toEqual(expect.objectContaining({ cardId: "R", controller: P2 }));
    expect(turnState(game)).toBe("neutral-closed");
    expect(game.p2.energy()).toBe(5);
    expect(priorityHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
  });

  test("the Turn Player is equally bound: with Priority back on its own chain, P1 cannot add [Action] or plain spells or move, but CAN add a Reaction", async () => {
    const game = await toP2Priority();
    await game.p2.passPriority(); // both passed → S1 resolves; rebuild the situation on a fresh chain instead:
    expect(turnState(game)).toBe("neutral-open");
    // Fresh chain: P1 plays N (plain, legal in Open), holds first Priority in Closed.
    await game.p1.cast("p1N");
    expect(priorityHolder(game)).toBe(P1);
    expect(turnState(game)).toBe("neutral-closed");
    const before = snapshotResources(game);
    expect(game.p1.can("cast", "p1A")).toBe(false);
    expect((await game.p1.try((s) => s.do("playSpell", { cardId: "p1A" }))).ok).toBe(false);
    expect(game.p1.can("move")).toBe(false);
    expect((await game.p1.try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["p1unit"] }))).ok).toBe(false);
    expect(chainIds(game)).toEqual(["p1N"]);
    expect(snapshotResources(game)).toEqual(before);
    expect(game.p1.can("cast", "p1R")).toBe(true);
    await game.p1.cast("p1R");
    expect(chainIds(game)).toEqual(["p1N", "p1R"]);
    expect(priorityHolder(game)).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 5. LIFO order matters: a buff Reaction saves the unit
// ---------------------------------------------------------------------------

describe("LIFO resolution is load-bearing: a +might Reaction resolves before the damage spell under it (339.1, 340.1, 340.4, 142.4)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2 })
      .unit(P2, "bf1", { might: 2, name: "Filler Target" }, "X")
      .hand(P1, bolt(2), "D")
      .hand(P2, REACTION_BUFF, "B");
  }

  test("chain [D, B]: after all pass B resolves FIRST (X might 4), D stays; a fresh all-pass round then resolves D: 2 damage on might 4 is not lethal", async () => {
    const game = await board().build();
    await game.p1.cast("D", { targets: "X" });
    expect(chainIds(game)).toEqual(["D"]);
    await game.p1.passPriority();
    await game.p2.cast("B", { targets: "X" });
    expect(chainIds(game)).toEqual(["D", "B"]);
    expect(priorityHolder(game)).toBe(P2); // controller of B
    await game.p2.passPriority();
    expect(chainIds(game)).toEqual(["D", "B"]); // one pass is not all-pass
    await game.p1.passPriority();
    // B (newest) resolved; D did NOT.
    expect(game.zoneOf("B")).toBe("trash");
    expect(chainIds(game)).toEqual(["D"]);
    expect(game.state("X").might).toBe(4);
    expect(game.state("X").damage).toBe(0);
    // 340.4: controller of newest remaining item (D → P1) gains Priority; both must pass again.
    expect(priorityHolder(game)).toBe(P1);
    await game.p1.passPriority();
    expect(chainIds(game)).toEqual(["D"]);
    expect(game.state("X").damage).toBe(0);
    await game.p2.passPriority();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    // X survived with 2 damage on 4 might.
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(2);
    expect(game.state("X").might).toBe(4);
    expect(game.p2.trash()).not.toContain("X");
  });

  test("control branch: without the Reaction, D's 2 damage on might-2 X is lethal and cleanup kills X", async () => {
    const game = await board().build();
    await game.p1.cast("D", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("printed cross-check: Void Seeker (ogn-024-298, deal 4) under Discipline (ogn-058-298, [Reaction] +2 might) — Discipline resolves first and the might-3 unit survives with 4 damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P2, "bf1", { might: 3, name: "Filler Target" }, "X")
      .hand(P1, "ogn-024-298", "seeker")
      .hand(P2, "ogn-058-298", "discipline")
      .build();
    await game.p1.cast("seeker", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.cast("discipline", { targets: "X" });
    expect(chainIds(game)).toEqual(["seeker", "discipline"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(chainIds(game)).toEqual(["seeker"]);
    expect(game.state("X").might).toBe(5);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6. After the top resolves, priority → controller of the new top
// ---------------------------------------------------------------------------

describe("After an item resolves, Priority goes to the CONTROLLER of the newest remaining item (340.4, 312.2.c) — one item per all-pass round (340.1)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 4 })
      // Distinguishable effects: each Reaction bolt hits a different sturdy filler unit for a different amount.
      .unit(P2, "base", { might: 9, name: "Filler Wall A" }, "wa")
      .unit(P2, "base", { might: 9, name: "Filler Wall B" }, "wb")
      .unit(P1, "base", { might: 9, name: "Filler Wall C" }, "wc")
      .hand(P1, DRAW1, "S1")
      .hand(P2, reactionBolt(1), "R2") // → wc (P1's wall) for 1
      .hand(P1, reactionBolt(2), "R3") // → wa for 2
      .hand(P2, reactionBolt(3), "R4"); // → wb for 3
  }

  test("chain [S1,R2,R3] → R3 resolves → priority P2 (controller of R2), P2 adds R4 → R4 → priority P2 → R2 → priority P1 → S1; order exactly R3, R4, R2, S1", async () => {
    const game = await board().build();
    const p1Hand0 = game.p1.hand().length;
    const order: string[] = [];
    const track = () => {
      for (const id of ["S1", "R2", "R3", "R4"]) {
        if (game.zoneOf(id) === "trash" && !order.includes(id)) {
          order.push(id);
        }
      }
    };

    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.cast("R2", { targets: "wc" });
    expect(priorityHolder(game)).toBe(P2);
    await game.p2.passPriority();
    await game.p1.cast("R3", { targets: "wa" });
    expect(chainIds(game)).toEqual(["S1", "R2", "R3"]);
    expect(priorityHolder(game)).toBe(P1);
    await game.p1.passPriority();
    track();
    expect(order).toEqual([]);
    await game.p2.passPriority();
    track();
    // R3 resolved alone.
    expect(order).toEqual(["R3"]);
    expect(game.state("wa").damage).toBe(2);
    expect(game.state("wc").damage).toBe(0);
    expect(chainIds(game)).toEqual(["S1", "R2"]);
    // Priority → controller of R2 = P2 (NOT the turn player P1).
    expect(priorityHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    // P2 may add another Reaction here.
    expect(game.p2.can("cast", "R4")).toBe(true);
    await game.p2.cast("R4", { targets: "wb" });
    expect(chainIds(game)).toEqual(["S1", "R2", "R4"]);
    expect(priorityHolder(game)).toBe(P2);
    await game.p2.passPriority();
    track();
    expect(order).toEqual(["R3"]);
    await game.p1.passPriority();
    track();
    expect(order).toEqual(["R3", "R4"]);
    expect(game.state("wb").damage).toBe(3);
    expect(game.state("wc").damage).toBe(0);
    expect(chainIds(game)).toEqual(["S1", "R2"]);
    expect(priorityHolder(game)).toBe(P2); // controller of R2 again
    await game.p2.passPriority();
    track();
    expect(order).toEqual(["R3", "R4"]);
    await game.p1.passPriority();
    track();
    expect(order).toEqual(["R3", "R4", "R2"]);
    expect(game.state("wc").damage).toBe(1);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(priorityHolder(game)).toBe(P1); // controller of S1
    expect(game.p1.hand().length).toBe(p1Hand0 - 2); // S1 not yet resolved (S1 and R3 left hand)
    await game.p1.passPriority();
    track();
    expect(order).toEqual(["R3", "R4", "R2"]);
    await game.p2.passPriority();
    track();
    expect(order).toEqual(["R3", "R4", "R2", "S1"]);
    expect(game.p1.hand().length).toBe(p1Hand0 - 2 + 1);
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(rulesViolations(game)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Adding an item resets the pass sequence
// ---------------------------------------------------------------------------

describe("Adding an item resets the pass sequence (339.1 'in sequence without adding', 339.2, 338.1.a.7)", () => {
  test("P1 passes, P2 reacts instead of passing, P2 passes → NOTHING resolves; only after P1 passes too does R resolve; then S1 needs its own round", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2 })
      .hand(P1, DRAW1, "S1")
      .hand(P2, REACTION_DRAW, "R")
      .build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.cast("S1");
    await game.p1.passPriority(); // stale once R is added
    await game.p2.cast("R");
    expect(chainIds(game)).toEqual(["S1", "R"]);
    expect(priorityHolder(game)).toBe(P2);
    expect(game.gameState.interaction?.chain?.passedPlayers ?? []).toEqual([]);
    await game.p2.passPriority();
    // MUST NOT resolve: P1 has not passed since R was added.
    expect(chainIds(game)).toEqual(["S1", "R"]);
    expect(game.zoneOf("R")).toBe("chain");
    expect(game.p2.hand().length).toBe(p2Hand0 - 1);
    expect(priorityHolder(game)).toBe(P1);
    await game.p1.passPriority();
    expect(game.zoneOf("R")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2Hand0 - 1 + 1);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(priorityHolder(game)).toBe(P1); // controller of S1
    await game.p1.passPriority();
    expect(chainIds(game)).toEqual(["S1"]);
    await game.p2.passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(turnState(game)).toBe("neutral-open");
  });
});

// ---------------------------------------------------------------------------
// 8. Permanents resolve immediately — no response window
// ---------------------------------------------------------------------------

describe("Permanents (unit / gear) resolve immediately after finalizing — no Priority window (337.2, 351.1, 359.2, 340.2)", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2 })
      .hand(P1, VANILLA_UNIT, "U")
      .hand(P1, VANILLA_GEAR, "G")
      .hand(P2, REACTION_DRAW, "p2react");
  }

  test("vanilla unit: on the board in base, exhausted (359.2.c), chain empty, Neutral Open, P1 still acting, P2 never got Priority", async () => {
    const game = await board().build();
    await game.p1.play("U");
    expect(game.zoneOf("U")).toBe("base");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toEqual(expect.objectContaining({ context: "main", kind: "action", seat: P1 }));
    // MUST NOT: P2 receiving a window off a vanilla permanent.
    expect(game.p2.isActing()).toBe(false);
    expect(game.p2.can("cast", "p2react")).toBe(false);
    expect((await game.p2.try((s) => s.do("playSpell", { cardId: "p2react" }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.passPriority())).ok).toBe(false);
  });

  test("vanilla gear: enters base READY (359.2.d), no chain, Neutral Open, P2 no window", async () => {
    const game = await board().build();
    await game.p1.play("G");
    expect(game.zoneOf("G")).toBe("base");
    expect(game.state("G").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "p2react")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Cannot end turn / standard move while a chain exists
// ---------------------------------------------------------------------------

describe("While a chain exists the turn cannot end and Standard Moves are barred (305, 316.9, 144.1.b, 309.1.a)", () => {
  test("Closed: endTurn, standardMove and a second plain spell all rejected; after S1 resolves the same moves are accepted", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 }) // own battlefield: moving there opens no showdown
      .resources(P1, { energy: 4 })
      .hand(P1, DRAW1, "S1")
      .hand(P1, DRAW2, "S2")
      .unit(P1, "base", { might: 2, name: "Filler Runner" }, "runner")
      .build();
    await game.p1.cast("S1");
    expect(turnState(game)).toBe("neutral-closed");
    expect(priorityHolder(game)).toBe(P1);
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.endTurnKey : "x").toBeUndefined();
    expect((await game.p1.try((s) => s.endTurn())).ok).toBe(false);
    expect((await game.p1.try((s) => s.do("endTurn", {}))).ok).toBe(false);
    expect(game.p1.can("move")).toBe(false);
    expect((await game.p1.try((s) => s.do("standardMove", { destination: "bf1", unitIds: ["runner"] }))).ok).toBe(false);
    expect(game.p1.can("cast", "S2")).toBe(false);
    expect((await game.p1.try((s) => s.do("playSpell", { cardId: "S2" }))).ok).toBe(false);
    // Unchanged.
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(3);
    // Resolve S1.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(turnState(game)).toBe("neutral-open");
    expect(game.p1.can("cast", "S2")).toBe(true);
    expect(game.p1.can("move")).toBe(true);
    expect(game.p1.can("endTurn")).toBe(true);
    const dOpen = game.decision();
    expect(dOpen && dOpen.kind === "action" ? dOpen.endTurnKey : undefined).toBeDefined();
    await game.p1.move("runner", "bf1");
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").isExhausted).toBe(true);
  });

  test("Open (no chain ever created this turn): endTurn is accepted and the turn passes to P2", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, DRAW1, "S1").build();
    await game.p1.cast("S1");
    expect((await game.p1.try((s) => s.do("endTurn", {}))).ok).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// 10. Rune Add abilities never open a priority window
// ---------------------------------------------------------------------------

describe("Rune [Add] abilities finalize and resolve immediately — no chain item, no Priority to the opponent (429.2, 429.2.a, 400.2, 337.2)", () => {
  function board() {
    return scenario().runes(P1, "mind", 2).resources(P2, { energy: 2 }).hand(P1, DRAW1, "S1").hand(P2, REACTION_DRAW, "p2react");
  }

  test("Neutral Open: exhausting a rune adds 1 energy at once; no chain; still Open; P2 gets no window", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "p2react")).toBe(false);
    expect((await game.p2.try((s) => s.do("playSpell", { cardId: "p2react" }))).ok).toBe(false);
  });

  test("Closed, P1 holding Priority: exhausting the second rune adds energy immediately; chain stays exactly [S1]; Priority stays P1; P1 pass + P2 pass resolves S1", async () => {
    const game = await board().build();
    await game.p1.tapRune();
    await game.p1.cast("S1");
    expect(game.p1.energy()).toBe(0);
    expect(chainIds(game)).toEqual(["S1"]);
    expect(priorityHolder(game)).toBe(P1);
    expect(game.p1.can("tapRune")).toBe(true);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(chainIds(game)).toEqual(["S1"]); // no Add item stacked on top
    expect(priorityHolder(game)).toBe(P1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    await game.p1.passPriority();
    expect(priorityHolder(game)).toBe(P2);
    await game.p2.passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(turnState(game)).toBe("neutral-open");
  });
});

// ---------------------------------------------------------------------------
// 11. Countered item leaves chain; priority to controller of new top
// ---------------------------------------------------------------------------

describe("Counter: the countered spell leaves the chain to trash without effect or refund; then Priority to the new top's controller (425.1.a, 425.1.a.1, 425.1.c, 340.2, 340.4)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 2 })
      .unit(P2, "bf1", { might: 3, name: "Filler Guard" }, "X")
      .hand(P1, bolt(3), "S1")
      .hand(P1, DRAW1, "S0")
      .hand(P2, NULLIFY, "C");
  }

  test("chain [S1, C] → C resolves: S1 countered → P1 trash, no damage, no refund; chain empty → Neutral Open with P1 acting", async () => {
    const game = await board().build();
    await game.p1.cast("S1", { targets: "X" });
    expect(game.p1.energy()).toBe(2);
    await game.p1.passPriority();
    await game.p2.cast("C", { targets: "S1" });
    expect(chainIds(game)).toEqual(["S1", "C"]);
    expect(priorityHolder(game)).toBe(P2);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("C")).toBe("trash");
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.trash()).toContain("S1");
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    // MUST NOT: damage or refund.
    expect(game.state("X").damage).toBe(0);
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(1);
  });

  test("variant chain [S0, S1, C]: after C counters S1, newest remaining is S0 → Priority to P1 (its controller); S0 resolves only after a fresh all-pass round", async () => {
    const game = await board().hand(P1, { ...bolt(3), keywords: ["Reaction"], name: "Filler Snap Bolt 3", timing: "reaction", abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }] }, "S1r").build();
    const p1Hand0 = game.p1.hand().length;
    await game.p1.cast("S0"); // plain draw 1 — bottom of chain
    await game.p1.cast("S1r", { targets: "X" }); // P1 still held priority: add a Reaction bolt
    expect(chainIds(game)).toEqual(["S0", "S1r"]);
    await game.p1.passPriority();
    await game.p2.cast("C", { targets: "S1r" });
    expect(chainIds(game)).toEqual(["S0", "S1r", "C"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // C resolved, S1r countered & cleared; S0 remains and did NOT resolve in the same step.
    expect(game.zoneOf("C")).toBe("trash");
    expect(game.zoneOf("S1r")).toBe("trash");
    expect(chainIds(game)).toEqual(["S0"]);
    expect(game.state("X").damage).toBe(0);
    expect(game.p1.hand().length).toBe(p1Hand0 - 2); // no draw yet
    expect(priorityHolder(game)).toBe(P1);
    expect(turnState(game)).toBe("neutral-closed");
    await game.p1.passPriority();
    expect(chainIds(game)).toEqual(["S0"]);
    await game.p2.passPriority();
    expect(game.zoneOf("S0")).toBe("trash");
    expect(game.p1.hand().length).toBe(p1Hand0 - 2 + 1);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.state("X").damage).toBe(0);
  });

  test("printed cross-check: Defy (ogn-045-298, [Reaction] counter a spell costing ≤4 and ≤1 power) counters an inline 1-cost bolt the same way", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P2, "bf1", { might: 3, name: "Filler Guard" }, "X")
      .hand(P1, bolt(3), "S1")
      .hand(P2, "ogn-045-298", "defy")
      .build();
    await game.p1.cast("S1", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.cast("defy"); // Defy binds its (only legal) spell target itself
    expect(chainIds(game)).toEqual(["S1", "defy"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("X").damage).toBe(0);
    expect(game.p1.energy()).toBe(1); // no refund
  });
});

// ---------------------------------------------------------------------------
// 12. pendingChoice blocks every other move for both players
// ---------------------------------------------------------------------------

describe("A resolution-time choice (pendingChoice) is a Limited Action that blocks every Discretionary Action for BOTH players (312.1.b, 312.1.b.1, 355.17, 354.3, 321, 334)", () => {
  function board() {
    return scenario()
      .battlefield("bf1", { controller: null })
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 4 })
      .runes(P1, "chaos", 1)
      .runes(P2, "mind", 1)
      .hand(P1, PILFER, "H")
      .hand(P1, REACTION_DRAW, "p1react")
      .unit(P1, "base", { might: 2, name: "Filler Runner" }, "p1unit")
      .legend(P1, LEGEND_PLAIN, "p1legend")
      .hand(P2, REACTION_DRAW, "victim")
      .hand(P2, DRAW2, "keep")
      .unit(P2, "base", { might: 2, name: "Filler Walker" }, "p2unit")
      .legend(P2, LEGEND_PLAIN, "p2legend");
  }

  test("H resolves → pendingChoice for P1; while open every other move by either seat is rejected; only P1 may resolve it; afterwards normal play resumes", async () => {
    const game = await board().build();
    await game.p1.cast("H");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Reveal-and-pick outstanding for P1.
    const pc = game.gameState.pendingChoice;
    expect(pc?.type).toBe("reveal-and-pick");
    expect(game.actingSeat()).toBe(P1);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P1);
    expect(d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["keep", "victim"]);
    // No priority exists during a resolution step.
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.decision()).toBeNull();
    const hash = game.stateHash();
    // Every discretionary move, both seats → rejected.
    for (const seat of [game.p1, game.p2]) {
      const react = seat === game.p1 ? "p1react" : "victim";
      const legend = seat === game.p1 ? "p1legend" : "p2legend";
      const unit = seat === game.p1 ? "p1unit" : "p2unit";
      expect((await seat.try((s) => s.do("playSpell", { cardId: react }))).ok).toBe(false);
      expect((await seat.try((s) => s.do("activateAbility", { abilityIndex: 0, cardId: legend }))).ok).toBe(false);
      const rune = game.cardsAt("runePool", seat.seat)[0] as string;
      expect((await seat.try((s) => s.do("exhaustRune", { runeId: rune }))).ok).toBe(false);
      expect((await seat.try((s) => s.do("standardMove", { destination: "bf1", unitIds: [unit] }))).ok).toBe(false);
      expect((await seat.try((s) => s.do("passChainPriority", {}))).ok).toBe(false);
      expect((await seat.try((s) => s.do("endTurn", {}))).ok).toBe(false);
    }
    expect(game.stateHash()).toBe(hash);
    // P2 cannot answer P1's choice.
    expect((await game.p2.try((s) => s.pick("victim"))).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("resolvePendingChoice", { pickedCardId: "victim" }))).ok).toBe(false);
    expect(game.gameState.pendingChoice?.type).toBe("reveal-and-pick");
    expect(game.zoneOf("victim")).toBe("hand");
    // P1 resolves.
    await game.p1.pick("victim");
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.trash()).toContain("victim");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("tapRune")).toBe(true);
    expect(game.p1.can("move")).toBe(true);
    expect(game.p1.can("activate", "p1legend")).toBe(true);
    expect(game.p1.can("endTurn")).toBe(true);
    expect(rulesViolations(game)).toEqual([]);
  });

  test("printed cross-check: Sabotage (ogn-156-298 — opponent reveals hand, choose a non-unit, recycle it) parks the same P1-only pendingChoice and gates P2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .resources(P2, { energy: 2 })
      .hand(P1, "ogn-156-298", "sabotage")
      .hand(P2, REACTION_DRAW, "victim")
      .hand(P2, VANILLA_UNIT, "unitcard")
      .build();
    await game.p1.cast("sabotage");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.pendingChoice?.type).toBe("reveal-and-pick");
    expect(game.actingSeat()).toBe(P1);
    const d = game.decision();
    expect(d).toEqual(expect.objectContaining({ kind: "pick", seat: P1 }));
    // Only the non-unit card is a legal pick.
    expect(d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["victim"]);
    expect((await game.p2.try((s) => s.do("playSpell", { cardId: "victim" }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("resolvePendingChoice", { pickedCardId: "victim" }))).ok).toBe(false);
    await game.p1.pick("victim");
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.zoneOf("victim")).toBe("mainDeck"); // recycled
    expect(game.p2.deck()[game.p2.deck().length - 1]).toBe("victim");
    expect(game.zoneOf("sabotage")).toBe("trash");
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// 13. pendingChoice mid-chain resumes LIFO correctly afterwards
// ---------------------------------------------------------------------------

describe("A pendingChoice raised mid-chain suspends the chain; afterwards LIFO resumes with a fresh all-pass round (334.2.a, 340.4, 312.1.b.1)", () => {
  test("chain [S1 (P1 draw), H (P2 Reaction reveal-and-pick)]: all pass → H raises P2's choice; S1 stays unresolved and nobody has Priority; after the pick → Priority P1, P1+P2 pass → S1 resolves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .hand(P1, DRAW1, "S1")
      .hand(P1, DRAW2, "fodder")
      .hand(P1, REACTION_DRAW, "p1react")
      .hand(P2, REACTION_PILFER, "H")
      .hand(P2, REACTION_DRAW, "p2react")
      .build();
    const p1Deck0 = game.p1.deck().length;
    await game.p1.cast("S1");
    await game.p1.passPriority();
    await game.p2.cast("H");
    expect(chainIds(game)).toEqual(["S1", "H"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // H is resolving: P2 must pick from P1's revealed hand.
    expect(game.gameState.pendingChoice?.type).toBe("reveal-and-pick");
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toEqual(expect.objectContaining({ kind: "pick", seat: P2 }));
    // S1 still on the chain, unresolved; no priority window for anyone.
    expect(chainIds(game)).toContain("S1");
    expect(game.zoneOf("S1")).toBe("chain");
    expect(game.p1.deck().length).toBe(p1Deck0);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    // MUST NOT: a Reaction being playable while the choice is outstanding.
    expect((await game.p1.try((s) => s.do("playSpell", { cardId: "p1react" }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.do("playSpell", { cardId: "p2react" }))).ok).toBe(false);
    expect((await game.p1.try((s) => s.do("passChainPriority", {}))).ok).toBe(false);
    // P2 picks P1's fodder.
    await game.p2.pick("fodder");
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("H")).toBe("trash");
    // MUST NOT: S1 auto-resolving right after H.
    expect(chainIds(game)).toEqual(["S1"]);
    expect(game.zoneOf("S1")).toBe("chain");
    expect(game.p1.deck().length).toBe(p1Deck0);
    expect(turnState(game)).toBe("neutral-closed");
    expect(priorityHolder(game)).toBe(P1); // controller of S1
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(chainIds(game)).toEqual(["S1"]);
    await game.p2.passPriority();
    expect(game.zoneOf("S1")).toBe("trash");
    expect(game.p1.deck().length).toBe(p1Deck0 - 1);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(rulesViolations(game)).toEqual([]);
  });
});
