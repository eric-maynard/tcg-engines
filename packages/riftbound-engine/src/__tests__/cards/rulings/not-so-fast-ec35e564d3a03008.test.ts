/**
 * Ruling ec35e564d3a03008 — Not So Fast (SFD-045 → sfd-045-221) · [Reaction] · [2][calm] "Counter an enemy spell or ability
 *     that chooses a friendly unit or gear."
 *   × Get Excited! (OGN-008 → ogn-008-298) · [Action] · [2][fury] "Discard 1. Deal its Energy cost as damage to a unit at a
 *     battlefield."
 *
 * Q: Can Not So Fast counter Get Excited?
 * A: Only when the OPPONENT plays Get Excited choosing one of YOUR units/gear. Not your own Get Excited, and not an
 *    opponent's Get Excited aimed at their own unit — "enemy"/"friendly" are read relative to Not So Fast's controller.
 * Rules: 355.9.b (friendly/enemy relative to the controller of the card being played), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const GET_EXCITED = "ogn-008-298";
const FODDER = (n: number) => ({ cardType: "unit", energyCost: 3, might: 3, name: `Fodder ${n}` }) as const; // the discard: Energy cost 3

/**
 * P1's turn. P1 holds bf1 with Mine (3), P2 holds bf2 with Theirs (3). BOTH players hold Get Excited + a 3-cost Fodder to
 * discard + Not So Fast, with [4][fury][calm] each.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1, fury: 1 } })
    .resources(P2, { energy: 4, power: { calm: 1, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf2", { might: 3, name: "Theirs" }, "theirs")
    .hand(P1, GET_EXCITED, "geP1")
    .hand(P1, FODDER(1), "fodP1")
    .hand(P1, NOT_SO_FAST, "nsfP1")
    .hand(P2, GET_EXCITED, "geP2")
    .hand(P2, FODDER(2), "fodP2")
    .hand(P2, NOT_SO_FAST, "nsfP2");
}

describe("Ruling ec35e564d3a03008 — Not So Fast vs Get Excited depends on who cast it and whose unit it chose", () => {
  test("opponent's Get Excited choosing MY unit: Not So Fast is legal (from the unit owner's seat), counters it — no discard, no damage", async () => {
    const game = await board().build();
    // P1 (the "opponent" here) aims Get Excited at P2's unit.
    await game.p1.cast("geP1", { targets: "theirs" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "geP1", controller: P1, targets: ["theirs"] })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsfP2")).toBe(true);
    const offered = game.p2.option("cast", "nsfP2")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toEqual(["geP1"]);
    await game.p2.cast("nsfP2", { targets: "geP1" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 0, fury: 1 } });
    await game.settle();
    expect(game.zoneOf("nsfP2")).toBe("trash");
    expect(game.zoneOf("geP1")).toBe("trash"); // countered
    expect(game.p1.hand()).toContain("fodP1"); // nothing discarded
    expect(game.state("theirs").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("my OWN Get Excited (at the enemy unit) is not an 'enemy spell' to me: my Not So Fast is not castable at it", async () => {
    const game = await board().build();
    await game.p1.cast("geP1", { targets: "theirs" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "nsfP1")).toBe(false);
    expect((await game.p1.try((p) => p.cast("nsfP1", { targets: "geP1" }))).ok).toBe(false);
  });

  test("opponent's Get Excited choosing THEIR OWN unit: it chooses nothing friendly to me, so my Not So Fast is not castable; it resolves (they discard Fodder, 3 damage kills their own 3-Might unit)", async () => {
    const game = await board().build();
    await game.p1.cast("geP1", { targets: "mine" }); // P1 aims at P1's own unit
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nsfP2")).toBe(false);
    await game.p2.passPriority();
    // Resolution: P1 discards (pick Fodder, cost 3) → 3 damage to Mine.
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("fodP1");
    }
    await game.settle();
    expect(game.zoneOf("fodP1")).toBe("trash");
    expect(game.zoneOf("geP1")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p2.hand()).toContain("nsfP2");
  });
});
