/**
 * Ruling be17906d78d5e3ee — Bullet Time (OGN-268 → ogn-268-298) · Spell · [1] · [Action]
 *   "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: When do you choose the battlefield — when putting it on the Chain, or on resolution?
 * A: When you put it on the Chain (finalization). Both players then get their reaction window against a
 *    spell whose battlefield is already known; the [rainbow] is paid and the damage dealt on resolution.
 * Rules: 355.4 / 402.2 (choices are made as the item is finalized), 340 (priority after finalization),
 *        359 (the instructions, including the Pay, happen on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";

/** Two enemy-held battlefields, two units at bf1 and one at bf2; P1 has [1] plus two [rainbow]. */
function twoTargets() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Alpha" }, "x")
    .unit(P2, "bf1", { might: 5, name: "Beta" }, "x2")
    .unit(P2, "bf2", { might: 5, name: "Gamma" }, "y")
    .hand(P1, BULLET_TIME, "bt");
}

describe("Ruling be17906d78d5e3ee — Bullet Time's battlefield is picked as it goes on the Chain", () => {
  test("the battlefield is a play-time choice: both battlefields are offered as the spell is played", async () => {
    const game = await twoTargets().build();
    const field = game.p1.option("cast", "bt")?.fields.find((f) => f.arg === "targets");
    expect(field).toMatchObject({ max: 1, min: 1, required: true });
    expect((field?.options ?? []).flat().toSorted()).toEqual(["bf1", "bf2"]);
  });

  test("the chosen battlefield is recorded on the Chain item before anyone reacts, and nothing has happened yet", async () => {
    const game = await twoTargets().build();
    await game.p1.cast("bt", { targets: "bf1", x: 2 });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "bt", controller: P1, targets: ["bf1"], triggered: false }),
    ]);
    expect(game.state("x").damage).toBe(0);
    expect(game.state("x2").damage).toBe(0);
    expect(game.state("y").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the [rainbow] is paid and the damage dealt on RESOLUTION — and only at the named battlefield", async () => {
    const game = await twoTargets().build();
    await game.p1.cast("bt", { targets: "bf1", x: 2 });
    expect(game.p1.power("rainbow")).toBe(2); // not spent yet…
    expect(game.p1.energy()).toBe(0); // (the printed [1] is an ordinary cost, paid on the play)
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0); // …paid as it resolved
    expect(game.state("x").damage).toBe(2);
    expect(game.state("x2").damage).toBe(2);
    expect(game.state("y").damage).toBe(0); // the other battlefield is untouched
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
