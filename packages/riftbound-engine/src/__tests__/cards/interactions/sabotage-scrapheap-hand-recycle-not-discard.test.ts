/**
 * Interaction: Sabotage (ogn-156-298) · Spell (Action) · Body · 1 + [body]
 *     "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2   "When this is played, discarded, or killed, draw 1."
 *   × Chemtech Enforcer (ogn-003-298) · Unit · Fury · 2 · 2 Might   "[Assault 2] … When you play me, discard 1."
 *
 * Rules: 416.1 / 416.1.a (Recycle = put on the BOTTOM of the corresponding deck; Main Deck cards go to the
 * Main Deck), 416.1.c (each player recycles to their OWN deck regardless of who is instructed), 056 / 056.2
 * (a card can never enter another player's non-board zone — it goes to its owner's instead), 422.1 (Discard
 * = hand → trash; a hand → deck Recycle is a different action), 422.1.b (discard triggers execute after the
 * discard), 413.1.a (draws come off the TOP, so a bottom-recycled card is drawn last). Sabotage rulings:
 * the opponent is chosen at play; reveal + choose + recycle all happen on resolution (the hand card is not
 * a target); the pick is mandatory if a non-unit exists.
 *
 * Question: P2's hand = {Scrapheap (gear), Chemtech Enforcer (unit), X (a spell)}; P2's deck = D1..D4. P1
 * Sabotages P2 and picks Scrapheap. (a) What may P1 pick, and when? (b) Where does Scrapheap go? (c) Does
 * Scrapheap's "discarded" trigger draw? (d) Verify by drawing. (e) Contrast: P2 plays Chemtech Enforcer and
 * discards Scrapheap to its "discard 1".
 *
 * Expected: (a) only the non-units {Scrapheap, X}, never the Enforcer, not declinable, asked on RESOLUTION.
 * (b) bottom of P2's (owner's) Main Deck — not P1's deck, not any trash; P2 hand 3→2, deck 4→5. (c) No —
 * a recycle is not a discard; P2 draws nothing. (d) P2's next draws are D1, D2, D3, D4, then Scrapheap.
 * (e) Yes — a real Discard: Scrapheap → P2's trash, its trigger fires, P2 draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const SCRAPHEAP = "ogn-182-298";
const CHEMTECH_ENFORCER = "ogn-003-298";
const CLEAVE = "ogn-004-298"; // "X" — any non-unit, non-gear card (a Fury spell)
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla unit used as known deck cards

/**
 * P1's turn. No auto-filler: P2's Main Deck is EXACTLY d1..d4 (top first) so bottom placement is provable;
 * P1 has its own small deck. P2's hand: Scrapheap, Chemtech Enforcer, Cleave. P1: Sabotage + exactly 1 + [body].
 * P2 has 2 energy for the Enforcer line.
 */
function board() {
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 2 })
    .deck(P1, [FILLER, FILLER, FILLER], ["p1d1", "p1d2", "p1d3"])
    .deck(P2, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"])
    .hand(P2, SCRAPHEAP, "scrap")
    .hand(P2, CHEMTECH_ENFORCER, "enf")
    .hand(P2, CLEAVE, "xspell")
    .hand(P1, SABOTAGE, "sab");
}

/** P1 casts Sabotage (the only opponent, P2, is implied) and both pass → it resolves and P1 faces the reveal-and-pick. */
async function sabotageResolving(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sab");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …and P1 picks `card` from P2's revealed hand; settle back to P1's open main phase. */
async function sabotaged(card: "scrap" | "xspell" = "scrap"): Promise<Game> {
  const game = await sabotageResolving();
  await game.p1.pick(card);
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

describe("(a) what P1 may pick, and when", () => {
  test("at PLAY time Sabotage asks for no card at all — no targets field naming P2's (private) hand; it costs 1 energy + [body] and sits on the chain with P1 holding priority", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "sab")).toBe(true);
    const fields = game.p1.option("cast", "sab")?.fields ?? [];
    const cardChoices = fields.filter((f) => f.kind === "card" || f.kind === "cards").flatMap((f) => (f.options ?? []).flat() as string[]);
    expect(cardChoices).not.toContain("scrap");
    expect(cardChoices).not.toContain("xspell");
    expect(cardChoices).not.toContain("enf");
    await game.p1.cast("sab");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sab", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 }); // P2 may still respond — nothing revealed or chosen yet
    expect(game.p2.hand()).toHaveLength(3);
  });

  test("on RESOLUTION P1 is shown P2's revealed hand and must pick exactly one NON-UNIT: options = {Scrapheap, X}; Chemtech Enforcer is not offered; no decline", async () => {
    const game = await sabotageResolving();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    const options = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(options).toEqual(["scrap", "xspell"]);
    expect(options).not.toContain("enf");
  });

  test("naming the unit (Chemtech Enforcer) or declining is rejected; nothing has moved yet", async () => {
    const game = await sabotageResolving();
    expect((await game.p1.try((p) => p.pick("enf"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect(game.p2.hand().sort()).toEqual(["enf", "scrap", "xspell"]);
    expect(game.p2.deck()).toEqual(["d1", "d2", "d3", "d4"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });
});

describe("(b) where the recycled Scrapheap goes", () => {
  test("to the BOTTOM of its OWNER P2's Main Deck: P2 deck = d1, d2, d3, d4, Scrapheap (4 → 5); P2 hand 3 → 2 (416.1.a, 416.1.c)", async () => {
    const game = await sabotaged("scrap");
    expect(game.zoneOf("scrap")).toBe("mainDeck");
    expect(game.state("scrap").owner).toBe(P2);
    expect(game.p2.deck()).toEqual(["d1", "d2", "d3", "d4", "scrap"]);
    expect(game.p2.hand().sort()).toEqual(["enf", "xspell"]);
  });

  test("never into P1's deck (056/056.2) and never into either trash — only Sabotage itself is in P1's trash", async () => {
    const game = await sabotaged("scrap");
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2", "p1d3"]);
    expect(game.p1.trash()).toEqual(["sab"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("picking X instead recycles X the same way and leaves Scrapheap in P2's hand", async () => {
    const game = await sabotaged("xspell");
    expect(game.p2.deck()).toEqual(["d1", "d2", "d3", "d4", "xspell"]);
    expect(game.p2.hand().sort()).toEqual(["enf", "scrap"]);
    expect(game.p2.trash()).toEqual([]);
  });
});

describe("(c) a hand-recycle is NOT a discard — Scrapheap's trigger stays silent", () => {
  test("no 'discarded' trigger: nothing goes on the chain, P2 draws nothing (hand exactly {Enforcer, X}, d1 still on top), straight back to P1's main phase (422.1 vs 416)", async () => {
    const game = await sabotageResolving();
    await game.p1.pick("scrap");
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand().sort()).toEqual(["enf", "xspell"]);
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.p2.deck()).toHaveLength(5);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) proof by drawing: bottom of the deck, no shuffle", () => {
  test("P2's next five draws come off the top in order d1, d2, d3, d4 and Scrapheap LAST (413.1.a, 416.1)", async () => {
    const game = await sabotaged("scrap");
    const drawn: string[] = [];
    for (let i = 0; i < 5; i++) {
      const before = new Set(game.p2.hand());
      await game.p2.do("drawCard", { count: 1 });
      drawn.push(...game.p2.hand().filter((c) => !before.has(c)));
    }
    expect(drawn).toEqual(["d1", "d2", "d3", "d4", "scrap"]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.zoneOf("scrap")).toBe("hand");
  });

  test("across real turns too: P2's next Draw Phase draws d1 (not Scrapheap), and Scrapheap is still the bottom card", async () => {
    const game = await sabotaged("scrap");
    await game.advanceTurn(); // → P2: channel 2, draw 1
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand()).toContain("d1");
    expect(game.p2.hand()).not.toContain("scrap");
    expect(game.p2.deck()).toEqual(["d2", "d3", "d4", "scrap"]);
  });
});

describe("(e) contrast: a real Discard of Scrapheap (Chemtech Enforcer's 'discard 1') DOES draw", () => {
  /** P2's turn; P2 plays Chemtech Enforcer (2 energy) → its play trigger resolves → P2 must discard 1. */
  async function enforcerPlayed(): Promise<Game> {
    const game = await board().active(P2).build();
    await game.p2.play("enf");
    expect(game.zoneOf("enf")).toBe("base");
    expect(game.p2.energy()).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    return game;
  }

  test("the Enforcer's 'When you play me, discard 1' asks P2 (the discarding player, 422.1.a) to choose from P2's own hand: {Scrapheap, X}", async () => {
    const game = await enforcerPlayed();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    const options = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(options).toEqual(["scrap", "xspell"]);
  });

  test("discarding Scrapheap: it goes hand → P2's TRASH (422.1), and only THEN its 'discarded' trigger goes on the chain (422.1.b)", async () => {
    const game = await enforcerPlayed();
    await game.p2.pick("scrap");
    expect(game.zoneOf("scrap")).toBe("trash");
    expect(game.p2.trash()).toEqual(["scrap"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scrap", controller: P2, triggered: true })]);
    expect(game.p2.hand()).toEqual(["xspell"]); // not drawn yet — the trigger is still on the chain
  });

  test("it resolves: P2 draws 1 (d1) — hand = {X, d1}, deck d2..d4; Scrapheap stays in P2's trash, Enforcer on the board", async () => {
    const game = await enforcerPlayed();
    await game.p2.pick("scrap");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.hand().sort()).toEqual(["d1", "xspell"]);
    expect(game.p2.deck()).toEqual(["d2", "d3", "d4"]);
    expect(game.p2.trash()).toEqual(["scrap"]);
    expect(game.zoneOf("enf")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("side by side: recycle-from-hand (Sabotage) → deck +1, hand −1, no draw, trash empty; discard (Enforcer) → trash +1 and a draw", async () => {
    const recycled = await sabotaged("scrap");
    const discarded = await enforcerPlayed();
    await discarded.p2.pick("scrap");
    await discarded.settle();
    expect({ deck: recycled.p2.deck().length, hand: recycled.p2.hand().length, scrap: recycled.zoneOf("scrap"), trash: recycled.p2.trash().length }).toEqual({
      deck: 5,
      hand: 2,
      scrap: "mainDeck",
      trash: 0,
    });
    expect({ deck: discarded.p2.deck().length, hand: discarded.p2.hand().length, scrap: discarded.zoneOf("scrap"), trash: discarded.p2.trash().length }).toEqual({
      deck: 3,
      hand: 2, // X + the drawn d1 (Enforcer left the hand for the board)
      scrap: "trash",
      trash: 1,
    });
  });
});
