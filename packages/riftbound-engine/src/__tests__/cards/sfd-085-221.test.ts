/**
 * Ornn, Forge God — sfd-085-221 · Unit (Champion) · Mind · 6 energy · 4 might
 *
 *   [Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me
 *   for [rainbow] less, even if it's already attached.)
 *   I have +1 [Might] for each friendly gear.
 *
 * Rules: 105.2 / 740.1.a (dynamic static Might), 522 (statics re-applied).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-085-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, +0 Might bonus

describe("Ornn, Forge God (sfd-085-221)", () => {
  test("gains +1 Might for each friendly gear and scales with the gear count", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "ornn")
      .gear(P1, DIRK, "g1")
      .build();
    expect(game.state("ornn").might).toBe(5);

    const game2 = await scenario()
      .unit(P1, "base", CARD, "ornn")
      .gear(P1, DIRK, "g1")
      .gear(P1, DIRK, "g2")
      .gear(P1, DIRK, "g3")
      .build();
    expect(game2.state("ornn").might).toBe(7);
  });

  test("counts only friendly gear — enemy gear does not raise my Might", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "ornn")
      .gear(P2, DIRK, "theirs")
      .build();
    expect(game.state("ornn").might).toBe(4);
  });
});
