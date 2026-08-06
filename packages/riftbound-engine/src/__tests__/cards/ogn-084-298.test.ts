/**
 * Eager Apprentice — ogn-084-298 · Unit · Mind · 3 energy · 3 Might
 *
 *   While I'm at a battlefield, the Energy costs for spells you play is
 *   reduced by [1], to a minimum of [1].
 *
 * Rule 356.4.e: the minimum applies per discount (two Apprentices: 3 → 1).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-084-298";

/** Inline vanilla spells so the printed cost is the only variable. */
const spell = (cost: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: cost,
  name: `Draw-${cost}`,
  timing: "action",
});

describe("Eager Apprentice (ogn-084-298)", () => {
  test("costs 3 energy; a 3-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ea").build();
    await game.p1.play("ea");
    await game.settle();
    expect(game.zoneOf("ea")).toBe("base");
    expect(game.state("ea").might).toBe(3);
    expect(game.p1.energy()).toBe(0);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "ea").build();
    expect(poor.p1.can("play", "ea")).toBe(false);
  });

  test("at a battlefield: your spells cost 1 less energy (3 → 2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ea")
      .hand(P1, spell(3), "s3")
      .build();
    expect(game.p1.can("cast", "s3")).toBe(true);
    await game.p1.cast("s3");
    expect(game.p1.energy()).toBe(0);
  });

  test("minimum of 1: a 1-cost spell still costs 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ea")
      .hand(P1, spell(1), "s1")
      .build();
    await game.p1.cast("s1");
    expect(game.p1.energy()).toBe(0);
    const broke = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ea").hand(P1, spell(1), "s1").build();
    expect(broke.p1.can("cast", "s1")).toBe(false);
  });

  test("'While I'm at a battlefield': no discount while the Apprentice is in the base", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ea").hand(P1, spell(3), "s3").build();
    expect(game.p1.can("cast", "s3")).toBe(false);
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.cast("s3");
    expect(game.p1.energy()).toBe(0);
  });

  test("'spells YOU play': the opponent's spells are not discounted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ea")
      .hand(P2, spell(3), "theirs")
      .build();
    expect(game.p2.can("cast", "theirs")).toBe(false);
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("theirs");
    expect(game.p2.energy()).toBe(0);
  });

  test("only spells: units you play are not discounted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ea")
      .hand(P1, { energyCost: 3, might: 2 }, "u3")
      .build();
    expect(game.p1.can("play", "u3")).toBe(false);
  });

  test("two Apprentices at battlefields stack: 3 → 1 (each discount's minimum applies to itself, rule 356.4.e)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "ea1")
      .unit(P1, "bf2", CARD, "ea2")
      .hand(P1, spell(3), "s3")
      .build();
    expect(game.p1.can("cast", "s3")).toBe(true);
    await game.p1.cast("s3");
    expect(game.p1.energy()).toBe(0);
  });
});
