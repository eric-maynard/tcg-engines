/**
 * Jinx, Rebel — ogn-202-298 · Champion Unit (Jinx) · Chaos · 5 energy + [chaos] · 5 Might
 *
 *   When you discard one or more cards, ready me and give me +1 [Might] this turn.
 *
 * Rules: 422 (Discard: hand → trash; 422.1.b discard triggers fire after the
 * discard), 383.1 ("one or more" → a multi-card discard is ONE trigger event).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-202-298";
const FILLER = "ogn-175-298";
/** Inline vanilla "Discard N." spells (0 cost) — the caster discards. */
function discardSpell(n: number) {
  return {
    abilities: [{ effect: { amount: n, type: "discard" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "chaos",
    energyCost: 0,
    name: `Discard ${n}`,
    timing: "action",
  };
}

describe("Jinx, Rebel (ogn-202-298)", () => {
  test("costs 5 energy + 1 chaos; 5-Might champion unit; unaffordable without the chaos or with 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "jinx").build();
    await game.p1.play("jinx");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").might).toBe(5);
    expect(game.state("jinx").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "jinx").build();
    expect(noPower.p1.can("play", "jinx")).toBe(false);
    const low = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "jinx").build();
    expect(low.p1.can("play", "jinx")).toBe(false);
  });

  test("you discard 1 → Jinx gets +1 Might this turn (5 → 6), back to 5 next turn", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "jinx", { exhausted: true })
      .hand(P1, discardSpell(1), "d1")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.cast("d1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("jinx").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("jinx").might).toBe(5);
  });

  test.failing("BUG: you discard 1 → Jinx is also READIED by the trigger", async () => {
    // Expected: the exhausted Jinx becomes ready (and 6 Might). Actual: the trigger resolves the
    // +1 Might half of the sequence but the `ready self` step leaves her exhausted.
    const game = await scenario()
      .unit(P1, "base", CARD, "jinx", { exhausted: true })
      .hand(P1, discardSpell(1), "d1")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.cast("d1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("jinx").might).toBe(6);
    expect(game.state("jinx").isReady).toBe(true);
  });

  test("'one or more': discarding 2 cards at once is a single trigger → +1 Might, not +2", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "jinx", { exhausted: true })
      .hand(P1, discardSpell(2), "d2")
      .hand(P1, FILLER, "junk1")
      .hand(P1, FILLER, "junk2")
      .build();
    await game.p1.cast("d2");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk1", "junk2");
      await game.settle();
    }
    expect(game.zoneOf("junk1")).toBe("trash");
    expect(game.zoneOf("junk2")).toBe("trash");
    expect(game.state("jinx").might).toBe(6);
  });

  test("only when YOU discard: the opponent discarding does nothing for your Jinx", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", CARD, "jinx", { exhausted: true })
      .hand(P2, discardSpell(1), "d1")
      .hand(P2, FILLER, "theirs")
      .build();
    await game.p2.cast("d1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("theirs");
      await game.settle();
    }
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("jinx").isExhausted).toBe(true);
    expect(game.state("jinx").might).toBe(5);
  });

  test("no discard happened (empty hand) → no trigger: Jinx stays exhausted at 5", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "jinx", { exhausted: true })
      .hand(P1, discardSpell(1), "d1")
      .build();
    await game.p1.cast("d1");
    await game.settle();
    expect(game.state("jinx").isExhausted).toBe(true);
    expect(game.state("jinx").might).toBe(5);
  });
});
