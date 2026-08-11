/**
 * Interaction: "discard N, then draw N" with fewer than N cards in hand, watched by a discard payoff.
 *   × Doran's Ring (sfd-124-221) · Equipment · Chaos · 1 · +1 [Might]
 *       Effect text: "When I conquer, discard 1, then draw 1."         — attached to a unit that conquers
 *   × Scrapyard Champion (ogn-020-298) · Unit · Fury · 5 + [fury] · 5 Might
 *       "[Legion] — When you play me, discard 2, then draw 2."
 *   × Jinx, Rebel (ogn-202-298) · Unit · Chaos · 5 · Champion, 5 Might
 *       "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Question — for each of (a) Ring's bearer conquers with an EMPTY hand, (b) with exactly one card,
 * (c) Scrapyard with Legion active and an empty hand after paying, (d) with one other card: is the
 * discard ignored or does it fail the whole ability, does the draw still happen, and does Jinx ready
 * and grow?
 *
 * Expected — a discard-as-effect must be performed as much as possible and the remainder ignored
 * (422.4). It is never converted into a substitute: no random deck mill, no skipped draw, no ability
 * fizzle.
 *  (a) Empty hand: the entire discard instruction is ignored, the ability still resolves and P1 still
 *      DRAWS 1 (359.3.e.11 — the discard-then-draw example is literally this). Jinx does NOT trigger:
 *      zero cards were discarded, so "when you discard one or more cards" never happened; she stays
 *      exhausted with no +1 [Might]. The drawn card arrives after the discard step, so it cannot
 *      retroactively be discarded.
 *  (b) One card: discard it, then draw 1; Jinx triggers exactly once and readies with +1 [Might].
 *  (c) Scrapyard with an empty hand after paying its cost: the whole "discard 2" is ignored, P1 still
 *      draws 2, Jinx silent — the Legion ability still counted as triggered and resolved (359.3.e.10).
 *  (d) One card: discard that one, the second discard is ignored (422.4's Undercover Agent example),
 *      then draw 2; Jinx triggers ONCE ("one or more"), not twice.
 * In every branch the play/conquer itself is unaffected and no card leaves any other zone.
 *
 * Rules: 422.1, 422.1.b, 422.4, 359.3.e.10, 359.3.e.11, 383.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const DORANS_RING = "sfd-124-221";
const SCRAPYARD_CHAMPION = "ogn-020-298";
const JINX_REBEL = "ogn-202-298";
/** A vanilla 1-cost gear: something to hold in hand as discard fodder, and a card play that switches Legion on. */
const TRINKET = { cardType: "gear", energyCost: 1, name: "Test Trinket", rulesText: "Vanilla gear." };

/** Pass priority / take forced picks until P1's open main phase is back. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.card ?? d.options[0]!.key);
    } else {
      return;
    }
  }
}

// ───────────────────────────── Doran's Ring: conquer with 0 / 1 cards in hand ─────────────────

/** P1's turn. Bearer + an EXHAUSTED Jinx in base, the Ring loose in base, bf1 neutral and empty. */
function ringBoard(handSize: number) {
  const b = scenario()
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer")
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .gear(P1, DORANS_RING, "ring");
  for (let i = 0; i < handSize; i++) {
    b.hand(P1, TRINKET, `card${i}`);
  }
  return b;
}

/** Equip the Ring to Bearer, then walk Bearer onto the empty neutral bf1 → it conquers. */
async function conquerWithRing(handSize: number): Promise<{ deckBefore: number; game: Game }> {
  const game = await ringBoard(handSize).build();
  await game.p1.do("equipCard", { equipmentId: "ring", unitId: "bearer" });
  await game.settle();
  expect(game.state("ring").attachedTo).toBe("bearer");
  expect(game.state("bearer").might).toBe(4); // +1 from the Ring
  expect(game.p1.hand()).toHaveLength(handSize);
  const deckBefore = game.p1.deck().length;
  await game.p1.move("bearer", "bf1");
  return { deckBefore, game };
}

describe("Doran's Ring 'discard 1, then draw 1' on conquer — 0 vs 1 cards in hand", () => {
  test("(a) EMPTY hand: 422.4 / 359.3.e.11 — the discard instruction is ignored, the trigger still resolves, and P1 still DRAWS 1; nothing is milled and the trash stays empty", async () => {
    const { deckBefore, game } = await conquerWithRing(0);
    await drain(game);
    expect(game.p1.trash()).toEqual([]); // no substitute discard, no mill
    expect(game.p1.deck()).toHaveLength(deckBefore - 1); // the draw happened
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the conquer itself is untouched: P1 takes bf1 and scores, Bearer is there with the Ring still attached", async () => {
    const { game } = await conquerWithRing(0);
    await drain(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("bearer")).toBe("bf1");
    expect(game.state("ring").attachedTo).toBe("bearer");
  });

  test("(a) Jinx, Rebel does NOT trigger — ZERO cards were discarded, so 'when you discard one or more cards' never happened: she stays exhausted at 5 [Might] and no Jinx item ever reaches the chain", async () => {
    const { game } = await conquerWithRing(0);
    for (let i = 0; i < 12; i++) {
      expect(game.chain().filter((c) => c.cardId === "jinx")).toEqual([]);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.card ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, isReady: false, might: 5 });
  });

  test("(b) ONE card: it is discarded and then 1 is drawn — hand size is back to 1, the discarded card is in the trash, and the freshly drawn card is NOT it (the draw happens after the discard step)", async () => {
    const { deckBefore, game } = await conquerWithRing(1);
    await drain(game);
    expect(game.zoneOf("card0")).toBe("trash");
    expect(game.p1.trash()).toEqual(["card0"]);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.hand()).not.toContain("card0");
    expect(game.violations()).toEqual([]);
  });

  test("(b) Jinx triggers exactly ONCE: she readies and gains +1 [Might] this turn (5 → 6), and the buff expires with the turn", async () => {
    const { game } = await conquerWithRing(1);
    await game.p1.pass();
    await game.p2.pass(); // showdown focus at the empty bf1
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Ring's conquer trigger resolves → one card discarded, one drawn
    await game.p1.pick("card0"); // the discard prompt names the single card in hand
    expect(game.chain().filter((c) => c.cardId === "jinx")).toHaveLength(1); // exactly one trigger
    await drain(game);
    expect(game.state("jinx")).toMatchObject({ isExhausted: false, isReady: true, might: 6 });
    await game.advanceTurn();
    expect(game.state("jinx").might).toBe(5); // "this turn" is over
    expect(game.state("jinx").isReady).toBe(true); // readying is permanent
  });
});

// ───────────────────────────── Scrapyard Champion: Legion "discard 2, then draw 2" ────────────

/** P1's turn, plenty of energy. Jinx exhausted in base; hand = a Trinket primer, Scrapyard, and `spares` extras. */
function scrapBoard(spares: number) {
  const b = scenario()
    .resources(P1, { energy: 12, power: { fury: 2 } })
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .hand(P1, TRINKET, "primer")
    .hand(P1, SCRAPYARD_CHAMPION, "scrap");
  for (let i = 0; i < spares; i++) {
    b.hand(P1, TRINKET, `spare${i}`);
  }
  return b;
}

/** Play the Trinket first (so [Legion] is Active), then play Scrapyard Champion. */
async function playScrapyardWithLegion(spares: number): Promise<{ deckBefore: number; game: Game }> {
  const game = await scrapBoard(spares).build();
  await game.p1.play("primer");
  await game.settle();
  const deckBefore = game.p1.deck().length;
  expect(game.p1.hand()).toHaveLength(1 + spares);
  await game.p1.play("scrap");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scrap", controller: P1, triggered: true })]);
  return { deckBefore, game };
}

describe("Scrapyard Champion [Legion] 'discard 2, then draw 2' — 0 vs 1 other cards in hand", () => {
  test("(c) EMPTY hand after paying: 422.4 / 359.3.e.10 — the whole 'discard 2' is ignored, the Legion ability still resolved, and P1 still draws 2; the trash stays empty", async () => {
    const { deckBefore, game } = await playScrapyardWithLegion(0);
    expect(game.p1.hand()).toEqual([]); // Scrapyard itself left the hand as it was played
    await drain(game);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("scrap")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(c) Jinx is silent — no cards were discarded, so she stays exhausted at 5 [Might] and never reaches the chain", async () => {
    const { game } = await playScrapyardWithLegion(0);
    for (let i = 0; i < 12; i++) {
      expect(game.chain().filter((c) => c.cardId === "jinx")).toEqual([]);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.card ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("(d) ONE other card: that card is discarded, the SECOND discard is ignored (422.4 — as much as possible), and 2 are still drawn → hand 1 − 1 + 2 = 2", async () => {
    const { deckBefore, game } = await playScrapyardWithLegion(1);
    await drain(game);
    expect(game.zoneOf("spare0")).toBe("trash");
    expect(game.p1.trash()).toEqual(["spare0"]); // exactly one card discarded, not two
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Jinx triggers ONCE, not twice: 'when you discard one or more cards' is one event for the whole instruction — she readies at 6 [Might] with a single chain item", async () => {
    const { game } = await playScrapyardWithLegion(1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Legion trigger resolves: one card discarded, two drawn
    expect(game.chain().filter((c) => c.cardId === "jinx")).toHaveLength(1);
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("jinx")).toMatchObject({ isExhausted: false, isReady: true, might: 6 });
    expect(game.violations()).toEqual([]);
  });
});
