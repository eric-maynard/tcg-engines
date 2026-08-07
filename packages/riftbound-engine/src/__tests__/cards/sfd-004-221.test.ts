/**
 * Bushwhack — sfd-004-221 · Spell · Fury · 2 energy + [fury] · (no Action/Reaction → standard timing)
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   Friendly units enter ready this turn. Play a Gold gear token exhausted.
 *
 * Rules: 811 (Hidden: hide facedown at a battlefield you control for [rainbow]; play it from
 * there on a later turn ignoring cost), 143.4 (units enter exhausted by default — this spell
 * overrides that for friendly units for the rest of the turn), 187.5 (a Gold gear token is a
 * gear token with "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-004-221";
const VANILLA = { cardType: "unit", energyCost: 1, might: 2, name: "Vanilla" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1 } })
    .hand(P1, CARD, "bw")
    .hand(P1, VANILLA, "ally")
    .hand(P2, VANILLA, "foe");
}

describe("Bushwhack (sfd-004-221)", () => {
  test("cost: 2 energy + 1 fury; resolves to trash; unaffordable without the fury or with 1 energy", async () => {
    const game = await board().build();
    await game.p1.cast("bw");
    expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bw", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("bw")).toBe("trash");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "bw").build();
    expect(noPower.p1.can("cast", "bw")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, CARD, "bw").build();
    expect(lowEnergy.p1.can("cast", "bw")).toBe(false);
  });

  test("plays one Gold gear token into your base, exhausted", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    await game.p1.cast("bw");
    await game.settle();
    const gear = game.p1.gear();
    expect(gear).toHaveLength(1);
    const gold = game.state(gear[0] as string);
    expect(gold).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold", owner: P1 });
    expect(game.p2.gear()).toEqual([]);
  });

  test("'Friendly units enter ready this turn' — a unit played after Bushwhack resolves enters ready (rule 143.4 override)", async () => {
    const game = await board().build();
    await game.p1.cast("bw");
    await game.settle();
    await game.p1.play("ally");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isReady).toBe(true);
  });

  test("only THIS turn: the opponent's unit next turn enters exhausted, and so does ours on our following turn", async () => {
    const game = await board().build();
    await game.p1.cast("bw");
    await game.settle();
    await game.advanceTurn(); // pools empty; P2 channels 2 runes
    await game.p2.tapRunes(2);
    await game.p2.play("foe");
    await game.settle();
    expect(game.state("foe").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.play("ally");
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("standard timing (no [Action]/[Reaction]): not castable from hand on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "bw")).toBe(false);
  });

  test("Hidden: hide at a battlefield you control for [rainbow]; no chain; not revealable the same turn", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "bw")
      .build();
    await game.p1.hide("bw", "bf1");
    expect(game.zoneOf("bw")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "bw")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "bw").build();
    expect(enemyBf.p1.can("hide", "bw")).toBe(false);
  });

  test("Hidden: on a later turn it is played from facedown for 0 (no energy, no fury) and still makes an exhausted Gold token", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .hand(P1, CARD, "bw")
      .build();
    await game.p1.hide("bw", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.p1.reveal("bw");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bw", controller: P1 })]);
    await game.settle();
    expect(game.zoneOf("bw")).toBe("trash");
    const gear = game.p1.gear();
    expect(gear).toHaveLength(1);
    expect(game.state(gear[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
  });

  test("the Gold token is a real Gold gear (rule 187.5) — once ready, 'Kill this, [Exhaust]: [Add] [rainbow]' is activatable", async () => {
    const game = await board().build();
    await game.p1.cast("bw");
    await game.settle();
    const gold = game.p1.gear()[0] as string;
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    await game.p1.activate(gold);
    await game.settle();
    // rule 186.1 — the cashed-in token ceases to exist rather than landing in a zone.
    expect(game.has(gold) ? game.zoneOf(gold) : "gone").not.toBe("base");
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
