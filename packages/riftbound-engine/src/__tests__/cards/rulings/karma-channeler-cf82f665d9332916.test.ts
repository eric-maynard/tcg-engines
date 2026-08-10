/**
 * Ruling cf82f665d9332916 — Karma, Channeler (ogn-235-298) × Baited Hook (ogn-242-298)
 *   Karma — Unit · 6 Might: "[Vision] … When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *   Baited Hook — Gear: "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *   banish a unit … and play it, ignoring its cost. Then recycle the rest."
 *
 * Q: If several cards are recycled at once (e.g. Baited Hook recycles 4), does Karma buff once or once per card?
 * A: Once. "Recycle the rest" is a single simultaneous recycle instance, so Karma triggers exactly one time and grants one
 *    buff whether 1, 2 or 4 cards were recycled.
 * Rules: 383.1/383.2.c ("one or more" — one trigger per event), Baited Hook text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARMA = "ogn-235-298";
const BAITED_HOOK = "ogn-242-298";
const SKULKER = "ogn-175-298"; // 3 Might — too big for a 1-Might kill (ceiling 2)

/** P1's turn: Karma + a 1-Might Bait + a 2-Might Pal in base; Hook ready, exactly [1][order]. Deck top→ Two(2), 4 Skulkers, then more. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", KARMA, "karma")
    .unit(P1, "base", { might: 1, name: "Bait" }, "bait")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .deck(P1, [{ cardType: "unit", energyCost: 2, might: 2, name: "Two" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["two", "r1", "r2", "r3", "r4", "next"]);
}

const karmaItems = (game: Game) => game.chain().filter((c) => c.cardId === "karma" && c.triggered);

async function hookBaitToOffer(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "bait" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("bait")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hook" } });
  return game;
}

describe("Ruling cf82f665d9332916 — Baited Hook's 'recycle the rest' is ONE recycle: Karma triggers once, one buff", () => {
  test("taking Two: FOUR cards (r1–r4) are recycled to the bottom in one go, and exactly ONE Karma trigger is put on the chain, asking P1 for ONE friendly unit to buff", async () => {
    const game = await hookBaitToOffer();
    await game.p1.pick("two");
    expect(game.zoneOf("two")).toBe("base");
    expect(game.p1.deck()[0]).toBe("next");
    expect(new Set(game.p1.deck().slice(-4))).toEqual(new Set(["r1", "r2", "r3", "r4"]));
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma" } });
    expect(d?.kind === "pick" ? d.max : 0).toBe(1); // "buff A friendly unit"
    await game.p1.pick("pal");
    expect(karmaItems(game)).toHaveLength(1);
    expect(karmaItems(game)[0]?.targets).toEqual(["pal"]);
  });

  test("it resolves to a single buff: Pal is buffed (+1 → 3); Karma, Two and everyone else are not; no second Karma prompt ever appears", async () => {
    const game = await hookBaitToOffer();
    await game.p1.pick("two");
    await game.p1.pick("pal");
    let karmaPrompts = 0;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.source?.cardId === "karma") {
        karmaPrompts++;
        await game.p1.pick(d.options[0]!.key);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(karmaPrompts).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.state("two").isBuffed).toBe(false);
    const buffed = game.p1.units().filter((u) => game.state(u).isBuffed);
    expect(buffed).toEqual(["pal"]);
    expect(game.violations()).toEqual([]);
  });

  test("declining the fetch recycles all FIVE looked-at cards — still one instance: exactly one Karma trigger / one buff", async () => {
    const game = await hookBaitToOffer();
    await game.p1.decline();
    expect(game.p1.deck()[0]).toBe("next");
    expect(new Set(game.p1.deck().slice(-5))).toEqual(new Set(["two", "r1", "r2", "r3", "r4"]));
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma" } });
    await game.p1.pick("karma");
    expect(karmaItems(game)).toHaveLength(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("karma")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.state("pal").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
