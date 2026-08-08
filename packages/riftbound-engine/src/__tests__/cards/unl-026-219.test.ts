/**
 * Xerath, Freed — unl-026-219 · Champion Unit (Xerath) · Fury · 5 energy · 5 Might
 *
 *   [fury], [Exhaust]: Deal 3 to a unit. Use this ability only while I'm at a battlefield.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. Location gate: in base the ability is not usable at all (rule 377 restriction),
 *     even fully paid; the same board with Xerath at a battlefield offers it.
 *  2. A standard move exhausts the mover — Xerath cannot move to a battlefield and fire
 *     the same turn ([Exhaust] is unpayable); after Awaken on his next turn he can.
 *  3. Target is "a unit" — ANY unit anywhere (base or battlefield, friend or foe),
 *     unlike Iron Ballista's "at a battlefield". Exactly-lethal (3 Might) dies, 4 Might lives
 *     with 3 damage; a pre-damaged 5-Might unit (2 dmg) dies to the extra 3.
 *  4. Timing: unit activated abilities are turn-player / Open-state only — not on the
 *     opponent's turn, not inside a showdown even when Xerath holds Focus.
 *  5. Cost: exactly 1 fury POWER (energy is not a substitute) + exhausting Xerath himself;
 *     killing a Deathknell unit with it puts the victim's trigger on the chain for ITS controller.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-026-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1-might Mind unit: [Deathknell] — Draw 1.

function atBattlefield() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "xerath")
    .unit(P2, "bf2", { might: 3, name: "Three" }, "three")
    .unit(P2, "base", { might: 4, name: "Four" }, "four")
    .unit(P1, "base", { might: 2, name: "Own" }, "own");
}

describe("Xerath, Freed (unl-026-219)", () => {
  test("parsed ability: one activated ability, cost = [fury] + exhaust, deal 3 to a unit, self-at-battlefield restriction", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, isChampion: true, might: 5, tags: ["Xerath"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { exhaust: true, power: ["fury"] },
      effect: { amount: 3, target: { type: "unit" }, type: "damage" },
      restrictions: [{ type: "self-at-battlefield" }],
      type: "activated",
    });
  });

  test("cost to play: 5 energy for a 5-Might champion unit; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "xerath").build();
    await game.p1.play("xerath");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("xerath")).toBe("base");
    expect(game.state("xerath").might).toBe(5);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "xerath").build();
    expect(poor.p1.can("play", "xerath")).toBe(false);
  });

  test("at a battlefield: pays 1 fury + exhausts Xerath, deals 3 — exactly lethal on a 3-Might unit at another battlefield", async () => {
    const game = await atBattlefield().build();
    expect(game.p1.can("activate", "xerath")).toBe(true);
    await game.p1.activate("xerath", 0, { targets: "three" });
    expect(game.state("xerath").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.state("xerath").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("'a unit' has no location limit: an enemy unit in its BASE takes 3 and survives at 4 Might", async () => {
    const game = await atBattlefield().build();
    const targets = game.p1.option("activate", "xerath")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["three"], ["four"], ["own"], ["xerath"]]));
    await game.p1.activate("xerath", 0, { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("base");
    expect(game.state("four").damage).toBe(3);
  });

  test("pre-damaged 5-Might unit (2 damage) dies to the additional 3", async () => {
    const game = await atBattlefield().unit(P2, "bf2", { might: 5, name: "Bruised" }, "bruised", { damage: 2 }).build();
    await game.p1.activate("xerath", 0, { targets: "bruised" });
    await game.settle();
    expect(game.zoneOf("bruised")).toBe("trash");
  });

  test("restriction: while Xerath is in the base the ability is not offered even with fury available", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "xerath")
      .unit(P2, "bf1", { might: 3 }, "three")
      .build();
    expect(game.p1.can("activate", "xerath")).toBe(false);
    const r = await game.p1.try((p) => p.activate("xerath", 0, { targets: "three" }));
    expect(r.ok).toBe(false);
    expect(game.state("three").damage).toBe(0);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("cost: needs fury POWER — 5 energy and an order power do not substitute; an exhausted Xerath cannot pay [Exhaust]", async () => {
    const noFury = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "xerath")
      .unit(P2, "base", { might: 3 }, "three")
      .build();
    expect(noFury.p1.can("activate", "xerath")).toBe(false);
    const tired = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "xerath", { exhausted: true })
      .unit(P2, "base", { might: 3 }, "three")
      .build();
    expect(tired.p1.can("activate", "xerath")).toBe(false);
  });

  test("moving to a battlefield exhausts Xerath, so he cannot fire that turn; after his next Awaken (still there) he can", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "xerath")
      .unit(P2, "base", { might: 3 }, "three")
      .build();
    await game.p1.move("xerath", "bf1");
    await game.settle();
    expect(game.locationOf("xerath")).toBe("bf1");
    expect(game.state("xerath").isExhausted).toBe(true);
    expect(game.p1.can("activate", "xerath")).toBe(false);
    await game.advanceTurn(); // → P2
    expect(game.p1.can("activate", "xerath")).toBe(false); // not on the opponent's turn (Open state, P2 acting)
    await game.advanceTurn(); // → P1, Awaken readied Xerath; power pool emptied at end of turn, so re-add
    expect(game.state("xerath").isReady).toBe(true);
    await game.p1.do("addResources", { power: { fury: 1 } });
    expect(game.p1.can("activate", "xerath")).toBe(true);
    await game.p1.activate("xerath", 0, { targets: "three" });
    await game.settle();
    expect(game.zoneOf("three")).toBe("trash");
  });

  test("timing: not usable inside a showdown even while Xerath's controller holds Focus (unit abilities are Open-state only)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "xerath")
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "bf2", { might: 3 }, "three")
      .build();
    await game.p1.move("scout", "bf2"); // combat showdown opens, P1 (attacker) has Focus
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "xerath")).toBe(false);
    await game.settle(); // combat: 2 vs 3 → scout dies
    expect(game.zoneOf("scout")).toBe("trash");
    // Back in the Open state on P1's turn → usable again.
    expect(game.p1.can("activate", "xerath")).toBe(true);
  });

  test("timing: not usable on the opponent's turn, nor in response on a chain the opponent started", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { fury: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "xerath")
      .unit(P2, "base", { might: 3 }, "three")
      .hand(P2, "ogn-058-298", "discipline") // Reaction: give a unit +2 Might this turn, draw 1
      .build();
    expect(game.p1.can("activate", "xerath")).toBe(false);
    await game.p2.cast("discipline", { targets: "three" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "xerath")).toBe(false);
  });

  test("killing a Deathknell unit with the ability puts the victim's trigger on the chain for ITS controller (P2 draws, not P1)", async () => {
    const game = await atBattlefield().unit(P2, "base", WATCHFUL_SENTRY, "sentry").build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.activate("xerath", 0, { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.p2.hand().length).toBe(p2Hand + 1);
    expect(game.p1.hand().length).toBe(p1Hand);
  });
});
