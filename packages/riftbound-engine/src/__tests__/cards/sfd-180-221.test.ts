/**
 * Fiora, Worthy — sfd-180-221 · Champion Unit · Order · 3 energy (no power) · 3 Might · Fiora
 *
 *   When a unit you control becomes [Mighty], you may pay [order] to ready it. (A unit is Mighty
 *   while it has 5+ [Might].)
 *
 * Head-judge notes — the tricky spots for this card:
 *  - "becomes Mighty" (709) is an EDGE: Might crosses from < 5 to ≥ 5. A unit already at 5+ that grows
 *    does not trigger; a pump that lands one short (→ 4) does not trigger; 2 → 5 exactly does.
 *  - Any source of Might counts (710: current Might): +N this turn spells, buffs/+1s, an attached
 *    Equipment's bonus, and combat-only keywords (a 4-Might Assault unit becomes 5 the moment it is an
 *    attacker — cf. the Fiora, Victorious example in 476.3).
 *  - "a unit you control" includes Fiora herself (3 + 3); excludes enemy units even if I cast the pump;
 *    an opposing Fiora never triggers off my units. Fiora must be on the board (not hand).
 *  - Optional + cost: the trigger goes on the chain; on resolution her controller may pay [order]; with
 *    no order power "yes" is not a legal answer and the unit stays exhausted; declining keeps the power.
 *  - "ready IT" = the unit that became Mighty (not Fiora, unless she is that unit).
 *  - Each time: the +3 expires at end of turn (no longer Mighty, 710) and the same unit becoming Mighty
 *    again next turn triggers again. Two units crossing at once (Bonds of Strength) → two triggers,
 *    each wanting its own [order].
 *  - Natural line: pump an EXHAUSTED unit in base to Mighty, pay [order], it readies and can still
 *    move to a battlefield this turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-180-221";
const CALL_TO_GLORY = "ogn-207-298"; // 3-cost order Reaction: "Give a unit +3 [Might] this turn."
const BONDS = "sfd-151-221"; // 2-cost order Reaction: "Give two friendly units each +1 [Might] this turn."
const DORANS_BLADE = "sfd-095-221"; // Equipment [Equip] [body], +2 Might

/** P1: exhausted Fiora + an exhausted `might`-Might Squire in base, Call to Glory in hand, 3 energy + `order` order. */
function board(might = 2, order = 1) {
  return scenario()
    .resources(P1, { energy: 3, power: { order } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", CARD, "fiora", { exhausted: true })
    .unit(P1, "base", { might, name: "Squire" }, "squire", { exhausted: true })
    .hand(P1, CALL_TO_GLORY, "ctg");
}

/** Pass priority until Fiora's yes/no (returns true) or the open main phase (returns false). */
async function untilFioraAsks(game: Game): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return false;
    }
    if (d.kind === "yes-no") {
      return true;
    }
    if (d.kind !== "action") {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
    await game.seat(d.seat).pass();
  }
  return false;
}

describe("Fiora, Worthy (sfd-180-221)", () => {
  test("parsed abilities match the printed text: one optional become-mighty trigger on friendly units, pay [order] → ready the trigger source", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, isChampion: true, might: 3, tags: ["Fiora"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { power: ["order"] }, type: "pay-cost" },
        effect: { target: { type: "trigger-source" }, type: "ready" },
        optional: true,
        trigger: { event: "become-mighty", on: "friendly-units" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 3 energy, no power; enters the base exhausted as a (non-Mighty) 3; 2 energy is not enough; playing her triggers nothing", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "fiora").build();
    await game.p1.play("fiora");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("base");
    expect(game.state("fiora")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect((await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "fiora").build()).p1.can("play", "fiora")).toBe(false);
  });

  test("core line: Call to Glory takes the exhausted 2-Might Squire to 5 → Fiora's trigger hits the chain → pay [order] → Squire is READY and can still move out this turn", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { targets: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    await game.p1.pass();
    await game.p2.pass(); // Call to Glory resolves
    expect(game.state("squire").might).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    expect(game.state("squire").isExhausted).toBe(true); // nothing readied before the trigger resolves
    expect(await untilFioraAsks(game)).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(0);
    expect(game.state("squire").isReady).toBe(true);
    expect(game.state("fiora").isExhausted).toBe(true); // "ready IT", not Fiora
    await game.settle();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("optional: declining keeps the [order] and leaves the now-Mighty Squire exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.no();
    await game.settle();
    expect(game.state("squire")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.power("order")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("cannot pay: with no order power 'yes' is not a legal answer; the unit stays exhausted", async () => {
    const game = await board(2, 0).build();
    await game.p1.cast("ctg", { targets: "squire" });
    const asked = await untilFioraAsks(game);
    if (asked) {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.state("squire")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("Fiora herself is 'a unit you control': 3 + 3 = 6 → she may pay [order] to ready herself", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { targets: "fiora" });
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.state("fiora")).toMatchObject({ isReady: true, might: 6 });
    expect(game.p1.power("order")).toBe(0);
  });

  test("threshold, negative space (709): already-Mighty 5 → 8 does NOT trigger; 1 → 4 (one short) does NOT trigger", async () => {
    const already = await board(5).build();
    await already.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(already)).toBe(false);
    expect(already.state("squire")).toMatchObject({ isExhausted: true, might: 8 });
    expect(already.p1.power("order")).toBe(1);
    const short = await board(1).build();
    await short.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(short)).toBe(false);
    expect(short.state("squire")).toMatchObject({ isExhausted: true, might: 4 });
  });

  test("threshold, exact: 4 → 5 via Bonds of Strength's +1 triggers", async () => {
    const game = await board(4).hand(P1, BONDS, "bonds").resources(P1, { energy: 2 }).build();
    await game.p1.cast("bonds", { targets: ["squire", "fiora"] });
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.state("squire")).toMatchObject({ isReady: true, might: 5 });
    expect(game.state("fiora")).toMatchObject({ isExhausted: true, might: 4 }); // 3 + 1: not Mighty, no second trigger
  });

  test("'you control' — pumping an ENEMY unit to Mighty triggers nothing for me; an enemy Fiora does not trigger off MY unit", async () => {
    const game = await board().unit(P2, "base", { might: 2, name: "Theirs" }, "theirs", { exhausted: true }).build();
    await game.p1.cast("ctg", { targets: "theirs" });
    expect(await untilFioraAsks(game)).toBe(false);
    expect(game.state("theirs")).toMatchObject({ isExhausted: true, might: 5 });
    const enemyFiora = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .resources(P2, { power: { order: 1 } })
      .unit(P2, "base", CARD, "theirFiora")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { exhausted: true })
      .hand(P1, CALL_TO_GLORY, "ctg")
      .build();
    await enemyFiora.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(enemyFiora)).toBe(false);
    expect(enemyFiora.chain()).toEqual([]);
    expect(enemyFiora.state("squire").isExhausted).toBe(true);
    expect(enemyFiora.p2.power("order")).toBe(1);
  });

  test("Fiora must be on the board: with her only in hand, the Squire becoming Mighty triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .hand(P1, CARD, "fiora")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { exhausted: true })
      .hand(P1, CALL_TO_GLORY, "ctg")
      .build();
    await game.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(game)).toBe(false);
    expect(game.state("squire")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("each time: the +3 expires at end of turn (back to 2, not Mighty); pumping the same unit next turn triggers Fiora again", async () => {
    const game = await board().hand(P1, CALL_TO_GLORY, "ctg2").build();
    await game.p1.cast("ctg", { targets: "squire" });
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.no();
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("squire").might).toBe(2);
    expect(game.state("squire").isReady).toBe(true); // readied in my Awaken step
    await game.p1.do("addResources", { energy: 3, power: { order: 1 } });
    await game.p1.cast("ctg2", { targets: "squire" });
    expect(await untilFioraAsks(game)).toBe(true); // crossed 2 → 5 again
    await game.p1.yes();
    await game.settle();
    expect(game.state("squire").might).toBe(5);
  });

  test("two units cross at once (Bonds of Strength on two exhausted 4s): two separate triggers; with a single [order] exactly one of them ends up ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P1, "base", CARD, "fiora", { exhausted: true })
      .unit(P1, "base", { might: 4, name: "Left" }, "left", { exhausted: true })
      .unit(P1, "base", { might: 4, name: "Right" }, "right", { exhausted: true })
      .hand(P1, BONDS, "bonds")
      .build();
    await game.p1.cast("bonds", { targets: ["left", "right"] });
    let asks = 0;
    for (let i = 0; i < 4 && (await untilFioraAsks(game)); i++) {
      asks += 1;
      const d = game.decision();
      if (d?.kind === "yes-no" && d.canAccept !== false) {
        await game.p1.yes();
      } else {
        await game.p1.no();
      }
    }
    await game.settle();
    expect(asks).toBe(2);
    expect(game.p1.power("order")).toBe(0);
    const ready = ["left", "right"].filter((u) => game.state(u).isReady);
    expect(ready).toHaveLength(1);
    expect(game.state("left").might).toBe(5);
    expect(game.state("right").might).toBe(5);
  });

  test("an attached Equipment's bonus counts (710) — equipping Doran's Blade (+2) onto the exhausted 3-Might Fiora makes her Mighty and offers the [order] ready", async () => {
    // After the Equip resolves Fiora is 5 → become-mighty trigger → pay [order] → Fiora ready.
    const game = await scenario()
      .resources(P1, { power: { body: 1, order: 1 } })
      .unit(P1, "base", CARD, "fiora", { exhausted: true })
      .gear(P1, DORANS_BLADE, "blade")
      .build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "fiora" } });
    const asked = await untilFioraAsks(game);
    expect(game.state("blade").attachedTo).toBe("fiora");
    expect(game.state("fiora").might).toBe(5);
    expect(game.p1.power("body")).toBe(0);
    expect(asked).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.state("fiora").isReady).toBe(true);
    expect(game.p1.power("order")).toBe(0);
  });

  test("combat keywords count — a 4-Might [Assault] unit becomes 5 the moment it attacks (709/710, cf. 476.3) and Fiora's trigger should hit the chain during the showdown", async () => {
    // Expected: on declaring the attack the Assault unit is a 5-Might attacker → become-mighty →
    // Fiora's optional trigger is put on the chain (P1 gets the pay-[order] question before combat).
    // Actual: keyword-conditional Might is applied in the layers without raising the event; no trigger.
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "fiora")
      .unit(P1, "base", { keywords: ["Assault"], might: 4, name: "Charger" }, "charger")
      .build();
    await game.p1.move("charger", "bf1");
    expect(game.state("charger").might).toBe(5);
    expect(await untilFioraAsks(game)).toBe(true);
  });
});
