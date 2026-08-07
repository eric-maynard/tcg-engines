/**
 * Evelynn, Entrancing — unl-141-219 · Unit (Champion) · Chaos · 2 energy · 2 might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Backline] (I must be assigned combat damage last.)
 *   When you play me from face down on your turn, you may move an enemy unit at a
 *   different location to my battlefield.
 *
 * rule 811.1.c.3: revealing a facedown card is playing it "from [Hidden]".
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const EVELYNN = "unl-141-219";

describe("Evelynn, Entrancing (unl-141-219)", () => {
  test("played from face down on your turn: may move an enemy unit at a different location to my battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .facedown(P1, "bf1", EVELYNN, "eve")
      .unit(P2, "bf2", { might: 3 }, "foe")
      .build();

    await game.p1.reveal("eve");
    await game.settle();

    expect(game.zoneOf("eve")).toBe("battlefield-bf1");
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("has Backline and Hidden", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "bf1", EVELYNN, "eve")
      .build();
    const keywords = game.state("eve").keywords.concat(
      game.state("eve").grantedKeywords.map((g: { keyword: string }) => g.keyword),
    );
    expect(keywords).toContain("Backline");
  });
});
