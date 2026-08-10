/**
 * Ruling b5bbc99de3c98ddd — Stacked Deck (OGN-183 → ogn-183-298) · Action · Chaos · 1
 *   "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · 4 + [chaos] · 4 Might
 *   "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *    for [rainbow]."
 *
 * Q: If Stacked Deck reveals (looks at) Nocturne, does his ability trigger so I can play him for 1 power?
 * A: Yes. Looking at him from the top of the deck triggers it: you may banish him and then play him for [rainbow].
 *    Looking/revealing is not drawing; and he must actually be banished to get the cheap play.
 * Rules: 383 (triggered "As you look at or reveal me"), 356.1.a (alternative cost), 411 (look at) vs 413 (draw).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const NOCTURNE = "ogn-194-298";
const SKULKER = "ogn-175-298";

/** P1's turn, main phase. Exactly [1] + one [rainbow]. Deck top: Nocturne, s1, s2, s3. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
    .hand(P1, STACKED_DECK, "sd");
}

/** Cast Stacked Deck and let it resolve up to the first prompt. */
async function castStackedDeck(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sd");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling b5bbc99de3c98ddd — Stacked Deck 'looks at' Nocturne: his banish-and-play-for-[rainbow] triggers", () => {
  test("as Stacked Deck looks at the top 3, Nocturne's 'you may banish me' is offered to P1 (a yes/no sourced from Nocturne)", async () => {
    const game = await castStackedDeck();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    expect(game.zoneOf("noc")).toBe("mainDeck"); // nothing has happened to him yet
  });

  test("yes → Nocturne is banished; yes again → he is played for just [rainbow] (not 4 + [chaos]) and lands in base; Stacked Deck then only offers the two remaining looked-at cards", async () => {
    const game = await castStackedDeck();
    await game.p1.yes(); // banish me
    let sawPlayOffer = false;
    let sawStackedPick = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
        expect(game.zoneOf("noc")).toBe("banishment"); // "If you do" — he IS banished before the play offer
        sawPlayOffer = true;
        await game.p1.yes(); // play me for [rainbow]
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination" && d.source?.cardId === "noc") {
        await game.p1.pick("base");
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
        sawStackedPick = true;
        expect(d.options.map((o) => o.card).sort()).toEqual(["s1", "s2"]); // Nocturne is gone from the looked-at set
        await game.p1.pick("s1");
        continue;
      }
      break;
    }
    await game.settle();
    expect(sawPlayOffer).toBe(true);
    expect(sawStackedPick).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.units("base")).toContain("noc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // paid exactly the one [rainbow]
    expect(game.p1.hand()).toEqual(["s1"]);
    expect(game.zoneOf("s2")).toBe("mainDeck"); // recycled
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the card must be banished to use the ability: declining the banish leaves Nocturne among the looked-at cards (he can simply be put into hand) and no [rainbow] play is offered", async () => {
    const game = await castStackedDeck();
    await game.p1.no(); // don't banish
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["noc", "s1", "s2"]);
    await game.p1.pick("noc");
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no further Nocturne offer
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // rainbow untouched
    expect(game.p1.units("base")).not.toContain("noc");
  });
});
