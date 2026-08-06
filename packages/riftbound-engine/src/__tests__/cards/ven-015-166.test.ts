/**
 * Decree of Rage — ven-015-166 · Spell · Fury · 1 energy · 1 power
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   This can't be countered.
 *   Deal 4 to an enemy Calm ([calm]) unit.
 *
 * Rule 544 — a counter directed at an uncounterable chain item has no effect.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-015-166";
const WIND_WALL = "ogn-064-298"; // [Reaction] Counter a spell. (3 energy, 2 calm power)

describe("Decree of Rage (ven-015-166)", () => {
  test("deals 4 to an enemy Calm unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P2, "base", { domain: "calm", might: 5 }, "foe")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
    expect(game.zoneOf("decree")).toBe("trash");
  });

  test("can't be countered: Wind Wall resolves but Decree still deals its damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P2, "base", { domain: "calm", might: 5 }, "foe")
      .hand(P1, CARD, "decree")
      .hand(P2, WIND_WALL, "wall")
      .build();
    await game.p1.cast("decree", { targets: "foe" });
    await game.p2.cast("wall");
    expect(game.chain().map((i) => i.cardId)).toEqual(["decree", "wall"]);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.state("foe").damage).toBe(4);
  });
});
