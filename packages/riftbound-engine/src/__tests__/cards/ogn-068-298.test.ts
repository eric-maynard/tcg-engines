/**
 * Caitlyn, Patrolling — ogn-068-298 · Champion Unit · Calm · 3 energy + [calm] · 3 might
 *
 *   I must be assigned combat damage last.
 *   [Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use this ability
 *   only while I'm at a battlefield.
 *
 * Rules: 465.2.c.3/6 (lethal damage must be assigned to other units first; assignment
 * restrictions must be obeyed), 826 Backline wording.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CAITLYN = "ogn-068-298";

/** Index of Caitlyn's activated ability as the engine numbers it. */
function abilityIndex(game: Game): number {
  const key = game.p1.option("activate", "cait")?.key ?? "#0";
  return Number(key.split("#")[1]);
}

describe("Caitlyn, Patrolling (ogn-068-298)", () => {
  test("costs 3 energy + 1 calm power to play", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CAITLYN, "cait").build();
    await game.p1.play("cait", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("cait")).toBe("base");
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CAITLYN, "cait").build();
    expect(noPower.p1.can("play", "cait")).toBe(false);
  });

  test.failing("BUG: assigned combat damage last (defending) — a 3-Might attacker must kill the other defender, Caitlyn takes nothing (465.2.c.6)", async () => {
    // Expected: lethal damage goes to grunt first; Caitlyn is untouched. Actual: the static clause
    // is dropped by the parser and the auto-assignment follows placement order, killing Caitlyn.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CAITLYN, "cait")
      .unit(P1, "bf1", { might: 3 }, "grunt")
      .unit(P2, "base", { might: 3 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.zoneOf("attacker")).toBe("trash"); // 3 + 3 = 6 ≥ 3
  });

  test.failing("BUG: assigned combat damage last (attacking) — the defender's 3 damage goes to the other attacker first (465.2.c.6)", async () => {
    // Expected: grunt absorbs the lethal 3, Caitlyn survives and conquers. Actual: Caitlyn
    // (placed first) is assigned the damage and dies.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CAITLYN, "cait")
      .unit(P1, "base", { might: 3 }, "grunt")
      .unit(P2, "bf1", { might: 3 }, "defender")
      .build();
    await game.p1.move(["cait", "grunt"], "bf1");
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.locationOf("cait")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Exhaust] at a battlefield: deals damage equal to its Might (3) to a unit at a battlefield and exhausts", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CAITLYN, "cait")
      .unit(P2, "bf2", { might: 7 }, "far")
      .unit(P2, "base", { might: 7 }, "home")
      .build();
    const targets = game.p1.option("activate", "cait")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["far"], ["cait"]]));
    expect(targets).not.toContainEqual(["home"]);
    await game.p1.activate("cait", abilityIndex(game), { targets: "far" });
    expect(game.state("cait").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("far").damage).toBe(3);
  });

  test("damage tracks current Might: a buffed Caitlyn (4 Might) deals 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CAITLYN, "cait", { buffed: true })
      .unit(P2, "bf1", { might: 4 }, "foe")
      .build();
    expect(game.state("cait").might).toBe(4);
    await game.p1.activate("cait", abilityIndex(game), { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("only while I'm at a battlefield: not activatable from base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CAITLYN, "cait")
      .unit(P2, "bf1", { might: 7 }, "foe")
      .build();
    expect(game.p1.can("activate", "cait")).toBe(false);
  });

  test("cannot be activated while exhausted", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CAITLYN, "cait", { exhausted: true })
      .unit(P2, "bf1", { might: 7 }, "foe")
      .build();
    expect(game.p1.can("activate", "cait")).toBe(false);
  });
});
