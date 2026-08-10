/**
 * Ruling 47e2b1a19b170200 — Baited Hook (OGN-242 → ogn-242-298) · Gear · "[1][order], [Exhaust]: Kill a friendly unit. Look at
 *   the top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit
 *   and play it, ignoring its cost. Then recycle the rest."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me,
 *     and spend its buff to heal it, exhaust it, and recall it instead."
 *   (Question also mentions Hidden Blade ogn-213-298 as the contrasting "still draw 2 if saved" case.)
 *
 * Q: Baited Hook my buffed unit, save it with Sett — do I still get the Hook's payoff?
 * A: No. The Hook references the Might of the KILLED unit; a saved unit was never killed, so no Might is defined: you look
 *    at 5 cards, cannot take any, and recycle them all.
 * Rules: 371 (replacement — the unit did not die), 359.3.e.14 (referent of "the killed unit" missing), 359.3.f.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1's turn. P1: The Boss (ready), Baited Hook (ready), BUFFED Bait (printed 2 → 3) in base; [1][order] for the Hook + 1 body
 * for the Boss's [rainbow]. Deck top→: One (1), Two (2), Three (3), Junk (spell), Four (4) — all within a "3+1" ceiling.
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 1, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 2, name: "Bait" }, "bait", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Sixth" },
      ],
      ["one", "two", "three", "junk", "four", "sixth"],
    );
}

/** Activate the Hook on Bait and drive to the Boss's "would die" question. */
async function hookBaitToBoss(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bait")).toMatchObject({ isBuffed: true, might: 3 });
  const asksNow = game.p1.option("activate", "hook")?.fields.some((f) => f.name === "targets") === true;
  if (asksNow) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook", 0, { answers: ["bait"] });
  }
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind === "yes-no") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "bait")) {
      await game.p1.pick("bait");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  return game;
}

const TOP5 = ["one", "two", "three", "junk", "four"];

describe("Ruling 47e2b1a19b170200 — a Sett-saved Baited Hook victim was never killed: look at 5, take nothing, recycle all", () => {
  test("control (NO to the Boss): Bait dies (last known Might 3 → ceiling 4) and the look offers One/Two/Three/Four to play", async () => {
    const game = await hookBaitToBoss();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["four", "one", "three", "two"]);
  });

  test("YES to the Boss: Bait is healed, exhausted, recalled — it stays on the board unbuffed; Boss exhausted and [rainbow] paid", async () => {
    const game = await hookBaitToBoss();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
  });

  test("YES to the Boss: no unit was killed ⇒ no Might ceiling exists ⇒ P1 is offered NOTHING to banish/play; all 5 looked-at cards are recycled to the bottom and nothing new is on the board", async () => {
    const game = await hookBaitToBoss();
    const unitsBefore = game.p1.units().sort();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // If the look is surfaced at all it must offer no card to take.
      expect(d.options.map((o) => o.card ?? o.key)).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.units().sort()).toEqual(unitsBefore);
    expect(game.p1.banishment()).toEqual([]);
    for (const c of TOP5) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
    // Recycled = the five went under the rest of the deck: the old 6th card is now on top.
    expect(game.p1.deck()[0]).toBe("sixth");
    expect(game.p1.deck().slice(-5).sort()).toEqual([...TOP5].sort());
    expect(game.violations()).toEqual([]);
  });
});
