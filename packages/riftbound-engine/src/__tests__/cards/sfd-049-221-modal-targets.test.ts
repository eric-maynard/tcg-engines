/**
 * Aphelios, Exalted — sfd-049-221 · modal target declaration.
 *
 * rule 355.10: only a SINGLE caster-chosen target is declared when a modal
 * option is picked. "Ready 2 runes" names a two-object target set that the
 * handler resolves itself; "Buff a friendly unit" is one choice and must be
 * prompted rather than silently taking the first friendly unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-049-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment

describe("Aphelios, Exalted — modal targeting (sfd-049-221)", () => {
  test("mode 'Ready 2 runes' readies both exhausted runes", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", CARD, "aph")
      .gear(P1, DIRK, "dirk")
      .runes(P1, "calm", 2)
      .build();
    await game.p1.tapRunes(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);

    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    await game.acting().chooseMode(0);
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("mode 'Buff a friendly unit' prompts for which friendly unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", CARD, "aph")
      .unit(P1, "base", "sfd-050-221", "other")
      .gear(P1, DIRK, "dirk")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "aph" });
    await game.settle();
    await game.acting().chooseMode(2);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    await game.acting().pick("other");
    await game.settle();
    expect(game.state("other").meta.buffed).toBe(true);
  });
});
