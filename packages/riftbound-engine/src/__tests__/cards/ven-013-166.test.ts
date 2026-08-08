/**
 * Shadow Assassin — ven-013-166 · Unit · Fury · 5 energy · 5 Might
 *
 *   I enter ready if you have a card with my name in your trash.
 *
 * Rules: 359.2.c (a played unit normally enters exhausted), 369.3 / 364.3.a ("I enter ready if …" is a
 * conditional replacement of that entry, checked AS the unit enters), 419.1 + riftboundfaq ruling
 * (a copy played FROM the trash has already left it and never counts itself), 143.4 (the entry state
 * does not depend on the destination), 108/"your trash" (only the controller's own trash counts).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "your trash": a Shadow Assassin in the OPPONENT's trash does nothing for you.
 *  2. "with my name": a different Fury unit in the trash is not enough; a second Shadow Assassin in
 *     hand / on the board / in the deck is not "in your trash".
 *  3. Checked as it enters: the copy that goes to the trash as Ruthless Strike's additional cost
 *     (ven-008-166, same domain) earlier in the turn already counts for the one played afterwards.
 *  4. Destination-independent: to base or to a controlled battlefield, ready either way — and a ready
 *     5-Might body at home can attack the same turn (that is the whole point of the card).
 *  5. Negative space: without the condition it is a plain exhausted 5/5 with nothing on the chain.
 *  6. Cost 5, no power; 4 energy is not enough.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-013-166";
const RUTHLESS_STRIKE = "ven-008-166"; // [Action] optional additional cost: discard 1. Deal 3 (5 if paid) to a unit at a battlefield.
const OTHER_FURY = "ogn-175-298"; // Shipyard Skulker — a differently named unit

describe("Shadow Assassin (ven-013-166)", () => {
  test("registry payload: Fury 5-cost 5-Might unit with ONE static enter-ready gated on name-in-trash", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, might: 5, name: "Shadow Assassin" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ condition: { type: "name-in-trash" }, effect: { target: "self", type: "enter-ready" }, type: "static" }]);
  });

  test("cost: 5 energy, no power; with 4 energy it is not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("sa")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 4, power: { fury: 3 } }).hand(P1, CARD, "sa").build();
    expect(poor.p1.can("play", "sa")).toBe(false);
  });

  test("negative space — empty trash: enters EXHAUSTED as a plain 5-Might unit, nothing on the chain", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa")).toMatchObject({ isExhausted: true, isReady: false, might: 5, zone: "base" });
    expect(game.chain()).toEqual([]);
  });

  test("a Shadow Assassin in YOUR trash → enters READY", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P1, CARD, "dead").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
    expect(game.zoneOf("dead")).toBe("trash"); // the trash copy is only looked at, never moved
    expect(game.violations()).toEqual([]);
  });

  test("'with my name': a differently named unit in your trash does not satisfy it → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P1, OTHER_FURY, "skulker").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });

  test("'YOUR trash': a Shadow Assassin in the OPPONENT's trash does not count → exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P2, CARD, "theirs").hand(P1, CARD, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });

  test("'in your trash' only: a second copy in hand, one on the board and one in the deck do not count → exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .hand(P1, CARD, "sa")
      .hand(P1, CARD, "spare")
      .unit(P1, "base", CARD, "onboard")
      .deckTop(P1, CARD, "indeck")
      .build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
  });

  test("destination-independent: played to a battlefield you control with the name in trash → ready there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .trash(P1, CARD, "dead")
      .hand(P1, CARD, "sa")
      .build();
    await game.p1.play("sa", { to: "bf1" });
    await game.settle();
    expect(game.state("sa")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
  });

  test("multi-step (Fury partner Ruthless Strike): discard copy #1 as the additional cost (5 dmg kills the 5-Might blocker), then copy #2 enters READY and attacks the now-empty battlefield the same turn for a point", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Blocker" }, "blocker")
      .hand(P1, RUTHLESS_STRIKE, "strike")
      .hand(P1, CARD, "fodder")
      .hand(P1, CARD, "sa")
      .build();
    await game.p1.cast("strike", { params: { discardId: "fodder", paidAdditionalCost: true }, targets: "blocker" });
    expect(game.zoneOf("fodder")).toBe("trash"); // 422.3: discarded before the spell is even on the chain
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("blocker");
      await game.settle();
    }
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.p1.energy()).toBe(5);
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa")).toMatchObject({ isReady: true, zone: "base" });
    await game.p1.move("sa", "bf1");
    await game.settle();
    expect(game.locationOf("sa")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("negative space of the combo: WITHOUT the discard the second copy enters exhausted and cannot move this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("bf1", { controller: null })
      .hand(P1, CARD, "fodder")
      .hand(P1, CARD, "sa")
      .build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.state("sa").isExhausted).toBe(true);
    expect(game.p1.can("move")).toBe(false);
    const r = await game.p1.try((p) => p.move("sa", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sa")).toBe("base");
  });
});
