/**
 * Renata Glasc, Mastermind — sfd-088-221 · Champion Unit (Renata Glasc) · Mind · 5 energy · 4 might
 *
 *   [1][mind]: Draw 1.
 *   [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.
 *   Use my abilities only while I'm at a battlefield.
 *
 * Head-judge notes (the tricky cases covered below):
 *  - "Use my abilities only while I'm at a battlefield" is a condition on ACTIVATING (377.2.b): in
 *    the base neither ability may even be announced, however much mind power is floating.
 *  - Unit activated abilities: controller's Main Phase, Open state, NOT during a showdown and never
 *    on the opponent's turn (145.2) — Renata has no [Action]/[Reaction] tag.
 *  - The draw ability has no [Exhaust]: usable repeatedly in one turn and while Renata is exhausted
 *    (e.g. right after she walked to the battlefield); the score ability needs her READY and
 *    exhausts her as a cost (paid on activation, before anyone can respond).
 *  - Score 1 point is not a Conquer, so the Final-Point restriction (471.1.b) does not apply
 *    (471.1.a.1): at 7 it wins the game outright.
 *  - Both abilities use the chain (they are not [Add] abilities): costs leave the pool
 *    immediately, the effect waits for passes.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-088-221";
const DRAW = 0;
const SCORE = 1;

function atBattlefield(resources: { energy: number; mind: number }, meta?: { exhausted?: boolean }) {
  return scenario()
    .resources(P1, { energy: resources.energy, power: { mind: resources.mind } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "renata", meta)
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry");
}

describe("Renata Glasc, Mastermind (sfd-088-221)", () => {
  test("play cost: 5 energy for a 4-might champion unit that enters the base exhausted; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "renata").build();
    await game.p1.play("renata");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("renata")).toBe("base");
    expect(game.state("renata").might).toBe(4);
    expect(game.state("renata").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 4, power: { mind: 4 } }).hand(P1, CARD, "renata").build();
    expect(poor.p1.can("play", "renata")).toBe(false);
  });

  test("[1][mind]: Draw 1 — pays on activation, sits on the chain, draws one card on resolution; Renata stays ready", async () => {
    const game = await atBattlefield({ energy: 1, mind: 1 }).build();
    const before = game.p1.hand().length;
    await game.p1.activate("renata", DRAW);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toHaveLength(before); // not yet
    await game.settle();
    expect(game.p1.hand()).toHaveLength(before + 1);
    expect(game.state("renata").isExhausted).toBe(false);
  });

  test("the draw ability has no [Exhaust]: usable twice in a turn, and usable while Renata is exhausted", async () => {
    const game = await atBattlefield({ energy: 2, mind: 2 }, { exhausted: true }).build();
    await game.p1.activate("renata", DRAW);
    await game.settle();
    await game.p1.activate("renata", DRAW);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.can("activate", "renata")).toBe(false); // out of resources now
  });

  test("[4][mind]×4, [Exhaust]: Score 1 point — full cost leaves the pool, Renata exhausts at once, +1 point on resolution", async () => {
    const game = await atBattlefield({ energy: 4, mind: 4 }).points(P1, 2).build();
    await game.p1.activate("renata", SCORE);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("renata").isExhausted).toBe(true); // cost, paid before priority
    expect(game.p1.points()).toBe(2);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // opponent gets a response window
    await game.settle();
    expect(game.p1.points()).toBe(3);
    expect(game.chain()).toHaveLength(0);
  });

  test("score ability is illegal when Renata is already exhausted, with only 3 mind, or with only 3 energy", async () => {
    const tired = await atBattlefield({ energy: 4, mind: 4 }, { exhausted: true }).build();
    expect(tired.p1.option(`activateAbility:renata#${SCORE}`)).toBeUndefined();
    expect(tired.p1.option(`activateAbility:renata#${DRAW}`)).toBeDefined(); // draw still fine
    const lowPower = await atBattlefield({ energy: 4, mind: 3 }).build();
    expect(lowPower.p1.option(`activateAbility:renata#${SCORE}`)).toBeUndefined();
    const lowEnergy = await atBattlefield({ energy: 3, mind: 4 }).build();
    expect(lowEnergy.p1.option(`activateAbility:renata#${SCORE}`)).toBeUndefined();
  });

  test("Score 1 point at 7/8 wins the game — a non-Conquer point ignores the Final-Point restriction (471.1.a.1)", async () => {
    const game = await atBattlefield({ energy: 4, mind: 4 }).points(P1, 7).victoryScore(8).build();
    await game.p1.activate("renata", SCORE);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("walk-up line: move Renata base → bf1 (exhausts her), then draw is usable there but the [Exhaust] score is not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 5 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Flag" }, "flag")
      .unit(P1, "base", CARD, "renata")
      .build();
    await game.p1.move("renata", "bf1");
    await game.settle();
    expect(game.locationOf("renata")).toBe("bf1");
    expect(game.state("renata").isExhausted).toBe(true);
    expect(game.p1.option(`activateAbility:renata#${DRAW}`)).toBeDefined();
    expect(game.p1.option(`activateAbility:renata#${SCORE}`)).toBeUndefined();
    await game.p1.activate("renata", DRAW);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test.failing("BUG: 'only while I'm at a battlefield' — in the base neither ability may be activated (377.2.b)", async () => {
    // Expected: with Renata ready in base and 5 energy / 5 mind, no activateAbility option exists for her.
    // Actual: the restriction sentence is not parsed/enforced; both abilities are offered from the base.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 5 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "renata")
      .build();
    expect(game.p1.can("activate", "renata")).toBe(false);
    expect(game.p1.legal().filter((o) => o.card === "renata" && o.verb === "activate")).toEqual([]);
  });

  test("timing (145.2): nothing is offered on the opponent's turn in their Open state, even at a battlefield with full resources", async () => {
    const game = await atBattlefield({ energy: 5, mind: 5 }).active(P2).build();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("activate", "renata")).toBe(false);
  });

  test.failing("BUG: timing (145.2) — unit abilities are not usable during a showdown (defending on the opponent's turn)", async () => {
    // Expected: when P2 attacks bf1 and passes Focus to P1, Renata (no [Action]/[Reaction]) offers nothing.
    // Actual: both activated abilities appear in P1's showdown menu.
    const game = await atBattlefield({ energy: 5, mind: 5 }).active(P2).unit(P2, "base", { might: 1, name: "Poker" }, "poker").build();
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.legal().filter((o) => o.card === "renata" && o.verb === "activate")).toEqual([]);
  });

  test.failing("BUG: timing (145.2) — not usable during a showdown on your OWN turn either (another unit attacking bf2)", async () => {
    // Expected: while P1's Striker is in a showdown at bf2, P1 holds Focus but Renata's abilities are not activatable.
    // Actual: they are offered alongside passFocus.
    const game = await atBattlefield({ energy: 5, mind: 5 }).unit(P1, "base", { might: 3, name: "Striker" }, "striker").build();
    await game.p1.move("striker", "bf2");
    expect(game.p1.can("passFocus")).toBe(true); // we are in the showdown
    expect(game.p1.legal().filter((o) => o.card === "renata" && o.verb === "activate")).toEqual([]);
  });

  test("parsed abilities: two activated abilities with the printed costs and draw/score effects", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, isChampion: true, might: 4, tags: ["Renata Glasc"] });
    const abilities = def?.abilities as { type: string; cost?: unknown; effect?: unknown }[];
    expect(abilities.filter((a) => a.type === "activated")).toHaveLength(2);
    expect(abilities[DRAW]).toMatchObject({ cost: { energy: 1, power: ["mind"] }, effect: { amount: 1, type: "draw" }, type: "activated" });
    expect(abilities[DRAW]?.cost).not.toHaveProperty("exhaust");
    expect(abilities[SCORE]).toMatchObject({
      cost: { energy: 4, exhaust: true, power: ["mind", "mind", "mind", "mind"] },
      effect: { amount: 1, type: "score" },
      type: "activated",
    });
  });

  test.failing("BUG: parsed abilities drop the 'Use my abilities only while I'm at a battlefield' restriction entirely", async () => {
    // Expected: each activated ability (or the card) carries an at-battlefield use condition.
    // Actual: neither ability has any condition/restriction field; the third sentence produced nothing.
    const pool = await loadDefaultCardPool();
    const abilities = pool.get(CARD)?.abilities ?? [];
    expect(abilities.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(abilities)).toMatch(/battlefield/i);
  });
});
