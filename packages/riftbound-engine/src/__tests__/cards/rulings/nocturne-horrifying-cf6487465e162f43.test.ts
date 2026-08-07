/**
 * Ruling cf6487465e162f43 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · 4 · 4 Might
 *   "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may
 *    play me for [rainbow]."
 *   × Kennen, Storm of Shuriken (ven-113-166) "When you play me, [Burn 2]." (Burn = put top N into trash)
 *   × Minefield (sfd-212-221) battlefield "When you conquer here, put the top 2 cards of your Main Deck
 *     into your trash."
 *   × Mystic Poro (ogn-171-298) "[Vision] (When you play me, look at the top card of your Main Deck …)"
 *
 * Q: Can I banish and play Nocturne if Burn or Minefield puts it into my trash from the top of my deck?
 * A: No. Neither Burn nor Minefield instructs you to look at or reveal the cards — they go straight from
 *    the deck to the trash, so Nocturne's "as you look at or reveal me" replacement never applies.
 * Rules: 369.1 / 370.1 ("as" = replacement on the look/reveal event), 424.1–424.2.a (reveal only when
 *        instructed), 440.1 (Burn), 108.2.d (trash is public — visible only after arriving there).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const KENNEN = "ven-113-166";
const MINEFIELD = "sfd-212-221";
const MYSTIC_PORO = "ogn-171-298";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit used as known deck filler

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Does the current prompt offer anything to do with banishing / playing Nocturne? */
function nocturneOffer(d: Decision | null): boolean {
  if (!d) {
    return false;
  }
  if (d.kind === "yes-no") {
    return /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`);
  }
  if (d.kind === "pick") {
    return /banish/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc");
  }
  return false;
}

/** Settle, failing the test if a Nocturne banish/play offer or a look/reveal prompt appears. */
async function settleExpectingNoLookOrOffer(game: Game): Promise<void> {
  await game.settle();
  const d = game.decision();
  expect(nocturneOffer(d)).toBe(false);
  // Burn / Minefield never look at or reveal the cards: no "revealed card" style prompt either.
  expect(d && d.kind !== "action" ? /reveal|look/i.test(d.prompt) : false).toBe(false);
}

describe("Ruling cf6487465e162f43 — Burn / Minefield mill Nocturne without a look or reveal: no banish-and-play", () => {
  // Expected (440.1): Kennen's "When you play me, Burn 2" puts the top 2 cards (Nocturne, then a Skulker)
  // straight into P1's trash — no look/reveal, so no Nocturne offer; Nocturne ends in the TRASH, not in
  // banishment, and P1's spare [rainbow] is untouched. Actual: [Burn] is unimplemented (raw text) — the
  // deck is untouched and Nocturne stays on top.
  test("ruling cf6487465e162f43 — Burn 2 (Kennen) mills Nocturne from the top straight to trash; no banish/play offer (engine: Burn does nothing)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } })
      .hand(P1, KENNEN, "kennen")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "second", "third"])
      .build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["noc", "second"]);
    await game.p1.play("kennen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
    await settleExpectingNoLookOrOffer(game);
    expect(game.zoneOf("kennen")).toBe("base");
    expect(game.zoneOf("noc")).toBe("trash");
    expect(game.zoneOf("second")).toBe("trash");
    expect(game.zoneOf("third")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1); // never paid [rainbow] to play Nocturne
    expect(game.p1.units()).not.toContain("noc");
  });

  // Expected: conquering Minefield puts the top 2 cards of P1's deck directly into the trash — no look,
  // no reveal, no choice; Nocturne lands in the trash with no banish/play offer. Actual: Minefield is
  // mis-modelled as "look at the top 2, you may recycle one" — a 'Pick a revealed card to recycle'
  // prompt appears and nothing is milled.
  test("ruling cf6487465e162f43 — conquering Minefield mills Nocturne + 1 straight to trash with no look/reveal prompt and no Nocturne offer (engine: look-and-recycle prompt)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { def: MINEFIELD, inert: false, controller: null })
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "second", "third"])
      .build();
    await game.p1.move("scout", "bf1"); // empty, uncontrolled → showdown, then conquer
    await settleExpectingNoLookOrOffer(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("noc")).toBe("trash");
    expect(game.zoneOf("second")).toBe("trash");
    expect(game.zoneOf("third")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  // Contrast the ruling relies on — Expected: an effect that DOES look at the top card (Mystic Poro's
  // Vision) hits Nocturne's "as you look at … me" replacement: P1 is offered to banish Nocturne (and then
  // to play it for [rainbow]). Actual: the Vision look shows a recycle prompt only; Nocturne's ability is
  // wired to a "reveal" trigger that the look never raises, so no banish offer appears.
  test.failing("BUG: ruling cf6487465e162f43 — contrast: LOOKING at Nocturne on top (Mystic Poro's Vision) does offer 'banish me, then play me for [rainbow]'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .hand(P1, MYSTIC_PORO, "poro")
      .deck(P1, [NOCTURNE, SKULKER], ["noc", "second"])
      .build();
    await game.p1.play("poro");
    expect(game.p1.energy()).toBe(0);
    let offered = false;
    for (let i = 0; i < 6 && !offered; i++) {
      const r = await game.settle();
      offered = nocturneOffer(game.decision());
      if (r.reason !== "unanswered" || offered) {
        break;
      }
      await game.p1.decline(); // decline unrelated optional prompts (e.g. Vision's recycle)
    }
    expect(offered).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
  });
});
