/**
 * Interaction: Blue Sentinel (unl-087-219) × Blitzcrank, Impassive (ogn-067-298) — doubled
 * hold EFFECTS, single hold POINT.
 *
 *   Blue Sentinel (Unit, Mind, 4 Might, [Shield 2])
 *     "Your hold effects for holding here trigger an additional time.
 *      When I hold, [Add] [rainbow] at the start of your next Main Phase.
 *      (Abilities that add resources can't be reacted to.)"
 *   Blitzcrank, Impassive (Champion Unit, Calm, 5 Might, [Tank])
 *     "When you play me to a battlefield, you may move an enemy unit to here.
 *      When I hold, return me to my owner's hand."
 *
 * Rules: 315.2.b.2 (Scoring Step: Turn Player Holds every battlefield they control), 469.2 /
 * 470 (Hold = one Score per battlefield per turn), 471.1 (gain the point at the Score),
 * 471.2.b + 383.4.d.2.a (Hold abilities of units there go on the chain as the point is
 * gained), 383.3.d (controller orders simultaneous triggers), 429.2 (triggered Add abilities
 * resolve as soon as they finalize — no lingering chain item), 323.6 / 190.4.c (an empty
 * controlled battlefield is lost at the next Cleanup), 316.x (pools empty as Main begins, so
 * the Add is delayed to "the start of your next Main Phase" = THIS turn's Main Phase).
 *
 * Board: P1 (2 points) controls bf1 with Blue Sentinel + Blitzcrank A, and bf2 with Blitzcrank B
 * alone. It is P2's turn 2; P2 ends the turn → P1's Beginning Phase with no start-of-turn triggers.
 *
 * Question / expected:
 *   (a) bf1 scores ONCE (+1) and bf2 once (+1): P1 2 → 4, never more — the Sentinel doubles
 *       hold *effects*, not the Score.
 *   (b) bf1: Sentinel's Add ×2 (resolve immediately, 429.2) and Blitzcrank A's return ×2;
 *       bf2: Blitzcrank B's return ×1. The lingering chain is three P1 items; P2 gets priority.
 *       Once the first Blitzcrank-A instance returns him to hand, the second finds him gone and
 *       resolves with no effect (no retarget, no error, no second card in hand).
 *   (c) After the chain + Cleanup: bf1 still P1's (Sentinel stands there); bf2 empty → control
 *       lost, but the point stays: P1 = 4.
 *   (d) Two delayed Adds → +2 rainbow power at the start of P1's Main Phase this turn (0 before).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";
const BLITZCRANK = "ogn-067-298";

function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, 2)
    .victoryScore(8)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", BLUE_SENTINEL, "sentinel")
    .unit(P1, "bf1", BLITZCRANK, "blitzA")
    .unit(P1, "bf2", BLITZCRANK, "blitzB");
}

describe("Blue Sentinel × Blitzcrank, Impassive — hold effects doubled, hold point not", () => {
  test("(a) Scoring Step: exactly one Hold point per battlefield — P1 goes 2 → 4, not more (470/471.1)", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(2);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    // Points are gained at the Hold itself, before any hold trigger resolves.
    expect(game.p1.points()).toBe(4);
    expect([...(game.gameState.scoredThisTurn?.[P1] ?? [])].sort()).toEqual(["bf1", "bf2"]);
    await game.settle();
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("(b) lingering chain = Blitzcrank A's return ×2 (doubled at bf1) + Blitzcrank B's return ×1 (bf2 has no Sentinel); the Sentinel's two Adds do not linger (429.2)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.acceptTriggerOrder(); // take the listed order if an offer is pending
    const items = game.chain();
    expect(items.every((i) => i.controller === P1 && i.triggered)).toBe(true);
    expect(items.filter((i) => i.cardId === "blitzA")).toHaveLength(2);
    expect(items.filter((i) => i.cardId === "blitzB")).toHaveLength(1);
    expect(items.filter((i) => i.cardId === "sentinel")).toHaveLength(0);
    expect(items).toHaveLength(3);
    // P1 (controller / turn player) holds priority first, then P2 gets to respond.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P1);
    await game.p1.pass();
    expect(game.decision()?.seat).toBe(P2);
    expect(game.p2.can("passPriority")).toBe(true);
  });

  // Expected: the three Hold triggers arise from ONE task ("the Turn Player Holds all
  // Battlefields they Control", 315.2.b.2) and are all P1's, so P1 is offered their relative
  // order on the chain (383.3.d) — an `order` decision listing Blitzcrank A's and B's items.
  // Actual: the engine fires each battlefield's Hold as a separate batch and puts the items on
  // the chain in scan order without ever offering P1 the choice.
  test("(b) P1 should get a 383.3.d order decision over the simultaneous Blitzcrank A / Blitzcrank B hold triggers", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d?.kind).toBe("order");
    expect(d?.seat).toBe(P1);
    const cards = d?.kind === "order" ? d.items.map((i) => i.card) : [];
    expect(cards).toContain("blitzA");
    expect(cards).toContain("blitzB");
  });

  test("(b) the second Blitzcrank-A instance resolves with no effect once the first has returned him to hand — one card, no prompt, no error", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    // Listed order: [blitzA, blitzA, blitzB] bottom→top, so B resolves first, then A, then A again.
    expect(game.chain().map((i) => i.cardId)).toEqual(["blitzA", "blitzA", "blitzB"]);

    await game.p1.pass();
    await game.p2.pass(); // Blitzcrank B's return resolves
    expect(game.zoneOf("blitzB")).toBe("hand");
    expect(game.chain()).toHaveLength(2);

    await game.p1.pass();
    await game.p2.pass(); // first Blitzcrank A instance resolves
    expect(game.zoneOf("blitzA")).toBe("hand");
    expect(game.chain()).toHaveLength(1); // the second instance is still there — not removed, not refunded
    expect(game.chain()[0]?.cardId).toBe("blitzA");

    await game.p1.pass();
    await game.p2.pass(); // second instance: nothing to return → resolves doing nothing
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("blitzA")).toBe("hand");
    expect(game.p1.hand().filter((c) => c === "blitzA")).toHaveLength(1);
    // Net hand: +blitzA +blitzB (+1 from the Draw Phase once the turn proceeds).
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toContain("blitzA");
    expect(game.p1.hand()).toContain("blitzB");
    expect(game.p1.hand()).toHaveLength(handBefore + 2 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) after the chain and Cleanup: bf1 stays P1's (Sentinel still there), bf2 is empty → control lost (323.6), points stay 4", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["sentinel"]);
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.p1.points()).toBe(4); // 471.1 — a gained point is never undone by vacating
  });

  test("(d) Blue Sentinel's doubled Add: 0 power during the Beginning Phase, +2 rainbow at the start of P1's Main Phase this turn", async () => {
    const game = await board().build();
    expect(game.p1.power()).toBe(0);
    await game.p2.endTurn();
    // Still in the Beginning Phase (hold chain pending): the Add is delayed, nothing added yet.
    expect(game.phase()).toBe("beginning");
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.power()).toBe(2); // two separate delayed Adds, one [rainbow] each
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });

  test("control: without Blue Sentinel a lone Blitzcrank's hold effect triggers once — one chain item, no Add", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .points(P1, 2)
      .victoryScore(8)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", BLITZCRANK, "blitzSolo")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(3);
    expect(game.chain().map((i) => i.cardId)).toEqual(["blitzSolo"]);
    await game.settle();
    expect(game.zoneOf("blitzSolo")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.power()).toBe(0);
    expect(game.p1.points()).toBe(3);
  });
});
