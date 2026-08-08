/**
 * Reinforce — ogn-062-298 · Spell · Calm · 5 energy
 *
 *   Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then
 *   play it, reducing its cost by [5]. Recycle the remaining cards.
 *
 * No [Action]/[Reaction] tag → playable only on your own turn in an Open State.
 * Rule 356.4 (discounts), 356.6 (not below 0), 143.4 (units enter exhausted), 419.3 (play via effect).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-062-298";
const FAEFOLK = "ogn-075-298"; // 7-cost Calm unit, 6 might
const SKULKER = "ogn-175-298"; // cheap vanilla unit
const RUNE_PRISON = "ogn-050-298"; // a spell — must not be pickable

function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .deck(P1, [FAEFOLK, RUNE_PRISON, SKULKER, SKULKER, SKULKER, SKULKER], ["fae", "spell", "s1", "s2", "s3", "sixth"])
    .hand(P1, CARD, "rf");
}

describe("Reinforce (ogn-062-298)", () => {
  test("cost: 5 energy; not castable with 4", async () => {
    const game = await board(5).build();
    expect(game.p1.can("cast", "rf")).toBe(true);
    await game.p1.cast("rf");
    expect(game.p1.energy()).toBe(0);
    const poor = await board(4).build();
    expect(poor.p1.can("cast", "rf")).toBe(false);
  });

  test("looks at the top 5 and offers only the UNITS among them (optional pick)", async () => {
    // 7 energy: 5 for Reinforce, 2 left so the discounted Faefolk (7 − 5) is payable and therefore
    // choosable (rule 419.2.a — an unaffordable play is not a legal pick).
    const game = await board(7).build();
    await game.p1.cast("rf");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.seat).toBe(P1);
    expect(d.allowDecline).toBe(true);
    expect(d.options.map((o) => o.card).sort()).toEqual(["fae", "s1", "s2", "s3"]); // not "spell", not the 6th card
  });

  test("picking a unit plays it with its cost reduced by 5 (7-cost Faefolk costs 2); the rest are recycled", async () => {
    const game = await board(7).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("fae");
    expect(game.p1.energy()).toBe(0); // 7 - 5 (Reinforce) - 2 (Faefolk reduced from 7)
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    // The other four looked-at cards go to the bottom; the 6th card is now on top.
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["s1", "s2", "s3", "spell"]);
    expect(game.zoneOf("rf")).toBe("trash");
  });

  test("declining plays nothing and recycles all 5 looked-at cards to the bottom", async () => {
    const game = await board(5).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-5).sort()).toEqual(["fae", "s1", "s2", "s3", "spell"]);
    expect(game.p1.base()).not.toContain("fae");
  });

  test("the unit played via Reinforce enters the board exhausted (rule 143.4)", async () => {
    // Expected: Faefolk (Accelerate not paid — no calm power available) enters exhausted like any unit.
    // Actual: the look→play path puts it onto the board ready.
    const game = await board(7).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("fae");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isExhausted).toBe(true);
  });

  test("the reduced cost must still be paid — with 0 energy left a 7-cost unit (2 after reduction) cannot be played for free (rules 356.4, 419.2.a)", async () => {
    // Expected: after paying 5 for Reinforce, P1 has 0 energy, so Faefolk (cost 2 after the
    // discount) is either not offered or cannot end up on the board. Actual: it is played for 0.
    const game = await board(5).build();
    await game.p1.cast("rf");
    await game.settle();
    const d = game.decision() as PickDecision;
    if (d.options.some((o) => o.card === "fae")) {
      await game.p1.try((p) => p.pick("fae"));
      await game.settle();
    }
    expect(game.zoneOf("fae")).not.toBe("base");
  });

  test("the banished pick is played at once — no chain item, no priority round (rules 337.1.b, 337.2)", async () => {
    // "banish a unit from among them, then play it" is ONE instruction: the play finalizes with
    // the resolving ability. It must not become an 'ability' chain item both players have to pass on.
    const game = await board(7).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("fae");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fae")).toBe("base");
  });

  test("timing: no [Action] tag — not castable on the opponent's turn", async () => {
    const game = await board(5).active(P2).build();
    expect(game.p1.can("cast", "rf")).toBe(false);
  });
});
