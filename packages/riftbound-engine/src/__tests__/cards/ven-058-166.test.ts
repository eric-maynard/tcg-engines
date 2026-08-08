/**
 * Patched Porobot — ven-058-166 · Unit · Mind · 2 energy · 2 Might
 *
 *   (I enter exhausted.)
 *   When you play me, if you control 3 or more other gear, draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. 383.2.a.1 — the "if you control 3 or more other gear" sits IMMEDIATELY after the trigger condition,
 *      so it is part of the CONDITION: with fewer than 3 gear the ability never goes on the chain at all;
 *      with 3+ it is finalized and draws exactly 1 (not one per gear).
 *   2. "you control" — only P1's gear counts; the opponent's board is irrelevant. Equipment is Gear
 *      (a Hand Hammer lying in base counts toward the 3).
 *   3. Threshold edges: 0 / 2 gear → nothing; exactly 3 → draw; 4 → still exactly one card.
 *   4. "other gear" — the printed word "other" only makes sense if the Porobot is itself Gear (a Mech
 *      gear-unit; cf. the "(I enter exhausted.)" reminder, 178.1.a.1). The data set types it as a plain
 *      unit, so a Porobot already on the board does not count toward a second Porobot's three.
 *   5. It enters exhausted like any unit (359.2.c) and has no Accelerate to buy readiness.
 *   6. The draw comes off the top of the Main Deck after the unit is already on the board (383.4.b).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-058-166";
const ORB = "ogn-090-298"; // Orb of Regret — 1-cost Mind gear (inert unless exhausted for its ability)
const HAND_HAMMER = "ven-027-166"; // Equipment gear, [Equip][calm]
const FILLER = "ogn-175-298";

/** P1 with `gear` Orbs in base, Porobot in hand (paid), a known 3-card deck top. */
function withGear(gear: number, enemyGear = 0) {
  const b = scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
  for (let i = 0; i < gear; i++) {
    b.gear(P1, ORB, `orb${i + 1}`);
  }
  for (let i = 0; i < enemyGear; i++) {
    b.gear(P2, ORB, `foe${i + 1}`);
  }
  return b;
}

describe("Patched Porobot (ven-058-166)", () => {
  test("costs 2 energy; a 2-Might Mind unit that enters the base EXHAUSTED with no Accelerate option; 1 energy is not enough", async () => {
    const game = await withGear(0).build();
    // An Accelerate unit offers paidAdditionalCost ∈ {false,true}; the Porobot must not offer `true`.
    expect(game.p1.option("playUnit", "poro")?.fields.find((f) => f.name === "paidAdditionalCost")?.options ?? []).not.toContain(true);
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, domains: ["mind"], isExhausted: true, might: 2, zone: "base" });
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 2 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("with exactly 3 gear you control: the play trigger goes on the chain and draws exactly 1 (the top card) when it resolves", async () => {
    const game = await withGear(3).build();
    expect(game.p1.gear()).toHaveLength(3);
    await game.p1.play("poro");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]); // not drawn yet
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d2", "d3"]);
  });

  test("with 4 gear it is still exactly ONE card, not one per gear", async () => {
    const game = await withGear(4).build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("with 2 gear (one short) nothing is drawn; with 0 gear nothing is drawn", async () => {
    const two = await withGear(2).build();
    await two.p1.play("poro");
    await two.settle();
    expect(two.p1.hand()).toEqual([]);
    expect(two.p1.deck()[0]).toBe("d1");
    expect(two.zoneOf("poro")).toBe("base");

    const none = await withGear(0).build();
    await none.p1.play("poro");
    await none.settle();
    expect(none.p1.hand()).toEqual([]);
    expect(none.p1.deck()[0]).toBe("d1");
  });

  test("383.2.a.1 — the 'if' is part of the trigger CONDITION: with only 2 gear the ability is never put on the chain (play resolves straight back to an open main phase)", async () => {
    const game = await withGear(2).build();
    await game.p1.play("poro");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'you control' — the opponent's gear does not count: P1 on 2 gear with P2 holding 3 draws nothing", async () => {
    const game = await withGear(2, 3).build();
    expect(game.p2.gear()).toHaveLength(3);
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]); // and certainly not the opponent
  });

  test("Equipment is Gear: 2 Orbs + an unattached Hand Hammer in base make three → draw 1", async () => {
    const game = await withGear(2).gear(P1, HAND_HAMMER, "hammer").build();
    expect(game.p1.gear()).toHaveLength(3);
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("units are not gear: 2 Orbs + a friendly unit (and the opponent's units) leave the count at 2 → no draw", async () => {
    const game = await withGear(2).unit(P1, "base", { might: 3 }, "buddy").unit(P2, "base", { might: 3 }, "foe").build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
  });

  test("as the data set types it (plain unit), a Porobot already on the board is NOT 'other gear' for the next one: 2 Orbs + Porobot #1 → Porobot #2 draws nothing", async () => {
    // Printed "other gear" hints the real card is a Mech gear-unit; the engine/card data model it as a
    // unit only, so this documents the current, data-consistent behaviour.
    const game = await withGear(2).unit(P1, "base", CARD, "poro1").build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("poro1").cardType).toBe("unit");
  });

  test("multi-turn line: play it with 3 gear on turn N (draw), it readies at your next Awaken and can move out like any unit", async () => {
    const game = await withGear(3).battlefield("bf1", { controller: null }).build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.state("poro").isExhausted).toBe(true);
    expect(game.p1.can("move")).toBe(false); // nothing ready to move
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, awakened
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro").isReady).toBe(true);
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("registry payload: one play-self trigger drawing 1, gated by a control-3+-friendly-gear condition, on a 2/2 Mind non-champion with no keywords", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 2, might: 2, name: "Patched Porobot" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.keywords ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        condition: { target: { controller: "friendly", quantity: { atLeast: 3 }, type: "gear" }, type: "control" },
        effect: { amount: 1, type: "draw" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});
