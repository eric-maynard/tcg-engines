/**
 * Power Nexus — sfd-214-221 · Battlefield
 *
 *   When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point.
 *
 * Rules: 469.2 / 315.2.b (Hold = keep control through your Beginning Phase's Scoring Step; 1 point),
 * 471.2.b (hold abilities trigger at the held battlefield), 383.3.b.1 (an optional-cost trigger: the
 * cost is paid as the trigger is finalized), 135.2.e.5.a ([rainbow] = one Power of ANY domain — four
 * pips = four Power, Energy is useless), 317.2.d + 316.3 (Rune Pools empty at the end of every turn
 * and again as the Main Phase opens — so nothing can be "saved up" for this; the Power has to be added
 * WHILE the payment is being asked for), 164.2.b + 429.3 (a rune's "Recycle this: [Reaction] — Add
 * [C]" is exactly such an Add-during-payment), 471.1.a.1 (a point that is not a Conquer point is not
 * subject to the Final Point restriction — this can be the winning point), 469.1 (conquer ≠ hold).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The realistic line: my turn starts, Awaken readies my runes, I hold the Nexus (1 pt), the
 *     trigger asks for [rainbow]×4 → I RECYCLE four runes right there and say yes → 2nd point.
 *  2. Energy is not Power: tapping four runes for energy during the prompt pays nothing.
 *  3. Optional: declining (or being unable to pay) costs nothing and the hold point stands.
 *  4. Hold only — conquering the Nexus with four Power floating asks nothing.
 *  5. "You" = the holder: the opponent holding it is the one asked.
 *  6. From 6 points: hold → 7, pay → 8 = victory (non-conquer point, 471.1.a.1).
 */

import { describe, expect, test } from "bun:test";
import type { Game, YesNoDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-214-221";

/** P2 is about to end turn 2; P1 controls the Nexus with a unit on it and has 5 channeled runes (3 fury, 2 calm). */
function aboutToHold(opts: { points?: number } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, opts.points ?? 0)
    .battlefield("nexus", { controller: P1, def: CARD, inert: false })
    .battlefield("other", { controller: null })
    .unit(P1, "nexus", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .runes(P1, "fury", 3)
    .runes(P1, "calm", 2)
    .fillDecks({ main: 10, runes: 0 }); // no channel noise: P1's rune pool stays at exactly these 5
}

/** P2 ends the turn; returns P1's pay prompt for the Nexus (asserting it is one). */
async function holdAndGetPrompt(game: Game): Promise<YesNoDecision> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
  return d as YesNoDecision;
}

describe("Power Nexus (sfd-214-221)", () => {
  test("registry payload: one optional 'hold here' trigger — pay-cost condition of four rainbow pips, effect score 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Power Nexus" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { power: ["rainbow", "rainbow", "rainbow", "rainbow"] }, type: "pay-cost" },
        effect: { amount: 1, type: "score" },
        optional: true,
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("holding scores the ordinary point at once and puts the Nexus trigger on the chain, asking P1 whether to pay [rainbow]×4 — with an (inevitably) empty pool 'yes' is not acceptable yet", async () => {
    const game = await aboutToHold().build();
    const d = await holdAndGetPrompt(game);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nexus", controller: P1, triggered: true })]);
    expect(d.prompt).toContain("[rainbow][rainbow][rainbow][rainbow]");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // 317.2.d — pools emptied at the end of P2's turn
    expect(d.canAccept).toBe(false);
    expect(game.p1.runes({ ready: true })).toHaveLength(5); // Awaken already readied them (315.1.b)
  });

  // BUG — expected (164.2.b + 429.3): "Recycle this: [Reaction] — Add [C]" is an Add ability usable whenever a payment
  // is being asked for, so with the pay prompt open P1 recycles four ready runes (any domains — [rainbow] is any Power),
  // 'yes' becomes acceptable, the four Power are spent and P1 scores a second point. Actual: only "[Exhaust]: Add [1]"
  // is offered during the prompt (`recycleRune` is refused under every pending choice), so the Nexus can never be paid
  // on the natural line.
  test.failing("BUG: core line — recycle four runes during the pay prompt (164.2.b/429.3), accept → 4 Power spent, 2 points, one rune left in the pool", async () => {
    const game = await aboutToHold().build();
    await holdAndGetPrompt(game);
    expect(game.p1.legal().some((o) => o.verb === "recycleRune")).toBe(true);
    await game.p1.recycleRune({ domain: "fury" });
    await game.p1.recycleRune({ domain: "fury" });
    await game.p1.recycleRune({ domain: "calm" });
    await game.p1.recycleRune({ domain: "calm" });
    expect(game.p1.power()).toBe(4);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power()).toBe(0); // paid at finalization (383.3.b.1)
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("Energy is not Power: tapping four runes for energy while the prompt is open still leaves 'yes' unacceptable; forcing it is rejected", async () => {
    const game = await aboutToHold().build();
    await holdAndGetPrompt(game);
    expect(game.p1.legal().some((o) => o.verb === "tapRune")).toBe(true); // the [Exhaust]: Add [1] Reaction IS offered
    await game.p1.tapRunes(4);
    expect(game.p1.energy()).toBe(4);
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    expect(game.p1.points()).toBe(1);
  });

  test("optional — declining: the trigger leaves the chain, the hold point stands, no resources move, and the turn proceeds to an ordinary Main Phase (+1 draw)", async () => {
    const game = await aboutToHold().build();
    await holdAndGetPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(5);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.gameState.battlefields.nexus?.controller).toBe(P1);
  });

  test("hold ONLY (469.1 ≠ 469.2): conquering the Nexus with four rainbow Power floating asks nothing and takes nothing — just the conquer point", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 4 } })
      .battlefield("nexus", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "nexus");
    await game.settle();
    expect((await game.settle()).reason).toBe("open");
    expect(game.gameState.battlefields.nexus?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 4 } });
    expect(game.chain()).toEqual([]);
  });

  // BUG — expected (471.2.b): hold abilities trigger only at the battlefield that was held. Actual: the trigger's
  // `location: "here"` is not honoured — P1 (who brought the Nexus) holding the OTHER battlefield still gets the
  // Power Nexus pay prompt on the chain.
  test.failing("BUG: 'here' — holding a DIFFERENT battlefield while the Nexus lies uncontrolled asks nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("nexus", { controller: null, def: CARD, inert: false })
      .battlefield("other", { controller: P1 })
      .unit(P1, "other", { might: 2, name: "Holder" }, "holder")
      .runes(P1, "fury", 5)
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("'you' = the holder: when P2 holds the Nexus it is P2 who is asked (and scores), never P1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("nexus", { controller: P2, def: CARD, inert: false })
      .unit(P2, "nexus", { might: 2, name: "Their Holder" }, "theirs")
      .runes(P2, "mind", 5)
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    await game.p2.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(1);
  });

  // BUG — same root cause as the core line (no way to Add Power during the prompt). Expected: from 6 points the hold
  // makes 7 and the paid Nexus point makes 8 = the Victory Score; a non-conquer point is not subject to the Final
  // Point restriction (471.1.a.1), so P1 wins on the spot.
  test.failing("BUG: from 6 points — hold (7), recycle four and pay (8) → P1 wins the game with a non-conquer final point (471.1.a.1)", async () => {
    const game = await aboutToHold({ points: 6 }).build();
    await holdAndGetPrompt(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    for (let i = 0; i < 4; i++) {
      await game.p1.recycleRune();
    }
    await game.p1.yes();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("hold at 7 points: the ordinary hold point alone already wins (holds are not conquer-restricted either) — the Nexus question never matters", async () => {
    const game = await aboutToHold({ points: 7 }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
