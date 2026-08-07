/**
 * unl-150-219 — Vex, Apathetic · Champion Unit · Chaos · 4 · 4 Might
 *   "[Deflect]
 *    When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *
 * rule 350.1 — the "can't move it this turn" clause is a movement restriction on the stunned unit:
 * the opponent may not take a Standard Move (or a Ganking move) with it for the rest of the turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const VEX = "unl-150-219";

describe("unl-150-219 — Vex, Apathetic", () => {
  test("the unit an opponent plays under Vex is stunned and can't move this turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VEX, "vex")
      .hand(P2, { energyCost: 2, might: 3, name: "Recruit" }, "recruit")
      .build();

    await game.p2.play("recruit");
    await game.settle();

    expect(game.state("recruit").isStunned).toBe(true);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.p2.can("standardMove", { destination: "bf1", unitIds: ["recruit"] })).toBe(false);
    const attempt = await game.p2.try((p) => p.move("recruit", "bf1"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("recruit")).toBe("base");
  });

  test("a unit the opponent played on an EARLIER turn is unaffected — the restriction lasts only that turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VEX, "vex")
      .hand(P2, { energyCost: 2, might: 3, name: "Recruit" }, "recruit")
      .build();

    await game.p2.play("recruit");
    await game.settle();
    expect(game.state("recruit").isStunned).toBe(true);

    // P2 ends the turn; P1 takes a turn; back to P2 — the restriction has expired.
    await game.p2.endTurn();
    await game.settle();
    await game.advanceTurn();
    await game.settle();

    expect(game.state("recruit").isStunned).toBe(false);
    await game.p2.move("recruit", "bf1");
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
  });
});
