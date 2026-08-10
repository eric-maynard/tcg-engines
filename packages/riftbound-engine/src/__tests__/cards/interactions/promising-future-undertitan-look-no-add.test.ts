/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs. (They must still pay
 *      Power costs.)"
 *   × Undertitan (sfd-175-221) · Unit · Order · 6+[order] · 5 Might
 *     "When you play me, give your other units +2 [Might] this turn. As I'm revealed from your deck, [Add] [2]."
 *   (contrast prop: Void Rush sfd-188-221 · Spell · 2+[rainbow] — "REVEAL the top 2 cards of your Main Deck. You may
 *    banish one, then play it, reducing its cost by [2]. Draw any you didn't banish.")
 *
 * Rules: 303.2.a (simultaneous instructions → turn order from the turn player), 128.2.a / 128.3 / 128.4 / 128.5 +
 * 108.4.d (deck = Secret; a LOOK is private to the looker; banishment is Public), 424.2.a / 424.2.b (only an
 * instructed Reveal is a reveal — looking at / showing / moving a card to a public zone is not, and triggers no
 * "when revealed"), 416 / 416.1.c / 416.5 (recycle to your OWN deck; several cards at once go under in random order —
 * no ordering choice), 354.2 / 337.1.b (plays queued during a resolution are finalized afterwards, next player first),
 * 356.1.b.2 (only Energy is ignored; Power is paid), 143.4 (enters exhausted).
 *
 * Q: P1's turn; P1 casts Promising Future. P1's top 5 = A1..A5 (vanilla units); P2's top 5 include Undertitan.
 *   (a) Who looks first; what does P2 see of P1's pending look?
 *   (b) P1 banishes A3: public to P2 before P2 chooses? A1/A2/A4/A5 ever exposed? A recycle-order prompt? Deck
 *       order afterwards visible to P1 itself?
 *   (c) P2 looks and banishes Undertitan: does "As I'm revealed from your deck, [Add] [2]" fire? P2's other four /
 *       recycle order private?
 *   (d) Then: P2 plays Undertitan first (paying [order], 6 Energy ignored), then P1 plays A3.
 *   Contrast: Void Rush REVEALS Undertitan from P2's deck → [Add] [2].
 *
 * Expected: (a) P1 (turn player) is prompted first; P2's view carries only a summary of P1's decision (no option ids
 * or names) and the shared pendingChoice lists five anonymous placeholders; publicReveals empty. (b) A3 is in P1's
 * banishment — public — while P2's own prompt is open; A1/A2/A4/A5 never appear in P2's view; no ordering prompt
 * (416.5 random order); afterwards every card of P1's deck is redacted even in P1's own view. (c) No [Add]: P2's
 * energy stays 0 in every view; no publicReveals entry; B1/B3/B4/B5 never appear in P1's view. (d) chain = [Undertitan
 * (P2), A3 (P1)]; P2 places Undertitan (order 1 → 0, energy 0 → 0), it enters P2's side exhausted and its play
 * trigger gives P2 Holder +2; then P1 places A3 (energy stays 0). Contrast: Void Rush → P2 energy 0 → 2 on the reveal,
 * and Undertitan is on the public reveal record.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Decision, Game, Observation } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const UNDERTITAN = "sfd-175-221";
const VOID_RUSH = "sfd-188-221";
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;
const alpha = (n: number) => ({ cardType: "unit", energyCost: 4, might: 3, name: `Alpha ${n}` }) as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn, Neutral Open. P1: exactly 5 energy + [mind] for Promising Future; deck = A1..A5 (vanilla 4-cost units)
 * then A6, A7. P2: 0 energy + exactly [order] (Undertitan's pip); deck = B1, Undertitan, B3, B4, B5, B6, B7. Each
 * player holds one battlefield with a 2-Might unit (so "your other units" has a P2 recipient).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .resources(P2, { energy: 0, power: { order: 1 } })
    .battlefield("bfP1", { controller: P1 })
    .battlefield("bfP2", { controller: P2 })
    .unit(P1, "bfP1", { might: 2, name: "P1 Holder" }, "p1holder")
    .unit(P2, "bfP2", { might: 2, name: "P2 Holder" }, "p2holder")
    .deck(P1, [alpha(1), alpha(2), alpha(3), alpha(4), alpha(5), FILLER, FILLER], ["a1", "a2", "a3", "a4", "a5", "a6", "a7"])
    .deck(P2, [FILLER, UNDERTITAN, FILLER, FILLER, FILLER, FILLER, FILLER], ["b1", "titan", "b3", "b4", "b5", "b6", "b7"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const ids = (views: readonly CardView[] | undefined): string[] => (views ?? []).map((v) => (isHiddenView(v) ? "HIDDEN" : v.id));
const keysOf = (d: Decision | null): string[] => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);
const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Every card id a seat's Observation names anywhere (zones, battlefields, chain, pending prompt, reveal log). */
function everyIdIn(view: Observation): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      out.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(view.zones);
  walk(view.battlefields);
  walk(view.chain);
  walk(view.decision);
  walk(view.state.pendingChoice);
  walk(view.state.publicReveals);
  walk(view.state.activeReveals);
  return out;
}

/** Step (passes / forced answers only) until `pred` holds; asserts it does. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return game.decision();
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

/** P1 casts Promising Future; both pass; it starts resolving → P1's look/banish prompt is open. */
async function pfResolving(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

/** …P1 banished A3 → P2's look/banish prompt is open. */
async function p1BanishedA3(): Promise<Game> {
  const game = await pfResolving();
  await game.p1.pick("a3");
  await until(game, isPickFor(P2, /banish/i));
  return game;
}

/** …P2 banished Undertitan → the play pass begins (P2's destination prompt for Undertitan). */
async function bothBanished(): Promise<Game> {
  const game = await p1BanishedA3();
  await game.p2.pick("titan");
  return game;
}

describe("Promising Future × Undertitan — look ≠ reveal; who sees what, when", () => {
  // ── (a) order + privacy of P1's look ─────────────────────────────────────────────────────────────

  test("(a) the TURN PLAYER looks first: the first prompt after Promising Future starts resolving is P1's compulsory pick among exactly A1..A5 (303.2.a, 128.6: no opt-out)", async () => {
    const game = await pfResolving();
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "pf" } });
    expect(keysOf(d).sort()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(game.p2.banishment()).toEqual([]); // P2 has not looked/banished yet
    expect(game.zoneOf("titan")).toBe("mainDeck");
  });

  test("(a) while P1's look is pending, P2's view shows a decision FOR SEAT P1 with zero card identities: summary only (no options), the shared prompt lists five anonymous placeholders, and none of A1..A5 appears anywhere in P2's view (128.3/128.4, 108.4.d)", async () => {
    const game = await pfResolving();
    const v = game.p2.view();
    expect(v.decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((v.decision as { options?: unknown }).options).toBeUndefined();
    const pending = v.state.pendingChoice as { revealed?: readonly string[]; prompter?: string } | undefined;
    expect(pending?.prompter).toBe(P1);
    expect(pending?.revealed).toEqual(["hidden", "hidden", "hidden", "hidden", "hidden"]);
    const seen = everyIdIn(v);
    for (const a of ["a1", "a2", "a3", "a4", "a5"]) {
      expect(seen.has(a)).toBe(false);
    }
    expect(JSON.stringify(v)).not.toContain("Alpha ");
    // …whereas P1's own view of the same prompt names all five.
    expect((game.p1.view().state.pendingChoice as { revealed?: readonly string[] }).revealed).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });

  test("(a) a LOOK is not a reveal: nothing is on the public reveal record / active-reveal window while P1 looks (424.2.b)", async () => {
    const game = await pfResolving();
    expect(game.gameState.publicReveals ?? []).toEqual([]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    // and P2's live view of P1's deck is fully redacted (the looked-at cards are still IN the deck)
    expect(ids((game.p2.view().zones.mainDeck ?? []).filter((c) => c.owner === P1)).every((x) => x === "HIDDEN")).toBe(true);
  });

  // ── (b) P1 banishes A3 ───────────────────────────────────────────────────────────────────────────

  test("(b) A3 goes to P1's banishment — a PUBLIC zone — and P2's view names it while P2's OWN look prompt is the pending decision (128.5; 'each later player knows what the players before them chose')", async () => {
    const game = await p1BanishedA3();
    expect(game.zoneOf("a3")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["a3"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "pf" } });
    const p1BanishSeenByP2 = ids((game.p2.view().zones.banishment ?? []).filter((c) => c.owner === P1));
    expect(p1BanishSeenByP2).toEqual(["a3"]);
    const a3view = (game.p2.view().zones.banishment ?? []).find((c) => !isHiddenView(c) && c.id === "a3");
    expect(a3view && !isHiddenView(a3view) ? a3view.name : undefined).toBe("Alpha 3");
  });

  test("(b) banishing is a zone change, not a Reveal: no publicReveals / activeReveals entry for A3 (424.2.b), and nothing went on the chain for it", async () => {
    const game = await p1BanishedA3();
    expect((game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds])).not.toContain("a3");
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    expect(game.chain()).toEqual([]); // PF is mid-resolution; no play has been queued yet
  });

  test("(b) A1/A2/A4/A5 are NEVER exposed to P2 — not while P1 looked, not after the banish, not after everything resolved", async () => {
    const game = await pfResolving();
    const hidden = ["a1", "a2", "a4", "a5"];
    const check = () => {
      const seen = everyIdIn(game.p2.view());
      for (const a of hidden) {
        expect(seen.has(a)).toBe(false);
      }
    };
    check();
    await game.p1.pick("a3");
    await until(game, isPickFor(P2, /banish/i));
    check();
    await game.p2.pick("titan");
    await until(game, isPickFor(P2, /destination/i));
    check();
    await game.p2.pick("base");
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    check();
  });

  // RULING-CONFLICT: the question expects a private "order the recycled cards" prompt for P1. CR 416.5: two or more
  // cards recycled to the Main Deck simultaneously go under it in RANDOM order — no player orders them — and the
  // engine follows the CR: P1 is never asked to order A1/A2/A4/A5 (so there is trivially nothing for P2 to see).
  test("(b) the other four are recycled under P1's OWN deck with NO ordering prompt (416.1.c, 416.5 — random order): straight from P1's banish pick to P2's look; deck 10 → 5 looked → 4 back under A6.. = 9", async () => {
    const game = await pfResolving();
    expect(game.p1.deck()).toHaveLength(10); // 7 declared + auto-fill to 10
    await game.p1.pick("a3");
    // The very next decision is P2's look — P1 saw no order/deck-arrange prompt in between.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(isPickFor(P2, /banish/i)(game.decision())).toBe(true);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(9);
    expect(deck[0]).toBe("a6");
    expect(deck.slice(-4).sort()).toEqual(["a1", "a2", "a4", "a5"]);
    expect(game.p2.deck()).toContain("titan"); // P2's deck untouched so far
  });

  test("(b) after the recycle P1's deck order is SECRET again even to P1: every card of P1's main deck is redacted in P1's own view (128.3, 108.4.d) — and of course in P2's", async () => {
    const game = await pfResolving();
    // While looking, P1's view does name the top five (the look itself)…
    expect(ids((game.p1.view().zones.mainDeck ?? []).filter((c) => c.owner === P1)).slice(0, 5)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    await game.p1.pick("a3");
    const own = ids((game.p1.view().zones.mainDeck ?? []).filter((c) => c.owner === P1));
    expect(own).toHaveLength(9);
    expect(own.every((x) => x === "HIDDEN")).toBe(true);
    const theirs = ids((game.p2.view().zones.mainDeck ?? []).filter((c) => c.owner === P1));
    expect(theirs.every((x) => x === "HIDDEN")).toBe(true);
  });

  // ── (c) P2 looks and banishes Undertitan ─────────────────────────────────────────────────────────

  test("(c) P2's look: compulsory pick among exactly its own top five (B1, Undertitan, B3, B4, B5); P1's view of it is a bare summary with five anonymous placeholders", async () => {
    const game = await p1BanishedA3();
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2 });
    expect(keysOf(d).sort()).toEqual(["b1", "b3", "b4", "b5", "titan"]);
    const v = game.p1.view();
    expect(v.decision).toMatchObject({ kind: "pick", seat: P2 });
    expect((v.decision as { options?: unknown }).options).toBeUndefined();
    expect((v.state.pendingChoice as { revealed?: readonly string[] }).revealed).toEqual(["hidden", "hidden", "hidden", "hidden", "hidden"]);
    const seen = everyIdIn(v);
    for (const b of ["b1", "titan", "b3", "b4", "b5"]) {
      expect(seen.has(b)).toBe(false);
    }
    expect(JSON.stringify(v)).not.toContain("Undertitan");
  });

  test("(c) LOOK + banish is not a reveal: Undertitan's 'As I'm revealed from your deck, [Add] [2]' does NOT fire — P2's energy stays 0 in P2's view, in P1's view and in the raw state; no reveal record names it (424.2.a/b)", async () => {
    const game = await p1BanishedA3();
    expect(game.p2.energy()).toBe(0); // looking at it: nothing
    await game.p2.pick("titan");
    expect(game.zoneOf("titan")).toBe("banishment"); // banished (public) — still nothing
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.p2.view().resources[P2]).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.p1.view().resources[P2]).toEqual({ energy: 0, power: { order: 1 } });
    expect((game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds])).not.toContain("titan");
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    // Undertitan is now public by ZONE (banishment), which P1's view reflects by name.
    const p2BanishSeenByP1 = (game.p1.view().zones.banishment ?? []).filter((c) => c.owner === P2);
    expect(ids(p2BanishSeenByP1)).toEqual(["titan"]);
  });

  test("(c) P2's unpicked four are recycled under P2's own deck with no ordering prompt, never appear in P1's view, and P2's deck is fully redacted afterwards in BOTH views", async () => {
    const game = await p1BanishedA3();
    await game.p2.pick("titan");
    expect(game.decision()?.seat === P2 && game.decision()?.kind === "pick" && /destination/i.test(game.decision()?.prompt ?? "")).toBe(true); // straight on to placing Undertitan
    const deck = game.p2.deck();
    expect(deck).toHaveLength(9);
    expect(deck[0]).toBe("b6");
    expect(deck.slice(-4).sort()).toEqual(["b1", "b3", "b4", "b5"]);
    const seenByP1 = everyIdIn(game.p1.view());
    for (const b of ["b1", "b3", "b4", "b5"]) {
      expect(seenByP1.has(b)).toBe(false);
    }
    expect(ids((game.p2.view().zones.mainDeck ?? []).filter((c) => c.owner === P2)).every((x) => x === "HIDDEN")).toBe(true);
    expect(ids((game.p1.view().zones.mainDeck ?? []).filter((c) => c.owner === P2)).every((x) => x === "HIDDEN")).toBe(true);
  });

  // ── (d) the play pass: next player first ────────────────────────────────────────────────────────

  test("(d) 'starting with the next player': both plays are queued as [Undertitan (P2), A3 (P1)] and P2 is asked to place Undertitan first, among P2's base / P2's battlefield only", async () => {
    const game = await bothBanished();
    expect(game.zoneOf("pf")).toBe("trash"); // PF itself has finished
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["titan", P2],
      ["a3", P1],
    ]);
    const d = (await until(game, isPickFor(P2, /destination/i))) as Pick;
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP2"]);
    expect(game.zoneOf("a3")).toBe("banishment"); // A3 waits its turn
  });

  test("(d) P2 must still pay Undertitan's [order] (Energy 6 ignored): order 1 → 0, energy 0 → 0; it enters P2's base exhausted under P2's control; its play trigger then gives P2 Holder +2 (not P1's unit, not itself)", async () => {
    const game = await bothBanished();
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    expect(game.zoneOf("titan")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("titan")).toMatchObject({ controller: P2, isExhausted: true, might: 5, owner: P2, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.state("p2holder").might).toBe(4);
    expect(game.state("p1holder").might).toBe(2);
    expect(game.state("titan").might).toBe(5);
  });

  test("(d) contrast: with NO [order] in P2's pool Undertitan's play fails — it stays in P2's banishment and P2 is never asked to place it; A3 still plays for P1", async () => {
    const game = await board().resources(P2, { energy: 0, power: { order: 0 } }).build();
    await game.p1.cast("pf");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("a3");
    await until(game, isPickFor(P2, /banish/i));
    await game.p2.pick("titan");
    let p2Asked = false;
    await until(game, (d) => {
      p2Asked ||= d?.seat === P2 && d.kind !== "action";
      return isPickFor(P1, /destination/i)(d);
    });
    expect(p2Asked).toBe(false);
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.zoneOf("titan")).toBe("banishment");
    expect(game.zoneOf("a3")).toBe("base");
    expect(game.p2.energy()).toBe(0);
  });

  test("(d) then P1 places A3: P1's base / P1's battlefield only, 4 Energy ignored (P1 stays at 0), enters exhausted; end state — chain empty, both banishments empty, PF in trash, P1's open main phase, no invariant violations", async () => {
    const game = await bothBanished();
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    const d = (await until(game, isPickFor(P1, /destination/i))) as Pick;
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP1"]);
    await game.p1.pick("base");
    expect(game.zoneOf("a3")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("a3")).toMatchObject({ controller: P1, isExhausted: true, might: 3, owner: P1 });
    await until(game, isOpenMain);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
    expect(game.p2.energy()).toBe(0); // never any [Add] anywhere along the way
    expect(game.violations()).toEqual([]);
  });

  // ── contrast: an actual REVEAL from P2's deck ────────────────────────────────────────────────────

  test("contrast: Void Rush REVEALS Undertitan from P2's deck → [Add] [2] fires on the spot (P2 energy 0 → 2), the card is on the public reveal record and P1's view names it while the window is open", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { rainbow: 1 } })
      .deck(P2, [UNDERTITAN, FILLER, FILLER], ["titan", "b2", "b3"])
      .hand(P2, VOID_RUSH, "vr")
      .build();
    await game.p2.cast("vr");
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(game.p2.energy()).toBe(2);
    expect(game.p1.view().resources[P2]?.energy).toBe(2);
    expect((game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds])).toContain("titan");
    expect(ids((game.p1.view().zones.mainDeck ?? []).filter((c) => c.owner === P2)).slice(0, 2)).toEqual(["titan", "b2"]);
  });
});
