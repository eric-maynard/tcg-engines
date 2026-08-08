/**
 * Scrutinizing Sergeant — unl-157-219 · Unit · Order · 6 energy (no power) · 6 Might
 *
 *   When you play me, gain 1 XP for each friendly unit.
 *
 * Rules: 383.4.a (play effects are triggered abilities put on the chain after the permanent is
 * finalized and has ENTERED the board, 359.2 → the Sergeant is itself a friendly unit by the time the
 * count happens), 359.3.f / 355.5.a ("for each friendly unit" is a criteria count evaluated on
 * RESOLUTION, not a target — a unit removed in response is not counted), 740.1.a ("friendly" = shares
 * a CONTROLLER with the ability; ownership is irrelevant), 355.9.a.1 ("unit" = a unit on the board:
 * base and battlefields, never hand/trash/champion zone), 730 (XP persists; Level gates read it live).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. It counts ITSELF: played onto an empty board it is worth exactly 1 XP, not 0.
 *  2. Everything friendly on the board counts wherever it is (base + every battlefield); enemy units,
 *     friendly gear, the legend, and units in hand / trash / champion zone do not.
 *  3. Counted on resolution: P2 answering the trigger with Gust (bounce a ≤3-Might unit at a
 *     battlefield) shrinks the payout by one.
 *  4. Control, not ownership: a unit P1 stole from P2 counts; a P1-owned unit P2 controls does not.
 *  5. Partner (Order): the XP is real and immediate — Sergeant with two allies = 3 XP, which turns on
 *     Bandle Soldier's "[Level 3] I enter ready" for the very next play; and Enthralling Protector can
 *     spend it.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-157-219";
const GUST = "ogn-169-298"; // Chaos Reaction, 1 energy: Return a unit at a battlefield with 3 Might or less to its owner's hand.
const BANDLE_SOLDIER = "unl-151-219"; // Order 4+[order], 5 Might: [Level 3] I enter ready.
const PROTECTOR = "unl-162-219"; // Order 2, 2 Might: [Hunt] / Spend 2 XP: Buff me.

describe("Scrutinizing Sergeant (unl-157-219)", () => {
  test("registry payload: 6-cost Order unit, 6 Might, no power; exactly one play-self trigger gaining XP equal to a COUNT of friendly units", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, might: 6, name: "Scrutinizing Sergeant" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.isChampion).toBeFalsy();
    expect(def?.abilities).toEqual([
      {
        effect: { amount: { count: { controller: "friendly", type: "unit" } }, type: "gain-xp" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: exactly 6 energy, no power; the play trigger goes on the chain (XP unchanged until it resolves); enters base exhausted as a 6; 5 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).xp(P1, 0).hand(P1, CARD, "sgt").build();
    await game.p1.play("sgt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("sgt")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sgt", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.state("sgt")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6, zone: "base" });
    expect((await scenario().resources(P1, { energy: 5, power: { order: 3 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("counts ITSELF: onto an otherwise empty board it is worth exactly 1 XP", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).xp(P1, 0).hand(P1, CARD, "sgt").build();
    await game.p1.play("sgt");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("counts every FRIENDLY unit on the board wherever it is (2 in base + 2 across battlefields + itself = 5) and ignores enemy units, friendly gear, the legend and cards in hand/trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .xp(P1, 2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .unit(P1, "base", { might: 1, name: "B" }, "b")
      .unit(P1, "bf1", { might: 2, name: "C" }, "c")
      .unit(P1, "bf2", { might: 2, name: "D" }, "d")
      .unit(P2, "bf2", { might: 3, name: "E1" }, "e1")
      .unit(P2, "base", { might: 3, name: "E2" }, "e2")
      .gear(P1, { name: "Trinket" }, "trinket")
      .legend(P1, "unl-203-219", "legend")
      .hand(P1, { cardType: "unit", might: 2, name: "In Hand" }, "inHand")
      .trash(P1, { cardType: "unit", might: 2, name: "In Trash" }, "inTrash")
      .hand(P1, CARD, "sgt")
      .build();
    await game.p1.play("sgt", { to: "base" });
    await game.settle();
    expect(game.p1.xp()).toBe(2 + 5);
    expect(game.p2.xp()).toBe(0);
  });

  test("played TO a battlefield you control it still counts the whole board (ally in base + itself = 2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P1, CARD, "sgt")
      .build();
    await game.p1.play("sgt", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("sgt")).toBe("bf1");
    expect(game.p1.xp()).toBe(2);
  });

  test("counted on RESOLUTION: P2 answers the trigger with Gust, bouncing the 2-Might ally at bf1 → only Sergeant + the base ally remain → 2 XP, not 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P2, GUST, "gust")
      .hand(P1, CARD, "sgt")
      .build();
    await game.p1.play("sgt", { to: "base" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sgt"]);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sgt", "gust"]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("'friendly' is CONTROL (740.1.a): a P2-owned unit that P1 controls counts; a P1-owned unit that P2 controls does not (stolen + itself = 2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Borrowed" }, owner: P2, zone: "bf1" })
      .card("lent", { controller: P2, def: { cardType: "unit", might: 3, name: "Lent Out" }, owner: P1, zone: "bf2" })
      .hand(P1, CARD, "sgt")
      .build();
    await game.p1.play("sgt", { to: "base" });
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("only YOUR play: P2 playing their own Sergeant with P1's board full of units gives P2 XP for P2's units (itself only = 1) and P1 nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6 })
      .unit(P1, "base", { might: 1 }, "a")
      .unit(P1, "base", { might: 1 }, "b")
      .hand(P2, CARD, "theirs")
      .build();
    await game.p2.play("theirs");
    await game.settle();
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.xp()).toBe(0);
  });

  test("partner (Order) — the XP is immediate and real: Sergeant + two allies = 3 XP switches on Bandle Soldier's [Level 3] 'I enter ready' for the very next play this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { order: 1 } })
      .xp(P1, 0)
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .unit(P1, "base", { might: 1, name: "B" }, "b")
      .hand(P1, CARD, "sgt")
      .hand(P1, BANDLE_SOLDIER, "bandle")
      .build();
    await game.p1.play("sgt");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    await game.p1.play("bandle");
    await game.settle();
    expect(game.state("bandle")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state("sgt").isExhausted).toBe(true); // the Sergeant itself got no such favour
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("partner (Order) — Enthralling Protector can spend the fresh XP at once: Protector + Sergeant = 2 XP → 'Spend 2 XP: Buff me' → 0 XP and a buffed 3-Might Protector", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).xp(P1, 0).unit(P1, "base", PROTECTOR, "prot").hand(P1, CARD, "sgt").build();
    expect(game.p1.can("activate", "prot")).toBe(false); // 0 XP: cannot pay
    await game.p1.play("sgt");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    await game.p1.activate("prot");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.state("prot")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("XP persists and stacks across turns: 1 XP now, still 1 next turn; a second Sergeant later counts the first (→ 1 + 2 = 3)", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "sgt1").hand(P1, CARD, "sgt2").build();
    await game.p1.play("sgt1");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    await game.p1.tapRunes(2); // the 2 runes channelled at P1's turn start
    await game.p1.do("addResources", { energy: 4 }); // sandbox top-up to afford the second 6-drop
    expect(game.p1.energy()).toBe(6);
    await game.p1.play("sgt2");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
  });
});
