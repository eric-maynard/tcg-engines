/**
 * Tornado Warrior — ven-099-166 · Unit · Chaos · 3 energy · 3 might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me from face down, you may empower something here.
 *   Disempower it at end of turn.
 *
 * Rules: 827 [Empowered]; 517.2.b — "… at end of turn" durations expire in the Ending Step.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-099-166";

describe("Tornado Warrior (ven-099-166)", () => {
  test("playing me from face down empowers a chosen permanent here, and it is disempowered at end of turn", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .facedown(P1, "bf1", CARD, "tw")
      .build();
    await game.p1.reveal("tw");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").meta.empowered).toBe(true);

    await game.p1.endTurn();
    await game.settle();
    expect(game.state("ally").meta.empowered).toBe(false);
  });
});
