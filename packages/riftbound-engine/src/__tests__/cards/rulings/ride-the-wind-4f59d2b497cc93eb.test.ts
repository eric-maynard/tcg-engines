/**
 * Ruling 4f59d2b497cc93eb — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Can Ride the Wind move a unit from one battlefield to another?
 * A: Yes. The "you cannot move from battlefield to battlefield" restriction belongs to the STANDARD MOVE
 *    action only. Any other move effect is limited only by what its own text says, and Ride the Wind says
 *    nothing — so it can move a unit anywhere, battlefield to battlefield included.
 * Rules: 407 (moving), 411.2 (the Standard Move action's own battlefield-to-battlefield restriction),
 *        407.2 (a move effect's limits come from the effect), 837 ([Ganking] exists precisely to lift the
 *        Standard Move restriction).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1 holds bf1 (Wanderer + Holder 1) and bf2 (Holder 2); bf3 is P2's with a Squatter. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Wanderer" }, "wanderer", { exhausted: true })
    .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
    .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
    .unit(P2, "bf3", { might: 1, name: "Squatter" }, "squatter")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const destinations = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).toSorted() : []);

describe("Ruling 4f59d2b497cc93eb — Ride the Wind may move a unit battlefield-to-battlefield", () => {
  test("premise: a STANDARD move from bf1 to bf2 is illegal (and the Wanderer is exhausted anyway)", async () => {
    const game = await board().build();
    expect(game.locationOf("wanderer")).toBe("bf1");
    expect((await game.p1.try((p) => p.move("wanderer", "bf2"))).ok).toBe(false);
    expect(game.locationOf("wanderer")).toBe("bf1");
  });

  test("ruling: Ride the Wind's destination menu includes the OTHER battlefields, not just the base", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "wanderer" });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(destinations(d)).toEqual(["base", "battlefield-bf2", "battlefield-bf3"]);
  });

  test("moving bf1 → bf2 works and the unit is readied by the same spell", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "wanderer" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("bf2");
    expect(game.state("wanderer").isReady).toBe(true);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Holder 1 is still there
    expect(game.violations()).toEqual([]);
  });

  test("…and bf1 → an ENEMY battlefield works too, opening a showdown there", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "wanderer" });
    await game.settle();
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("bf3");
    expect(game.zoneOf("squatter")).toBe("trash"); // 3 beats 1
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a standard move from a battlefield to the BASE is legal, which is the only battlefield exit the action itself allows", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Wanderer" }, "wanderer")
      .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
      .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
      .build();
    expect((await game.p1.try((p) => p.move("wanderer", "bf2"))).ok).toBe(false);
    await game.p1.move("wanderer", "base");
    expect(game.locationOf("wanderer")).toBe("base");
  });
});
