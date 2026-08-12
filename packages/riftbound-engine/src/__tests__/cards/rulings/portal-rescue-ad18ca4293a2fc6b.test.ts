/**
 * Ruling ad18ca4293a2fc6b — Portal Rescue (OGN-102 → ogn-102-298) · Action · Mind · [3][mind]
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   × Ruined Rex (UNL-067 → unl-067-219) · 6 Might · "[Deathknell][>] Deal 4 to an enemy unit."
 *
 * Q: Does banishing a unit count as it dying — e.g. can Portal Rescue be used to set off a [Deathknell]?
 * A: No. Banishing is not dying: the unit moves to banishment without a death event, so no [Deathknell] /
 *    "when a unit dies" trigger fires. (Killing that same unit does fire it — that is the control below.)
 * Rules: 428 (Banish moves a card to banishment; it is not a death), 808.1 ([Deathknell] = "when I die"),
 *        419.3 (the rescued unit is PLAYED back, entering exhausted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const RUINED_REX = "unl-067-219";
/** Control spell: a plain "Kill a unit." so the same board can be shown to fire the Deathknell. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Execute",
  timing: "action",
} as const;

/** P1's turn. P1's Ruined Rex stands in P1's base; P2 has one unit (the only legal Deathknell target). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "base", { might: 9, name: "Bystander" }, "bystander")
    .hand(P1, PORTAL_RESCUE, "rescue")
    .hand(P1, EXECUTE, "execute");
}

describe("Ruling ad18ca4293a2fc6b — banishing a unit with Portal Rescue is not a death, so no [Deathknell] fires", () => {
  test("Portal Rescue on Ruined Rex: it is banished and replayed to base, and NO Deathknell item ever reaches the chain", async () => {
    const game = await board().build();
    await game.p1.cast("rescue", { targets: "rex" });
    await game.settle();
    expect(game.chain().filter((c) => c.cardId === "rex")).toEqual([]);
    expect(game.state("bystander").damage).toBe(0); // the 4 was never dealt
    expect(game.zoneOf("rescue")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("…and the rescued Rex is back on the board (played to its owner's base, ignoring its cost) rather than dead", async () => {
    const game = await board().build();
    await game.p1.cast("rescue", { targets: "rex" });
    await game.settle();
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.p1.trash()).not.toContain("rex");
    expect(game.p1.units()).toContain("rex");
  });

  test("control: KILLING the very same Rex does fire the Deathknell — 4 damage onto the enemy unit", async () => {
    const game = await board().build();
    await game.p1.cast("execute", { targets: "rex" });
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("bystander").damage).toBe(4);
  });
});
