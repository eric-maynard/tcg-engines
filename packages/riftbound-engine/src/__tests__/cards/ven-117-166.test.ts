/**
 * Disciple of Shen — ven-117-166 · Unit · Order · 2 energy · 1 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   I have [Shield 3] while I'm at a battlefield with exactly one other unit you control.
 *   (+3 [Might] while I'm a defender.)
 *
 * Rules: 425.2 (a static ability functions only while its condition holds),
 * 809 (granted keywords), 432.1.a (Shield raises the defender's Might in combat).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-117-166";

describe("Disciple of Shen (ven-117-166)", () => {
  test("alone at a battlefield: no Shield is granted", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .build();

    expect(game.state("disciple").keywords).toContain("Hidden");
    expect(game.state("disciple").keywords).not.toContain("Shield");
  });

  test("with exactly one other friendly unit there: Shield 3", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .unit(P1, "bf1", { might: 2 }, "ally")
      .build();

    const granted = game.state("disciple").grantedKeywords ?? [];
    expect(granted.some((gk) => gk.keyword === "Shield" && gk.value === 3)).toBe(true);
  });

  test("an enemy unit at the battlefield does not satisfy 'you control'", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .unit(P2, "bf1", { might: 2 }, "foe")
      .build();

    expect(game.state("disciple").keywords).not.toContain("Shield");
  });

  test("two other friendly units is not 'exactly one': no Shield", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .unit(P1, "bf1", { might: 2 }, "ally1")
      .unit(P1, "bf1", { might: 2 }, "ally2")
      .build();

    expect(game.state("disciple").keywords).not.toContain("Shield");
  });

  test("in combat Shield 3 raises the lethal threshold, so a 3-damage attacker can't kill it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .unit(P1, "bf1", { might: 1 }, "ally")
      .unit(P2, "base", { might: 3 }, "attacker")
      .build();

    await game.p2.move("attacker", "bf1");
    await game.settle();

    // rule 432.1.a: as a defender the Disciple is Might 1 + Shield 3 = 4, so
    // the whole 3 damage the attacker can deal is not lethal to it.
    expect(game.zoneOf("disciple")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
  });

  test("without the Shield (alone) a 3-damage attacker kills the Disciple", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "disciple")
      .unit(P2, "base", { might: 3 }, "attacker")
      .build();

    await game.p2.move("attacker", "bf1");
    await game.settle();

    expect(game.zoneOf("disciple")).toBe("trash");
  });
});
