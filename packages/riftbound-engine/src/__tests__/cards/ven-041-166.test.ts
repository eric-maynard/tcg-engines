/**
 * Riven, Shattered — ven-041-166 · Unit (Champion) · Calm · 3 energy · 3 [Might]
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to
 *   me for [rainbow] less, even if it's already attached.)
 *   When I attack, choose an enemy unit here. Deal 2 to it for each Equipment
 *   attached to me.
 *
 * rule 355.8 — the "choose an enemy unit here" preamble restricts the target:
 * only opposing units at Riven's battlefield are legal, never friendly units,
 * units in base, or Riven herself.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-041-166";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment

describe("Riven, Shattered (ven-041-166)", () => {
  test("the attack trigger only offers enemy units at Riven's battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "riven")
      .unit(P1, "base", { might: 2 }, "friendlyInBase")
      .unit(P2, "bf1", { might: 4 }, "enemyHere")
      .unit(P2, "bf1", { might: 5 }, "enemyHere2")
      .unit(P2, "bf2", { might: 4 }, "enemyElsewhere")
      .build();

    await game.p1.move("riven", "bf1"); // "When I attack"
    await game.settle(); // stops on the trigger's unanswered target prompt
    const decision = game.decision();
    expect(decision?.kind).toBe("pick");
    const options = (decision as { options?: { key: string }[] }).options?.map((o) => o.key) ?? [];
    expect(options.toSorted()).toEqual(["enemyHere", "enemyHere2"]);
  });

  test("rule 434.4 — Equipment attached to Riven travels with her when she moves to a battlefield", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "riven")
      .gear(P1, DIRK, "dirk")
      .build();

    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "riven" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("riven");
    expect(game.zoneOf("dirk")).toBe("base");

    await game.p1.move("riven", "bf1");
    await game.settle();

    expect(game.zoneOf("riven")).toBe("battlefield-bf1");
    expect(game.zoneOf("dirk")).toBe("battlefield-bf1");
    expect(game.state("dirk").attachedTo).toBe("riven");
  });
});
