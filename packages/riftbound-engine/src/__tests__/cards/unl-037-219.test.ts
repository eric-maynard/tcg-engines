/**
 * Shadow Watcher — unl-037-219 · Unit · Calm · 4 energy + [calm] · 5 might
 *
 *   "If a friendly unit died during your Beginning Phase this turn, I enter ready."
 *
 * Rules: 143.4 (a unit enters exhausted unless an effect says otherwise), so a
 * conditional "I enter ready" that cannot be shown to hold must NOT grant ready.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-037-219";

/** [Action] Kill a unit — a friendly death on demand, in the MAIN phase. */
const KILL_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Filler Kill",
  timing: "action",
} as const;

describe("Shadow Watcher (unl-037-219)", () => {
  test("no unit has died at all this turn: the conditional clause does not apply and it enters exhausted (143.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .hand(P1, CARD, "watcher")
      .build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("watcher").isExhausted).toBe(true);
    expect(game.state("watcher").isReady).toBe(false);
  });

  test("a friendly unit that died in the MAIN phase is not a Beginning Phase death: still exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .unit(P1, "base", { might: 2, name: "Filler Ally" }, "ally")
      .hand(P1, KILL_SPELL, "boom")
      .hand(P1, CARD, "watcher")
      .build();
    await game.p1.cast("boom", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("watcher").isExhausted).toBe(true);
  });
});
