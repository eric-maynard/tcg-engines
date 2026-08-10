/**
 * Ruling 7c6830e62a07e9eb — Blind Fury (OGN-025 → ogn-025-298) · Action · 4+[fury][fury] "Each opponent reveals the top card of their
 *     Main Deck. Choose one and banish it, then play it, ignoring its cost. Then recycle the rest."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4+[chaos] · 4 Might "[Ganking] As you look at or reveal me from the top of your
 *     deck, you may banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Multiplayer: Blind Fury reveals a Nocturne from one opponent's deck but the caster picks the OTHER opponent's card (so the
 *    Nocturne would be recycled). Can Nocturne's owner use its ability and play it?
 * A: Yes. The card was revealed — everybody, including its owner, saw it come off the top of their deck — so the owner may
 *    banish it and play it for [rainbow]. (Like Promising Future in 1v1 when the Nocturne isn't the chosen card.)
 * Rules: 409 (reveal = shown to all players), Nocturne's self-replacement on look/reveal, Blind Fury text (multiplayer "each opponent").
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const NOCTURNE = "ogn-194-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit on top of P3's deck

/** 3 players, P1's turn with exactly 4+[fury][fury]. P2's top card is Nocturne (P2 holds a [chaos] for its [rainbow]); P3's top is a Skulker. */
function board() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { power: { chaos: 1 } })
    .hand(P1, BLIND_FURY, "fury")
    .deckTop(P2, NOCTURNE, "noc")
    .deckTop(P3, SKULKER, "skulk");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Cast Blind Fury and drive it, choosing the Skulker; record every non-action decision seen (to spot anything asked of P2).
 * `optIn` decides how Nocturne's owner answers its own "you may banish me" — the replacement is offered as the card is
 * revealed (rule 369.1 / 370.1), i.e. before Blind Fury's own "choose one", so declining leaves it among P1's options.
 */
async function furyChoosingSkulker(game: Game, optIn = true): Promise<Decision[]> {
  const seen: Decision[] = [];
  await game.p1.cast("fury");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  for (let i = 0; i < 12; i++) {
    const stop = await game.settle();
    const d = game.decision();
    if (stop.reason !== "unanswered" || !d) {
      break;
    }
    seen.push(d);
    if (d.kind === "pick") {
      const opt = d.options.find((o) => o.card === "skulk") ?? d.options[0]!;
      await game.seat(d.seat).pick(opt.key);
    } else if (d.kind === "yes-no") {
      await (optIn ? game.seat(d.seat).yes() : game.seat(d.seat).no());
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 7c6830e62a07e9eb — a Nocturne revealed (but not chosen) by Blind Fury may still be played by its owner", () => {
  test("Blind Fury in multiplayer: BOTH opponents' top cards are revealed and offered to P1; P1 picks P3's Skulker, which is played to P1's board ignoring its cost", async () => {
    const game = await board().build();
    expect(game.p2.deck()[0]).toBe("noc");
    expect(game.seat(P3).deck()[0]).toBe("skulk");
    const seen = await furyChoosingSkulker(game, false); // P2 declines Nocturne's "you may banish me"
    const offer = seen.find((d) => d.kind === "pick" && d.seat === P1);
    expect(offer?.kind === "pick" ? offer.options.map((o) => o.card).toSorted() : []).toEqual(["noc", "skulk"]);
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.zoneOf("skulk")).toBe("base");
    expect(game.state("skulk").controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing more was paid for the Skulker
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Revealing Nocturne off the top of P2's deck lets P2 (its owner) opt in — banish it, then play it for [rainbow] — even
  // though the reveal was caused by P1's spell.
  test("ruling 7c6830e62a07e9eb — the Nocturne's owner is offered its reveal ability and may banish-and-play it for [rainbow]", async () => {
    const game = await board().build();
    const seen = await furyChoosingSkulker(game);
    // P2 was asked (a "you may" sourced from the Nocturne) …
    expect(seen.some((d) => d.seat === P2 && d.kind === "yes-no")).toBe(true);
    // … and, having accepted, banished-then-played it for [rainbow]: Nocturne on P2's board, the [chaos] spent, not in the deck.
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.state("noc").controller).toBe(P2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p2.deck()).not.toContain("noc");
    // The chosen Skulker was still played by P1 as normal.
    expect(game.zoneOf("skulk")).toBe("base");
    expect(game.state("skulk").controller).toBe(P1);
  });

  test("a DECLINED Nocturne is just another unchosen card: 'recycle the rest' puts it on the bottom of P2's Main Deck", async () => {
    const game = await board().build();
    await furyChoosingSkulker(game, false);
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("noc");
    expect(game.p2.deck()[0]).not.toBe("noc");
    expect(game.violations()).toEqual([]);
  });
});
