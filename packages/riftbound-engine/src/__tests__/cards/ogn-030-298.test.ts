/**
 * Jinx, Demolitionist — ogn-030-298 · Champion Unit · Fury · 3 energy + [fury] · 4 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   When you play me, discard 2.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-030-298";
const FILLER = "ogn-175-298";

describe("Jinx, Demolitionist (ogn-030-298)", () => {
  test("costs 3 energy + 1 fury and enters exhausted without Accelerate", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "jinx").build();
    await game.p1.play("jinx");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").isExhausted).toBe(true);
    expect(game.state("jinx").might).toBe(4);
  });

  test("unaffordable without the fury power or with only 2 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "jinx").build();
    expect(noPower.p1.can("play", "jinx")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).hand(P1, CARD, "jinx").build();
    expect(noEnergy.p1.can("play", "jinx")).toBe(false);
  });

  test("Accelerate: paying an extra [1][fury] (total 4 energy + 2 fury) makes her enter ready (rule 805.1.a)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).hand(P1, CARD, "jinx").build();
    await game.p1.play("jinx", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("jinx").isReady).toBe(true);
    // Not enough for the additional cost → the accelerated variant is not offered.
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "jinx").build();
    const t = await poor.p1.try((p) => p.play("jinx", { accelerate: true }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("When you play me, discard 2: two other cards leave the hand for the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "jinx")
      .hand(P1, FILLER, "h1")
      .hand(P1, FILLER, "h2")
      .hand(P1, FILLER, "h3")
      .build();
    await game.p1.play("jinx");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.answer(["h1", "h2"]);
      await game.settle();
    }
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.trash()).toHaveLength(2);
  });

  test.failing("BUG: the discarding player chooses WHICH 2 cards to discard (rule 422.1.a)", async () => {
    // Expected: with 3 other cards in hand the play trigger prompts P1 to pick 2 of them, so P1
    // can keep "h1". Actual: the engine discards the first two hand cards automatically with
    // no prompt, so "h1" always ends up in the trash.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "jinx")
      .hand(P1, FILLER, "h1")
      .hand(P1, FILLER, "h2")
      .hand(P1, FILLER, "h3")
      .build();
    await game.p1.play("jinx");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.answer(["h2", "h3"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["h1"]);
    expect(game.p1.trash().sort()).toEqual(["h2", "h3"]);
  });

  test("discard is mandatory and discards as many as possible: with one other card, that card is discarded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "jinx")
      .hand(P1, FILLER, "only")
      .build();
    await game.p1.play("jinx");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("only");
      await game.settle();
    }
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("Assault 2: printed keyword; a 4-Might Jinx kills a 5-Might defender when attacking (4+2 ≥ 5)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "jinx")
      .unit(P2, "bf1", { might: 5 }, "wall")
      .build();
    expect(game.state("jinx").keywords).toContain("Assault");
    expect(game.state("jinx").might).toBe(4); // no bonus at rest
    await game.p1.move("jinx", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });
});
