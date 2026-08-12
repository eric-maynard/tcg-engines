/**
 * Ruling 38bacbe5624a378a — (no specific card) moving onto an EMPTY battlefield.
 *
 * Q: Do you attack an empty battlefield?
 * A: No. You do not attack an empty battlefield — moving there opens a (non-combat) Showdown, not a
 *    Combat, so nobody is designated Attacker and nothing "attacks".
 * Rules: 437 / 440 (Combat needs opposing units at the same battlefield), 429.1 / 344.2 (a move to an
 *        empty battlefield stages a Showdown), 464.2.c.3 (no Attacker designation without a Combat),
 *        466.5.d / 469.1 (control is established when the Showdown closes → Conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298"; // 6 Might — "When I attack, deal damage equal to my Might to an enemy unit here."

describe("Ruling 38bacbe5624a378a — you do not attack an empty battlefield", () => {
  test("a lone move onto an uncontrolled, empty battlefield stages a SHOWDOWN with no combat and no Attacker designation", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    // A showdown is open (both seats may act), but no combat exists: nobody is an attacker.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.state("raider").location).toBe("bf1");
    await game.settle();
    // Showdown closes, P1 is the only player present → establishes control (a Conquer, scoring 1).
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("no unit ever gets the Attacker designation there — Yasuo's \"When I attack\" trigger does NOT fire on the empty battlefield", async () => {
    const game = await scenario().battlefield("bf1").unit(P1, "base", YASUO, "yasuo").build();
    await game.p1.move("yasuo", "bf1");
    expect(game.chain()).toEqual([]); // nothing attacked ⇒ no attack trigger
    expect(game.state("yasuo").combatRole).toBeNull();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("contrast — the SAME move into an enemy-occupied battlefield IS an attack: attacker designation and the attack trigger fire", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain().map((i) => i.cardId)).toEqual(["yasuo"]); // "When I attack" is on the chain
    expect(game.violations()).toEqual([]);
  });
});
