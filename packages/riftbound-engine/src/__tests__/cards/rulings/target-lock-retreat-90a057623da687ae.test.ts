/**
 * Ruling 90a057623da687ae — (no specific card) the opponent retreats the unit you targeted.
 *   Exercised with Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *   (Sibling ruling 4234e989544dc0b0 settles the same point; this file checks the "moved to base"
 *   phrasing of the question and the untouched bystander.)
 *
 * Q: I choose a target; my opponent reacts by moving that unit from the battlefield to base. May I
 *    re-aim my spell at something else?
 * A: No. The target is locked when the spell is finalized — which happens before anyone gets priority.
 *    The retreat makes the target illegal, so that instruction is simply ignored; it is never
 *    re-pointed, and no new target prompt appears.
 * Rules: 355.5 / 402.2 (choices are made and locked as the item is finalized), 337.1.a (finalizing
 *        passes no priority), 355.15 (a locked choice is not re-made), 359.3.e.5 (an illegal target on
 *        resolution is simply unaffected).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";

/** [Action] "Deal 3 to a unit at a battlefield." — base is out of its reach. */
const SNIPE = {
  abilities: [
    {
      effect: { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Action] Deal 3 to a unit at a battlefield.",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with a Foe and a Bystander; P2 has Flash and the energy for it. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 5, name: "Bystander" }, "bystander")
    .hand(P1, SNIPE, "snipe")
    .hand(P2, FLASH, "flash");
}

describe("Ruling 90a057623da687ae — a target retreated to base is not swapped for another; the spell just misses", () => {
  test("the target rides on the chain item from the moment it is played, before P2 has any window", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snipe", targets: ["foe"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 Flashes the target home: no re-target prompt appears and the chain item still names the departed unit", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("foe")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snipe", targets: ["foe"] })]);
    expect(game.decision()).toMatchObject({ kind: "action" }); // an action window, not a pick
    expect(game.violations()).toEqual([]);
  });

  test("the Snipe then resolves doing nothing: no damage on the retreated Foe and none on the Bystander that stayed", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "foe" });
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0); // never re-aimed at the unit still standing there
    expect(game.zoneOf("snipe")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — with no retreat the same spell deals its 3 to the chosen Foe", async () => {
    const game = await board().build();
    await game.p1.cast("snipe", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
    expect(game.state("bystander").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
