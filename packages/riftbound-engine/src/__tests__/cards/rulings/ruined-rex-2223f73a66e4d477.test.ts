/**
 * Ruling 2223f73a66e4d477 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might
 *   "[Deathknell] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *
 * Q: If Ruined Rex damaged a surviving enemy unit in combat, does that unit die to the Deathknell's 4
 *    before it gets healed?
 * A: No. Combat Cleanup order is: deal combat damage → Deathknell triggers become pending → move lethal
 *    units to the trash → HEAL the survivors → only then go back to resolving the chain. The combat
 *    damage marked on the survivor is wiped before the Deathknell's 4 lands, so it does not add up.
 * Rules: 461.1.a.1 (heal step of Combat Cleanup), 466 (combat resolution order), 808 (Deathknell triggers
 *        on dying and resolves as a chain item afterwards).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";

/**
 * P1's turn. P2 holds bf1 with an 8-Might Colossus; Ruined Rex (6) waits in P1's base.
 * Rex attacks: it deals 6 to the Colossus (survives), takes 8 and dies → Deathknell.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Colossus" }, "colossus")
    .unit(P1, "base", RUINED_REX, "rex");
}

describe("Ruling 2223f73a66e4d477 — Ruined Rex's Deathknell resolves AFTER the combat heal, so its 4 does not stack on combat damage", () => {
  test("Rex attacks, dies to the Colossus, and its Deathknell is pending while the Colossus is still on the board", async () => {
    const game = await board().build();
    await game.p1.move("rex", "bf1");
    expect(game.state("rex").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash"); // 8 damage vs 6 Might
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
  });

  test("ruling: the Colossus is healed of Rex's 6 combat damage first, so the Deathknell's 4 leaves it at 4 damage and alive", async () => {
    const game = await board().build();
    await game.p1.move("rex", "bf1");
    await game.settle();
    // Had the Deathknell landed before the heal it would be 6 + 4 = 10 ≥ 8 Might and the Colossus would be dead.
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.state("colossus").damage).toBe(4);
    expect(game.state("colossus").might).toBe(8);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // P2 defended successfully
    expect(game.violations()).toEqual([]);
  });

  test("control: without the combat (Rex simply killed outside combat) the same Deathknell also deals exactly 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Colossus" }, "colossus")
      .unit(P1, "base", RUINED_REX, "rex")
      .build();
    await game.p1.do("killUnit", { cardId: "rex" });
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("colossus").damage).toBe(4);
  });
});
