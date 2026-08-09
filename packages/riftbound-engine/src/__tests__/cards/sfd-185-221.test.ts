/**
 * Glorious Executioner — sfd-185-221 · Legend (Draven) · Fury/Chaos
 *
 *   When you win a combat, draw 1. (You win if only your units remain after combat.)
 *
 * Rules: 466.3.a (a PLAYER wins a combat when they had the attacker/defender designation and are
 * the only player with units remaining at that battlefield in the Resolution Step), 466.3.d ("No
 * Result" when the attackers were recalled because defenders survived, when both sides still have
 * units, or when nobody does), 466.1.a.2 (surviving attackers facing surviving defenders are
 * recalled), 383 (triggered ability → chain item), 469 (walking onto an undefended battlefield is a
 * conquer, not a combat).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. It is the PLAYER who wins: with two of my units surviving I still won ONE combat → exactly
 *     one card, not one per unit.
 *  2. Defending counts: when the opponent attacks on THEIR turn and only my units remain, I draw
 *     on their turn.
 *  3. No Result ≠ win: mutual wipe (nobody remains) draws nothing; mutual survival (attackers
 *     recalled) draws nothing for EITHER side — the defender did not "win" either.
 *  4. Conquering an empty battlefield involves no combat → no draw (but still scores).
 *  5. When the OPPONENT wins the combat, only their legend would care — mine draws nothing.
 *  6. Partners: Corrupt Enforcer ("When I win a combat, draw 1") → two separate triggers, two
 *     cards; Draven, Vanquisher ("When I win a combat, play a Gold token") → a card AND a Gold.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-185-221";
const CORRUPT_ENFORCER = "sfd-123-221"; // 4 might · When I move to a battlefield, discard 1. When I win a combat, draw 1.
const DRAVEN_VANQUISHER = "sfd-020-221"; // 4 might · When I win a combat, play a Gold gear token exhausted. (+ optional [fury] pump)

/** P1 (legend owner) has an attacker in base; P2 defends bf1 with one unit. */
function attack(attackerMight: number, defenderMight: number, defenderMeta?: { stunned?: boolean }) {
  return scenario()
    .legend(P1, CARD, "exec")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: attackerMight, name: "Axe" }, "axe")
    .unit(P2, "bf1", { might: defenderMight, name: "Wall" }, "wall", defenderMeta);
}

describe("Glorious Executioner (sfd-185-221)", () => {
  test("registry payload: a Draven legend with one triggered ability — win-combat (controller) → draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Draven", domain: ["fury", "chaos"], name: "Glorious Executioner" });
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, type: "draw" }, trigger: { event: "win-combat", on: "controller" }, type: "triggered" },
    ]);
  });

  test("attacking win: my 4-might Axe kills their 3-might Wall and survives → I draw exactly 1 (and conquer)", async () => {
    const game = await attack(4, 3).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("axe")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("the draw is a triggered chain item sourced from the legend: nothing is drawn until it resolves", async () => {
    const game = await attack(4, 3).autoProcedures(false).build();
    await game.p1.move("axe", "bf1");
    // Drive the showdown/combat by hand until the legend's trigger appears on the chain.
    let sawTrigger = false;
    for (let i = 0; i < 20 && !sawTrigger; i++) {
      if (game.chain().some((c) => c.cardId === "exec" && c.triggered)) {
        sawTrigger = true;
        break;
      }
      const d = game.decision();
      if (!d || d.kind !== "action") {
        break;
      }
      const key = d.passKey ?? d.options.find((o) => o.verb !== "concede")?.key;
      if (!key) {
        break;
      }
      await game.act(d.seat, { key, kind: "action" });
    }
    expect(sawTrigger).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "exec", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("defending win on the opponent's turn: their 3-might raider dies on my 4-might Wall → I draw 1, they draw nothing", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "exec")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space — mutual kill (3 vs 3): nobody remains, No Result (466.3.d) → no draw", async () => {
    const game = await attack(3, 3).build();
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — both survive (stunned 5-might Wall deals no damage, takes 4): attacker recalled, No Result → NEITHER player draws", async () => {
    const game = await attack(4, 5, { stunned: true }).legend(P2, CARD, "theirExec").build();
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.locationOf("axe")).toBe("base");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space — I LOSE the combat (3 into 5): the opponent won, my legend draws me nothing", async () => {
    const game = await attack(3, 5).build();
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(0); // P2 has no such legend
  });

  test("negative space — walking onto an EMPTY enemy battlefield conquers without a combat: a point but no card", async () => {
    const game = await scenario().legend(P1, CARD, "exec").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Axe" }, "axe").build();
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'When you win a combat' fires once per surviving unit instead of once per combat — two survivors draw 2, rules say 1 (466.3.a)", async () => {
    // Expected: the PLAYER wins one combat → the legend triggers once → +1 card.
    // Actual: resolve-full-combat emits a `win-combat` event per remaining unit and the legend's
    // `on: "controller"` matcher fires for each → 2 cards.
    const game = await scenario()
      .legend(P1, CARD, "exec")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Axe One" }, "axe1")
      .unit(P1, "base", { might: 4, name: "Axe Two" }, "axe2")
      .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall")
      .build();
    await game.p1.move(["axe1", "axe2"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["axe1", "axe2"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("two combats in one turn, two wins → two cards (one per combat)", async () => {
    const game = await scenario()
      .legend(P1, CARD, "exec")
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Axe One" }, "axe1")
      .unit(P1, "base", { might: 4, name: "Axe Two" }, "axe2")
      .unit(P2, "bf1", { might: 2, name: "Wall One" }, "wall1")
      .unit(P2, "bf2", { might: 2, name: "Wall Two" }, "wall2")
      .build();
    await game.p1.move("axe1", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    await game.p1.move("axe2", "bf2");
    await game.settle();
    expect(game.zoneOf("wall2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(2);
  });

  test("partner — Corrupt Enforcer wins alone: his own 'draw 1' AND the legend's fire → net +2 cards (after his move-in discard)", async () => {
    const game = await scenario()
      .legend(P1, CARD, "exec")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CORRUPT_ENFORCER, "ce")
      .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall")
      .hand(P1, "ogn-175-298", "junk")
      .build();
    await game.p1.move("ce", "bf1");
    await game.settle({ policy: "first" }); // discard the only card (junk), fight, resolve both win triggers
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("ce")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("partner — Draven, Vanquisher wins alone: a Gold token (his trigger) AND a card (the legend's)", async () => {
    const game = await scenario()
      .legend(P1, CARD, "exec")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", DRAVEN_VANQUISHER, "draven")
      .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall")
      .build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no(); // decline the [fury] pump
      await game.settle();
    }
    expect(game.zoneOf("wall")).toBe("trash");
    const gold = game.p1.base().filter((id) => game.state(id).name === "Gold");
    expect(gold).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(1);
  });
});
