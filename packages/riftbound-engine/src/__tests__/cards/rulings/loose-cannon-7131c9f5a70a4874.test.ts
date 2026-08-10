/**
 * Ruling 7131c9f5a70a4874 — Jinx, Loose Cannon (OGN-251 → ogn-251-298, legend)
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *   × Grove of the God-Willow (OGN-280 → ogn-280-298, battlefield) "When you hold here, draw 1."
 *
 * Q: Jinx player with 1 card in hand holding the Grove: in what order do the Jinx draw, the Grove draw and
 *    the regular turn draw happen?
 * A: Fixed sequence, no choice: Jinx's Legend draw first (start of Beginning Step), then Grove's draw (hold
 *    scoring), then the regular Draw Phase card. Jinx triggers before scoring so it cannot be reordered
 *    with the Grove.
 * Rules: 315.1 (Beginning Step → start-of-beginning triggers), 315.2 (Scoring Step: hold), 316/318 (Channel,
 *        Draw), 383.3.d (only SIMULTANEOUS triggers are ordered by their controller).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOOSE_CANNON = "ogn-251-298";
const GROVE = "ogn-280-298";

/** End of P2's turn 2. P1: Jinx legend, exactly one card in hand, holds the Grove with a 3-Might unit. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "jinx")
    .battlefield("grove", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .unit(P1, "grove", { might: 3, name: "Holder" }, "holder")
    .hand(P1, { might: 1, name: "Lonely Card" }, "h1");
}

describe("Ruling 7131c9f5a70a4874 — Jinx draw → Grove hold draw → turn draw, in that fixed order", () => {
  test("step 1: as P1's turn begins ONLY Jinx's trigger is on the chain (Beginning Step, before scoring): no point yet, hand still 1, and it is a priority window — not an ordering prompt", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["h1"]);
  });

  test("step 2: Jinx resolves (hand 1 → 2); THEN the hold is scored (+1) and the Grove's draw trigger goes on the chain — still in the Beginning Phase, regular draw not yet taken", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(2); // Jinx drew
    expect(game.p1.points()).toBe(1); // hold scored after Jinx
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grove", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("step 3: Grove resolves (hand 2 → 3), then Channel/Draw Phase adds the regular card (→ 4) and the main phase opens; no ordering decision was ever offered", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    let sawOrder = false;
    const check = () => {
      if (game.decision()?.kind === "order") {
        sawOrder = true;
      }
    };
    check();
    await game.p1.passPriority();
    check();
    await game.p2.passPriority();
    check();
    expect(game.p1.hand()).toHaveLength(2);
    await game.p1.passPriority();
    check();
    await game.p2.passPriority();
    check();
    await game.settle();
    expect(sawOrder).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(4); // h1 + Jinx + Grove + turn draw
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
