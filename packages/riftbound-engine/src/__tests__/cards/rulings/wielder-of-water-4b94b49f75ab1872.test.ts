/**
 * Ruling 4b94b49f75ab1872 — Wielder of Water (OGN-055 → ogn-055-298) · Unit · [3] · 2 Might
 *   "While I'm attacking or defending alone, I have +2 [Might]."
 *
 * Q: Does Wielder of Water get its +2 when it "attacks" an open battlefield with no defenders?
 * A: No. A unit only carries the Attacker or Defender designation while it is in a combat, and a
 *    combat only exists where units controlled by different players are present. Walking onto an
 *    empty battlefield is not an attack, so the static's condition is never met.
 * Rules: 442.1 (Attacker/Defender designations are handed out in a showdown), 464 (combat needs
 *        units of two different players at one battlefield), 740.2 (alone).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIELDER = "ogn-055-298";

describe("Ruling 4b94b49f75ab1872 — no defenders means no combat, so Wielder of Water stays a 2", () => {
  test("ruling 4b94b49f75ab1872 — moving alone onto an OPEN battlefield: no combat role, no +2 (Wielder is 2 Might there)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", WIELDER, "wielder")
      .build();
    expect(game.state("wielder").might).toBe(2);
    await game.p1.move("wielder", "bf1");
    await game.settle();
    expect(game.locationOf("wielder")).toBe("bf1");
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
    expect(game.state("wielder").staticMightBonus).toBe(0);
    expect(game.p1.points()).toBe(1); // it conquered the open battlefield — but never attacked anyone
  });

  test("an enemy-CONTROLLED but unoccupied battlefield is the same story: nobody to fight, no designation, still 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 9, name: "Homebody" }, "homebody")
      .unit(P1, "base", WIELDER, "wielder")
      .build();
    await game.p1.move("wielder", "bf1");
    await game.settle();
    expect(game.locationOf("wielder")).toBe("bf1");
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
  });

  test("contrast — with an enemy unit actually there it IS a combat: Wielder attacks alone and is a 4 (and beats a 3-Might defender)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", WIELDER, "wielder")
      .build();
    await game.p1.move("wielder", "bf1");
    expect(game.state("wielder").combatRole).toBe("attacker");
    expect(game.state("wielder").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("wielder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("and the bonus is gone again the moment the combat is over (no designation left ⇒ back to 2)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", WIELDER, "wielder")
      .build();
    await game.p1.move("wielder", "bf1");
    await game.settle();
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
  });
});
