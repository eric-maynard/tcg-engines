/**
 * Ruling cac9ff02562631c6 — Stacked Deck (OGN-183 → ogn-183-298) · Action · [1]
 *   "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · Unit · [4][chaos] · 4 · [Ganking]
 *   "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me for [R]."
 *
 * Q: How does Stacked Deck resolve if a Nocturne is among the 3 cards?
 * A: While looking you may banish the Nocturne and play it for [rainbow]; it is set aside pending, Stacked Deck
 *    finishes (you put 1 of the REMAINING cards into hand, recycle the rest — the Nocturne does not count as that
 *    card), and only then do you pay for / finish playing the Nocturne (that is when you'd exhaust or recycle
 *    runes). Three Nocturnes all played ⇒ nothing goes to hand.
 * Rules: Nocturne's look/reveal replacement-style option, 346/355 (playing a card: pay at finalize), FAQ 6744/7941/1157.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const NOCTURNE = "ogn-194-298";
const SKULKER = "ogn-175-298";

const nocOffer = (d: Decision | null, id: string) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === id;

/** Cast Stacked Deck with [1] and let it start resolving (both pass). */
async function castStackedDeck(game: Game): Promise<void> {
  await game.p1.cast("sd");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling cac9ff02562631c6 — Stacked Deck finding Nocturne: banish → finish Stacked Deck → then pay for and play Nocturne", () => {
  test("deck = Nocturne, S1, S2, S3 with a floating [rainbow]: accept Nocturne's offers; Stacked Deck's pick then offers only S1/S2 (Nocturne already banished, not one of them); S1 → hand, S2 recycled; Nocturne is played to base for [rainbow]; S3 is the new top card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await castStackedDeck(game);
    let sawStackedPick = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (nocOffer(d, "noc")) {
        await game.p1.yes(); // banish me / play me for [rainbow]
      } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
        sawStackedPick = true;
        expect(game.zoneOf("noc")).toBe("banishment"); // set aside before Stacked Deck finishes
        expect(d.options.map((o) => o.card).sort()).toEqual(["s1", "s2"]); // Nocturne is not "1 of them"
        expect(game.p1.power("rainbow")).toBe(1); // not paid for yet — that comes after Stacked Deck
        await game.p1.pick("s1");
      } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick(d.options.find((o) => (o.zone ?? o.key) === "base")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawStackedPick).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.p1.hand()).toEqual(["s1"]);
    expect(game.p1.deck()[0]).toBe("s3");
    expect(game.p1.deck().at(-1)).toBe("s2"); // recycled
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // played "for [rainbow]", not [4][chaos]
  });

  test("three Nocturnes on top (+ S1 4th): banish and play all three → nothing is put into hand ('draw nothing'), all three Nocturnes on the board, 3 × [rainbow] paid, S1 untouched on top", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 3 } })
      .battlefield("bf1")
      .deck(P1, [NOCTURNE, NOCTURNE, NOCTURNE, SKULKER], ["n1", "n2", "n3", "s1"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await castStackedDeck(game);
    let stackedPickCards: (string | undefined)[] | undefined;
    for (let i = 0; i < 24; i++) {
      const d = game.decision();
      if (nocOffer(d, "n1") || nocOffer(d, "n2") || nocOffer(d, "n3")) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
        stackedPickCards = d.options.map((o) => o.card);
        if (d.allowDecline) {
          await game.p1.decline();
        } else {
          await game.p1.pick(d.options[0]!.key);
        }
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.zone ?? o.key) === "base")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    // Either no Stacked Deck pick at all, or an empty one — never S1 (it was the 4th card, never looked at).
    expect(stackedPickCards ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]);
    expect(["n1", "n2", "n3"].map((n) => game.zoneOf(n))).toEqual(["base", "base", "base"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.deck()[0]).toBe("s1");
  });

  // Expected (FAQ 1157): no floating power is needed while Stacked Deck resolves and runes are NOT tapped during it — you
  // just accept Nocturne's offers; AFTER Stacked Deck's put-1-in-hand step you are prompted to pay for the banished
  // Nocturne and may exhaust/recycle runes THEN; recycling the ready rune pays [rainbow] and Nocturne is played.
  // Actual: the engine only offers rune actions at the opt-in DURING Stacked Deck's resolution; a player who accepts there
  // with an empty pool gets no pay prompt after Stacked Deck finishes and Nocturne is stranded in banishment.
  test.failing("BUG: ruling cac9ff02562631c6 — no pay-for-Nocturne prompt after Stacked Deck finishes; accepting with an empty pool strands Nocturne in banishment", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .rune(P1, "chaos", { alias: "rune" })
      .battlefield("bf1")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await castStackedDeck(game);
    let stackedDeckDone = false;
    let payWindowAfterStackedDeck = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
        const runeOffered = (d.actions ?? []).some((a) => a.moveId === "recycleRune");
        if (stackedDeckDone && runeOffered) {
          payWindowAfterStackedDeck = true;
          await game.p1.recycleRune("rune"); // Add [chaos] now, at pay time
          if (game.decision()?.kind === "yes-no") {
            await game.p1.yes();
          }
        } else {
          await game.p1.yes(); // during Stacked Deck: just accept "banish me" / "play me", touch no runes
        }
      } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
        expect(game.p1.runes()).toEqual(["rune"]); // untouched while Stacked Deck resolves
        await game.p1.pick("s1");
        stackedDeckDone = true;
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.zone ?? o.key) === "base")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.p1.hand()).toEqual(["s1"]);
    expect(payWindowAfterStackedDeck).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.runes()).toEqual([]); // recycled to pay
  });
});
