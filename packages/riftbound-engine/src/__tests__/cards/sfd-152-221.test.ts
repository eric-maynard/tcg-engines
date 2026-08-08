/**
 * Eminent Benefactor — sfd-152-221 · Unit · Order · 6 energy · 5 Might
 *
 *   When I hold, play two Gold gear tokens exhausted.
 *
 * Head-judge checklist for this card:
 *  1. Hold (469.2 / 383.4.d): only in YOUR Beginning Phase, only for a battlefield you still control,
 *     and "When I hold" needs the Benefactor to be AT that battlefield (383.4.d.2.a) — sitting in base
 *     while another unit holds gives the point but no Gold; the opponent's Beginning Phase gives nothing.
 *  2. The trigger is a chain item during the Beginning Phase (the phase holds for it); the Gold only
 *     exists after it resolves; afterwards Channel (+2 runes) and Draw (+1) still happen.
 *  3. Gold (187.5) is a gear TOKEN in P1's base, controlled/owned by P1, entering EXHAUSTED: Awaken has
 *     already happened this turn, so neither Gold can be cashed this turn; both ready at P1's next
 *     Awaken and each sacrifices for one [rainbow] (429.2 — Add resolves immediately).
 *  4. Multiples: two Benefactors at one held battlefield → one hold point but 4 Gold; one Benefactor at
 *     each of two held battlefields → 2 points and 4 Gold.
 *  5. Lost before it counts: if P2 conquers the battlefield on their turn there is no hold at all.
 *  6. Cost sanity: 6 energy, no power, enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-152-221";

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P2 is about to end turn 2; P1 controls bf1 with the Benefactor on it. */
function holding() {
  return scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bene");
}

describe("Eminent Benefactor (sfd-152-221)", () => {
  test("registry payload: one triggered ability — on self HOLD, create 2 Gold gear tokens, not ready", async () => {
    await holding().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, might: 5, name: "Eminent Benefactor" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        trigger: { event: "hold", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 6 energy, no power; enters the base exhausted at 5 Might; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bene").build();
    await game.p1.play("bene");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bene")).toBe("base");
    expect(game.state("bene")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([]); // no play trigger
    expect((await scenario().resources(P1, { energy: 5, power: { order: 3 } }).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
  });

  test("When I hold: Beginning Phase holds for the trigger on the chain; resolving it puts two EXHAUSTED Gold gear tokens in P1's base (+1 point, then channel 2 / draw 1)", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bene", controller: P1, triggered: true })]);
    expect(golds(game)).toEqual([]); // nothing exists before resolution
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    const g = golds(game);
    expect(g).toHaveLength(2);
    for (const id of g) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1, zone: "base" });
    }
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("the Gold arrives exhausted AFTER this turn's Awaken: not cashable this turn; both ready at P1's next Awaken and each adds one [rainbow]", async () => {
    const game = await holding().build();
    await game.advanceTurn();
    const [g1, g2] = golds(game) as [string, string];
    expect(game.p1.can("activate", g1)).toBe(false);
    expect(game.p1.can("activate", g2)).toBe(false);
    await game.advanceToTurnOf(P2);
    expect(game.state(g1).isExhausted).toBe(true); // P2's Awaken readies nothing of P1's
    await game.advanceToTurnOf(P1);
    expect(game.state(g1).isReady).toBe(true);
    expect(game.state(g2).isReady).toBe(true);
    await game.p1.activate(g1);
    await game.p1.activate(g2);
    expect(game.p1.power("rainbow")).toBe(2);
    // A killed token ceases to exist once it leaves the board — either way it is gone from the base.
    expect(game.p1.base()).not.toContain(g1);
    expect(game.p1.base()).not.toContain(g2);
    // Held again on that turn with the Benefactor still there → two fresh exhausted Gold.
    expect(golds(game)).toHaveLength(2);
    expect(golds(game).every((id) => game.state(id).isExhausted)).toBe(true);
    expect(game.p1.points()).toBe(2);
  });

  test("negative space: Benefactor in BASE while a vanilla unit holds bf1 → the hold point is scored but no Gold is made", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", CARD, "bene")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toEqual([]);
  });

  test("negative space: only YOUR hold — across the opponent's Beginning Phase nothing happens (no point, no Gold)", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bene").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(golds(game)).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
  });

  test("negative space: P2 conquers bf1 on their turn (9 vs 5) → Benefactor dead, no hold, no Gold at P1's turn start", async () => {
    const game = await holding().unit(P2, "base", { might: 9, name: "Giant" }, "giant").build();
    await game.p2.move("giant", "bf1");
    await game.settle();
    expect(game.zoneOf("bene")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(golds(game)).toEqual([]);
  });

  test("two Benefactors at the same held battlefield: ONE hold point, but each triggers → four Gold", async () => {
    const game = await holding().unit(P1, "bf1", CARD, "bene2").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.triggered).map((i) => i.cardId).sort()).toEqual(["bene", "bene2"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toHaveLength(4);
    expect(golds(game).every((id) => game.state(id).isExhausted)).toBe(true);
  });

  test("a Benefactor at each of two held battlefields: two hold points and four Gold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "bene")
      .unit(P1, "bf2", CARD, "bene2")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(golds(game)).toHaveLength(4);
  });

  test("holding for the FINAL point is allowed (471.1.a.1 — only Conquer is restricted): at 7/8 the hold wins the game outright", async () => {
    const game = await holding().victoryScore(8).points(P1, 7).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the trigger is a real chain item: P2 gets priority on it during P1's Beginning Phase and can respond before any Gold exists", async () => {
    const bolt = {
      abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Bolt",
      timing: "reaction",
    } as const;
    const game = await holding().hand(P2, bolt, "bolt").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "bolt")).toBe(true);
    await game.p2.cast("bolt", { targets: "bene" });
    await game.settle();
    // Bolt resolved first (LIFO) and killed the Benefactor; its hold trigger is already on the chain and
    // still resolves (triggered abilities exist independently of their source) → two Gold anyway.
    expect(game.zoneOf("bene")).toBe("trash");
    expect(game.phase()).toBe("main");
    expect(golds(game)).toHaveLength(2);
    expect(game.p1.points()).toBe(1);
  });
});
