/**
 * Akali, Silent — ven-038-166 · Unit (Champion) · Calm · 4 energy · 1 power · 4 might
 *
 *   I can't be chosen by enemy spells and abilities unless I'm in combat.
 *   When I move to a battlefield, give me +2 [Might] this turn.
 *
 * Rules: 757 (choosing a card as a target), 740 (combat designations — a unit
 * is "in combat" while it is attacking or defending).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-038-166";
const RAY = "ogn-009-298"; // Hextech Ray — [Action] "Deal 3 to a unit at a battlefield."

describe("Akali, Silent (ven-038-166)", () => {
  test("out of combat she can't be chosen by an enemy spell (757)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "akali")
      .unit(P1, "bf1", { might: 2 }, "decoy")
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .hand(P2, RAY, "ray")
      .build();

    const offered = game.p2
      .option("cast", "ray")
      ?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).not.toContain("akali");

    const r = await game.p2.try((p) => p.cast("ray", { targets: "akali" }));
    expect(r.ok).toBe(false);
    expect(game.state("akali").damage).toBe(0);
  });

  test("while she is in combat the protection lapses and she can be chosen", async () => {
    const game = await scenario()
      .autoProcedures(false)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "guard")
      .unit(P1, "base", CARD, "akali")
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .hand(P2, RAY, "ray")
      .build();

    await game.p1.move("akali", "bf1");
    // let the move trigger resolve so the showdown is open again
    await game.p1.pass();
    await game.p2.pass();
    await game.p1.passFocus(); // P2 takes focus in the open showdown
    await game.p2.cast("ray", { targets: "akali" });
    await game.settle({ policy: "first" });

    expect(game.state("akali").damage).toBe(3);
  });

  test("when she moves to a battlefield she gets +2 Might for the turn", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "akali")
      .build();

    expect(game.state("akali").might).toBe(4);
    await game.p1.move("akali", "bf1");
    await game.settle();
    expect(game.state("akali").might).toBe(6);
  });
});
