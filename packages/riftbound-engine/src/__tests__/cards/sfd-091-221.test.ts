/**
 * Buhru Captain — sfd-091-221 · Unit · Body · 3 energy · 3 might
 *
 *   When you play me, you may draw 1 or buff me. (To buff a unit, give it a
 *   +1 [Might] buff if it doesn't already have one.)
 *
 * Rule 355.8 — modal "A or B": the controller picks which mode resolves.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-091-221";

describe("Buhru Captain (sfd-091-221)", () => {
  test("opting in presents a mode choice; picking 'buff me' buffs the captain and draws nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .hand(P1, CARD, "captain")
      .build();
    const handBefore = game.p1.hand().length;

    await game.p1.play("captain", { to: "base" });
    await game.settle();
    await game.p1.yes();
    expect(game.decision()?.kind).toBe("pick");
    expect(game.gameState.pendingChoice?.type).toBe("choose-mode");
    await game.p1.chooseMode(1);
    await game.settle();

    expect(game.state("captain").isBuffed).toBe(true);
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });

  test("picking 'draw 1' draws a card and leaves the captain unbuffed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .hand(P1, CARD, "captain")
      .build();
    const handBefore = game.p1.hand().length;

    await game.p1.play("captain", { to: "base" });
    await game.settle();
    await game.p1.yes();
    await game.p1.chooseMode(0);
    await game.settle();

    expect(game.state("captain").isBuffed).toBe(false);
    expect(game.p1.hand().length).toBe(handBefore);
  });
});
