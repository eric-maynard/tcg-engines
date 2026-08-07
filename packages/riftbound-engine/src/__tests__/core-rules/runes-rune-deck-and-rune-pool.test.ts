/**
 * Core rules — Resources I: Basic Rune abilities, Rune Pool lifetime, Rune Deck ordering.
 *
 * Card-independent: every rune is an inline `{ cardType: "rune", domain }` def (or the
 * harness' `.rune(P1, "fury")` shorthand); spells/legends are inline filler defs.
 *
 * Rules covered
 *   164.2.a     [E]: [Reaction] — Add [1]            (exhaust a Basic Rune for 1 Energy)
 *   164.2.b/.b.1 Recycle this: [Reaction] — Add [C]  (1 Power of THAT rune's domain)
 *   161.2.b / 416.1.b / 416.1.c   runes recycle to the bottom of their OWNER's Rune Deck
 *   163.2.a(.1) Power has a Domain (that of the rune that produced it)
 *   166 / 444.1 the Rune Pool is a counter; Pay removes exactly the cost, surplus floats
 *   167 / 316.2-316.4  every player's pool empties at the START of each Main Phase (before
 *               start-of-Main triggers) …
 *   167 / 317.2.d      … and at the END of each player's turn (every player's pool)
 *   315.1.b / 415.3.a  Awaken readies only the Turn Player's game objects (runes included)
 *   315.3.b / 430.1 / 430.2.a / 103.3.b  Channel takes the TOP 2 runes, they enter ready,
 *               and nothing re-shuffles the Rune Deck after setup
 *   315.3.b.1 / 430.3  fewer runes than required → channel as many as possible, no penalty
 *   485.7       second player channels 3 on their first Channel Phase only
 *   416.5.a     simultaneous rune recycles go to the bottom in the OWNER's chosen order
 *   429.2 / 429.2.a / 813.1.c.2  Add abilities are Reactions that finalize+resolve at once:
 *               no chain item, no priority pass, usable during an opponent's chain
 *   414.4       an exhausted rune cannot pay an [E] cost again; 416.3 recycle-as-cost is fine
 *   103.3.a / 103.3.a.1 / 161.2.a  deck construction: exactly 12 runes, in Domain Identity
 */

import { describe, expect, test } from "bun:test";
import type { Domain } from "@tcg/riftbound-types";
import type { BattlefieldCard, Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { Game, P1, P2, P3, basicRuneDef, loadDefaultCardPool, scenario } from "../../harness";
import { validateDeck } from "../../validators/deck-validators";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

const rune = (domain: string, name?: string) => ({ cardType: "rune", domain, name: name ?? `${domain} Rune` });

/** A slow (Action-less) 0-cost spell: "Draw 1." — something to put on the chain. */
const SLOW_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Cantrip",
};

/** [Reaction] spell costing 1 energy: "Draw 1." */
const REACTION_1E = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Filler Snap",
  timing: "reaction",
};

/** Spell: "Recycle a rune." (effect-driven recycle, NOT the rune's own ability). */
const RECYCLE_A_RUNE = {
  abilities: [{ effect: { amount: 1, from: "board", target: { type: "rune" }, type: "recycle" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Unmake",
  timing: "action",
};

/** Spell: "Recycle 3 of your runes." — per 416.6 such an instruction does not target; the owner picks (and orders) on resolution. */
const RECYCLE_THREE_RUNES = {
  abilities: [{ effect: { amount: 3, from: "board", type: "recycle", what: "rune" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Storm Sigil",
  timing: "action",
};

/** Legend: "At the start of your Beginning Phase, draw 1." — holds the Beginning Phase open on a chain. */
const LEGEND_DAWN_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "beginning-phase", on: "controller", timing: "at" }, type: "triggered" }],
  cardType: "legend",
  domain: ["fury", "mind"],
  name: "Filler Dawn Legend",
};

/** Legend: "At the start of your Main Phase, [Add] [1]." — observes task order 316.3 → 316.4. */
const LEGEND_MAIN_ADD = {
  abilities: [{ effect: { energy: 1, type: "add-resource" }, trigger: { event: "main-phase", on: "controller", timing: "at" }, type: "triggered" }],
  cardType: "legend",
  domain: ["fury", "mind"],
  name: "Filler Spark Legend",
};

// ---------------------------------------------------------------------------
// 164.2 — the two Basic Rune abilities
// ---------------------------------------------------------------------------

describe("164.2.a — [E]: Add [1] (exhaust a rune for one Energy)", () => {
  test("exhausting a ready rune adds exactly 1 Energy, creates no chain item and passes no priority; it cannot be exhausted again (414.4)", async () => {
    const game = await scenario().fillDecks({ main: 10, runes: 0 }).rune(P1, "fury", { alias: "f1" }).build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });

    await game.p1.tapRune("f1");
    expect(game.state("f1").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(0);
    // 429.2 / 429.2.a: Add resolves immediately — nothing on the chain, still P1's Neutral Open main phase.
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);

    // 414.4: the exhaust cost cannot be paid by an already-exhausted rune.
    expect(game.p1.can("tapRune", "f1")).toBe(false);
    const again = await game.p1.try((p) => p.tapRune("f1"));
    expect(again.ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
    expect(game.isOver()).toBe(false);
  });
});

describe("164.2.b — Recycle this: Add [C] (one Power of the rune's own domain, rune to the bottom of its owner's Rune Deck)", () => {
  test("recycling a Calm rune adds 1 Calm power (no Energy), and the rune becomes the LAST card of P1's rune deck (416.1.b, 161.2.b)", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "calm", { alias: "c1" })
      .card("r3", { def: rune("calm"), owner: P1, zone: "runeDeck" })
      .card("r4", { def: rune("calm"), owner: P1, zone: "runeDeck" })
      .card("r5", { def: rune("calm"), owner: P1, zone: "runeDeck" })
      .build();
    expect(game.p1.runeDeck()).toEqual(["r3", "r4", "r5"]);

    await game.p1.recycleRune("c1");
    expect(game.zoneOf("c1")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toEqual(["r3", "r4", "r5", "c1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    // Must NOT end up anywhere else, and — being an Add — leaves no chain item / priority change.
    expect(game.p1.deck()).not.toContain("c1");
    expect(game.p1.trash()).not.toContain("c1");
    expect(game.p1.banishment()).not.toContain("c1");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("an EXHAUSTED rune can still be recycled the same turn: 1 Energy from the tap + 1 Fury power from the recycle (416.3, 444.1)", async () => {
    const game = await scenario().fillDecks({ main: 10, runes: 0 }).rune(P1, "fury", { alias: "f1" }).build();
    await game.p1.tapRune("f1");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("f1").isExhausted).toBe(true);

    expect(game.p1.can("recycleRune", "f1")).toBe(true);
    await game.p1.recycleRune("f1");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.zoneOf("f1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
  });

  test("Power tracks the domain of the rune recycled, not the legend: Mind rune → Mind power, Fury rune → Fury power (163.2.a.1, 164.2.b.1)", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 })
      .legend(P1, { cardType: "legend", domain: ["fury", "mind"], name: "Filler Legend" })
      .rune(P1, "fury", { alias: "f1" })
      .rune(P1, "mind", { alias: "m1" })
      .build();
    await game.p1.recycleRune("m1");
    expect(game.p1.power("mind")).toBe(1);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("f1")).toBe("runePool");
    expect(game.state("f1").isReady).toBe(true);

    await game.p1.recycleRune("f1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 1 } });
    // No generic/universal power is produced by Basic Runes.
    expect(game.p1.power("rainbow")).toBe(0);
  });

  // Expected (416.1.b/.c, 429.4.a, 168): an effect that recycles a rune moves it to the bottom of its
  // OWNER's Rune Deck and adds NO power to anyone (only the rune's own "Recycle this: Add [C]" adds).
  // Actual: the generic `recycle` effect handler is a no-op for board runes — the rune stays in play.
  test("416.1.b/.c — an EFFECT that recycles P1's rune (cast by P2) puts it under P1's rune deck and adds no power to either player; engine leaves the rune on the board", async () => {
    const game = await scenario()
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "fury", { alias: "f1" })
      .card("p1r", { def: rune("fury"), owner: P1, zone: "runeDeck" })
      .card("p2r", { def: rune("calm"), owner: P2, zone: "runeDeck" })
      .hand(P2, RECYCLE_A_RUNE, "unmake")
      .build();
    await game.p2.cast("unmake", { targets: "f1" });
    await game.settle();
    expect(game.zoneOf("unmake")).toBe("trash");
    expect(game.zoneOf("f1")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toEqual(["p1r", "f1"]);
    expect(game.p2.runeDeck()).toEqual(["p2r"]);
    expect(game.p2.deck()).not.toContain("f1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});

// ---------------------------------------------------------------------------
// 166 / 167 — Rune Pool lifetime
// ---------------------------------------------------------------------------

describe("166.3 / 444.1 — unspent Energy and Power float across plays within the Main Phase", () => {
  test("paying a cost removes exactly that cost; the surplus (and unused power) stays in the pool for the next play", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, { energyCost: 2, might: 2, name: "Filler Two-Drop" }, "u2")
      .hand(P1, { energyCost: 1, might: 1, name: "Filler One-Drop" }, "u1")
      .build();
    await game.p1.play("u2");
    await game.settle();
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });

    await game.p1.play("u1");
    await game.settle();
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });
});

describe("167 / 316.2–316.4 — every player's pool empties at the START of each Main Phase, before start-of-Main triggers", () => {
  test("Energy the turn player floated during their Beginning Phase is gone when the Main Phase opens; the tapped rune stays exhausted (emptying is not a refund)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .rune(P1, "fury", { alias: "f1" })
      .legend(P1, LEGEND_DAWN_DRAW, "dawn")
      .build();
    await game.p2.endTurn();
    // The legend's start-of-Beginning-Phase trigger holds the Beginning Phase open; P1 has priority.
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dawn", triggered: true })]);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.tapRune("f1"); // Reaction-speed Add during the Beginning Phase
    expect(game.p1.energy()).toBe(1);

    await game.settle(); // trigger resolves → channel → draw → main
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("f1").isExhausted).toBe(true);
    // Awaken already happened before the tap; the 2 channeled runes are the only ready ones.
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(3);
  });

  test("task order 316.3 → 316.4: a start-of-Main-Phase '[Add] [1]' trigger lands in an already-emptied pool, so the Main Phase opens with exactly 1 Energy (not 0, not 3)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P1, { energy: 2 }) // stale float that must be wiped before the trigger adds
      .legend(P1, LEGEND_MAIN_ADD, "spark")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    // 429.2: the Add trigger finalizes and resolves immediately — nothing lingers on the chain.
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
  });

  // Expected (167: "Every player's Rune Pool empties at the start of EACH player's Main Phase"): energy P2
  // floated (via a Reaction Add) during P1's Beginning Phase is lost when P1's Main Phase starts.
  // Actual: only the turn player's pool is emptied (draw.onEnd) — P2 carries the energy into P1's Main Phase.
  test("167 / 316.3 — the OFF-turn player's pool also empties when the turn player's Main Phase starts", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .rune(P1, "fury", { alias: "f1" })
      .rune(P2, "fury", { alias: "f2" })
      .legend(P1, LEGEND_DAWN_DRAW, "dawn")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    await game.p1.passPriority(); // P2 now holds priority on P1's Beginning-Phase chain
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune("f2");
    expect(game.p2.energy()).toBe(1);

    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("f2").isExhausted).toBe(true); // not P2's Awaken — stays tapped
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});

describe("167 / 317.2.d — every player's pool empties at the END of each player's turn", () => {
  test("turn player and off-turn player both float 1 Energy during P1's turn; after P1's Ending Phase both pools are 0 (3-player game so P3's own turn start cannot be what emptied it)", async () => {
    const game = await scenario({ players: 3 })
      .rune(P1, "fury", { alias: "f1" })
      .rune(P3, "fury", { alias: "f3" })
      .hand(P1, SLOW_SPELL, "cantrip")
      .build();
    // P1 opens a chain so P3 gets a Closed-state priority window to use its Reaction Add.
    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P3);
    await game.seat(P3).tapRune("f3");
    expect(game.seat(P3).energy()).toBe(1);
    await game.settle(); // cantrip resolves
    await game.p1.tapRune("f1");
    expect(game.p1.energy()).toBe(1);

    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.seat(P3).resources()).toEqual({ energy: 0, power: {} });
    // 315.1.b: P2's Awaken readied nothing of P1's/P3's — their tapped runes stay exhausted.
    expect(game.state("f1").isExhausted).toBe(true);
    expect(game.state("f3").isExhausted).toBe(true);
  });
});

describe("315.1.b / 415.3.a — Awaken readies only the Turn Player's runes (runes are controlled game objects though not permanents, 161.1.a)", () => {
  test("both players have 2 exhausted runes; P1's Awaken readies P1's two and leaves P2's two exhausted; readying adds no Energy", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "fury", { alias: "a1", exhausted: true })
      .rune(P1, "mind", { alias: "a2", exhausted: true })
      .rune(P2, "fury", { alias: "b1", exhausted: true })
      .rune(P2, "calm", { alias: "b2", exhausted: true })
      .build();
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p2.runes({ ready: true })).toEqual([]);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("a1").isReady).toBe(true);
    expect(game.state("a2").isReady).toBe(true);
    expect(game.state("b1").isExhausted).toBe(true);
    expect(game.state("b2").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});

// ---------------------------------------------------------------------------
// 315.3 / 430 / 103.3.b — Channel Phase and Rune Deck ordering
// ---------------------------------------------------------------------------

describe("315.3.b / 430.1 / 430.2.a — the Channel Phase takes the TOP two runes, in order, ready; the rest of the deck keeps its order", () => {
  test("deck [r5,r6,r7,r8,r9] with 4 runes on board → r5 and r6 are channeled ready, deck is exactly [r7,r8,r9], pool unchanged", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .runes(P1, "fury", 4)
      .card("r5", { def: rune("fury"), owner: P1, zone: "runeDeck" })
      .card("r6", { def: rune("mind"), owner: P1, zone: "runeDeck" })
      .card("r7", { def: rune("fury"), owner: P1, zone: "runeDeck" })
      .card("r8", { def: rune("mind"), owner: P1, zone: "runeDeck" })
      .card("r9", { def: rune("fury"), owner: P1, zone: "runeDeck" })
      .runeDeck(P2, [rune("fury"), rune("fury"), rune("fury")])
      .build();
    expect(game.p1.runeDeck()).toEqual(["r5", "r6", "r7", "r8", "r9"]);
    expect(game.p1.runes()).toHaveLength(4);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runes()).toEqual(expect.arrayContaining(["r5", "r6"]));
    expect(game.p1.runes()).not.toContain("r7");
    expect(game.state("r5").isReady).toBe(true);
    expect(game.state("r6").isReady).toBe(true);
    expect(game.p1.runeDeck()).toEqual(["r7", "r8", "r9"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // Channeling is a phase Task, not a chain item.
    expect(game.chain()).toEqual([]);
  });

  test("a recycled rune comes back deterministically from the BOTTOM: deck [rA] + recycle r1 → [rA, r1]; next Channel Phase channels rA then r1 and the deck is empty (416.1, no post-setup shuffle)", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "fury", { alias: "r2" })
      .card("rA", { def: rune("mind"), owner: P1, zone: "runeDeck" })
      .runes(P2, "fury", 2)
      .runeDeck(P2, [rune("fury"), rune("fury"), rune("fury")])
      .build();
    await game.p1.recycleRune("r1");
    expect(game.p1.runeDeck()).toEqual(["rA", "r1"]);

    await game.advanceTurn(); // → P2
    expect(game.p1.runeDeck()).toEqual(["rA", "r1"]); // P2's turn touches nothing of P1's
    await game.advanceTurn(); // → P1: channels 2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.runes()).toEqual(expect.arrayContaining(["r2", "rA", "r1"]));
    expect(game.p1.runes()).toHaveLength(3);
  });
});

describe("315.3.b.1 / 430.3 — a short Rune Deck channels as many as possible, with no penalty", () => {
  test("1 rune left → channels exactly 1, the turn proceeds through Draw to Main normally; empty deck next turn → channels 0, still no error and no Burn Out", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .card("last", { def: rune("fury"), owner: P1, zone: "runeDeck" })
      .runeDeck(P2, [rune("fury"), rune("fury"), rune("fury"), rune("fury")])
      .build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toEqual(["last"]);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // Draw Phase still happened
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // drawn from the MAIN deck only once — runes never come from it
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // no burn-out-like penalty

    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 with an empty rune deck
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toEqual(["last"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });
});

describe("485.7 — First Turn Process: the player going second channels one extra rune in their FIRST Channel Phase only", () => {
  async function duel(runeCount = 12): Promise<Game> {
    const pool = await loadDefaultCardPool();
    const runeDef = basicRuneDef(pool, "fury");
    const bf = pool.all().find((c) => c.cardType === "battlefield" && !((c.abilities as unknown[] | undefined)?.length)) ?? pool.all().find((c) => c.cardType === "battlefield");
    const deck = {
      battlefieldIds: [bf?.id as string],
      mainDeckCardIds: Array(40).fill("ogn-175-298"), // vanilla 3-might unit
      runeDeckCardIds: Array(runeCount).fill(runeDef.id as string),
    };
    return Game.fromDecks({ p1: deck, p2: deck });
  }

  test("P1 T1 → 2 runes; P2 T2 → 3 runes (12→9); P1 T3 → +2 (4); P2 T4 → +2 only (5, deck 7); nothing goes on the chain for the bonus", async () => {
    const game = await duel();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p2.runes()).toHaveLength(0);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runeDeck()).toHaveLength(9);
    expect(game.chain()).toEqual([]);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(4); // P1 never gets the bonus
    expect(game.p1.runeDeck()).toHaveLength(8);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5); // bonus is not repeated
    expect(game.p2.runeDeck()).toHaveLength(7);
  });

  test("contrived: the second player's rune deck holds only 2 runes → their first Channel Phase channels 2 (as many as possible), no error (430.3)", async () => {
    const game = await duel(2);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(0);
    expect(game.isOver()).toBe(false);
  });
});

describe("416.5.a — several runes recycled simultaneously go to the bottom in their OWNER's chosen order (not random like Main Deck cards, 416.5)", () => {
  // Expected: resolving "recycle 3 of your runes" has P1 (the owner) put rX,rY,rZ under the rune deck in an order P1
  // chooses — the engine must surface that choice to P1 (a pick and/or order prompt); choosing Z,X,Y yields a rune
  // deck of exactly [rA, rZ, rX, rY] and adds no power (effect-recycle, not the rune ability — 429.4.a).
  // Actual: the generic `recycle` effect is a no-op for board runes — no prompt at all, runes stay in play.
  test.failing("BUG: 416.5.a — effect recycling 3 runes should surface an owner's-ORDER decision and place them under the deck in that order; engine does not recycle them at all", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "fury", { alias: "rX" })
      .rune(P1, "mind", { alias: "rY" })
      .rune(P1, "fury", { alias: "rZ" })
      .card("rA", { def: rune("mind"), owner: P1, zone: "runeDeck" })
      .hand(P1, RECYCLE_THREE_RUNES, "sigil")
      .build();
    await game.p1.cast("sigil");
    await game.settle(); // stops at the first real prompt
    const first = game.decision();
    expect(first?.seat).toBe(P1);
    expect(["pick", "order"]).toContain(first?.kind as string);
    if (first?.kind === "pick") {
      await game.p1.pick("rZ", "rX", "rY");
      await game.settle();
    }
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.p1.order(["rZ", "rX", "rY"]);
      await game.settle();
    }
    expect(game.p1.runeDeck()).toEqual(["rA", "rZ", "rX", "rY"]);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});

// ---------------------------------------------------------------------------
// 429.2 / 813.1.c.2 — Reaction Add during an opponent's chain
// ---------------------------------------------------------------------------

describe("429.2 / 429.3 / 813.1.c.2 — a rune's Add is a Reaction that bypasses the chain: usable while an opponent's spell is pending, then pays for a Reaction that resolves first (LIFO)", () => {
  test("P1's spell S is on the chain; P2 taps a rune (no chain item, keeps priority), casts Reaction R on top; R resolves before S", async () => {
    const game = await scenario()
      .rune(P2, "fury", { alias: "f2" })
      .hand(P1, SLOW_SPELL, "S")
      .hand(P2, REACTION_1E, "R")
      .build();
    const p1Hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    await game.p1.cast("S");
    expect(game.chain().map((c) => c.cardId)).toEqual(["S"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "R")).toBe(false); // cannot afford it yet

    await game.p2.tapRune("f2");
    expect(game.p2.energy()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["S"]); // the Add put nothing on the chain
    expect(game.actingSeat()).toBe(P2); // …and did not hand priority back to P1

    await game.p2.cast("R");
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["S", "R"]); // R is the newest item

    // Both pass once each → only the newest item (R) resolves; S is still there.
    await game.acting().pass();
    await game.acting().pass();
    expect(game.chain().map((c) => c.cardId)).toEqual(["S"]);
    expect(game.zoneOf("R")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1 + 1); // cast R, drew 1 off R
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // S has NOT resolved yet

    await game.settle();
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1);
  });
});

// ---------------------------------------------------------------------------
// 103.3 / 161.2.a — deck construction
// ---------------------------------------------------------------------------

describe("103.3.a / 103.3.a.1 / 161.2.a — the Rune Deck is exactly 12 runes within the legend's Domain Identity, separate from the 40+ Main Deck", () => {
  let n = 0;
  const id = () => createCardId(`core-rune-test-${++n}`);
  const legend: LegendCard = { cardType: "legend", championTag: "Filler", domain: ["fury", "mind"] as Domain[], id: id(), name: "Filler Legend" };
  const champion: UnitCard = { cardType: "unit", domain: "fury" as Domain, id: id(), isChampion: true, might: 4, name: "Filler, Champion", tags: ["Filler"] };
  const unit = (): UnitCard => ({ cardType: "unit", domain: "fury" as Domain, id: id(), might: 2, name: `Filler Unit ${n}` });
  const mkRune = (domain: Domain): RuneCard => ({ cardType: "rune", domain, id: id(), isBasic: true, name: `${domain} Rune` });
  const battlefields: BattlefieldCard[] = [
    { cardType: "battlefield", id: id(), name: "Filler Field A" },
    { cardType: "battlefield", id: id(), name: "Filler Field B" },
    // rule 485.4.a: a duel deck provides three battlefields
    { cardType: "battlefield", id: id(), name: "Filler Field C" },
  ];
  const mainDeck: Card[] = Array.from({ length: 40 }, () => unit());
  const runes = (fury: number, mind: number, calm = 0): RuneCard[] => [
    ...Array.from({ length: fury }, () => mkRune("fury" as Domain)),
    ...Array.from({ length: mind }, () => mkRune("mind" as Domain)),
    ...Array.from({ length: calm }, () => mkRune("calm" as Domain)),
  ];
  const config = (runeDeck: RuneCard[], deck: Card[] = mainDeck) => ({ battlefields, chosenChampion: champion, legend, mainDeck: deck, mode: "duel" as const, runeDeck });

  test("ACCEPT: 12 runes in any Fury/Mind mix (7 Fury + 5 Mind)", () => {
    const result = validateDeck(config(runes(7, 5)));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("REJECT: 11 runes and 13 runes (exactly 12 required)", () => {
    const eleven = validateDeck(config(runes(6, 5)));
    expect(eleven.valid).toBe(false);
    expect(eleven.errors).toContainEqual(expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }));
    const thirteen = validateDeck(config(runes(7, 6)));
    expect(thirteen.valid).toBe(false);
    expect(thirteen.errors).toContainEqual(expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }));
  });

  test("REJECT: 12 runes including 1 Calm rune (outside the Fury/Mind Domain Identity)", () => {
    const result = validateDeck(config(runes(6, 5, 1)));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "RUNE_DOMAIN_VIOLATION" }));
    expect(result.errors).not.toContainEqual(expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }));
  });

  test("runes are a separate deck and never count toward the 40-card Main Deck minimum: 39 main-deck cards + 12 runes is still too small", () => {
    const result = validateDeck(config(runes(6, 6), mainDeck.slice(0, 39)));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "MAIN_DECK_TOO_SMALL" }));
    expect(result.errors).not.toContainEqual(expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }));
  });
});
