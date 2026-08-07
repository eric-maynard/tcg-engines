/**
 * Scrapheap — ogn-182-298 · Gear · Chaos · 2 energy
 *
 *   When this is played, discarded, or killed, draw 1.
 *
 * Discard (rule 402): hand → trash. Kill (rule 427): board → trash. Recycling a card from
 * hand is neither.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SCRAPHEAP = "ogn-182-298";
const ENFORCER = "ogn-003-298"; // 2-energy unit: "When you play me, discard 1."
const THERMO_BEAM = "ogn-022-298"; // 5 + [fury][fury]: "Kill all gear."
const SABOTAGE = "ogn-156-298"; // 1 + [body]: opponent reveals hand, recycle a non-unit card from it

describe("Scrapheap (ogn-182-298)", () => {
  test("costs 2 energy to play to base; not playable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, SCRAPHEAP, "heap").build();
    await game.p1.play("heap");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("heap")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, SCRAPHEAP, "heap").build();
    expect(poor.p1.can("play", "heap")).toBe(false);
  });

  // rule 402/427: the parser emits `play-self-or-discard-or-die`, whose "-or-" parts each
  // resolve to a real engine event, so all three branches below draw.
  test("'When this is played … draw 1' — playing it puts a trigger on the chain and draws 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, SCRAPHEAP, "heap").build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("heap");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heap", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("heap")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
  });

  test("'When this is … discarded … draw 1' — discarded from hand by your own effect draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, ENFORCER, "ce")
      .hand(P1, SCRAPHEAP, "heap")
      .build();
    await game.p1.play("ce", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("heap");
      await game.settle();
    }
    expect(game.zoneOf("heap")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // Scrapheap left, one card drawn
  });

  test("'When this is … killed, draw 1' — killed on the board (even by an opponent's spell) its controller draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { fury: 2 } })
      .gear(P1, SCRAPHEAP, "heap")
      .hand(P2, THERMO_BEAM, "beam")
      .build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.cast("beam");
    await game.settle();
    expect(game.zoneOf("heap")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("recycled from hand is NOT discarded: no draw", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { body: 1 } })
      .hand(P1, SCRAPHEAP, "heap")
      .hand(P2, SABOTAGE, "sab")
      .build();
    await game.p2.cast("sab");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("heap");
      await game.settle();
    }
    expect(game.zoneOf("heap")).toBe("mainDeck");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("sitting on the board it does nothing when OTHER gear is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .gear(P1, SCRAPHEAP, "heap")
      .hand(P1, { cardType: "gear", energyCost: 2, name: "Trinket" }, "trinket")
      .build();
    await game.p1.play("trinket");
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
  });
});
