/**
 * Interaction: Stacked Deck (ogn-183-298) · Action spell · Chaos · 1
 *     "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Death Mark (ven-144-166) · Spell · Fury/Chaos · 2 + [rainbow]
 *     "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. … [Flow] [1][rainbow][rainbow]"
 *
 * Question: recycle-to-bottom then Burn. P1's Main Deck top→bottom is D1 … D7, trash empty. P1 plays Stacked
 * Deck taking D2, then plays Death Mark.
 *   (a) After Stacked Deck, what are the top 3 and bottom 2 of the deck, and was P1 asked to order D1/D3?
 *   (b) Which three cards does Death Mark burn — the recycled D1/D3 or D4 D5 D6?
 *   (c) Short deck (D1..D5): which cards burn now?
 *   (d) Tiny deck (D1 D2 D3), P2 on 3 points: Stacked Deck takes D2, recycles D1/D3; Death Mark Burns 3 — walk
 *       the Burn Out: what is recycled, who gets the point, what is burned after, does the Shadow Clone still
 *       get played?
 *
 * Rules: 416.1.a (recycled Main Deck cards go to the Main Deck), 416.5 (2+ recycled simultaneously → bottom in
 * RANDOM order — no ordering choice), 440.1 (Burn takes from the TOP), 440.4 + 431.1.b (burn as many as
 * possible, Burn Out, then burn the rest), 431.2.a–d (Burn Out: recycle the whole trash into the deck,
 * randomized; an opponent gains 1 point; then complete the action), 413.1.a.
 *
 * Expected:
 *   (a) D2 → hand; D1, D3 → bottom in random order, no Decision. Deck = D4 D5 D6 D7 {D1,D3}. Stacked Deck → trash.
 *   (b) Burn = D4, D5, D6 (top). Deck = D7 {D1,D3}. Shadow Clone (0 Might token) played. Trash = {Stacked Deck,
 *       D4, D5, D6, Death Mark}.
 *   (c) Deck after Stacked Deck = D4 D5 {D1,D3}; Burn 3 = D4, D5 and whichever of D1/D3 sits higher; exactly one
 *       of D1/D3 remains as the sole deck card.
 *   (d) Deck = {D1,D3}; Burn 2 (D1, D3 → trash = {Stacked Deck, D1, D3}); Burn Out: recycle the ENTIRE trash
 *       (Death Mark is still resolving, not among them) → deck of 3, trash empty; P2 3→4; burn 1 more (the new
 *       top). Final: deck 2, trash = that card + Death Mark; Shadow Clone IS played; exactly one Burn Out.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const DEATH_MARK = "ven-144-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Distinct vanilla 1-cost units D1…Dn so every deck slot is identifiable. */
const D = (i: number) => ({ energyCost: 1, might: 1, name: `Card D${i}` });

/**
 * P1's turn, exactly 3 energy + 1 rainbow (Stacked Deck 1, Death Mark 2 + [rainbow]). P1's Main Deck is
 * exactly D1..Dn top→bottom (no filler for P1), trash empty; both spells in hand. P2 sits on 3 points.
 */
function board(n: 7 | 5 | 3, seed?: string) {
  const defs = Array.from({ length: n }, (_, i) => D(i + 1));
  const aliases = Array.from({ length: n }, (_, i) => `d${i + 1}`);
  return scenario(seed !== undefined ? { seed } : {})
    .fillDecks({ main: n, runes: 12 })
    .points(P2, 3)
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .deck(P1, defs, aliases)
    .hand(P1, STACKED_DECK, "stacked")
    .hand(P1, DEATH_MARK, "dm");
}

/** Cast Stacked Deck, let it resolve, take D2 from the three revealed cards. */
async function stackTakingD2(game: Game): Promise<void> {
  await game.p1.cast("stacked");
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d1", "d2", "d3"]);
  await game.p1.pick("d2");
}

/** …then cast Death Mark and let it resolve completely. */
async function thenDeathMark(game: Game): Promise<void> {
  await game.p1.cast("dm");
  await game.settle();
  expect(game.chain()).toEqual([]);
}

const shadowClones = (game: Game) => game.p1.units("base").filter((id) => game.state(id).name === "Shadow Clone");

describe("Stacked Deck (recycle 2 to the bottom) then Death Mark (Burn 3) — which cards burn?", () => {
  // ── (a) after Stacked Deck ─────────────────────────────────────────────────────────────────

  test("(a) Stacked Deck: D2 → hand; D1 and D3 go to the BOTTOM (416.1.a) — deck is now D4 D5 D6 D7 on top with {D1, D3} as the bottom two; Stacked Deck → trash; 1 energy spent", async () => {
    const game = await board(7).build();
    expect(game.p1.deck()).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d7"]);
    await stackTakingD2(game);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(6);
    expect(deck.slice(0, 4)).toEqual(["d4", "d5", "d6", "d7"]);
    expect([...deck.slice(4)].sort()).toEqual(["d1", "d3"]);
    expect(game.p1.hand().sort()).toEqual(["d2", "dm"]);
    expect(game.p1.trash()).toEqual(["stacked"]);
    expect(game.p1.energy()).toBe(2);
  });

  test("(a) P1 is NOT asked to order D1/D3 — after taking D2 the very next decision is P1's open main phase (416.5: simultaneous recycle = random order, no choice)", async () => {
    const game = await board(7).build();
    await stackTakingD2(game);
    const d = game.decision();
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(d?.kind).not.toBe("order");
    expect(d?.kind).not.toBe("deck-arrange");
  });

  // Expected (416.5): the two recycled cards land in a RANDOM order, so across different shuffler seeds both
  // "D1 above D3" and "D3 above D1" must occur. Actual: the reveal-and-pick "recycle the rest" always puts
  // them back in their original order (D1 then D3) regardless of seed — the order is not randomized.
  test("(a) the bottom two are in RANDOM order — over many seeds both D1-over-D3 and D3-over-D1 occur (416.5)", async () => {
    const orders = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const game = await board(7, `stacked-${i}`).build();
      await stackTakingD2(game);
      orders.add(game.p1.deck().slice(4).join(">"));
    }
    expect([...orders].sort()).toEqual(["d1>d3", "d3>d1"]);
  });

  // ── (b) Death Mark burns from the TOP ──────────────────────────────────────────────────────

  test("(b) Death Mark burns from the TOP (440.1): D4, D5, D6 go to the trash — NOT the just-recycled D1/D3; deck = D7 then {D1, D3}", async () => {
    const game = await board(7).build();
    await stackTakingD2(game);
    await thenDeathMark(game);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(3);
    expect(deck[0]).toBe("d7");
    expect([...deck.slice(1)].sort()).toEqual(["d1", "d3"]);
    expect(game.p1.trash()).toContain("d4");
    expect(game.p1.trash()).toContain("d5");
    expect(game.p1.trash()).toContain("d6");
    expect(game.p1.trash()).not.toContain("d1");
    expect(game.p1.trash()).not.toContain("d3");
    expect(game.p1.trash()).not.toContain("d7");
  });

  test("(b) then a 0-Might Shadow Clone unit TOKEN is played to P1's base; final trash = {Stacked Deck, D4, D5, D6, Death Mark}; hand = {D2}; all 3 energy + the rainbow spent; nobody scored", async () => {
    const game = await board(7).build();
    await stackTakingD2(game);
    await thenDeathMark(game);
    const clones = shadowClones(game);
    expect(clones).toHaveLength(1);
    expect(game.state(clones[0]!)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 0, zone: "base" });
    expect(game.p1.trash().sort()).toEqual(["d4", "d5", "d6", "dm", "stacked"]);
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(3); // no burn out happened
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) short deck: D1..D5 ─────────────────────────────────────────────────────────────────

  test("(c) short deck D1..D5: after Stacked Deck the deck is D4 D5 {D1, D3}; Burn 3 takes D4, D5 AND whichever recycled card sits higher — a card you just recycled CAN be burned once the burn reaches it; exactly one of D1/D3 is left as the sole deck card; no Burn Out", async () => {
    const game = await board(5).build();
    await stackTakingD2(game);
    const mid = game.p1.deck();
    expect(mid.slice(0, 2)).toEqual(["d4", "d5"]);
    expect([...mid.slice(2)].sort()).toEqual(["d1", "d3"]);
    const third = mid[2]!; // the recycled card that ended up higher
    const survivor = mid[3]!;
    await thenDeathMark(game);
    expect(game.p1.deck()).toEqual([survivor]);
    expect(game.p1.trash()).toContain("d4");
    expect(game.p1.trash()).toContain("d5");
    expect(game.p1.trash()).toContain(third);
    expect(game.p1.trash()).not.toContain(survivor);
    expect(game.p1.trash().filter((c) => c === "d1" || c === "d3")).toHaveLength(1);
    expect(game.p1.trash().sort()).toEqual(["d4", "d5", "dm", "stacked", third].sort());
    expect(shadowClones(game)).toHaveLength(1);
    expect(game.p2.points()).toBe(3);
  });

  // ── (d) tiny deck: D1 D2 D3 → Burn Out mid-burn ────────────────────────────────────────────

  test("(d) tiny deck D1 D2 D3: after Stacked Deck the hand gains D2, the deck is exactly {D1, D3} (2 cards) and the trash is {Stacked Deck}", async () => {
    const game = await board(3).build();
    await stackTakingD2(game);
    expect([...game.p1.deck()].sort()).toEqual(["d1", "d3"]);
    expect(game.p1.hand().sort()).toEqual(["d2", "dm"]);
    expect(game.p1.trash()).toEqual(["stacked"]);
  });

  test("(d) Death Mark: burn 2 (D1, D3), Burn Out — the WHOLE trash {Stacked Deck, D1, D3} is recycled into the deck (Death Mark, still resolving, is not), P2 gains exactly 1 point (3→4), then 1 more card is burned from the new top: final deck = 2 of {Stacked Deck, D1, D3}, trash = the third + Death Mark (440.4, 431.2.a–d)", async () => {
    const game = await board(3).build();
    await stackTakingD2(game);
    await thenDeathMark(game);
    const pool = ["d1", "d3", "stacked"];
    const deck = game.p1.deck();
    const trash = game.p1.trash();
    expect(deck).toHaveLength(2);
    for (const c of deck) {
      expect(pool).toContain(c);
    }
    expect(trash).toHaveLength(2);
    expect(trash).toContain("dm");
    const lastBurned = trash.find((c) => c !== "dm")!;
    expect(pool).toContain(lastBurned);
    expect([...deck, lastBurned].sort()).toEqual(pool); // the three recycled cards, split 2 / 1
    expect(game.zoneOf("dm")).toBe("trash"); // Death Mark itself was never recycled
    expect(game.p2.points()).toBe(4); // exactly ONE Burn Out
    expect(game.p1.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("(d) the rest of Death Mark still resolves after the Burn Out: the 0-Might Shadow Clone token IS played to P1's base, hand = {D2}, back to P1's open main phase", async () => {
    const game = await board(3).build();
    await stackTakingD2(game);
    await thenDeathMark(game);
    const clones = shadowClones(game);
    expect(clones).toHaveLength(1);
    expect(game.state(clones[0]!)).toMatchObject({ isToken: true, might: 0, zone: "base" });
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) the Burn Out recycle IS randomized (431.2.b): across seeds the card left in the trash after the final burn is not always the same one", async () => {
    const lastBurned = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const game = await board(3, `burnout-${i}`).build();
      await stackTakingD2(game);
      await thenDeathMark(game);
      for (const c of game.p1.trash()) {
        if (c !== "dm") {
          lastBurned.add(c);
        }
      }
      expect(game.p2.points()).toBe(4);
    }
    expect(lastBurned.size).toBeGreaterThan(1);
  });
});
