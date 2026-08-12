/**
 * Ruling b07ec155c7d8b46b — Unchecked Power (OGN-123 → ogn-123-298) · Spell · [7][mind][mind]
 *   "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base."
 *
 * Q: Unchecked Power wipes Order Viktor plus 2 other non-token units — do 2 Recruit tokens appear?
 * A: No. Viktor dies in the same lethal batch as the others, so he is no longer on the board when the deaths
 *    would be seen; his ability never triggers and no token is created.
 * Rules: 411 / 383 (a trigger needs its source present when the event is seen), Cleanup lethal batch (one event).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const VIKTOR_LEADER = "ogn-246-298";

/** P2's board: Viktor and two vanilla non-token units, all at bf1. P1 casts the sweeper from base. */
function viktorPlusTwo() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VIKTOR_LEADER, "viktor")
    .unit(P2, "bf1", { might: 3, name: "Adept" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Savant" }, "b")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "mine")
    .hand(P1, UNCHECKED_POWER, "up");
}

describe("Ruling b07ec155c7d8b46b — Viktor is dead before his own trigger could see the other deaths", () => {
  test("all three units at the battlefield die and P2 gets NO Recruit tokens", async () => {
    const game = await viktorPlusTwo().build();
    await game.p1.cast("up");
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.p2.units("base")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the rest of the spell still happened — P1's own base unit was exhausted and, being in base, took no damage", async () => {
    const game = await viktorPlusTwo().build();
    expect(game.state("mine").isExhausted).toBe(false);
    await game.p1.cast("up");
    await game.settle();
    expect(game.state("mine").isExhausted).toBe(true);
    expect(game.zoneOf("mine")).toBe("base"); // "at battlefields" excludes base
    expect(game.zoneOf("up")).toBe("trash");
  });
});
