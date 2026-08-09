/**
 * Hand Hammer — ven-027-166 · Equipment (gear) · Calm · 2 energy · +1 Might bonus
 *
 *   [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *
 * Rules: 208.3 (a gear with [Equip] is Equipment), 716 (attachment).
 *
 * VEN has no hand-authored .ts defs: Hand Hammer flows through `adaptJsonCard`,
 * which passes ven.json's `"cardType": "gear"` through unchanged. Every engine
 * site that offers equipping discriminates on `cardType === "equipment"`, so
 * Hand Hammer can neither be equipped nor be offered by [Weaponmaster].
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-027-166";
const ORNN = "sfd-085-221"; // Ornn, Forge God — [Weaponmaster]

describe("Hand Hammer (ven-027-166)", () => {
  test("it is Equipment — it can be equipped to a friendly unit (208.3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", { might: 3 }, "ally")
      .gear(P1, CARD, "hammer")
      .build();
    await game.p1.do("equipCard", { equipmentId: "hammer", unitId: "ally" });
    await game.settle();
    expect(game.state("ally").meta.equippedWith).toEqual(["hammer"]);
    expect(game.state("ally").might).toBe(4);
  });

  test(
    "[Weaponmaster] offers Hand Hammer as an equip option when Ornn is played (208.3)",
    async () => {
      const game = await scenario()
        .resources(P1, { energy: 8, power: { mind: 3, calm: 2, rainbow: 2 } })
        .hand(P1, ORNN, "ornn")
        .gear(P1, CARD, "hammer")
        .build();
      await game.p1.play("ornn", { to: "base" });
      const decision = game.decision();
      expect(decision?.kind).toBe("pick");
      expect(JSON.stringify(decision)).toContain("hammer");
    },
  );

  // rule 718 — while attached, "I" in an Equipment's effect text is the equipped
  // unit, so "while I'm at a battlefield with exactly one other unit you
  // control" counts units around the HOLDER, excluding the holder itself.
  test(
    "+2 Might while the equipped unit is at a battlefield with exactly one other friendly unit (718)",
    async () => {
      const game = await scenario()
        .resources(P1, { energy: 3, power: { calm: 2 } })
        .battlefield("bf1")
        .unit(P1, "bf1", { might: 3 }, "ally")
        .unit(P1, "bf1", { might: 2 }, "buddy")
        .gear(P1, CARD, "hammer")
        .build();
      await game.p1.do("equipCard", { equipmentId: "hammer", unitId: "ally" });
      await game.settle();
      // 3 base + 1 equipment might bonus + 2 from the conditional static
      expect(game.state("ally").might).toBe(6);
    },
  );

  test("a second other friendly unit at the battlefield breaks 'exactly one' — the bonus is gone (718)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1")
      .unit(P1, "bf1", { might: 3 }, "ally")
      .unit(P1, "bf1", { might: 2 }, "buddy")
      .unit(P1, "bf1", { might: 2 }, "buddy2")
      .gear(P1, CARD, "hammer")
      .build();
    await game.p1.do("equipCard", { equipmentId: "hammer", unitId: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
  });
});
