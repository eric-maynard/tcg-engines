/**
 * Interaction: Pyke, Returned (unl-145-219) · Champion Unit · Chaos · 3 · 3 Might
 *     "[Hidden] [Backline] Once each turn, when an enemy unit dies while I'm at a battlefield, play a
 *      Gold gear token exhausted."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × Flurry of Blades (ogn-133-298) · Spell (Reaction) · Body · 1 — "Deal 1 to all units at battlefields."
 *
 * Question: P1's turn. P1 has two Watchful Sentries at bf1; P2's Pyke is face-up at bf2. Flurry of
 * Blades resolves: both Sentries die simultaneously, Pyke survives on 1 damage. How many Gold tokens
 * does P2 get, and in what order do the two Deathknells and Pyke's trigger go on / come off the chain?
 * Contrast (i): Pyke in P2's base. Contrast (ii): a third P1 unit dies later the same turn.
 *
 * Rules: 383.3.e / 383.3.e.1 ("once each turn" — performed once; a second simultaneous or later
 * fulfilment does not trigger), 383.1.b (controller picks which simultaneous instance it answers),
 * 383.3.d.1 (simultaneous triggers of different controllers: turn player appends theirs first, then
 * the next player — so P2's item ends on top), 383.2.a.1 ("while I'm at a battlefield" is part of the
 * condition), 808.1.d.2 (Deathknell is queued before the unit reaches the trash).
 *
 * Expected: exactly ONE exhausted Gold gear token for P2. Chain after the deaths (bottom→top):
 * Sentry DK, Sentry DK, Pyke — LIFO: Gold is created first, then P1 draws 1, draws 1. Final: P1 +2
 * cards, Pyke at bf2 with 1 damage. (i) Pyke in base → 0 tokens, P1 still draws 2. (ii) a later enemy
 * death the same turn → still exactly one token.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE = "unl-145-219";
const SENTRY = "ogn-096-298";
const FLURRY = "ogn-133-298";
/** 0-cost action spell "Deal 3 to a unit" — kills the third P1 unit later in the turn. */
const ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Zap",
  timing: "action",
};

const golds = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

function board(pykeAt: "bf2" | "base") {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SENTRY, "s1")
    .unit(P1, "bf1", SENTRY, "s2")
    .unit(P1, "base", { might: 1, name: "Third Wheel" }, "third")
    .unit(P2, pykeAt, PYKE, "pyke")
    .hand(P1, FLURRY, "flurry")
    .hand(P1, ZAP, "zap");
}

/** Cast Flurry and pass priority until it (and only it) has resolved — the triggers are now on the chain. */
async function flurryResolves(pykeAt: "bf2" | "base" = "bf2"): Promise<Game> {
  const game = await board(pykeAt).build();
  await game.p1.cast("flurry");
  expect(game.chain().map((c) => c.cardId)).toEqual(["flurry"]);
  while (game.chain().some((c) => c.cardId === "flurry")) {
    const d = game.decision();
    if (d?.kind === "order") {
      await game.seat(d.seat).order(d.items.map((i) => i.key)); // identical DKs — any order
      continue;
    }
    await game.acting().passPriority();
  }
  // P1 may be offered an order decision for its two identical Deathknells (383.3.d) — take it as given.
  const d = game.decision();
  if (d?.kind === "order" && d.seat === P1) {
    await game.p1.order(d.items.map((i) => i.key));
  }
  return game;
}

describe("Pyke, Returned 'once each turn' × two simultaneous enemy Deathknell deaths", () => {
  test("Flurry of Blades kills both 1-Might Sentries at bf1 simultaneously; Pyke (3) at bf2 survives with 1 damage", async () => {
    const game = await flurryResolves();
    expect(game.zoneOf("s1")).toBe("trash");
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf2");
    expect(game.state("pyke").damage).toBe(1);
    expect(game.zoneOf("third")).toBe("base"); // not at a battlefield — untouched
    expect(game.state("third").damage).toBe(0);
    expect(game.zoneOf("flurry")).toBe("trash");
  });

  test("exactly ONE Pyke trigger is put on the chain for the two simultaneous deaths (383.3.e.1, 383.1.b)", async () => {
    const game = await flurryResolves();
    const items = game.chain();
    expect(items.filter((c) => c.cardId === "pyke")).toHaveLength(1);
    expect(items.filter((c) => c.cardId === "s1" || c.cardId === "s2")).toHaveLength(2);
    expect(items.every((c) => c.triggered)).toBe(true);
    expect(items).toHaveLength(3);
  });

  // Expected (383.3.d.1): turn player P1 appends both Sentry Deathknells first, then P2 appends Pyke's
  // trigger — chain bottom→top = [DK, DK, Pyke], so Pyke's item is on top and resolves first.
  // Actual: the engine interleaves per death event — [s1 DK, Pyke, s2 DK] — putting a P1 item on top.
  test("cross-player placement — P1's two Deathknells go on first, P2's Pyke trigger ends on TOP (383.3.d.1)", async () => {
    const game = await flurryResolves();
    const items = game.chain();
    expect(items.map((c) => c.controller)).toEqual([P1, P1, P2]);
    expect(items.at(-1)?.cardId).toBe("pyke");
  });

  // Expected LIFO from the placement above: the Gold token exists before P1 has drawn anything.
  // Actual: s2's Deathknell resolves first (P1 draws), then Pyke, then s1.
  test("resolution order — Pyke's Gold token is created BEFORE either Deathknell draw (LIFO over 383.3.d.1)", async () => {
    const game = await flurryResolves();
    const hand0 = game.p1.hand().length;
    // Resolve exactly the top item.
    const n = game.chain().length;
    while (game.chain().length === n) {
      await game.acting().passPriority();
    }
    expect(golds(game, "p2")).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("after everything resolves: P2 has exactly one Gold gear TOKEN, exhausted, in P2's base; P1 has none", async () => {
    const game = await flurryResolves();
    await game.settle();
    expect(game.chain()).toEqual([]);
    const g = golds(game, "p2");
    expect(g).toHaveLength(1);
    expect(game.state(g[0]!)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, owner: P2 });
    expect(golds(game, "p1")).toEqual([]);
  });

  test("after everything resolves: both Deathknells drew — P1 is up exactly 2 cards net of the Flurry (808.1.d.2)", async () => {
    const game = await board("bf2").build();
    const hand0 = game.p1.hand().length; // flurry + zap
    const deck0 = game.p1.deck().length;
    await game.p1.cast("flurry");
    await game.settle({ policy: "first" }); // takes any DK order prompt as offered
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.state("pyke").damage).toBe(1);
    expect(game.locationOf("pyke")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  // ---- Contrast (i): Pyke in base ------------------------------------------------------------------

  test("contrast (i): Pyke in P2's BASE — 'while I'm at a battlefield' is part of the condition (383.2.a.1): no trigger, 0 Gold, P1 still draws 2", async () => {
    const game = await flurryResolves("base");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["s1", "s2"]);
    expect(game.state("pyke").damage).toBe(0); // in base — Flurry only hits battlefields
    const hand0 = game.p1.hand().length;
    await game.settle();
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  // ---- Contrast (ii): a later death the same turn ---------------------------------------------------

  test("contrast (ii): a third enemy unit dying later the same turn does not trigger Pyke again — still exactly one Gold (383.3.e.1)", async () => {
    const game = await flurryResolves();
    await game.settle();
    expect(golds(game, "p2")).toHaveLength(1);
    await game.p1.cast("zap", { targets: "third" });
    await game.settle();
    expect(game.zoneOf("third")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p2")).toHaveLength(1);
  });

  test("contrast (ii′): the restriction resets next turn — an enemy death on a later turn while Pyke is at bf2 yields a second Gold", async () => {
    const game = await flurryResolves();
    await game.settle();
    expect(golds(game, "p2")).toHaveLength(1);
    await game.advanceTurn(); // → P2's turn 3
    await game.advanceTurn(); // → P1's turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(4);
    expect(game.locationOf("pyke")).toBe("bf2");
    await game.p1.cast("zap", { targets: "third" });
    await game.settle();
    expect(game.zoneOf("third")).toBe("trash");
    expect(golds(game, "p2")).toHaveLength(2);
  });
});
