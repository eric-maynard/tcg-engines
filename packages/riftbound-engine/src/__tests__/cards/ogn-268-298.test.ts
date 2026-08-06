/**
 * Bullet Time — ogn-268-298 · Spell · Body/Chaos · 1 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield.
 *
 * Rules: 204.3.b (uses this very card: "its controller pays any amount of [rainbow] as a
 * cost, and deals that much damage to all units at a battlefield"), 135.2.e ([rainbow] is
 * Power of any domain — never Energy), 806 (Action timing).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-268-298";

function board(resources: { energy?: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, resources)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "Foe B" }, "b")
    .unit(P2, "bf2", { might: 4, name: "Elsewhere" }, "c")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "d")
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .hand(P1, CARD, "bt");
}

describe("Bullet Time (ogn-268-298)", () => {
  test("costs 1 energy; paying nothing extra deals no damage and the spell still resolves to trash", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("a").damage).toBe(0);
    expect(game.zoneOf("bt")).toBe("trash");
    const broke = await board({ energy: 0, power: { rainbow: 3 } }).build();
    expect(broke.p1.can("cast", "bt")).toBe(false);
  });

  test("chooses a battlefield: X damage to EVERY ENEMY unit there — not friendly units, other battlefields or bases; lethal damage kills", async () => {
    // Both energy and rainbow are supplied so the scoping assertion holds whichever the engine charges.
    const game = await board({ energy: 3, power: { rainbow: 2 } }).build();
    const targets = game.p1.option("cast", "bt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["bf1"], ["bf2"]]));
    await game.p1.cast("bt", { targets: "bf1", x: 2 });
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.zoneOf("b")).toBe("trash"); // 2 damage ≥ 2 Might
    expect(game.state("c").damage).toBe(0);
    expect(game.state("d").damage).toBe(0);
    expect(game.state("mine").damage).toBe(0);
  });

  test.failing("BUG: the variable payment is [rainbow] POWER (any domain), not energy (rules 204.3.b, 135.2.e)", async () => {
    // Expected: with 1 energy + 2 rainbow, X=2 is legal; afterwards energy 0 (base cost) and power 0.
    // Likewise 2 fury power pays X=2. Actual: X is capped by and deducted from ENERGY, so with
    // 1 energy the only legal X is 0 and the power is never touched.
    const game = await board({ energy: 1, power: { rainbow: 2 } }).build();
    await game.p1.cast("bt", { targets: "bf1", x: 2 });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("a").damage).toBe(2);
    const anyDomain = await board({ energy: 1, power: { fury: 2 } }).build();
    await anyDomain.p1.cast("bt", { targets: "bf1", x: 2 });
    await anyDomain.settle();
    expect(anyDomain.p1.power()).toBe(0);
    expect(anyDomain.state("a").damage).toBe(2);
  });

  test("[Action] timing: legal with Focus during a showdown on the opponent's turn; illegal in their Open state", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "atk")
      .hand(P1, CARD, "bt")
      .build();
    expect(game.p1.can("cast", "bt")).toBe(false);
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bt")).toBe(true);
    await game.p1.cast("bt", { targets: "bf1", x: 2 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // 2 damage kills the 2-Might attacker
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
  });
});
