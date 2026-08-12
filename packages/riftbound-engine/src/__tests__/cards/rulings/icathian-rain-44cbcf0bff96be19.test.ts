/**
 * Ruling 44cbcf0bff96be19 — Icathian Rain (OGN-248 → ogn-248-298) · [7][rainbow]×3
 *   "Deal 2 to a unit." ×6 (six independent instructions)
 *
 * Q: May I allocate more of Icathian Rain's damage to a unit than it has Might, or must the excess be
 *    redirected to other units?
 * A: You may pile it all on. Each "Deal 2 to a unit" chooses its target independently and nothing forces
 *    you to spread the damage — not even when the unit is already dead by the time the later instructions
 *    would resolve, and not onto your own units.
 * Rules: 355.9 (each instruction chooses its own target), 355.10 (you choose freely among legal targets;
 *        no obligation to maximise), 359.3.e.5 (an instruction whose target has gone simply does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";

/** P1's turn with exactly Icathian Rain's cost. P2 has a 3-Might Grunt and a 9-Might Ogre; P1 has an Ally. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
    .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
    .hand(P1, ICATHIAN_RAIN, "rain");
}

const ALL_AT_GRUNT = ["grunt", "grunt", "grunt", "grunt", "grunt", "grunt"];

describe("Ruling 44cbcf0bff96be19 — Icathian Rain may dump every instance on one unit; nothing has to be redirected", () => {
  test("ruling: all six 'Deal 2' instructions may name the same 3-Might Grunt — the play is legal and takes no redirection prompt", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ALL_AT_GRUNT });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", controller: P1, targets: ALL_AT_GRUNT })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const stop = await game.settle();
    expect(stop.reason).toBe("open"); // nobody was asked to re-aim the overkill
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.state("ogre")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("ally").damage).toBe(0); // no forced spill onto one's own units either
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the Grunt is already dead partway through, and the remaining instructions simply do nothing (no re-target)", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ALL_AT_GRUNT });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.units("bf1")).toEqual(["ogre"]);
    expect(game.state("ogre").damage).toBe(0);
  });

  test("spreading is equally legal — the caster simply chooses: six instances on the 9-Might Ogre kill it instead", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ["ogre", "ogre", "ogre", "ogre", "ogre", "ogre"] });
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("trash");
    expect(game.state("grunt")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("…and a mixed allocation (5 at the Ogre, 1 at the Grunt) is fine too: the Ogre dies at 10 and the Grunt just takes 2", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ["ogre", "ogre", "ogre", "ogre", "ogre", "grunt"] });
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("trash"); // 10 ≥ 9
    expect(game.state("grunt")).toMatchObject({ damage: 2, zone: "battlefield-bf1" }); // 2 < 3
  });
});
