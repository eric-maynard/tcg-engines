/**
 * Wildclaw Shaman — ogn-147-298 · Unit · Body · 4 energy · 3 Might
 *
 *   When you play me, you may spend a buff to buff me and ready me.
 *   (If I don't have a buff, I get a +1 [Might] buff.)
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-147-298";

describe("Wildclaw Shaman (ogn-147-298)", () => {
  test("spending another unit's buff buffs and readies me", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2 }, "ally", { buffed: true })
      .hand(P1, CARD, "shaman")
      .build();
    await game.p1.play("shaman");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("shaman").isBuffed).toBe(true);
    expect(game.state("shaman").isReady).toBe(true);
  });

  // rule-id: ogn-147-298 — the ready is gated behind the spend-buff cost.
  test("with no buff to spend, I am neither buffed nor readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "shaman")
      .build();
    await game.p1.play("shaman");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("shaman").isBuffed).toBe(false);
    expect(game.state("shaman").isExhausted).toBe(true);
  });
});
