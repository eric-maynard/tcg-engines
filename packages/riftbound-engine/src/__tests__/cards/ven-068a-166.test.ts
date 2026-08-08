/**
 * Jayce, Brilliant Inventor — ven-068a-166 · Unit (Champion) · Mind · 6 energy / [mind] · 6 Might
 *
 *   When you play me or the first time you play a non-token gear each turn, you may ready
 *   something besides me that's exhausted.
 *
 * Head-judge checklist:
 *  - Two separate triggers on one line: the play-me half is unrestricted, the gear half is
 *    "the first time … each turn" and ignores token gear (rule 187.2).
 *  - "you may" (rule 340.4) — an opt-in prompt; declining readies nothing.
 *  - "something besides me that's exhausted" — any exhausted permanent other than Jayce is a
 *    legal choice; Jayce himself never is.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-068a-166";
const GEAR = "ogn-099-298"; // Garbage Grabber — a plain 2-energy gear

describe("Jayce, Brilliant Inventor (ven-068a-166)", () => {
  test("when you play me: opting in readies an exhausted friendly permanent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", { exhausted: true })
      .hand(P1, CARD, "jayce")
      .build();
    await game.p1.play("jayce");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.state("ally").isExhausted).toBe(false);
  });

  test("'you may': declining readies nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", { exhausted: true })
      .hand(P1, CARD, "jayce")
      .build();
    await game.p1.play("jayce");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("'besides me': Jayce cannot ready himself — with nothing else exhausted nothing happens", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "jayce")
      .build();
    await game.p1.play("jayce");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.state("jayce").isExhausted).toBe(true); // units enter exhausted (rule 359.2)
  });

  test("playing a gear with Jayce on board also triggers it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "jayce")
      .unit(P1, "base", { might: 2 }, "ally", { exhausted: true })
      .hand(P1, GEAR, "gear")
      .build();
    await game.p1.play("gear");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(false);
  });

  test("only the FIRST gear each turn triggers it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", CARD, "jayce")
      .unit(P1, "base", { might: 2 }, "a1", { exhausted: true })
      .unit(P1, "base", { might: 2 }, "a2", { exhausted: true })
      .hand(P1, GEAR, "gear1")
      .hand(P1, GEAR, "gear2")
      .build();
    await game.p1.play("gear1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("a1");
    await game.settle();
    expect(game.state("a1").isExhausted).toBe(false);
    await game.p1.play("gear2");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.state("a2").isExhausted).toBe(true);
  });
});
