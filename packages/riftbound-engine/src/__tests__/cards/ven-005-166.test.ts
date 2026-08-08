/**
 * Forsaken Baccai — ven-005-166 · Unit · Fury · 2 energy · 2 Might
 *
 *   If you control fewer runes than an opponent at the start of your Beginning Phase,
 *   give me +1 [Might] this turn.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - The "if" is welded to the trigger condition (383.2.a.1): the rune comparison is made ONCE, at
 *    the start of YOUR Beginning Phase (315.2.a.1) — i.e. BEFORE your Channel Phase adds 2 runes.
 *    Fewer → the ability goes on the chain; equal or more → nothing is even put on the chain.
 *  - "control … runes" counts runes on your board (rune pool), ready or exhausted alike; runes in
 *    the rune deck do not count. The opponent's exhausted runes still count against you.
 *  - Strictly FEWER: a tie is a near-miss and must do nothing.
 *  - Only YOUR Beginning Phase: on the opponent's turn start nothing happens even if you are behind.
 *  - Only while on the board: a Baccai in hand has no trigger.
 *  - "+1 [Might] this turn" is a might modification (not a buff counter) and expires in the
 *    Expiration Step — after your turn ends it is a 2 again. Two Baccai each trigger separately.
 *  - Turn order Awaken → Beginning (trigger; phase holds while it is on the chain) → Channel → Draw
 *    → Main, so once it resolves the controller still channels 2 and draws 1.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-005-166";

/** P2 is about to end their turn. P1 has `mine` runes on board, P2 has `theirs`; Baccai in P1's base. */
function beforeP1Turn(mine: number, theirs: number, opts: { theirsExhausted?: boolean } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .runes(P1, "fury", mine)
    .runes(P2, "calm", theirs, { exhausted: opts.theirsExhausted })
    .unit(P1, "base", CARD, "baccai");
}

describe("Forsaken Baccai (ven-005-166)", () => {
  test("cost: 2 energy, no power; a 2-Might unit that enters exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "baccai").build();
    await game.p1.play("baccai");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("baccai")).toBe("base");
    expect(game.state("baccai")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
    expect(game.chain()).toHaveLength(0); // no play trigger
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "baccai").build();
    expect(poor.p1.can("play", "baccai")).toBe(false);
  });

  test("fewer runes (1 vs 2) at the start of your Beginning Phase: the trigger goes on the chain, the phase holds, and it resolves to 3 Might", async () => {
    const game = await beforeP1Turn(1, 2).build();
    expect(game.state("baccai").might).toBe(2);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "baccai", controller: P1, triggered: true })]);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.state("baccai").might).toBe(2); // not yet resolved
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("baccai")).toMatchObject({ baseMight: 2, isBuffed: false, might: 3 });
    // The rest of the turn start still happened: +2 runes channeled, +1 card drawn.
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("the comparison is made BEFORE channeling: 2 vs 3 triggers even though P1 will sit at 4 runes by the main phase", async () => {
    const game = await beforeP1Turn(2, 3).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.state("baccai").might).toBe(3);
  });

  test("negative space — a TIE (2 vs 2) is not 'fewer': nothing goes on the chain and Baccai stays 2", async () => {
    const game = await beforeP1Turn(2, 2).build();
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("baccai").might).toBe(2);
  });

  test("negative space — MORE runes than the opponent (3 vs 1) and both at zero (0 vs 0): no bonus", async () => {
    const more = await beforeP1Turn(3, 1).build();
    await more.advanceTurn();
    expect(more.state("baccai").might).toBe(2);
    const zero = await beforeP1Turn(0, 0).build();
    await zero.advanceTurn();
    expect(zero.state("baccai").might).toBe(2);
  });

  test("the opponent's EXHAUSTED runes still count as runes they control (0 vs 2 exhausted → 3 Might)", async () => {
    const game = await beforeP1Turn(0, 2, { theirsExhausted: true }).build();
    await game.advanceTurn();
    expect(game.state("baccai").might).toBe(3);
  });

  test("'this turn': the +1 is gone once P1's turn ends (back to 2 on the opponent's turn)", async () => {
    const game = await beforeP1Turn(1, 2).build();
    await game.advanceTurn();
    expect(game.state("baccai").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("baccai").might).toBe(2);
  });

  test("only YOUR Beginning Phase: when the opponent's turn starts nothing triggers, even though P1 is behind on runes", async () => {
    const game = await scenario().turn(3).active(P1).runes(P1, "fury", 0).runes(P2, "calm", 3).unit(P1, "base", CARD, "baccai").build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("baccai").might).toBe(2);
  });

  test("only on the board: a Baccai in HAND does not trigger", async () => {
    const game = await scenario().turn(2).active(P2).runes(P2, "calm", 3).hand(P1, CARD, "baccai").build();
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("baccai").might).toBe(2);
    expect(game.zoneOf("baccai")).toBe("hand");
  });

  test("a Baccai at a battlefield you hold also gets the bonus (and you still score the hold point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .runes(P2, "calm", 2)
      .unit(P1, "bf1", CARD, "baccai")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("baccai").might).toBe(3);
    expect(game.p1.points()).toBe(1);
  });

  test("two Baccai: each has its own trigger and each ends at 3 Might", async () => {
    const game = await beforeP1Turn(0, 1).unit(P1, "base", CARD, "baccai2").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.triggered).map((i) => i.cardId).sort()).toEqual(["baccai", "baccai2"]);
    await game.settle();
    expect(game.state("baccai").might).toBe(3);
    expect(game.state("baccai2").might).toBe(3);
  });

  test("the opponent gets priority on the trigger before the Might lands (they could respond)", async () => {
    const game = await beforeP1Turn(1, 2).build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.state("baccai").might).toBe(2);
    await game.p2.passPriority();
    expect(game.state("baccai").might).toBe(3);
  });

  test("parsed abilities match the printed text: one beginning-phase trigger on the controller, gated on fewer-runes-than-opponent, +1 Might to self for the turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 2 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { type: "fewer-runes-than-opponent" },
      effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "beginning-phase", on: "controller" },
      type: "triggered",
    });
  });
});
