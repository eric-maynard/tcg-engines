/**
 * Jhin, Murderous Artist — unl-022-219 · Champion Unit · Fury · 4 energy · 4 might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   When I move, [Add] [1][rainbow]. (Abilities that add resources can't be reacted to.)
 *
 * Rule 429.2 / 337.2 — abilities that Add resources resolve immediately and
 * are never placed on the chain.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const JHIN = "unl-022-219";

describe("Jhin, Murderous Artist (unl-022-219)", () => {
  test("moving adds [1][rainbow] immediately with no chain / reaction window", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", JHIN, "jhin")
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("jhin", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
  });
});
