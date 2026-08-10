/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos][chaos][chaos] · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Keeper's Verdict (unl-204-219) · Spell · Body/Order · 2 + [C][C] · Action
 *     "Choose an ENEMY unit at a battlefield. Its OWNER places it on the top or bottom of their Main Deck."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2 + [order] · Action (also [Hidden])
 *     "Kill a unit at a battlefield. Its CONTROLLER draws 2."
 *
 * Rules: 740.1.a / 740.1.b (friendly/enemy is purely CONTROLLER-relative), 355.9.b (a target must meet
 * every restriction — "enemy"), 127.1 (owner = who brought the card), 056 / 056.2 (a card can only ever
 * enter its OWNER's non-board zone — deck, trash, hand), 323.5 / 428.2 (a killed permanent goes to its
 * owner's trash), 359.3.e.14 / .a (Hidden Blade's "its controller draws 2" is linked to the kill and keys
 * off the unit's controller as it was killed), 190.4.c / 323.6 (no units left at a battlefield in an Open
 * state → control lapses at the next cleanup; nobody conquers from that alone).
 *
 * Setup: on P1's turn P1 Possesses P2's vanilla Xerxes (4) off bfD, then walks it onto the empty bfC and
 * conquers it. X now sits alone at bfC — owner P2, controller P1.
 *  (a) On P2's turn, is X (P2's own card) a legal "enemy unit" for P2's Keeper's Verdict? — YES; it goes to
 *      P2's Main Deck and P2 (owner) picks top/bottom; P1 draws nothing. P1's own Keeper's Verdict can NOT
 *      pick X (friendly to P1).
 *  (b) P2 Hidden-Blades X instead: X → P2's trash (owner); P1 — the controller — draws 2.
 *  (c) P1 Hidden-Blades X on P1's turn: X → P2's trash; P1 draws 2. Trash follows ownership, the draw
 *      follows control.
 *  (d) In every case bfC is left with no P1 unit → P1 loses control of it at the next cleanup; no points
 *      change hands from the removal itself.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const KEEPERS_VERDICT = "unl-204-219";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * Turn 2, P1 active with exactly Possession's cost. bfD is P2's with Xerxes (4) and Yeoman (2); bfC is
 * empty and uncontrolled. Each player holds a Keeper's Verdict and a Hidden Blade; P1 keeps a Homebody
 * in base so "friendly"/"enemy" have something to contrast against.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bfC", { controller: null })
    .battlefield("bfD", { controller: P2 })
    .unit(P2, "bfD", { might: 4, name: "Xerxes" }, "x")
    .unit(P2, "bfD", { might: 2, name: "Yeoman" }, "y")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, KEEPERS_VERDICT, "kvP1")
    .hand(P1, HIDDEN_BLADE, "hbP1")
    .hand(P2, KEEPERS_VERDICT, "kvP2")
    .hand(P2, HIDDEN_BLADE, "hbP2");
}

/** The set of card ids a seat's spell currently offers as targets. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 Possesses X (control + recall to P1's base), then moves it onto empty bfC and conquers. Ends in P1's open main phase. */
async function possessAndOccupy(game: Game): Promise<void> {
  await game.p1.cast("poss", { targets: "x" });
  await game.settle();
  expect(game.state("x")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
  await game.p1.move("x", "bfC");
  await game.settle();
  await game.settle(); // through any handed-back showdown step → conquer
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bfC" });
  expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
  expect(game.p1.units("bfC")).toEqual(["x"]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** …and on to P2's open main phase with enough in P2's pool for either spell. */
async function toP2Turn(game: Game): Promise<void> {
  await possessAndOccupy(game);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bfC" });
  await game.p2.do("addResources", { energy: 4, power: { order: 1, rainbow: 2 } });
}

describe("Keeper's Verdict / Hidden Blade on a Possessed unit — enemy is controller-relative, decks and trash are owner-keyed", () => {
  test("setup: Possession takes P2's Xerxes — controller P1, owner still P2 — and P1 parks it alone on bfC (conquered, +1)", async () => {
    const game = await board().build();
    await possessAndOccupy(game);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.p1.trash()).toContain("poss");
    expect(game.violations()).toEqual([]);
  });

  // ── (a) Keeper's Verdict ───────────────────────────────────────────────────────────────────────

  test("(a) on P2's turn X — a card P2 OWNS but P1 controls — is offered to P2's Keeper's Verdict as an enemy unit (740.1.b, 355.9.b)", async () => {
    const game = await board().build();
    await toP2Turn(game);
    expect(game.p2.can("cast", "kvP2")).toBe(true);
    expect(targetsOffered(game, "p2", "kvP2")).toEqual(["x"]); // Yeoman is P2's own (friendly) → not offered
    expect((await game.p2.try((p) => p.cast("kvP2", { targets: "y" }))).ok).toBe(false);
  });

  test("(a) conversely P1 can NOT Keeper's Verdict X on P1's turn — X is friendly to P1 despite P2 owning it; only P2's Yeoman at bfD is offered (740.1.a)", async () => {
    const game = await board().build();
    await possessAndOccupy(game);
    await game.p1.do("addResources", { energy: 2, power: { rainbow: 2 } });
    expect(game.p1.can("cast", "kvP1")).toBe(true);
    expect(targetsOffered(game, "p1", "kvP1")).toEqual(["y"]);
    expect((await game.p1.try((p) => p.cast("kvP1", { targets: "x" }))).ok).toBe(false);
    expect(game.zoneOf("x")).toBe("battlefield-bfC");
    expect(game.zoneOf("kvP1")).toBe("hand");
  });

  test("(a) P2's Keeper's Verdict on X resolves into a top/bottom prompt for the OWNER — P2 decides, P1 cannot answer it (127.1)", async () => {
    const game = await board().build();
    await toP2Turn(game);
    await game.p2.cast("kvP2", { targets: "x" });
    expect(game.p2.energy()).toBe(2); // 2 energy + two [C] pips paid on play
    const power = game.p2.resources().power;
    expect((power.order ?? 0) + (power.rainbow ?? 0)).toBe(1);
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P2, source: { cardId: "x" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["mainDeck-bottom", "mainDeck-top"]);
    expect((await game.p1.try((p) => p.answer("mainDeck-bottom"))).ok).toBe(false);
    expect(game.zoneOf("x")).toBe("battlefield-bfC"); // not moved until the owner answers
  });

  test("(a) owner picks bottom: X becomes the bottom card of P2's Main Deck (never P1's — 056.2), control reverts to P2; P1 draws nothing and simply loses the unit; P2 is down the spell", async () => {
    const game = await board().build();
    await toP2Turn(game);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.cast("kvP2", { targets: "x" });
    await game.settle();
    await game.p2.answer("mainDeck-bottom");
    await game.settle();
    expect(game.zoneOf("x")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("x");
    expect(game.p2.deck()).toHaveLength(p2Deck + 1);
    expect(game.p1.deck()).not.toContain("x");
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.state("x")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.zoneOf("kvP2")).toBe("trash");
    expect(game.p2.trash()).toContain("kvP2");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) owner picks top: X is the TOP card of P2's Main Deck instead — same everything else", async () => {
    const game = await board().build();
    await toP2Turn(game);
    await game.p2.cast("kvP2", { targets: "x" });
    await game.settle();
    await game.p2.answer("mainDeck-top");
    await game.settle();
    expect(game.zoneOf("x")).toBe("mainDeck");
    expect(game.p2.deck()[0]).toBe("x");
    expect(game.p1.deck()).not.toContain("x");
  });

  test("(d/a) after the Verdict bfC holds no P1 unit → P1 loses control of it at the Open-state cleanup; nobody conquers, no points move (190.4.c, 323.6)", async () => {
    const game = await board().build();
    await toP2Turn(game);
    const p1Pts = game.p1.points();
    const p2Pts = game.p2.points();
    await game.p2.cast("kvP2", { targets: "x" });
    await game.settle();
    await game.p2.answer("mainDeck-bottom");
    await game.settle();
    expect(game.p1.units("bfC")).toEqual([]);
    expect(game.p2.units("bfC")).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
    expect(game.p1.points()).toBe(p1Pts);
    expect(game.p2.points()).toBe(p2Pts);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (b) P2 Hidden-Blades its own (stolen) card ─────────────────────────────────────────────────

  test("(b) Hidden Blade has no side restriction: on P2's turn it offers both X (P1-controlled) and P2's own Yeoman", async () => {
    const game = await board().build();
    await toP2Turn(game);
    expect(game.p2.can("cast", "hbP2")).toBe(true);
    expect(targetsOffered(game, "p2", "hbP2").sort()).toEqual(["x", "y"]);
  });

  test("(b) P2 Hidden-Blades X: X is killed into its OWNER's trash (P2's), and 'its controller draws 2' pays out to P1 — P2 draws nothing and is down the spell (056.2, 428.2, 359.3.e.14)", async () => {
    const game = await board().build();
    await toP2Turn(game);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.cast("hbP2", { targets: "x" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { order: 0, rainbow: 2 } });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    expect(game.p1.trash()).not.toContain("x");
    expect(game.state("x")).toMatchObject({ controller: P2, owner: P2, zone: "trash" });
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p1.deck()).toHaveLength(p1Deck - 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p2.trash()).toContain("hbP2");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d/b) …and bfC, emptied by the kill, drops to uncontrolled at the cleanup with no points either way", async () => {
    const game = await board().build();
    await toP2Turn(game);
    const p1Pts = game.p1.points();
    const p2Pts = game.p2.points();
    await game.p2.cast("hbP2", { targets: "x" });
    await game.settle();
    expect(game.p1.units("bfC")).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
    expect(game.p1.points()).toBe(p1Pts);
    expect(game.p2.points()).toBe(p2Pts);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (c) P1 Hidden-Blades the unit it stole ─────────────────────────────────────────────────────

  test("(c) P1 Hidden-Blades X on P1's own turn: X still goes to P2's trash (owner), and P1 — its controller — draws 2 (net +1 in hand); P2's hand and deck untouched", async () => {
    const game = await board().build();
    await possessAndOccupy(game);
    await game.p1.do("addResources", { energy: 2, power: { order: 1 } });
    expect(targetsOffered(game, "p1", "hbP1").sort()).toEqual(["x", "y"]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("hbP1", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toEqual(["x"]);
    expect(game.p1.trash()).not.toContain("x");
    expect(game.p1.trash()).toContain("hbP1");
    expect(game.state("x")).toMatchObject({ controller: P2, owner: P2, zone: "trash" });
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.p1.deck()).toHaveLength(p1Deck - 2);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d/c) …bfC empties → P1 loses control at the cleanup but KEEPS the conquer point already scored; P2 gains nothing", async () => {
    const game = await board().build();
    await possessAndOccupy(game);
    expect(game.p1.points()).toBe(1);
    await game.p1.do("addResources", { energy: 2, power: { order: 1 } });
    await game.p1.cast("hbP1", { targets: "x" });
    await game.settle();
    expect(game.p1.units("bfC")).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
