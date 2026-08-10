/**
 * Interaction: Sacrifice (unl-173-219) — Order Reaction spell, [1]
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Playful Phantom (ogn-049-298) — Calm unit, [5], 5 Might, no text (Mighty).
 *
 * Question: P1 casts Sacrifice killing its own Playful Phantom. P1's Main Deck = [D1] only and P1's
 * trash was EMPTY before casting.
 *   (a) P2 on 7: after drawing D1 the second draw Burns Out — what is recycled (is the just-sacrificed
 *       Phantom in the trash at that moment? is Sacrifice?), which card finishes the Draw 2, does the
 *       "channel 1 rune exhausted" still happen, and does P2 win mid-spell or at the Cleanup after
 *       Sacrifice fully resolved?
 *   (b) Same with P2 on 6 — final zones.
 *   (c) Control: deck [D1, D2] — no Burn Out.
 *
 * Rules:
 *   204.2.a / 428.1  — the kill is an additional cost paid at finalization: the Phantom is in the trash
 *                      before Sacrifice resolves; Sacrifice itself is on the chain, not in the trash.
 *   413.4 / 431.1.a / 431.2.a–d — draw as many as possible (D1), Burn Out: recycle the trash (= the
 *                      Phantom) into the Main Deck, an opponent gains 1, then finish the draw (→ Phantom).
 *   431.3.c.1        — only a point from a REPEATED Burn Out wins immediately; the first one does not.
 *   321 / 319.5 / 323.1 / 472 — no cleanup while a chain item resolves; the win is found at the cleanup
 *                      after Sacrifice leaves the chain — every instruction (incl. the channel) completed.
 *
 * Expected: (a) hand = {D1, Phantom}, deck 0, trash = {Sacrifice}, +1 exhausted rune (rune deck −1),
 *   P2 7 → 8 exactly (one Burn Out) and P2 wins at that cleanup. (b) identical zones, P2 6 → 7, no win,
 *   P1's main phase continues. (c) hand = {D1, D2}, trash = {Phantom, Sacrifice}, P2 unchanged, rune channeled.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const PLAYFUL_PHANTOM = "ogn-049-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla deck card standing in for D1 / D2

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** The friendly units offered for Sacrifice's kill cost. */
function sacrificeOffered(game: Game): string[] {
  const field = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn 2 main phase, exactly 1 energy. P1: Playful Phantom (5, Mighty) + a 2-Might Page in base,
 * Sacrifice in hand, trash EMPTY, Main Deck = `deck` (top first, no filler), 12 runes in the rune deck,
 * no runes channeled yet. P2 on `p2Points` with a small deck of its own.
 */
function board(opts: { p2Points?: number; deck?: readonly string[] } = {}) {
  const deck = opts.deck ?? ["D1"];
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .points(P1, 0)
    .points(P2, opts.p2Points ?? 7)
    .resources(P1, { energy: 1 })
    .unit(P1, "base", PLAYFUL_PHANTOM, "phantom")
    .unit(P1, "base", { might: 2, name: "Page" }, "page")
    .hand(P1, SACRIFICE, "sac")
    .deck(P1, deck.map(() => FILLER), deck)
    .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"]);
}

/** Cast Sacrifice killing the Phantom; returns with Sacrifice on the chain (nothing resolved yet). */
async function castSacrifice(opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(opts).build();
  expect(game.p1.trash()).toEqual([]);
  expect(game.p1.deck()).toEqual([...(opts?.deck ?? ["D1"])]);
  await game.p1.cast("sac", { sacrifice: "phantom" });
  return game;
}

describe("Sacrifice into a one-card deck: the Burn Out recycles the just-killed Phantom and P1 draws it back", () => {
  test("setup: only the Mighty Phantom is offered for the kill cost (not the 2-Might Page); Sacrifice costs exactly 1 energy", async () => {
    const game = await board().build();
    expect(sacrificeOffered(game)).toEqual(["phantom"]);
    await game.p1.cast("sac", { sacrifice: "phantom" });
    expect(game.p1.energy()).toBe(0);
  });

  test("(a) the kill is a COST paid at finalization: before anything resolves the Phantom is already in P1's trash, Sacrifice is on the chain (not in the trash), D1 still in the deck (204.2.a, 428.1)", async () => {
    const game = await castSacrifice();
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.p1.trash()).toEqual(["phantom"]);
    expect(game.zoneOf("sac")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1, triggered: false })]);
    expect(game.zoneOf("D1")).toBe("mainDeck");
    expect(game.zoneOf("page")).toBe("base");
    expect(game.p2.points()).toBe(7);
  });

  test("(a) resolution: draw D1, Burn Out recycles the trash = {Phantom} into the deck, then the owed draw takes the Phantom back into P1's HAND; deck ends empty (413.4, 431.2.b/d)", async () => {
    const game = await castSacrifice();
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["D1", "phantom"]);
    expect(game.zoneOf("phantom")).toBe("hand");
    expect(game.p1.deck()).toEqual([]);
  });

  test("(a) Sacrifice was on the chain during the Burn Out, so it was NOT recycled — it lands in the trash afterwards and is the ONLY card there", async () => {
    const game = await castSacrifice();
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sac"]);
  });

  test("(a) exactly ONE Burn Out: P2 gains exactly 1 point (7 → 8), P1 none (431.2.c)", async () => {
    const game = await castSacrifice();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(0);
  });

  test("(a) the spell finished ALL its instructions before the game ended: 'channel 1 rune exhausted' happened (rune deck −1, one exhausted rune in the pool) (321, 431.3.c.1 inapplicable)", async () => {
    const game = await castSacrifice();
    const runeDeckBefore = game.p1.runeDeck().length;
    expect(game.p1.runes()).toEqual([]);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
  });

  test("(a) …and at the Cleanup after Sacrifice left the chain P2 (8 ≥ 8, 8 > 0) WINS (319.5, 323.1, 472)", async () => {
    const game = await castSacrifice();
    const stop = await game.settle();
    expect(game.chain()).toEqual([]);
    expect(stop.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P2 on 6 ─────────────────────────────────────────────────────────────────────────

  test("(b) P2 on 6: identical sequence — hand {D1, Phantom}, deck 0, trash {Sacrifice}, +1 exhausted rune — P2 6 → 7, NO win, P1's main phase continues", async () => {
    const game = await castSacrifice({ p2Points: 6 });
    const runeDeckBefore = game.p1.runeDeck().length;
    const stop = await game.settle();
    expect(game.p1.hand().sort()).toEqual(["D1", "phantom"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual(["sac"]);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) the Phantom drawn back is a real hand card again: with 5 energy P1 may replay it", async () => {
    const game = await castSacrifice({ p2Points: 6 });
    await game.settle();
    expect(game.p1.can("play", "phantom")).toBe(false); // 0 energy left
    await game.p1.do("addResources", { energy: 5 });
    expect(game.p1.can("play", "phantom")).toBe(true);
    await game.p1.play("phantom", { to: "base" });
    await game.settle();
    expect(game.zoneOf("phantom")).toBe("base");
  });

  // ── (c) control: deck [D1, D2] ──────────────────────────────────────────────────────────

  test("(c) control, deck [D1, D2]: draw D1 and D2, no Burn Out — Phantom stays in the trash with Sacrifice, P2 unchanged, rune channeled exhausted", async () => {
    const game = await castSacrifice({ deck: ["D1", "D2"] });
    const runeDeckBefore = game.p1.runeDeck().length;
    const stop = await game.settle();
    expect(game.p1.hand().sort()).toEqual(["D1", "D2"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["phantom", "sac"]);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    expect(game.isOver()).toBe(false);
    expect(stop.reason).toBe("open");
    expect(game.violations()).toEqual([]);
  });
});
