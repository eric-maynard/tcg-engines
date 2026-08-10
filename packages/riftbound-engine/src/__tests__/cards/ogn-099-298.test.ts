/**
 * Garbage Grabber — ogn-099-298 · Gear · Mind · 2 energy
 *
 *   Recycle 3 from your trash, [1], [Exhaust]: Draw 1.
 *
 * Rule 416 — recycled main-deck cards go to the bottom of their owner's Main
 * Deck; everything before the colon is cost (paid on activation), the draw
 * happens when the ability resolves off the chain.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-099-298";
const FILLER = "ogn-175-298";

function withTrash(n: number, energy = 1, exhausted = false, seed?: string) {
  const b = (seed === undefined ? scenario() : scenario({ seed }))
    .resources(P1, { energy })
    .gear(P1, CARD, "gg", exhausted ? { exhausted: true } : undefined);
  for (let i = 1; i <= n; i++) {
    b.trash(P1, FILLER, `t${i}`);
  }
  return b;
}

describe("Garbage Grabber (ogn-099-298)", () => {
  test("costs 2 energy to play as a gear into your base", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "gg").build();
    await game.p1.play("gg");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("gg")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "gg").build();
    expect(poor.p1.can("playGear", "gg")).toBe(false);
  });

  test("activation pays all three costs up front: 3 trash cards recycled to the deck bottom, 1 energy, exhaust", async () => {
    const game = await withTrash(3).build();
    const deckBefore = game.p1.deck().length;
    await game.p1.activate("gg");
    // Costs are paid immediately; the ability now sits on the chain.
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("gg").isExhausted).toBe(true);
    expect(game.p1.deck().length).toBe(deckBefore + 3);
    expect(game.p1.deck().slice(-3).sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gg", controller: P1, triggered: false })]);
  });

  test("effect: draws 1 when the ability resolves", async () => {
    const game = await withTrash(3).build();
    const handBefore = game.p1.hand().length;
    const top = game.p1.deck()[0];
    await game.p1.activate("gg");
    expect(game.p1.hand().length).toBe(handBefore); // not yet — still on the chain
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.p1.hand()).toContain(top as string);
    expect(game.zoneOf("gg")).toBe("base");
  });

  test("rule 416.5: the 3 simultaneously recycled cards hit the deck bottom in a RANDOM order, not trash order", async () => {
    const seen = new Set<string>();
    // The order comes from the game's SEEDED rng, so one seed always yields the
    // same bottom (that is what makes a transcript replayable): the randomness
    // shows up ACROSS games, not across repeats of one.
    for (let i = 0; i < 30; i++) {
      const game = await withTrash(3, 1, false, `gg-416-5-${i}`).build();
      await game.p1.activate("gg");
      const bottom = game.p1.deck().slice(-3);
      expect(bottom.slice().sort()).toEqual(["t1", "t2", "t3"]);
      seen.add(bottom.join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("with 4 cards in trash only 3 are recycled", async () => {
    const game = await withTrash(4).build();
    await game.p1.activate("gg", undefined, { params: { recycleIds: ["t1", "t2", "t3"] } });
    await game.settle();
    expect(game.p1.trash()).toHaveLength(1);
  });

  // rule 416.5: with more cards in trash than the cost demands, its controller
  // chooses which 3 pay — the engine must not silently take the oldest 3.
  test("with 4 cards in trash the controller is offered each legal 3-card selection", async () => {
    const game = await withTrash(4).build();
    const field = game.p1.option("activateAbility", "gg")?.fields.find((f) => f.arg === "recycle");
    expect(field).toBeDefined();
    const sets = (field?.options as string[][]).map((o) => [...o].sort().join(","));
    expect(sets.sort()).toEqual(["t1,t2,t3", "t1,t2,t4", "t1,t3,t4", "t2,t3,t4"]);
  });

  test("rule 416.5: the chosen 3 are the ones recycled — the unchosen card stays in trash", async () => {
    const game = await withTrash(4).build();
    await game.p1.activate("gg", undefined, { params: { recycleIds: ["t1", "t2", "t4"] } });
    expect(game.p1.trash()).toEqual(["t3"]);
    expect(game.p1.deck().slice(-3).sort()).toEqual(["t1", "t2", "t4"]);
  });

  test("not activatable with fewer than 3 cards in your trash", async () => {
    const game = await withTrash(2).build();
    expect(game.p1.can("activate", "gg")).toBe(false);
    const r = await game.p1.try((p) => p.activate("gg"));
    expect(r.ok).toBe(false);
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.p1.energy()).toBe(1);
  });

  test("not activatable without the [1] energy", async () => {
    const game = await withTrash(3, 0).build();
    expect(game.p1.can("activate", "gg")).toBe(false);
  });

  test("not activatable while already exhausted ([Exhaust] cost)", async () => {
    const game = await withTrash(3, 1, true).build();
    expect(game.state("gg").isExhausted).toBe(true);
    expect(game.p1.can("activate", "gg")).toBe(false);
  });
});
