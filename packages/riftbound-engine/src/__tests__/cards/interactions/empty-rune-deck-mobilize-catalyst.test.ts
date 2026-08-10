/**
 * Interaction: an empty / near-empty RUNE Deck at the Channel Phase vs effect-channels with a fallback.
 *   × Mobilize (ogn-134-298) · Spell · Body · 2 · "Channel 1 rune exhausted. If you can't, draw 1."
 *   × Catalyst of Aeons (ogn-138-298) · Spell · Body · 4 · "Channel 2 runes exhausted. If you couldn't
 *     channel 2 runes this way, draw 1."
 *
 * Rules: 315.3.b / 315.3.b.1 (Channel Phase: channel 2; fewer in the Rune Deck → as many as possible),
 * 430.2 / 430.2.a (an effect may say the runes enter exhausted; default ready), 430.3 (insufficient runes
 * → channel as many as possible), 430.4.b (effects may channel), 431.1 (Burn Out is ONLY about moving
 * cards out of the MAIN Deck), 413.2.b (draw when an effect says so).
 *
 * Question: (a) 11 runes on board, 1 in the Rune Deck at turn start → how many channeled? (b) next turn,
 * 12 on board / Rune Deck 0 → does the Channel Phase do anything (Burn Out? point for P2? shuffle? draw
 * instead?) (c) Rune Deck 0: Mobilize, then Catalyst → what happens? (d) recycle one rune first (Rune
 * Deck 1) then Catalyst → how many channeled, ready/exhausted, and a draw too? (e) Rune Deck 5, Catalyst?
 *
 * Expected: (a) exactly 1, ready; no compensation. (b) channels 0 and NOTHING else — no Burn Out, no
 * point, no trash shuffle, no substitute draw. (c) Mobilize: can't channel → draws 1. Catalyst: channels
 * 0, draws exactly 1. (d) channels 1 EXHAUSTED and ALSO draws 1. (e) channels 2 exhausted, no draw. The
 * Main Deck is only ever touched by the explicit draws.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const MOBILIZE = "ogn-134-298";
const CATALYST = "ogn-138-298";
const BODY_RUNE = "ogn-126-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2. P1 has `onBoard` body runes channeled and exactly `runeDeck` runes left in the Rune Deck
 * (P2 has a normal 12-rune deck). P1: 6 energy floating, Mobilize + Catalyst in hand, a junk card in
 * trash (Burn-Out canary), 10-card main deck. One vanilla unit each so the board is not degenerate.
 */
function board(opts: { runeDeck: number; onBoard: number; active?: Seat }) {
  return scenario()
    .turn(2)
    .active(opts.active ?? P1)
    .fillDecks({ main: 10, runes: 0 })
    .runeDeck(P2, Array.from({ length: 12 }, () => BODY_RUNE))
    .runeDeck(P1, Array.from({ length: opts.runeDeck }, () => BODY_RUNE))
    .runes(P1, "body", opts.onBoard)
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "P1 Homebody" }, "p1Home")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2Home")
    .trash(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk")
    .hand(P1, MOBILIZE, "mobilize")
    .hand(P1, CATALYST, "catalyst");
}

function snapshot(game: Game) {
  return {
    deck: game.p1.deck().length,
    exhausted: game.p1.runes({ ready: false }).length,
    hand: game.p1.hand().length,
    p1Points: game.p1.points(),
    p2Points: game.p2.points(),
    ready: game.p1.runes({ ready: true }).length,
    runeDeck: game.p1.runeDeck().length,
    runes: game.p1.runes().length,
    trash: [...game.p1.trash()],
  };
}

describe("Empty Rune Deck at the Channel Phase × Mobilize / Catalyst of Aeons fallbacks", () => {
  // ── (a) Rune Deck 1 at turn start ─────────────────────────────────────────────────────────

  test("(a) 11 on board + 1 in the Rune Deck: P1's Channel Phase channels exactly that 1 rune, READY (315.3.b.1, 430.2.a) — 12 on board, Rune Deck 0, normal draw of 1, no compensation, no points", async () => {
    const game = await board({ active: P2, onBoard: 11, runeDeck: 1 }).build();
    const before = snapshot(game);
    expect(before).toMatchObject({ runeDeck: 1, runes: 11 });
    await game.advanceTurn(); // P2 ends → P1: Awaken, Beginning, Channel, Draw → main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(snapshot(game)).toEqual({
      ...before,
      deck: before.deck - 1, // Draw Phase only
      exhausted: 0,
      hand: before.hand + 1,
      ready: 12,
      runeDeck: 0,
      runes: 12,
    });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Rune Deck 0 at turn start ─────────────────────────────────────────────────────────

  test("(b) all 12 on board, Rune Deck 0: the Channel Phase channels nothing and NOTHING else happens — no Burn Out (431.1 is Main-Deck only): trash not recycled, no point for P2, exactly the one Draw-Phase card, Main Deck −1", async () => {
    const game = await board({ active: P2, onBoard: 12, runeDeck: 0 }).build();
    const before = snapshot(game);
    expect(before).toMatchObject({ runeDeck: 0, runes: 12, trash: ["junk"] });
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(snapshot(game)).toEqual({
      ...before,
      deck: before.deck - 1,
      exhausted: 0,
      hand: before.hand + 1,
      ready: 12,
      runeDeck: 0,
      runes: 12,
      trash: ["junk"],
    });
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(b) …and it stays that way turn after turn: a second empty Channel Phase is equally uneventful (score still 0–0, trash intact)", async () => {
    const game = await board({ active: P2, onBoard: 12, runeDeck: 0 }).build();
    const before = snapshot(game);
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(snapshot(game)).toMatchObject({ deck: before.deck - 2, hand: before.hand + 2, p1Points: 0, p2Points: 0, runeDeck: 0, runes: 12, trash: ["junk"] });
  });

  // ── (c) Rune Deck 0: Mobilize then Catalyst ───────────────────────────────────────────────

  test("(c) Rune Deck 0 — Mobilize: cannot channel, so its own fallback draws 1 (hand −1 +1, Main Deck −1, runes unchanged, 2 energy paid)", async () => {
    const game = await board({ onBoard: 12, runeDeck: 0 }).build();
    const before = snapshot(game);
    await game.p1.cast("mobilize");
    await game.settle();
    expect(game.zoneOf("mobilize")).toBe("trash");
    expect(game.p1.energy()).toBe(4);
    expect(snapshot(game)).toEqual({
      ...before,
      deck: before.deck - 1,
      hand: before.hand, // −Mobilize +1 drawn
      trash: expect.arrayContaining(["junk", "mobilize"]),
    });
    expect(game.p1.hand()).not.toContain("mobilize");
  });

  test("(c) Rune Deck 0 — Catalyst of Aeons: channels 0, 'couldn't channel 2' is true → draws exactly 1 (not 2); no Burn Out, no point", async () => {
    const game = await board({ onBoard: 12, runeDeck: 0 }).build();
    const before = snapshot(game);
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.zoneOf("catalyst")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    expect(snapshot(game)).toMatchObject({
      deck: before.deck - 1,
      exhausted: 0,
      hand: before.hand, // −Catalyst +1 drawn
      p1Points: 0,
      p2Points: 0,
      runeDeck: 0,
      runes: 12,
    });
  });

  test("(c) both in sequence with Rune Deck 0: Mobilize draws 1, then Catalyst draws 1 — two draws total, still 12 runes, 6 energy spent, Main Deck −2", async () => {
    const game = await board({ onBoard: 12, runeDeck: 0 }).build();
    const before = snapshot(game);
    await game.p1.cast("mobilize");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(snapshot(game)).toMatchObject({ deck: before.deck - 2, hand: before.hand, p2Points: 0, runeDeck: 0, runes: 12 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Rune Deck 1: Catalyst channels 1 exhausted AND draws 1 ────────────────────────────

  test("(d) recycle one rune first (Rune Deck 1), then Catalyst: channels that 1 rune EXHAUSTED (430.2/430.3) and, having failed to channel 2, ALSO draws 1", async () => {
    const game = await board({ onBoard: 12, runeDeck: 0 }).build();
    await game.p1.recycleRune();
    expect(game.p1.runeDeck()).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(11);
    expect(game.p1.power("body")).toBe(1);
    const before = snapshot(game);
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.zoneOf("catalyst")).toBe("trash");
    expect(snapshot(game)).toMatchObject({
      deck: before.deck - 1, // drew 1
      exhausted: 1, // the channeled rune entered exhausted
      hand: before.hand, // −Catalyst +1
      p2Points: 0,
      ready: 11,
      runeDeck: 0,
      runes: 12,
    });
  });

  // ── (e) Rune Deck 5: full channel, no draw ────────────────────────────────────────────────

  test("(e) Rune Deck 5 — Catalyst channels 2 runes exhausted; the condition is false → NO draw (hand −1, Main Deck untouched)", async () => {
    const game = await board({ onBoard: 7, runeDeck: 5 }).build();
    const before = snapshot(game);
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.zoneOf("catalyst")).toBe("trash");
    expect(snapshot(game)).toMatchObject({
      deck: before.deck, // no draw
      exhausted: 2,
      hand: before.hand - 1,
      ready: 7,
      runeDeck: 3,
      runes: 9,
    });
    expect(game.violations()).toEqual([]);
  });

  test("(e) contrast — Rune Deck 5, Mobilize: channels 1 exhausted and does NOT draw", async () => {
    const game = await board({ onBoard: 7, runeDeck: 5 }).build();
    const before = snapshot(game);
    await game.p1.cast("mobilize");
    await game.settle();
    expect(snapshot(game)).toMatchObject({ deck: before.deck, exhausted: 1, hand: before.hand - 1, ready: 7, runeDeck: 4, runes: 8 });
  });
});
