/**
 * Ruling 89372b0577974be4 — Whirlwind (OGN-187 → ogn-187-298) · Spell · Chaos · [3][chaos]
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *
 * Q: Can each player choose ANY unit, including the opponent's?
 * A: Yes — "a unit" is unrestricted, so every player may bounce an enemy unit; the "may" is there so nobody is forced
 *    to bounce their own when no enemy unit is available.
 * Rules: 355.10.e (each player's choice is made at resolution), 359.2 ("a unit" = any unit), 383.6 (turn order for
 *        "starting with the next player").
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/** P1's turn with [3][chaos]. P1 has an Ally in base; P2 has a Foe at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, WHIRLWIND, "ww");
}

describe("Ruling 89372b0577974be4 — every player may bounce ANY unit, their own or the opponent's", () => {
  test("nothing is chosen on the play — Whirlwind takes no targets", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ww")?.fields.find((f) => f.arg === "targets");
    expect(targets === undefined || targets.max === 0).toBe(true);
    await game.p1.cast("ww");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: false })]);
  });

  test("ruling 89372b0577974be4 — on resolution P2 (the next player) chooses first, and BOTH units are on their menu: P2 may take P1's Ally", async () => {
    const game = await board().build();
    await game.p1.cast("ww");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d2 = game.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ww" } });
    expect(offered(d2)).toEqual(["ally", "foe"]); // an opponent's unit is a legal pick
    expect(d2?.kind === "pick" ? d2.allowDecline : undefined).toBe(true); // "may"
    await game.p2.pick("ally");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally"); // to its OWNER's hand
  });

  test("…then P1 gets the same unrestricted choice and may take P2's Foe", async () => {
    const game = await board().build();
    await game.p1.cast("ww");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.decline();
    const d1 = game.decision();
    expect(d1).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ww" } });
    expect(offered(d1)).toEqual(["ally", "foe"]);
    await game.p1.pick("foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.hand()).toContain("foe");
    expect(game.zoneOf("ally")).toBe("base"); // P2 declined
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the 'may' is what stops a player being forced to bounce their own unit: both players can simply decline", async () => {
    const game = await board().build();
    await game.p1.cast("ww");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.decline();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
