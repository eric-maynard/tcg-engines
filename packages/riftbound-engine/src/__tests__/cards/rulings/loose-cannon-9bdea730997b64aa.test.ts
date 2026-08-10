/**
 * Ruling 9bdea730997b64aa — Jinx, Loose Cannon (OGN-251 → ogn-251-298, legend)
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *   × Grove of the God-Willow (OGN-280 → ogn-280-298, battlefield) "When you hold here, draw 1."
 *
 * Q: Do the Beginning Step and the Scoring Step happen at the same time — would Jinx's trigger and the Grove's hold
 *    trigger share one chain?
 * A: No. The Beginning Step happens first and its chain resolves; only then does the Scoring Step happen (hold →
 *    Grove trigger on a NEW chain). This is also why [Temporary] units cannot hold: they die in the Beginning Step,
 *    before scoring.
 * Rules: 315.1 (Beginning Step triggers), 315.2 (Scoring Step: hold), 383 (separate chains), Temporary keyword.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOOSE_CANNON = "ogn-251-298";
const GROVE = "ogn-280-298";
const SPRITE = "ogn-274-298"; // 3-Might unit token, [Temporary]

/** End of P2's turn. P1: Jinx legend, one card in hand, holds the Grove with a plain 3-Might unit. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "jinx")
    .battlefield("grove", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .unit(P1, "grove", { might: 3, name: "Holder" }, "holder")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Lonely Card" }, "h1");
}

describe("Ruling 9bdea730997b64aa — Beginning Step chain (Jinx) resolves before the Scoring Step chain (Grove)", () => {
  test("as P1's turn begins ONLY Jinx's trigger is on the chain — the Grove has not triggered and no point is scored yet", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "grove")).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["h1"]);
    expect(game.decision()?.kind).not.toBe("order"); // not simultaneous → nothing to order
  });

  test("Jinx's chain resolves (draw → 2 in hand); THEN the hold is scored (+1) and the Grove trigger sits alone on a fresh chain", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Jinx resolves
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grove", controller: P1, triggered: true })]);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(4); // h1 + Jinx + Grove + regular draw
    expect(game.violations()).toEqual([]);
  });

  test("nuance — a [Temporary] unit cannot hold: a lone Sprite token at the Grove dies in the Beginning Step, so at the Scoring Step P1 no longer controls the Grove — no point, no Grove draw", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("grove", { controller: P1, def: GROVE, inert: false, owner: P1 })
      .unit(P1, "grove", SPRITE, "sprite")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Lonely Card" }, "h1")
      .build();
    expect(game.state("sprite").keywords).toContain("Temporary");
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).toBe("gone"); // token killed → ceased to exist
    expect(game.gameState.battlefields.grove?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(2); // h1 + regular draw only
  });
});
