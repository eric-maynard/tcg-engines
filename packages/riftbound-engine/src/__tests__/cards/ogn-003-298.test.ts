/**
 * Chemtech Enforcer — ogn-003-298 · Unit · Fury · 2 energy · 2 might
 *
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   When you play me, discard 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const ENFORCER = "ogn-003-298";
const FILLER = "ogn-175-298";

describe("Chemtech Enforcer (ogn-003-298)", () => {
  test("costs 2 energy to play; not playable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, ENFORCER, "ce").build();
    expect(game.p1.can("play", "ce")).toBe(true);
    await game.p1.play("ce", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ce")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, ENFORCER, "ce").build();
    expect(poor.p1.can("play", "ce")).toBe(false);
  });

  test("has the printed Assault 2 keyword", async () => {
    const game = await scenario().unit(P1, "base", ENFORCER, "ce").build();
    expect(game.state("ce").keywords).toContain("Assault");
    expect(game.state("ce").might).toBe(2); // no bonus at rest
  });

  test("Assault 2: as an attacker it has 4 Might — kills a 4-Might defender (rule 719)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", ENFORCER, "ce")
      .unit(P2, "bf1", { might: 4 }, "foe")
      .build();
    await game.p1.move("ce", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("Assault does not apply while defending: a 3-Might attacker kills it and survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ENFORCER, "ce")
      .unit(P2, "base", { might: 3 }, "foe")
      .build();
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("ce")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("When you play me, discard 1: the only other card in hand is discarded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, ENFORCER, "ce")
      .hand(P1, FILLER, "other")
      .build();
    await game.p1.play("ce", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("other");
      await game.settle();
    }
    expect(game.zoneOf("ce")).toBe("base");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });

  test("discard 1 with two other cards: controller chooses which one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, ENFORCER, "ce")
      .hand(P1, FILLER, "keep")
      .hand(P1, FILLER, "toss")
      .build();
    await game.p1.play("ce", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("toss");
    await game.settle();
    expect(game.zoneOf("toss")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
  });

  test("with an empty hand the play still resolves and nothing is discarded", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, ENFORCER, "ce").build();
    await game.p1.play("ce", { to: "base" });
    await game.settle();
    expect(game.zoneOf("ce")).toBe("base");
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });
});
