/**
 * Keeper of the Hammer — unl-203-219 · Legend (Poppy) · Body/Order
 *
 *   When you hold, gain 1 XP.
 *   Spend 3 XP, [Exhaust]: Draw 1.
 *
 * Rules: 469.2 / 315.2.b (Hold = keeping control of a battlefield during YOUR Beginning Phase's
 * scoring step; one score per battlefield → holding two battlefields is two Holds), 383.4.d.2.b
 * ("When you hold" abilities of a non-unit source go on the chain as a Pending Item per Hold),
 * 471.2.c (score triggers fire at most once per battlefield per turn), 730 (gain / spend XP),
 * 202–203 (spending XP is a cost, paid on activation), 377.3 (activated abilities use the chain),
 * 381 (activated abilities: only on the controller's turn in an Open State), 174.8 (legends may
 * carry activated abilities; the [Exhaust] cost needs a ready legend, which readies at your Awaken).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Two battlefields held → two separate triggers → +2 XP (not 1); zero battlefields → nothing.
 *  2. Conquering is not Holding: taking a battlefield in combat scores a point but gives no XP.
 *  3. Only YOUR hold: the opponent holding on their turn gives the Keeper's controller nothing.
 *  4. Activation economics: exactly 3 XP is spent up front (2 XP → illegal; 4 XP → 1 left); the
 *     legend exhausts, so 6 XP still buys only one draw per turn; it readies next turn for another.
 *  5. Same-turn chain: entering the turn with 2 XP and holding makes 3 by the Main Phase, so the
 *     draw ability is immediately usable.
 *  6. Timing: not on the opponent's turn, not with a chain open (Closed State), not while exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-203-219";
const FALLING_COMET = "ogn-085-298"; // [Action] 5: deal 6 to a unit at a battlefield (used only to open a chain)

/** P2 is about to end turn 2; P1 (Keeper) controls `held` battlefields with a unit on each. */
function aboutToHold(held: 0 | 1 | 2, xp = 0) {
  const b = scenario().turn(2).active(P2).legend(P1, CARD, "keeper").xp(P1, xp);
  b.battlefield("bf1", { controller: held >= 1 ? P1 : null }).battlefield("bf2", { controller: held >= 2 ? P1 : null });
  if (held >= 1) {
    b.unit(P1, "bf1", { might: 3, name: "Holder1" }, "h1");
  }
  if (held >= 2) {
    b.unit(P1, "bf2", { might: 3, name: "Holder2" }, "h2");
  }
  return b;
}

/** P1's own main phase with the Keeper and some XP. */
function mainPhase(xp: number) {
  return scenario().legend(P1, CARD, "keeper").xp(P1, xp).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9 }, "wall");
}

describe("Keeper of the Hammer (unl-203-219)", () => {
  test("registry payload: [hold → gain 1 XP] trigger + [3 XP, Exhaust → draw 1] activated ability, in printed order", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Poppy", name: "Keeper of the Hammer" });
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, type: "gain-xp" }, trigger: { event: "hold", on: "controller" }, type: "triggered" },
      { cost: { exhaust: true, xp: 3 }, effect: { amount: 1, type: "draw" }, type: "activated" },
    ]);
  });

  test("holding one battlefield at the start of your turn: +1 point and +1 XP (trigger is a chain item raised in the Beginning Phase)", async () => {
    const game = await aboutToHold(1).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "keeper", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // pending, not yet resolved
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("holding TWO battlefields is two Holds: +2 points and +2 XP", async () => {
    const game = await aboutToHold(2).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.xp()).toBe(2);
  });

  test("negative space: controlling no battlefield at the start of your turn gives no XP", async () => {
    const game = await aboutToHold(0).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
  });

  test("negative space: CONQUERING a battlefield scores a point but is not a Hold → no XP", async () => {
    const game = await scenario()
      .legend(P1, CARD, "keeper")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "weak")
      .unit(P1, "base", { might: 4 }, "hero")
      .build();
    await game.p1.move("hero", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
  });

  test("'you': the opponent holding on THEIR turn gives the Keeper's controller nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .legend(P1, CARD, "keeper")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "theirs")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
  });

  test("Spend 3 XP, [Exhaust]: XP 4 → 1 and the legend exhausts on activation; the draw happens when the chain item resolves", async () => {
    const game = await mainPhase(4).build();
    expect(game.state("keeper").isReady).toBe(true);
    const top = game.p1.deck()[0] as string;
    await game.p1.activate("keeper");
    expect(game.p1.xp()).toBe(1);
    expect(game.state("keeper").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "keeper", controller: P1 })]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([top]);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: 2 XP is not enough; 3 XP with an already-exhausted legend is not enough", async () => {
    const poor = await mainPhase(2).build();
    expect(poor.p1.can("activate", "keeper")).toBe(false);
    const r = await poor.p1.try((p) => p.activate("keeper", 1));
    expect(r.ok).toBe(false);
    expect(poor.p1.xp()).toBe(2);

    const tired = await scenario()
      .card("keeper", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .xp(P1, 3)
      .build();
    expect(tired.state("keeper").isExhausted).toBe(true);
    expect(tired.p1.can("activate", "keeper")).toBe(false);
  });

  test("6 XP buys only ONE draw per turn (the legend is exhausted after the first); it readies at your next Awaken for another", async () => {
    const game = await mainPhase(6).build();
    await game.p1.activate("keeper");
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.can("activate", "keeper")).toBe(false);
    await game.advanceTurn(); // → P2
    expect(game.p1.can("activate", "keeper")).toBe(false); // 381: not on the opponent's turn (and still exhausted)
    await game.advanceTurn(); // → P1: awaken readies the legend, +1 card from the draw step
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("keeper").isReady).toBe(true);
    const before = game.p1.hand().length;
    await game.p1.activate("keeper");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(before + 1);
  });

  test("same-turn chain: entering the turn at 2 XP and holding reaches 3 by the Main Phase, so the draw ability is usable right away", async () => {
    const game = await aboutToHold(1, 2).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(3);
    const inHand = game.p1.hand().length; // 1 from the draw step
    expect(game.p1.can("activate", "keeper")).toBe(true);
    await game.p1.activate("keeper");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(inHand + 1);
  });

  test("timing (381): not activatable while a chain is open (Closed State), legal again once it resolves", async () => {
    const game = await mainPhase(3).resources(P1, { energy: 5 }).hand(P1, FALLING_COMET, "comet").build();
    await game.p1.cast("comet", { targets: "wall" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activate", "keeper")).toBe(false);
    await game.settle();
    expect(game.p1.can("activate", "keeper")).toBe(true);
  });
});
