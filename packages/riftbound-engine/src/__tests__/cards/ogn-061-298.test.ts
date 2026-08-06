/**
 * Poro Herder — ogn-061-298 · Unit · Calm · 3 energy + 1 calm · 3 Might
 *
 *   When you play me, if you control a Poro, buff me and draw 1.
 *   (If I don't have a buff, I get a +1 [Might] buff.)
 *
 * Rules: 700–703 (buffs: a buffed unit has +1 Might; a unit holds at most one buff).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-061-298";
const POUTY_PORO = "ogn-013-298"; // 2-might Poro

describe("Poro Herder (ogn-061-298)", () => {
  test("with a friendly Poro: buffs itself (+1 Might) and draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", POUTY_PORO, "poro")
      .hand(P1, CARD, "herder")
      .build();
    expect(game.p1.hand()).toHaveLength(1);
    await game.p1.play("herder");
    await game.settle();
    expect(game.zoneOf("herder")).toBe("base");
    expect(game.state("herder").isBuffed).toBe(true);
    expect(game.state("herder").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(1); // herder left, 1 drawn
    expect(game.state("poro").isBuffed).toBe(false);
  });

  test("without a Poro: no buff and no draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "herder")
      .build();
    await game.p1.play("herder");
    await game.settle();
    expect(game.zoneOf("herder")).toBe("base");
    expect(game.state("herder").isBuffed).toBe(false);
    expect(game.state("herder").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'you control': an enemy Poro does not satisfy the condition", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P2, "base", POUTY_PORO, "theirPoro")
      .hand(P1, CARD, "herder")
      .build();
    await game.p1.play("herder");
    await game.settle();
    expect(game.state("herder").isBuffed).toBe(false);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("a Poro at a battlefield you control still counts", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", POUTY_PORO, "poro")
      .hand(P1, CARD, "herder")
      .build();
    await game.p1.play("herder", { to: "base" });
    await game.settle();
    expect(game.state("herder").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("cost: 3 energy + 1 calm deducted; not playable without the calm power or with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "herder").build();
    await game.p1.play("herder");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0 } });
    const noCalm = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "herder").build();
    expect(noCalm.p1.can("play", "herder")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).hand(P1, CARD, "herder").build();
    expect(low.p1.can("play", "herder")).toBe(false);
  });
});
