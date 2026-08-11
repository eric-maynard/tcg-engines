/**
 * Interaction: Divine Judgment's per-player, per-category choices — order, privacy, and what "recycle" triggers.
 *   Divine Judgment (ogn-244-298) · Spell · Order · 7 + [order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *   × Karma, Channeler (ogn-235-298) · Champion Unit · Order · 6 + [order] · 6 Might
 *     "[Vision] … When you recycle one or more cards to your Main Deck, buff a friendly unit. (Runes aren't cards.)"
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2 — "When this is played, discarded, or killed, draw 1."
 *
 * Rules: 355.10.e (nothing targeted), 303.2.a (simultaneous choices → turn order from the Turn Player), 108.7.c /
 * 108.7.e / 128.4 (the hand is private; a card moving hand → deck stays face down), 416.1.c (each player recycles
 * to their OWN decks), 416.5 / 416.5.a (main deck: random order; rune deck: owner's order), 422.1 (discard is its
 * own action — recycling from hand is not a discard; nor is recycling a kill), 370.1.a.2, 383.3.
 *
 * Question: P1 (turn player) casts it holding Karma + two other units, one gear, 4 runes and 3 other hand cards;
 * P2 has two units, a Scrapheap + one other gear, 3 runes and exactly 2 hand cards (one a second Scrapheap).
 *   (a) who chooses first; are board picks public / hand picks private and built from the chooser's own hand?
 *   (b) P2 with exactly 2 in hand — asked at all? P1 drops 1 of 3 — what does P2 learn?
 *   (c) an unchosen Scrapheap (board: not killed; hand: not discarded) — does it draw?
 *   (d) Karma among P1's kept units: how many triggers — per card, per zone, or ONE — and do P2's recycles or
 *       recycled runes count?
 *   (e) whose decks, what order; the spell → P1's trash.
 *
 * Expected: (a) P1 first, P1's public picks visible to P2 before P2 picks; each hand pick lists only that seat's
 * hand and the other seat sees only seat/kind (+ the hand count dropping). (b) P2's hand choice is trivial → not
 * asked; P1 recycles 1 of 3 unseen. (c) recycle ≠ kill ≠ discard → no draw. (d) ONE Karma trigger for P1's single
 * "recycle the rest" event; runes add nothing; P2's recycles are P2's. (e) own decks; DJ → P1's trash.
 *
 * Engine model notes: the "choose 2 to keep" is asked the other way round — per category with more than 2, "pick
 * the card(s) to recycle" (min = max = excess) — and each seat's menu is scoped to what that seat controls/holds
 * (adjudicated RULING-CONFLICT, see rulings/divine-judgment-164749cef0cce61e.test.ts).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const KARMA = "ogn-235-298";
const SCRAPHEAP = "ogn-182-298";

const P1_RUNES = ["o1", "o2", "o3", "o4"] as const;
const P2_RUNES = ["r1", "r2", "r3"] as const;

/** The question's exact position (P1's turn, exactly Divine Judgment's cost pooled). */
function board() {
  const b = scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    // P1: Karma + two other units, one gear, 4 runes, DJ + 3 other hand cards
    .unit(P1, "bf1", KARMA, "karma")
    .unit(P1, "base", { might: 2, name: "P1 Unit B" }, "u1b")
    .unit(P1, "base", { might: 1, name: "P1 Unit C" }, "u1c")
    .gear(P1, { energyCost: 1, name: "P1 Gear" }, "g1")
    .hand(P1, DIVINE_JUDGMENT, "dj")
    .hand(P1, { energyCost: 1, might: 1, name: "Hand One" }, "h1")
    .hand(P1, { energyCost: 1, might: 1, name: "Hand Two" }, "h2")
    .hand(P1, { energyCost: 1, might: 1, name: "Hand Three" }, "h3")
    // P2: two units, Scrapheap + one other gear, 3 runes, exactly 2 hand cards (one a Scrapheap)
    .unit(P2, "base", { might: 2, name: "P2 Unit A" }, "u2a")
    .unit(P2, "base", { might: 2, name: "P2 Unit B" }, "u2b")
    .gear(P2, SCRAPHEAP, "scrapBoard")
    .gear(P2, { energyCost: 1, name: "P2 Gear" }, "g2")
    .hand(P2, SCRAPHEAP, "scrapHand")
    .hand(P2, { energyCost: 1, might: 1, name: "P2 Hand Two" }, "p2h2");
  for (const id of P1_RUNES) {
    b.rune(P1, "order", { alias: id, exhausted: true });
  }
  for (const id of P2_RUNES) {
    b.rune(P2, "chaos", { alias: id });
  }
  return b;
}

type DjPrompt = { seat: string; options: string[]; min: number; max: number };

/** Is the current decision one of Divine Judgment's own resolution picks? */
function djPick(game: Game): (Decision & { kind: "pick" }) | undefined {
  const d = game.decision();
  return d?.kind === "pick" && d.source?.cardId === "dj" ? d : undefined;
}

/** Cast Divine Judgment, both pass → it starts resolving; returns at its first prompt. */
async function castAndResolve(b = board()): Promise<Game> {
  const game = await b.build();
  await game.p1.cast("dj");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(djPick(game)).toBeDefined();
  return game;
}

/**
 * Walk every Divine Judgment prompt, answering from `letGo` (the cards each seat gives up; first option otherwise),
 * and return the prompts in the order they were asked. Stops at the first non-DJ decision (Karma's FIN target etc.).
 */
async function walk(game: Game, letGo: Record<string, readonly string[]>): Promise<DjPrompt[]> {
  const prompts: DjPrompt[] = [];
  for (let i = 0; i < 12; i++) {
    const d = djPick(game);
    if (!d) {
      break;
    }
    const options = d.options.map((o) => (o.card ?? o.key) as string);
    prompts.push({ max: d.max, min: d.min, options, seat: d.seat });
    const want = (letGo[d.seat] ?? []).filter((w) => options.includes(w)).slice(0, d.max);
    await game.seat(d.seat).pick(...(want.length > 0 ? want : [options[0] as string]));
  }
  return prompts;
}

/** The question's line: P1 lets go of Unit C, runes o1+o2 and Hand Three; P2 lets go of rune r1. */
const LINE = { [P1]: ["u1c", "o1", "o2", "h3"], [P2]: ["r1"] } as const;

/** Answer every pending Karma finalization target prompt with `target`. Returns how many were asked. */
async function answerKarma(game: Game, target: string): Promise<number> {
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.source?.cardId !== "karma") {
      break;
    }
    expect(d).toMatchObject({ seat: P1, timing: "FIN" });
    await game.p1.pick(target);
    n++;
  }
  return n;
}

describe("(a) order and visibility of the choices", () => {
  test("nothing is targeted at cast time (355.10.e): the cast has a single variant with no targets field, and P1 pays 7 + [order][order]", async () => {
    const game = await board().build();
    const opt = game.p1.option("cast", "dj");
    expect(opt?.variants).toHaveLength(1);
    expect(opt?.fields.find((f) => f.name === "targets")).toBeUndefined();
    await game.p1.cast("dj");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj", controller: P1, triggered: false })]);
  });

  test("the Turn Player chooses FIRST (303.2.a): the first resolution prompt is P1's, over P1's OWN units only, asking for the 3 − 2 = 1 unit to recycle", async () => {
    const game = await castAndResolve();
    const d = djPick(game)!;
    expect(d).toMatchObject({ max: 1, min: 1, seat: P1, timing: "RES" });
    // RULING-CONFLICT: riftjudge (Divine Judgment rulings 164749ce… / b4a8fb99…) lets a player name ANY controller's
    // permanents; the engine scopes each seat's menu to what it controls (abilities/effects/recycle.ts collectCategory)
    // — adjudicated in rulings/divine-judgment-164749cef0cce61e.test.ts. Engine behaviour asserted.
    expect(d.options.map((o) => o.card).sort()).toEqual(["karma", "u1b", "u1c"]);
  });

  test("categories at or under quota ask nothing: P1's single gear, P2's 2 units / 2 gear / 2 hand cards never produce a prompt; the full prompt list is P1 units(1), P1 runes(2), P1 hand(1), P2 runes(1)", async () => {
    const game = await castAndResolve();
    const prompts = await walk(game, LINE);
    expect(prompts.map((p) => `${p.seat}:${p.max}`)).toEqual([`${P1}:1`, `${P1}:2`, `${P1}:1`, `${P2}:1`]);
    expect(prompts[1]?.options.sort()).toEqual([...P1_RUNES]);
    expect(prompts[3]?.options.sort()).toEqual([...P2_RUNES]);
    expect(prompts.some((p) => p.options.includes("g1") || p.options.includes("g2") || p.options.includes("scrapBoard"))).toBe(false);
    expect(prompts.some((p) => p.options.includes("u2a"))).toBe(false);
  });

  // Expected: "Each player chooses …" is one instruction per player, sequenced by turn order (303.2.a) — P1 makes ALL
  // of its choices (units, runes, hand) and only then does P2 choose. Actual: the engine walks category by category
  // (units → gear → runes → hand) asking each player in turn inside a category, so P1's hand pick comes AFTER P2's
  // rune pick.
  test("P1 completes every one of its choices (incl. the hand pick) before P2 is asked anything (303.2.a)", async () => {
    const game = await castAndResolve();
    const prompts = await walk(game, LINE);
    const lastP1 = prompts.map((p) => p.seat).lastIndexOf(P1);
    const firstP2 = prompts.map((p) => p.seat).indexOf(P2);
    expect(firstP2).toBeGreaterThan(lastP1);
  });

  test("P1's board choices are PUBLIC and already applied when P2 chooses: at P2's rune prompt Unit C is in P1's deck, o1/o2 in P1's rune deck, and P2's own view shows it", async () => {
    const game = await castAndResolve();
    await game.p1.pick("u1c");
    await game.p1.pick("o1", "o2");
    await game.p1.pick("h3");
    expect(djPick(game)).toMatchObject({ seat: P2 });
    expect(game.zoneOf("u1c")).toBe("mainDeck");
    expect([game.zoneOf("o1"), game.zoneOf("o2")]).toEqual(["runeDeck", "runeDeck"]);
    const p2view = game.p2.view();
    const p1Board = [...(p2view.zones.base ?? []), ...(p2view.zones["battlefield-bf1"] ?? [])]
      .filter((c) => "id" in c && c.owner === P1)
      .map((c) => ("id" in c ? c.id : "?"))
      .sort();
    expect(p1Board).toEqual(["g1", "karma", "u1b"]);
  });

  test("the HAND pick is built from the chooser's own hand only (answerable from P1's redacted view) and P2 sees only seat/kind/prompt of it — never the options (108.7.c, 128.4)", async () => {
    const game = await castAndResolve();
    await game.p1.pick("u1c");
    await game.p1.pick("o1", "o2");
    const d = djPick(game)!;
    expect(d).toMatchObject({ max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["h1", "h2", "h3"]);
    // P1's own view carries the full decision; P2's view is a summary without options.
    expect(game.p1.view().decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.p1.view().decision as { options?: unknown[] }).options).toHaveLength(3);
    const seen = game.p2.view().decision as Record<string, unknown>;
    expect(seen).toMatchObject({ kind: "pick", seat: P1 });
    expect(seen.options).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain("h1");
  });
});

describe("(b) hand counts: P2 trivially keeps both; P1 drops one unseen", () => {
  test("P2 (exactly 2 in hand) is never asked about its hand and nothing leaves it", async () => {
    const game = await castAndResolve();
    const prompts = await walk(game, LINE);
    expect(prompts.filter((p) => p.seat === P2 && p.options.includes("scrapHand"))).toEqual([]);
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.p2.hand().sort()).toEqual(["p2h2", "scrapHand"]);
  });

  test("P1 must let exactly 1 of its 3 go; P2 learns only that P1's hand went 3 → 2 and P1's deck grew by one face-down card (108.7.e) — the identity stays hidden in P2's view", async () => {
    const game = await castAndResolve();
    await game.p1.pick("u1c");
    await game.p1.pick("o1", "o2");
    const before = game.p2.listZones({ all: true });
    expect(before.find((z) => z.zone === "hand" && z.owner === P1)).toMatchObject({ count: 3, visible: false });
    const deckBefore = before.find((z) => z.zone === "mainDeck" && z.owner === P1)!.count;
    await game.p1.pick("h3");
    const after = game.p2.listZones({ all: true });
    expect(after.find((z) => z.zone === "hand" && z.owner === P1)).toMatchObject({ count: 2, visible: false });
    expect(after.find((z) => z.zone === "mainDeck" && z.owner === P1)!.count).toBe(deckBefore + 1);
    const p1DeckSeenByP2 = (game.p2.view().zones.mainDeck ?? []).filter((c) => c.owner === P1);
    expect(p1DeckSeenByP2.every((c) => "hidden" in c && c.hidden === true)).toBe(true);
    expect(JSON.stringify(game.p2.view().zones)).not.toContain("\"h3\"");
    // omniscient check: it really is h3 at the bottom of P1's deck, h1/h2 kept
    expect(game.zoneOf("h3")).toBe("mainDeck");
    expect(game.p1.hand().sort()).toEqual(["h1", "h2"]);
  });
});

describe("(c) recycling is neither Kill nor Discard — Scrapheap never draws", () => {
  test("on the question's board neither of P2's Scrapheaps can even be let go (2 gear, 2 hand cards → no choice): both stay put, P2 draws nothing", async () => {
    const game = await castAndResolve();
    await walk(game, LINE);
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.zoneOf("scrapBoard")).toBe("base");
    expect(game.zoneOf("scrapHand")).toBe("hand");
    expect(game.p2.hand()).toHaveLength(2);
  });

  test("variant with a third P2 gear and a third P2 hand card: P2 lets BOTH Scrapheaps go → board one recycled (not killed), hand one recycled (not discarded) → NO draw from either (416 vs 422.1); both on the bottom of P2's own deck", async () => {
    const b = board().gear(P2, { energyCost: 1, name: "P2 Gear Three" }, "g3").hand(P2, { energyCost: 1, might: 1, name: "P2 Hand Three" }, "p2h3");
    const game = await castAndResolve(b);
    const prompts = await walk(game, { ...LINE, [P2]: ["r1", "scrapBoard", "scrapHand"] });
    expect(prompts.filter((p) => p.seat === P2).map((p) => p.options.sort())).toEqual([
      ["g2", "g3", "scrapBoard"],
      [...P2_RUNES],
      ["p2h2", "p2h3", "scrapHand"],
    ]);
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.zoneOf("scrapBoard")).toBe("mainDeck");
    expect(game.zoneOf("scrapHand")).toBe("mainDeck");
    expect(game.p2.hand().sort()).toEqual(["p2h2", "p2h3"]); // 3 − 1 recycled, +0 drawn
    expect(game.p2.deck().slice(-2).sort()).toEqual(["scrapBoard", "scrapHand"]);
    expect(game.chain()).toEqual([]);
  });
});

describe("(d) Karma, Channeler: how many 'when you recycle one or more cards to your Main Deck' triggers?", () => {
  test("Karma's trigger(s) are finalized only AFTER Divine Judgment has finished every player's choices: the first Karma target prompt (FIN, P1, friendly units Karma/Unit B) follows P1's last DJ pick", async () => {
    const game = await castAndResolve();
    const prompts = await walk(game, LINE);
    expect(prompts).toHaveLength(4);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma", pendingChoiceType: "choose-target" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["karma", "u1b"]);
  });

  // Expected: "Recycle the rest" is ONE instruction → P1's unchosen unit and hand card hit the Main Deck in one
  // simultaneous event → "one or more cards" triggers exactly ONCE; the two runes go to the RUNE deck and are not
  // cards at all (Karma's own reminder text). Actual: the engine fires Karma once per recycled category — unit,
  // runes AND hand — putting three Karma items on the chain.
  test("exactly ONE Karma trigger for P1's whole recycle (unit + hand card together; runes aren't cards) → one buff prompt, one chain item", async () => {
    const game = await castAndResolve();
    await walk(game, LINE);
    const asked = await answerKarma(game, "karma");
    expect(asked).toBe(1);
    expect(game.chain().filter((c) => c.cardId === "karma")).toHaveLength(1);
  });

  // Expected: runes recycled to the Rune Deck are not "cards to your Main Deck" → no Karma trigger at all.
  // Actual: a rune-only recycle still fires Karma once.
  test("recycling ONLY runes (P1 at quota everywhere else) does not trigger Karma at all (416.1.b; 'Runes aren't cards')", async () => {
    const b = scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARMA, "karma")
      .hand(P1, DIVINE_JUDGMENT, "dj");
    for (const id of P1_RUNES) {
      b.rune(P1, "order", { alias: id, exhausted: true });
    }
    const game = await castAndResolve(b);
    await game.p1.pick("o1", "o2");
    expect(game.chain().some((c) => c.cardId === "karma")).toBe(false);
    expect(game.decision()?.source?.cardId).not.toBe("karma");
    await game.settle();
    expect(game.state("karma").isBuffed).toBe(false);
  });

  test("control: a unit-only recycle by P1 triggers Karma exactly once and the buff lands on the chosen friendly unit", async () => {
    const b = scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARMA, "karma")
      .unit(P1, "base", { might: 2, name: "P1 Unit B" }, "u1b")
      .unit(P1, "base", { might: 1, name: "P1 Unit C" }, "u1c")
      .hand(P1, DIVINE_JUDGMENT, "dj");
    const game = await castAndResolve(b);
    await game.p1.pick("u1c");
    expect(await answerKarma(game, "u1b")).toBe(1);
    expect(game.chain().filter((c) => c.cardId === "karma")).toHaveLength(1);
    await game.settle();
    expect(game.state("u1b")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("karma").isBuffed).toBe(false);
  });

  test("P2's recycles are performed by P2 to P2's decks (416.1.c) and are NOT 'you recycle' for P1's Karma: a board where only P2 has excess produces zero Karma triggers", async () => {
    const b = scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARMA, "karma")
      .unit(P2, "base", { might: 1, name: "P2 U1" }, "x1")
      .unit(P2, "base", { might: 1, name: "P2 U2" }, "x2")
      .unit(P2, "base", { might: 1, name: "P2 U3" }, "x3")
      .hand(P1, DIVINE_JUDGMENT, "dj");
    for (const id of P2_RUNES) {
      b.rune(P2, "chaos", { alias: id });
    }
    const game = await castAndResolve(b);
    const prompts = await walk(game, { [P2]: ["x3", "r1"] });
    expect(prompts.every((p) => p.seat === P2)).toBe(true);
    expect(game.chain().some((c) => c.cardId === "karma")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.zoneOf("x3")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("x3");
  });

  test("whatever the trigger count, the line ends with Karma buffed (+1 → 7), Unit B kept, and P1's chain empty", async () => {
    const game = await castAndResolve();
    await walk(game, LINE);
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.state("karma")).toMatchObject({ isBuffed: true, might: 7, location: "bf1" });
    expect(game.p1.units().sort()).toEqual(["karma", "u1b"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(e) where everything goes", () => {
  test("each player recycles to their OWN decks regardless of who cast it (416.1.c): Unit C + Hand Three → bottom of P1's main deck, o1/o2 → bottom of P1's rune deck, r1 → bottom of P2's rune deck; kept cards untouched; Divine Judgment → P1's trash", async () => {
    const game = await castAndResolve();
    await walk(game, LINE);
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.p1.deck().slice(-2).sort()).toEqual(["h3", "u1c"]); // together at the bottom (416.5: random order among them)
    expect(game.p1.runeDeck().slice(-2).sort()).toEqual(["o1", "o2"]);
    expect(game.p2.runeDeck().at(-1)).toBe("r1");
    expect(game.p2.deck().some((c) => ["u1c", "h3"].includes(c))).toBe(false);
    expect(game.p1.runes().sort()).toEqual(["o3", "o4"]);
    expect(game.p2.runes().sort()).toEqual(["r2", "r3"]);
    expect(game.p1.gear()).toEqual(["g1"]);
    expect(game.p2.gear().sort()).toEqual(["g2", "scrapBoard"]);
    expect(game.p2.units().sort()).toEqual(["u2a", "u2b"]);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.p1.trash()).toEqual(["dj"]);
  });

  test("a TOKEN unit let go ceases to exist instead of reaching a deck (186.1)", async () => {
    const b = scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARMA, "karma")
      .unit(P1, "base", { might: 2, name: "P1 Unit B" }, "u1b")
      .unit(P1, "base", { isToken: true, might: 1, name: "Recruit" }, "recruit")
      .hand(P1, DIVINE_JUDGMENT, "dj");
    const game = await castAndResolve(b);
    expect(game.state("recruit").isToken).toBe(true);
    const deck = game.p1.deck().length;
    await game.p1.pick("recruit");
    await answerKarma(game, "karma");
    await game.settle();
    expect(game.has("recruit")).toBe(false);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.p1.deck()).toHaveLength(deck);
  });
});
