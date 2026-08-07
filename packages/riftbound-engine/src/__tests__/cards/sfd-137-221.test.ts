/**
 * Harpoon Squad — sfd-137-221 · Unit · Chaos · 4 energy · 4 Might
 *
 *   When I move from a battlefield, give me +2 [Might] this turn.
 *
 * Head-judge checklist for this card:
 *  1. The ORIGIN matters, not the destination: battlefield → base (144.4.b) and battlefield →
 *     battlefield via Ganking (144.4.c) both trigger; base → battlefield never does.
 *  2. Only MOVES count (420/445): a corrective Recall after losing a combat "is not a Move" (rules:
 *     "Recalls are not Moves") — no bonus for being bounced home.
 *  3. Any move counts, not just the Standard Move: a spell (Ride the Wind, same domain) relocating
 *     the Squad off a battlefield triggers it too — and it goes on the chain as a triggered ability.
 *  4. Gank into an enemy battlefield: the trigger resolves during the showdown before combat damage,
 *     so the Squad fights at 6, not 4 (5-Might defender dies instead of killing it).
 *  5. "this turn": the +2 is gone after the turn ends (517.2); moving twice in a turn stacks (+4).
 *  6. Cost sanity: 4 energy, no power; enters exhausted like any unit (143.4).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-137-221";
const RIDE_THE_WIND = "ogn-173-298"; // Chaos [Action] 2+[chaos]: Move a friendly unit and ready it.
const GANKING = { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] } as const;

/** Squad sitting (ready) at P1's bf1; bf2 open; P2 holds bf3 with a 5-Might defender. */
function onBattlefield(meta?: Record<string, unknown>) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", CARD, "squad", meta)
    .unit(P2, "bf3", { might: 5, name: "Wall" }, "wall");
}

describe("Harpoon Squad (sfd-137-221)", () => {
  test("registry payload: one triggered ability — on SELF move-from-battlefield, +2 Might to self for the turn", async () => {
    await onBattlefield().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, might: 4, name: "Harpoon Squad" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
        trigger: { event: "move-from-battlefield", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 4 energy, no power; enters the base exhausted as a 4-Might unit; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "squad").build();
    await game.p1.play("squad");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("squad")).toBe("base");
    expect(game.state("squad")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "squad").build();
    expect(poor.p1.can("play", "squad")).toBe(false);
  });

  test("standard move battlefield → base (144.4.b) triggers it: Squad is 6 Might for the rest of the turn", async () => {
    const game = await onBattlefield().build();
    expect(game.state("squad").might).toBe(4);
    await game.p1.move("squad", "base");
    await game.settle();
    expect(game.locationOf("squad")).toBe("base");
    expect(game.state("squad").might).toBe(6);
    expect(game.state("squad").baseMight).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': +2 after moving home, back to 4 once the turn ends (517.2)", async () => {
    const game = await onBattlefield().build();
    await game.p1.move("squad", "base");
    await game.settle();
    expect(game.state("squad").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("squad").might).toBe(4);
  });

  test("negative space: moving FROM BASE to a battlefield is not 'from a battlefield' — no bonus, nothing on the chain", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "squad").build();
    await game.p1.move("squad", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("squad")).toBe("bf1");
    expect(game.state("squad").might).toBe(4);
  });

  test("Ganking battlefield → open battlefield (144.4.c) is a move FROM a battlefield: +2 (6 Might at bf2)", async () => {
    const game = await onBattlefield(GANKING).build();
    expect(game.p1.can("gank", "squad")).toBe(true);
    await game.p1.gank("squad", "bf2");
    await game.settle();
    expect(game.locationOf("squad")).toBe("bf2");
    expect(game.state("squad").might).toBe(6);
  });

  test("ganking into the enemy's bf3: the trigger resolves before combat damage, so a 6-Might Squad kills the 5-Might Wall and conquers", async () => {
    const game = await onBattlefield(GANKING).build();
    await game.p1.gank("squad", "bf3");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("squad")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("squad").might).toBe(6); // still pumped after the fight (this turn)
  });

  test("a Recall is not a Move: Squad attacks a stunned 5-Might defender, nobody dies, attackers are recalled home (627.2) — still 4 Might in base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "squad")
      .unit(P2, "bf1", { might: 5, name: "Dazed Wall" }, "dazed", { stunned: true })
      .build();
    await game.p1.move("squad", "bf1");
    await game.settle();
    expect(game.zoneOf("dazed")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.locationOf("squad")).toBe("base"); // recalled, not moved
    expect(game.chain()).toEqual([]);
    expect(game.state("squad").might).toBe(4);
  });

  test("attacking FROM BASE and conquering: the Squad never left a battlefield — fights and stays at 4 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "squad")
      .unit(P2, "bf1", { might: 3, name: "Speedbump" }, "bump")
      .build();
    await game.p1.move("squad", "bf1");
    await game.settle();
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.locationOf("squad")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("squad").might).toBe(4);
    expect(game.state("squad").damage).toBe(0); // healed at Combat Cleanup (143.3.b.2)
  });

  test("moved off a battlefield by a spell (Ride the Wind) also triggers: ability goes on the chain, resolves to 6 Might, Squad readied", async () => {
    const game = await onBattlefield({ exhausted: true })
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "squad" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("base");
    // The move happened during resolution → Harpoon Squad's trigger is now a chain item of P1's.
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "squad", controller: P1, triggered: true })]));
    await game.settle();
    expect(game.locationOf("squad")).toBe("base");
    expect(game.state("squad").might).toBe(6);
    expect(game.state("squad").isReady).toBe(true);
  });

  test("two moves from a battlefield in one turn stack: gank (+2) then Ride the Wind bf2 → base (+2) = 8 Might; 4 again next turn", async () => {
    const game = await onBattlefield(GANKING)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.gank("squad", "bf2");
    await game.settle();
    expect(game.state("squad").might).toBe(6);
    await game.p1.cast("rtw", { targets: "squad" });
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("squad")).toBe("base");
    expect(game.state("squad").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("squad").might).toBe(4);
  });

  test("only 'I': another friendly unit moving home from the same battlefield does not pump the Squad (nor itself)", async () => {
    const game = await onBattlefield().unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p1.move("buddy", "base");
    await game.settle();
    expect(game.state("squad").might).toBe(4);
    expect(game.state("buddy").might).toBe(2);
  });
});
