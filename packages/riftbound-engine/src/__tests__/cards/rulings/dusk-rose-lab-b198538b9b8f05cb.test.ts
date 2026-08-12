/**
 * Ruling b198538b9b8f05cb — Dusk Rose Lab (UNL-209 → unl-209-219) · Battlefield
 *   "At the start of your Beginning Phase, you may kill a unit you control here to draw 1.
 *    (This happens before scoring.)"
 *
 * Q: Does a unit have to be "holding" Dusk Rose Lab for its ability to trigger? If the battlefield has not
 *    been conquered, does the ability still go on the chain in the Beginning Phase?
 * A: No holding, no conquering required — the ability triggers at the start of YOUR Beginning Phase simply
 *    because the battlefield is yours. It is a "you may", so you choose whether to use it, and the only
 *    real requirement is having a unit you control there to kill as the cost.
 * Rules: 315.2.a (Beginning Step triggers), 383.3.a/383.3.b + 204.3.a (a leading "you may [cost] to" is
 *        opted into and PAID while the item is Finalized), 402.4 (no legal cost object ⇒ removed unasked).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";

/** It is P2's turn (turn 2); ending it walks into P1's Beginning Phase, when the Lab triggers for P1. */
function board(opts: { unitHere: boolean }) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false })
    .battlefield("bf2", { controller: null });
  return opts.unitHere ? b.unit(P1, "lab", { might: 2, name: "Assistant" }, "assistant") : b;
}

describe("Ruling b198538b9b8f05cb — Dusk Rose Lab triggers at the start of your Beginning Phase, unconquered and unheld", () => {
  test("ruling: the battlefield has NOT been scored/conquered this game, yet the ability is offered at the start of P1's Beginning Phase", async () => {
    const game = await board({ unitHere: true }).build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();

    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.source?.cardId).toBe("lab");
  });

  test("ruling: accepting kills the unit there as the cost and draws 1", async () => {
    const game = await board({ unitHere: true }).build();
    const deckBefore = game.p1.deck().length;
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();

    expect(game.zoneOf("assistant")).toBe("trash");
    expect(game.p1.deck().length).toBeLessThan(deckBefore); // the Lab's draw plus the turn's own draw
    expect(game.violations()).toEqual([]);
  });

  test("ruling: it is a 'you may' — declining leaves the unit alive and nothing is drawn from the Lab", async () => {
    const game = await board({ unitHere: true }).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("assistant")).toBe("battlefield-lab");
    expect(game.turnPlayer()).toBe(P1);
  });

  test("requirement: with no unit of yours there the cost cannot be paid, so nothing is offered", async () => {
    const game = await board({ unitHere: false }).build();
    await game.p2.endTurn();
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });

  test("it is YOUR Beginning Phase only — P1's Lab is not offered when P2's turn begins", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false })
      .unit(P1, "lab", { might: 2, name: "Assistant" }, "assistant")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.zoneOf("assistant")).toBe("battlefield-lab");
  });
});
