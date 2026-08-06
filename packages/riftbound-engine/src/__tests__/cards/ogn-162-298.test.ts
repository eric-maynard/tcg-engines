/**
 * Miss Fortune, Captain — ogn-162-298 · Champion Unit (Miss Fortune) · Body · 5 energy + [body] · 5 Might
 *
 *   [Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   The first time I move each turn, you may ready something else that's exhausted.
 *
 * Rules: 805 (Accelerate), 810 / 144.4.c (Ganking: standard move battlefield → battlefield),
 * "you may" → optional trigger; "something else" → any exhausted permanent/rune except herself.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-162-298";
// Exhausted via the engine's flag store only, so a later engine "ready" is observable.
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function moveBoard() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", CARD, "mf")
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "ally", EXHAUSTED);
}

describe("Miss Fortune, Captain (ogn-162-298)", () => {
  test("costs 5 energy + 1 body and enters the base exhausted as a 5-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "mf").build();
    await game.p1.play("mf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("mf")).toBe("base");
    expect(game.state("mf").might).toBe(5);
    expect(game.state("mf").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "mf").build();
    expect(noPower.p1.can("play", "mf")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "mf").build();
    expect(lowEnergy.p1.can("play", "mf")).toBe(false);
  });

  test("Accelerate: paying an extra [1][body] (6 energy + 2 body) makes her enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 2 } }).hand(P1, CARD, "mf").build();
    await game.p1.play("mf", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("mf").isReady).toBe(true);
    const poor = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "mf").build();
    const t = await poor.p1.try((p) => p.play("mf", { accelerate: true }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("Ganking: from a battlefield she can move straight to another battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "mf")
      .unit(P1, "bf1", { might: 2 }, "plain")
      .build();
    expect(game.state("mf").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "mf")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("mf", "bf2");
    await game.settle();
    expect(game.locationOf("mf")).toBe("bf2");
    expect(game.state("mf").isExhausted).toBe(true);
  });

  test("the first time she moves each turn, you may ready something else that's exhausted", async () => {
    // Expected: moving base → bf1 puts an optional trigger on the chain / asks yes-no; accepting and
    // picking the exhausted ally readies it. Actual: the `first-time-each-turn` trigger restriction is
    // hard-blocked in the trigger matcher, so nothing fires and the ally stays exhausted.
    const game = await moveBoard().build();
    await game.p1.move("mf", "bf1");
    const d = game.decision();
    expect(d?.kind === "yes-no" || game.chain().some((i) => i.cardId === "mf" && i.triggered)).toBe(true);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").isReady).toBe(true);
    expect(game.state("mf").isExhausted).toBe(true); // "something else": not herself
  });

  test("only the FIRST move each turn triggers — a second (ganking) move the same turn offers nothing", async () => {
    // Expected: first move readies the ally (see above); after re-exhausting nothing, a second move
    // this turn creates no prompt/trigger. Actual: the first move never triggers either.
    const game = await moveBoard().unit(P1, "base", { might: 1 }, "other", EXHAUSTED).build();
    await game.p1.move("mf", "bf1");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").isReady).toBe(true);
    // Ready her again via the sandbox so she can gank bf1 → bf2 this same turn.
    await game.p1.do("readyCard", { cardId: "mf" });
    await game.p1.gank("mf", "bf2");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("other").isExhausted).toBe(true);
  });
});
