/**
 * Ruling 6b0b950438f39839 — Wielder of Water (OGN-055 → ogn-055-298) · [3] · 2 Might · "While I'm attacking or defending alone, I have +2 [Might]."
 *   × Wuju Bladesman (Yi legend, ogs-019-024) · "While a friendly unit defends alone, it gets +2 [Might]."
 *   × Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Does Wielder of Water get +2 (itself) and +2 (Yi) when targeted by a Falling Star cast from hand, outside combat?
 * A: No. Being targeted by a spell is not combat; the Wielder is not a defender, so neither "while defending alone" bonus applies — it sits
 *    at its base 2 Might (and 3 damage kills it).
 * Rules: 464 (attacker/defender designations exist only in a combat showdown), 367/522 (conditional statics apply only while true).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIELDER = "ogn-055-298";
const WUJU_BLADESMAN = "ogs-019-024";
const FALLING_STAR = "ogn-029-298";

/** P2's turn with [2] + fury×2 and Falling Star. P1 (Wuju Bladesman legend) holds bf1 with a lone Wielder of Water; a 4-Might Other in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WIELDER, "wielder")
    .unit(P1, "base", { might: 4, name: "Other" }, "other")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, FALLING_STAR, "fs");
}

describe("Ruling 6b0b950438f39839 — a spell from hand is not combat: Wielder of Water gets neither its own nor Yi's 'defending alone' +2", () => {
  test("targeted by Falling Star (no showdown, no chain beforehand): the Wielder is 2 Might before, while the spell is on the chain, and takes the 3 as a 2-Might unit — it dies; Other (4) survives its 3", async () => {
    const game = await board().build();
    expect(game.state("wielder")).toMatchObject({ combatRole: null, might: 2, staticMightBonus: 0 });
    await game.p2.cast("fs", { targets: ["wielder", "other"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // not a combat
    expect(game.state("wielder")).toMatchObject({ combatRole: null, might: 2, staticMightBonus: 0 }); // being chosen changes nothing
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("wielder")).toBe("trash"); // 3 ≥ 2
    expect(game.state("other")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the bonuses are real IN COMBAT — when P2's Raider attacks and the Wielder defends alone it is 2 + 2 (self) + 2 (Yi) = 6", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.state("wielder")).toMatchObject({ might: 6, staticMightBonus: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 6 kills the 3-Might Raider
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1"); // took 3 < 6
    expect(game.state("wielder")).toMatchObject({ combatRole: null, might: 2 }); // and back to 2 once combat is over
  });
});
