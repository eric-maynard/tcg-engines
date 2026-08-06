/**
 * Firestorm — ogs-002-024 · Spell · Fury · 6 energy · 1 power
 *
 *   Deal 3 to all enemy units at a battlefield.
 *
 * rule-id: ogs-002-024 — "at A battlefield": the caster chooses ONE
 * battlefield at play time (rule 355.8); only enemy units there are dealt 3.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-002-024";

describe("Firestorm (ogs-002-024)", () => {
  test("asks for a battlefield and only damages enemy units at the chosen one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "a1")
      .unit(P2, "bf1", { might: 5 }, "a2")
      .unit(P2, "bf2", { might: 5 }, "b1")
      .unit(P1, "bf1", { might: 5 }, "mine")
      .unit(P2, "base", { might: 5 }, "based")
      .hand(P1, CARD, "storm")
      .build();
    const opt = game.p1.option("cast", "storm");
    expect(opt?.fields).toContainEqual(
      expect.objectContaining({ arg: "targets", options: [["bf1"], ["bf2"]] }),
    );
    await game.p1.cast("storm", { targets: "bf1" });
    await game.settle();
    expect(game.state("a1").damage).toBe(3);
    expect(game.state("a2").damage).toBe(3);
    expect(game.state("b1").damage ?? 0).toBe(0);
    expect(game.state("mine").damage ?? 0).toBe(0);
    expect(game.state("based").damage ?? 0).toBe(0);
    expect(game.zoneOf("storm")).toBe("trash");
  });

  test("a unit is not a legal 'battlefield' choice", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "a1")
      .hand(P1, CARD, "storm")
      .build();
    const bad = await game.p1.try((p) => p.cast("storm", { targets: "a1" }));
    expect(bad.ok).toBe(false);
  });
});
