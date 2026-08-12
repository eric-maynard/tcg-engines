/**
 * Ruling 453b76ccf5feba62 — Bullet Time (OGN-268 → ogn-268-298)
 *   "[Action] Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Do you announce the damage when Bullet Time is played, or when it resolves?
 * A: On RESOLUTION. Playing it costs only its printed [1]; the [rainbow] is chosen and paid as the
 *    spell resolves, and whatever you pay is exactly the damage dealt.
 * Rules: 444.2 (a Pay named inside an instruction happens during resolution), 383.3.a.3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, BULLET_TIME, "bt");
}

describe("Ruling 453b76ccf5feba62 — Bullet Time's [rainbow] is chosen and paid when it RESOLVES", () => {
  test("casting it asks only for the battlefield: there is no X/amount field, and no Power leaves the pool", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "bt")?.fields ?? [];
    expect(fields.map((f) => f.arg)).toEqual(["targets"]);
    expect(fields[0]?.options).toEqual([["bf1"]]);

    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 3 } }); // only the printed [1]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", targets: ["bf1"] })]);
    // Nothing is asked yet — it is a plain priority window.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  });

  test("the amount is an integer prompt at RESOLUTION time, and the paid amount IS the damage", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    const d = game.decision();
    expect(d).toMatchObject({
      kind: "integer",
      max: 3, // the whole pool is available
      min: 0,
      seat: P1,
      source: { cardId: "bt", pendingChoiceType: "pay-x" },
      timing: "RES",
    });

    await game.p1.answer(3);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0); // 3 paid
    expect(game.zoneOf("small")).toBe("trash"); // 3 damage on 3 Might
    expect(game.state("big").damage).toBe(3);
    expect(game.state("home").damage).toBe(0); // "at a battlefield" — not the base
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("paying a different amount deals that much instead — the choice is genuinely made at resolution", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.answer(1);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.state("small").damage).toBe(1);
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("big").damage).toBe(1);
  });

  test("paying zero is legal and deals nothing", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.answer(0);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(3);
    expect(game.state("small").damage).toBe(0);
    expect(game.zoneOf("bt")).toBe("trash");
  });
});
