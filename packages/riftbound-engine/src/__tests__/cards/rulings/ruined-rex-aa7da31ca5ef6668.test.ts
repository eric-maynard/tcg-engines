/**
 * Ruling aa7da31ca5ef6668 — Ruined Rex (UNL-067 → unl-067-219) · Unit · [6][mind] · 6 Might
 *   "[Deathknell][>] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *
 * Q: Rex (6) trades with a 10-Might unit. Does Rex's combat damage stay on the killer so the Deathknell's
 *    4 finishes it off?
 * A: No. The order is: combat damage → Rex dies and its Deathknell goes on the Chain as a pending item →
 *    survivors are HEALED → only then does the pending Deathknell resolve. The killer's 6 combat damage is
 *    already gone, so it ends the combat with just the 4 from the Deathknell and lives.
 * Rules: 428.1.a.1.b (death trigger pends), 461.1.a.1 (healing at combat resolution, before the Chain resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";

/** P2 holds bf1 with a 10-Might unit; P1's Ruined Rex attacks into it from base. */
function rexAttacksTen() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 10, name: "Colossus" }, "big")
    .unit(P1, "base", RUINED_REX, "rex");
}

describe("Ruling aa7da31ca5ef6668 — healing happens before the Deathknell resolves, so Rex cannot finish the killer", () => {
  test("Rex dies to the 10-Might unit and its Deathknell is a PENDING chain item, not an immediate effect", async () => {
    const game = await rexAttacksTen().build();
    await game.p1.move("rex", "bf1");
    expect(game.state("rex").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([]); // nothing on the chain before combat damage
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
  });

  test("the killer keeps only the Deathknell's 4 — its 6 combat damage was healed first, so it survives", async () => {
    const game = await rexAttacksTen().build();
    await game.p1.move("rex", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("battlefield-bf1"); // NOT trash: 6 + 4 never coexist
    expect(game.state("big").damage).toBe(4); // healed to 0, then the Deathknell's 4
    expect(game.state("big").might).toBe(10);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // defence held
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — the same Deathknell DOES kill a unit whose own Might is within 4 (the effect works, the healing is what saves the Colossus)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 10, name: "Colossus" }, "big")
      .unit(P2, "base", { might: 3, name: "Squire" }, "squire")
      .unit(P1, "base", RUINED_REX, "rex")
      .script(P1, ["squire"])
      .build();
    await game.p1.move("rex", "bf1");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash"); // 4 ≥ 3 Might
    expect(game.state("big").damage).toBe(0); // healed, and the Deathknell went elsewhere
  });
});
