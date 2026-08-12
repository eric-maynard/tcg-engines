/**
 * Interaction: Forge of the Future (ogn-212-298) × Karma, Channeler (ogn-235-298) — on BOTH sides
 *
 *   Forge of the Future — Gear · Order · 2
 *     "When you play this, play a 1 [Might] Recruit unit token at your base. Kill this: Recycle up to 4 cards
 *      from trashes."
 *   Karma, Channeler — Champion Unit · Order · 6 + [order] · 6 Might
 *     "[Vision] … When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *
 * Rules: 416.1 / 416.1.a (Main Deck cards recycle to the Main Deck), 416.1.c (EACH PLAYER recycles to their
 * OWN deck regardless of who was instructed), 416.5 (2+ cards recycled to a Main Deck simultaneously go to the
 * bottom in a RANDOM order — no one orders them; only Rune-Deck recycles are owner-ordered, 416.5.a), 416.6
 * ("Recycle X from [zone]" does not target), 056 / 056.2 (an owned card can never enter another player's
 * non-board zone — it is redirected to its owner's), 383 (one simultaneous recycle event → one trigger;
 * cross-controller triggers are added in turn order and resolve LIFO).
 *
 * Question: P1 controls the Forge; both players control a Karma. P1 trash {A1,A2,A3}, P2 trash {B1,B2,B3},
 * decks in a known order. P1 activates "Kill this:" choosing A1, A2, B1, B2. (a) where does each card go?
 * (b) any ordering Decision? (c) whose Karma triggers, how often? (d) control: only B1,B2,B3 chosen — does
 * P1's Karma trigger? (e) is the pre-existing deck order untouched with the recycled pair at the very bottom?
 *
 * Expected: (a) A1,A2 → bottom of P1's deck; B1,B2 → bottom of P2's deck (416.1.c / 056.2); trashes become
 * {A3, Forge} and {B3}. (b) no ordering prompt for anyone (416.5 random) — assert the bottom pair as a SET.
 * (c) P2 is the recycler of B1/B2 → P2's Karma triggers exactly once; P1's Karma triggers exactly once for
 * A1+A2; each buffs a unit friendly to ITS controller. (d) P1 recycled nothing → P1's Karma silent; P2's
 * fires. (e) yes: D1..D3 / E1..E3 still on top in order, the recycled pair last; recycle never shuffles.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const KARMA = "ogn-235-298";
const SKULKER = "ogn-175-298";
const JUNK = (n: string) => ({ cardType: "unit", energyCost: 2, might: 2, name: `Junk ${n}` }) as const;

/**
 * P1's turn. P1: Forge + Karma + Ally 1 in base, trash {a1,a2,a3}, deck exactly [d1,d2,d3].
 * P2: Karma + Ally 2 in base, trash {b1,b2,b3}, deck exactly [e1,e2,e3]. No filler cards.
 */
function board() {
  return scenario()
    .fillDecks({ main: 3, runes: 12 })
    .gear(P1, FORGE, "forge")
    .unit(P1, "base", KARMA, "karma1")
    .unit(P1, "base", { might: 2, name: "Ally 1" }, "ally1")
    .unit(P2, "base", KARMA, "karma2")
    .unit(P2, "base", { might: 2, name: "Ally 2" }, "ally2")
    .trash(P1, JUNK("A1"), "a1")
    .trash(P1, JUNK("A2"), "a2")
    .trash(P1, JUNK("A3"), "a3")
    .trash(P2, JUNK("B1"), "b1")
    .trash(P2, JUNK("B2"), "b2")
    .trash(P2, JUNK("B3"), "b3")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
    .deck(P2, [SKULKER, SKULKER, SKULKER], ["e1", "e2", "e3"]);
}

/**
 * Activate "Kill this:", P1 names `picks` from the trashes at FINALIZATION, then both players pass so the
 * ability resolves off that locked set.
 *
 * MIGRATED 2026-08-12 (DESIGN.md § "Choices and when they are made"): the set used to be named after both
 * reaction windows closed. A trash is a PUBLIC zone (355.10.a.1), so "Recycle up to 4 cards from trashes" is
 * an ordinary variable-count target set chosen in Make Relevant Choices (355.5 / 355.13 / 402.2) and locked
 * there (355.15). riftjudge `2f2fb3a61bb3446a` says resolution and is superseded — do not flip this back.
 */
async function recycle(picks: readonly string[]): Promise<Game> {
  const game = await board().build();
  expect(game.p1.deck()).toEqual(["d1", "d2", "d3"]);
  expect(game.p2.deck()).toEqual(["e1", "e2", "e3"]);
  await game.p1.activate("forge");
  expect(game.zoneOf("forge")).toBe("trash"); // the cost, paid in step 4 — after the step-2 choices (357.2)
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", max: 4, min: 0, seat: P1, timing: "FIN" });
  await game.p1.pick(...picks);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

interface Drained {
  /** Every non-action decision kind seen while draining (order / deck-arrange would be an ordering prompt). */
  readonly kinds: string[];
  /** Karma chain items observed, as "cardId:controller". */
  readonly karmaItems: Set<string>;
  /** Seats that were asked to choose a buff recipient. */
  readonly buffPickers: string[];
}

/** Resolve everything after the recycle: each seat buffs its own Ally when asked; everyone passes priority. */
async function drain(game: Game): Promise<Drained> {
  const kinds: string[] = [];
  const karmaItems = new Set<string>();
  const buffPickers: string[] = [];
  for (let i = 0; i < 24; i++) {
    for (const c of game.chain()) {
      if (c.cardId === "karma1" || c.cardId === "karma2") {
        karmaItems.add(`${c.id}:${c.cardId}:${c.controller}`);
      }
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    kinds.push(d.kind);
    if (d.kind === "order") {
      await game.seat(d.seat).order([]);
      continue;
    }
    if (d.kind === "pick") {
      const offered = d.options.map((o) => o.card ?? o.key);
      const mine = d.seat === P1 ? "ally1" : "ally2";
      buffPickers.push(d.seat);
      await game.seat(d.seat).pick(offered.includes(mine) ? mine : (offered[0] as string));
      continue;
    }
    break;
  }
  return { buffPickers, karmaItems, kinds };
}

describe("Forge of the Future recycles from both trashes — owner's decks, no ordering, each owner's Karma triggers", () => {
  // MIGRATED 2026-08-12: this facet used to assert the offer AFTER both passes, with the dead Forge on the
  // menu. 355.10.a.1 (a trash is Public) + 402.2 put the set in Make Relevant Choices, and 357.2 pays the
  // "Kill this" cost in step 4 — AFTER those choices — so the Forge can never be one of its own targets.
  // Do not flip this back.
  test("cost & offer: the Forge dies as the COST, the recycle waits on the chain, and at FINALIZATION P1 may pick 0–4 cards from EITHER trash (never the Forge itself)", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forge", controller: P1, triggered: false })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 4, min: 0, seat: P1, timing: "FIN" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
    // …and only then does anyone hold priority.
    await game.p1.decline();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // ── (a) destination = OWNER's deck ─────────────────────────────────────────────────────────

  test("(a) A1,A2 go into P1's Main Deck and B1,B2 into P2's — never the activator's (416.1.c, 056.2); trashes become {A3, Forge} and {B3}", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    await drain(game);
    expect(game.zoneOf("a1")).toBe("mainDeck");
    expect(game.zoneOf("a2")).toBe("mainDeck");
    expect(game.zoneOf("b1")).toBe("mainDeck");
    expect(game.zoneOf("b2")).toBe("mainDeck");
    expect(game.p1.deck()).toHaveLength(5);
    expect(game.p2.deck()).toHaveLength(5);
    expect(game.p1.deck()).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(game.p1.deck()).not.toContain("b1");
    expect(game.p1.deck()).not.toContain("b2");
    expect(game.p2.deck()).toEqual(expect.arrayContaining(["b1", "b2"]));
    expect(game.p1.trash().toSorted()).toEqual(["a3", "forge"]);
    expect(game.p2.trash()).toEqual(["b3"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) no ordering decision ───────────────────────────────────────────────────────────────

  test("(b) nobody is asked to ORDER the recycled pair (416.5: random to the bottom) — no order/deck-arrange prompt for either seat", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    const { kinds } = await drain(game);
    expect(kinds).not.toContain("order");
    expect(kinds).not.toContain("deck-arrange");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (e) deck order ─────────────────────────────────────────────────────────────────────────

  test("(e) the pre-existing order is untouched on top and the recycled pair sits at the very bottom (as a set): P1 = d1,d2,d3,{a1,a2}; P2 = e1,e2,e3,{b1,b2} — recycle never shuffles", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    await drain(game);
    const p1 = game.p1.deck();
    expect(p1.slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(p1.slice(3).toSorted()).toEqual(["a1", "a2"]);
    const p2 = game.p2.deck();
    expect(p2.slice(0, 3)).toEqual(["e1", "e2", "e3"]);
    expect(p2.slice(3).toSorted()).toEqual(["b1", "b2"]);
  });

  // ── (c) whose Karma triggers ───────────────────────────────────────────────────────────────

  test("(c) P1's Karma triggers exactly ONCE for A1+A2 (one simultaneous recycle = one trigger, not per card): one karma1 item, P1 picks among P1's units only, Ally 1 is buffed to 3", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    // The trigger is finalized right away: P1 is asked for ITS friendly recipient.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma1" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["ally1", "karma1"]); // never P2's units
    const { karmaItems, buffPickers } = await drain(game);
    expect([...karmaItems].filter((k) => k.includes(":karma1:"))).toHaveLength(1);
    expect(buffPickers.filter((s) => s === P1)).toHaveLength(1);
    expect(game.state("ally1")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("karma1").isBuffed).toBe(false);
  });

  // Expected (416.1.c + Karma "when YOU recycle … to YOUR Main Deck"): B1/B2 were recycled BY P2 to P2's deck,
  // so P2's Karma triggers exactly once as well — P2 is asked to buff one of P2's units (Ally 2 → 3). Both
  // triggers come from one resolution: P1's item is added first (turn order), P2's second, resolving LIFO.
  // Actual: the engine attributes the whole recycle to the activator P1 — P2's Karma never triggers, P2 is
  // never prompted and Ally 2 stays unbuffed.
  test("(c) P2's Karma should ALSO trigger once — P2 recycled B1,B2 to P2's own deck (416.1.c) — P2 buffs Ally 2; engine never fires P2's Karma", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    const { karmaItems, buffPickers } = await drain(game);
    expect([...karmaItems].filter((k) => k.includes(":karma2:") && k.endsWith(`:${P2}`))).toHaveLength(1);
    expect(buffPickers.filter((s) => s === P2)).toHaveLength(1);
    expect(game.state("ally2")).toMatchObject({ isBuffed: true, might: 3 });
    // …and P1's still fired exactly once alongside it.
    expect([...karmaItems].filter((k) => k.includes(":karma1:"))).toHaveLength(1);
    expect(game.state("ally1")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("(c) ordering — both Karma items are pending from one resolution: P1's (turn player) is added first, P2's on top, so P2's buff resolves before P1's (383, LIFO); engine only ever has P1's item", async () => {
    const game = await recycle(["a1", "a2", "b1", "b2"]);
    // Finalize whatever is asked (each seat names its own Ally) until both items sit finalized on the chain.
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.seat === P1 ? "ally1" : "ally2");
      }
    }
    expect(game.chain().map((c) => `${c.cardId}:${c.controller}`)).toEqual([`karma1:${P1}`, `karma2:${P2}`]);
    // Resolve the top item only: P2's buff lands while P1's is still waiting.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("ally2").isBuffed).toBe(true);
    expect(game.state("ally1").isBuffed).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["karma1"]);
  });

  // ── (d) control: only P2-owned cards chosen ────────────────────────────────────────────────

  test("(d) P1 picks only B1,B2,B3: all three go to the bottom of P2's deck (order on top untouched), P1's deck is untouched, and P1's Karma does NOT trigger — P1 recycled nothing to P1's deck", async () => {
    const game = await recycle(["b1", "b2", "b3"]);
    const { karmaItems, buffPickers } = await drain(game);
    expect(game.p1.deck()).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["e1", "e2", "e3"]);
    expect(game.p2.deck().slice(3).toSorted()).toEqual(["b1", "b2", "b3"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.trash().toSorted()).toEqual(["a1", "a2", "a3", "forge"]);
    expect([...karmaItems].filter((k) => k.includes(":karma1:"))).toHaveLength(0);
    expect(buffPickers).not.toContain(P1);
    expect(game.state("ally1").isBuffed).toBe(false);
    expect(game.state("karma1").isBuffed).toBe(false);
  });

  // Expected: P2 recycled three cards to P2's Main Deck → P2's Karma triggers once → Ally 2 buffed.
  // Actual: no Karma triggers at all (the recycle is credited to P1, who recycled nothing to P1's deck).
  test("(d) …while P2's Karma DOES trigger once for B1,B2,B3 entering P2's deck — P2 buffs Ally 2; engine fires nothing", async () => {
    const game = await recycle(["b1", "b2", "b3"]);
    const { karmaItems, buffPickers } = await drain(game);
    expect([...karmaItems].filter((k) => k.includes(":karma2:"))).toHaveLength(1);
    expect(buffPickers).toEqual([P2]);
    expect(game.state("ally2")).toMatchObject({ isBuffed: true, might: 3 });
  });
});
