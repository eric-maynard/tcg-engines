/**
 * Ruling 52430c46bc06de19 — (no specific card) Daring Poro (OGN-210 → ogn-210-298, [Assault]),
 *   Yasuo, Remorseful (OGN-076 → ogn-076-298, "When I attack, deal damage equal to my Might…").
 *
 * Q: If a unit moves to an empty battlefield, is it considered as attacking?
 * A: No. Attacker/Defender designations exist only in a Combat, and a move to an empty battlefield
 *    stages a non-combat Showdown. So "When I attack" triggers do not fire and [Assault] gives no
 *    Might there.
 * Rules: 437 / 440 (Combat needs opposing units), 429.1 (empty battlefield ⇒ Showdown, no Combat),
 *        464.2.c.3 (no designation), 807.1 (Assault applies while the unit IS an attacker).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DARING_PORO = "ogn-210-298"; // 2 Might · [Assault] (+1 Might while I'm an attacker)
const YASUO = "ogn-076-298"; // 6 Might · When I attack, deal damage equal to my Might to an enemy unit here

describe("Ruling 52430c46bc06de19 — a unit moving to an empty battlefield is not attacking", () => {
  test("[Assault] gives NO bonus on an empty battlefield: Daring Poro stays at 2 Might with a null combat role", async () => {
    const game = await scenario().battlefield("bf1").unit(P1, "base", DARING_PORO, "poro").build();
    expect(game.state("poro").keywords).toContain("Assault");
    await game.p1.move("poro", "bf1");
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.state("poro").might).toBe(2); // base 2, no attacker bonus
    await game.settle();
    expect(game.state("poro").might).toBe(2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Assault] DOES apply when the same Poro moves into an enemy-held battlefield (it is an attacker there)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", DARING_PORO, "poro")
      .build();
    await game.p1.move("poro", "bf1");
    expect(game.state("poro").combatRole).toBe("attacker");
    expect(game.state("poro").might).toBe(3); // 2 + [Assault] 1
  });

  test("\"When I attack\" does not fire on the empty battlefield, and the enemy unit at ANOTHER battlefield takes no damage", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });
});
