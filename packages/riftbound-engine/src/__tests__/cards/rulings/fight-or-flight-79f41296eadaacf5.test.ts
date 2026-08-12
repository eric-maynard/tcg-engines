/**
 * Ruling 79f41296eadaacf5 — Fight or Flight (OGN-168 → ogn-168-298) · Spell · [2] · Action · [Hidden]
 *     "Move a unit from a battlefield to its base."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might — the unit being saved
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · Action — "Deal 3 to a unit at a battlefield."
 *
 * Q: Can a hidden Fight or Flight be played in response to a burn spell, moving Teemo away so he is not damaged?
 * A: Yes. A hidden card is revealed at Reaction speed, so it can answer the burn spell even though Fight or Flight
 *    is printed [Action]. It resolves first, Teemo goes to base, and the burn spell then finds no "unit at a
 *    battlefield" to damage.
 * Rules: 811.1 (a hidden card may be revealed whenever a Reaction could be played, for [0]),
 *        341.1 (LIFO), 359.3.e.5 (an object that no longer matches the target descriptor is not affected).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn with exactly [1][fury]. P1 holds bf1 with Teemo and has Fight or Flight face down there. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P2, HEXTECH_RAY, "ray");
}

describe("Ruling 79f41296eadaacf5 — hidden Fight or Flight answers a burn spell and Teemo takes nothing", () => {
  test("premise: Fight or Flight is face down at bf1 and Teemo is the burn spell's only legal target", async () => {
    const game = await board().build();
    expect(game.zoneOf("fof")).toBe("facedown-bf1");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect((game.p2.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat()).toEqual(["teemo"]);
  });

  test("ruling: with Hextech Ray on the chain P1 may reveal the hidden Fight or Flight — it is a [Reaction] play from hidden, and it lands ON TOP of the burn spell", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "teemo" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "fof"]);
  });

  test("ruling: Fight or Flight resolves first and sends Teemo to base; Hextech Ray then finds no unit at a battlefield and deals NO damage", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "teemo" });
    await game.p2.passPriority();
    await game.p1.reveal("fof");
    await game.settle();
    expect(game.locationOf("teemo")).toBe("base");
    expect(game.state("teemo").damage).toBe(0);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control — without the reveal, Hextech Ray's 3 damage kills the 2-Might Teemo", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "teemo" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
  });
});
