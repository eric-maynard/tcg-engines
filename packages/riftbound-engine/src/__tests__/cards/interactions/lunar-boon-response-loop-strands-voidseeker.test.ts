/**
 * Interaction: Lunar Boon (unl-125-219) · Spell · Chaos · 3 · "[Reaction] Discard 1, then draw 2."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · "[Action] Deal 4 to a unit at a battlefield. Draw 1."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — the Void Seeker target
 *
 * Rules: 422.1 (discard = hand → trash), 359.3.e.11 ("Discard 1" with an empty hand is ignored, the draw
 * still happens), 413.4 (draw more than the deck holds → draw what you can, Burn Out, finish the draw),
 * 431.2.b–d (Burn Out: recycle trash into deck, an opponent gains 1, complete the action), 431.3 / 431.3.a
 * (trash also empty → deck stays empty → the retried draw burns out AGAIN, 1 point each time), 431.3.b
 * (post-first points unpreventable), 431.3.c / 431.3.c.1 (a post-first point reaching the Victory Score with
 * more than any opponent wins IMMEDIATELY — no Cleanup), 321 (no Cleanup while a chain item resolves),
 * 323.5 (lethal damage kills at the next Cleanup).
 *
 * Board: P2's turn, Victory 8, P1 3 – P2 2. P1's Vanguard Sergeant holds bf1. P2 casts Void Seeker at it;
 * P1 responds with Lunar Boon. P1's Main Deck is EMPTY.
 *   (a) P1 trash EMPTY, hand after casting = [X]. LIFO: Boon resolves first — discard X (trash {X}); draw 2:
 *       Burn Out #1 recycles {X}, P2 3, draw X; second draw: deck AND trash empty (Boon and Void Seeker are
 *       on the chain) → Burn Out #2 P2 4, #3 5, #4 6, #5 7, #6 8 → P2 WINS immediately. Exactly 6 Burn
 *       Outs. At game end the chain still holds [Void Seeker (unresolved), Lunar Boon (resolving)]: the
 *       Sergeant has 0 damage, P2 never drew, Boon never reached the trash; P1 hand [X], deck 0, trash 0.
 *   (b) P1 trash = {T1}: discard X → {T1, X}; draw 2 → ONE Burn Out (P2 3), draw both; Boon → trash;
 *       then Void Seeker resolves: 4 to the Sergeant (dies at the Cleanup), P2 draws 1. Game goes on.
 *   (c) hand after casting EMPTY, trash {T1, T2}: discard ignored (359.3.e.11); draw 2 → one Burn Out
 *       (P2 3), P1 draws T1 + T2; Void Seeker resolves normally.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUNAR_BOON = "unl-125-219";
const VOID_SEEKER = "ogn-024-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla stock for X / T1 / T2 / P2's deck

/**
 * P2's turn 2 (Neutral Open), Victory 8, P1 3 – P2 2. P1: Sergeant at bf1 (P1 controls it), Lunar Boon in
 * hand, exactly 3 energy, Main Deck EMPTY (no auto-fill). P2: Void Seeker in hand, exactly 3 + [fury], a
 * small real deck (its own "Draw 1" must not burn out). `hand` = P1's other hand cards, `trash` = P1's trash.
 */
function board(o: { hand: string[]; trash: string[] }) {
  let b = scenario()
    .active(P2)
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 3)
    .points(P2, 2)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sarge")
    .hand(P1, LUNAR_BOON, "boon")
    .hand(P2, VOID_SEEKER, "vs")
    .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"]);
  for (const id of o.hand) {
    b = b.hand(P1, FILLER, id);
  }
  for (const id of o.trash) {
    b = b.trash(P1, FILLER, id);
  }
  return b;
}

/** P2 casts Void Seeker at the Sergeant and passes; P1 responds with Lunar Boon → chain [vs, boon], P1 holds priority. */
async function seekerThenBoon(game: Game): Promise<void> {
  expect(game.p1.deck()).toEqual([]);
  await game.p2.cast("vs", { targets: "sarge" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("cast", "boon")).toBe(true);
  await game.p1.cast("boon");
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "boon"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

/** Both pass once → only the top item (Lunar Boon) resolves; answer the discard pick if the engine asks. */
async function resolveBoon(game: Game, discard?: string): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (!game.isOver() && d?.kind === "pick" && d.seat === P1 && discard !== undefined) {
    await game.p1.pick(discard);
  }
}

describe("Lunar Boon in response to Void Seeker — the draw-2 that burns out into an empty trash", () => {
  test("premise: on P2's turn Lunar Boon is a legal [Reaction] to Void Seeker and lands on TOP of it (LIFO); nothing has resolved yet — Sergeant undamaged, X still in hand", async () => {
    const game = await board({ hand: ["x"], trash: [] }).build();
    await seekerThenBoon(game);
    expect(game.state("sarge").damage).toBe(0);
    expect(game.p1.hand()).toEqual(["x"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("boon")).toBe("chain");
    expect(game.zoneOf("vs")).toBe("chain");
  });

  // ── (a) empty deck + empty trash + hand [X] → six Burn Outs, P2 wins mid-resolution ─────────────
  test("(a) Boon resolves first: X is discarded and drawn straight back (Burn Out #1 recycled it), then the second draw finds deck AND trash empty and burns out repeatedly — P2 2 → 8 = exactly SIX Burn Outs, P2 wins IMMEDIATELY (431.3, 431.3.c.1)", async () => {
    const game = await board({ hand: ["x"], trash: [] }).build();
    await seekerThenBoon(game);
    await resolveBoon(game, "x");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8); // 2 + 6, no overshoot
    expect(game.p1.points()).toBe(3);
    expect(game.p1.hand()).toEqual(["x"]); // discarded, recycled, drawn back
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toBeNull();
  });

  test("(a) at game end Void Seeker NEVER resolved: it is still on the chain beneath the Boon, the Sergeant has 0 damage and is alive at bf1, P2 never drew its card", async () => {
    const game = await board({ hand: ["x"], trash: [] }).build();
    const p2Hand0 = game.p2.hand().length; // Void Seeker still in hand here
    await seekerThenBoon(game);
    await resolveBoon(game, "x");
    expect(game.isOver()).toBe(true);
    expect(game.zoneOf("vs")).toBe("chain");
    expect(game.chain()[0]).toMatchObject({ cardId: "vs", controller: P2 });
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1); // cast Void Seeker, drew nothing
    expect(game.p2.deck()).toEqual(["p2d1", "p2d2", "p2d3"]);
  });

  test("(a) …and Lunar Boon itself never finished: it is NOT in P1's trash — the card is still in the chain zone (mid-resolution when the game ended) above the unresolved Void Seeker", async () => {
    const game = await board({ hand: ["x"], trash: [] }).build();
    await seekerThenBoon(game);
    await resolveBoon(game, "x");
    expect(game.isOver()).toBe(true);
    expect(game.p1.trash()).not.toContain("boon");
    expect(game.zoneOf("boon")).toBe("chain");
    // The engine pops the resolving item off its chain LIST while it executes (the card stays in the
    // chain zone); what must still be listed is the finalized, never-resolved Void Seeker beneath it.
    expect(game.chain().map((c) => c.cardId)).toContain("vs");
    expect(game.cardsAt("chain").sort()).toEqual(["boon", "vs"]);
  });

  // ── (b) one card already in the trash → exactly one Burn Out, then everything resolves ─────────
  test("(b) with T1 already in the trash: discard X → trash {T1, X}; draw 2 → ONE Burn Out (recycle both, P2 2 → 3), P1 draws T1 and X; Boon → trash; game continues", async () => {
    const game = await board({ hand: ["x"], trash: ["t1"] }).build();
    await seekerThenBoon(game);
    await resolveBoon(game, "x");
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(3);
    expect(game.p1.points()).toBe(3);
    expect(game.p1.hand().sort()).toEqual(["t1", "x"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("boon")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]); // Void Seeker still waiting
    expect(game.state("sarge").damage).toBe(0);
  });

  test("(b) then Void Seeker resolves normally: 4 damage to the 4-Might Sergeant → killed at the following Cleanup (323.5), P2 draws 1; back to P2's open main phase at 3 – 3", async () => {
    const game = await board({ hand: ["x"], trash: ["t1"] }).build();
    const p2Hand0 = game.p2.hand().length;
    await seekerThenBoon(game);
    await resolveBoon(game, "x");
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["boon", "sarge"]);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1 + 1); // cast Void Seeker, drew p2d1
    expect(game.p2.hand()).toContain("p2d1");
    expect(game.p2.points()).toBe(3);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) empty hand → discard ignored, draw still happens ───────────────────────────────────────
  test("(c) hand EMPTY after casting, trash {T1, T2}: 'Discard 1' is ignored (359.3.e.11) but 'draw 2' still happens — one Burn Out recycles both (P2 2 → 3) and P1 draws T1 + T2; Boon → trash", async () => {
    const game = await board({ hand: [], trash: ["t1", "t2"] }).build();
    await seekerThenBoon(game);
    expect(game.p1.hand()).toEqual([]);
    await resolveBoon(game);
    expect(game.decision()?.kind).toBe("action"); // no discard prompt was raised
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(3);
    expect(game.p1.hand().sort()).toEqual(["t1", "t2"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("boon")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
  });

  test("(c) Void Seeker then resolves normally as in (b): Sergeant killed, P2 draws 1, 3 – 3, P2's main phase", async () => {
    const game = await board({ hand: [], trash: ["t1", "t2"] }).build();
    await seekerThenBoon(game);
    await resolveBoon(game);
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.hand()).toContain("p2d1");
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(3);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
