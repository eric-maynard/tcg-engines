/**
 * Wielder of Water — ogn-055-298 · Unit · Calm · 3 energy · 2 might
 *
 *   While I'm attacking or defending alone, I have +2 [Might].
 *
 * Rule 740.2.a: a unit is alone when there are no other friendly units at the same location.
 * Rule 364.3.a: "while" marks a conditional passive — it applies only while the condition holds.
 *
 * Note: every position below first plays a throw-away 0-cost unit ("tick") so the engine has
 * run its static-ability pass before we look at Might.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const WIELDER = "ogn-055-298";
const TICK = { energyCost: 0, might: 1, name: "Tick" };

async function warm(game: Game, seat: "p1" | "p2" = "p1"): Promise<Game> {
  await game[seat].play("tick", { to: "base" });
  await game.settle();
  return game;
}

describe("Wielder of Water (ogn-055-298)", () => {
  test("costs 3 energy to play; not playable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, WIELDER, "ww").build();
    await game.p1.play("ww", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ww")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, WIELDER, "ww").build();
    expect(poor.p1.can("play", "ww")).toBe(false);
  });

  test.failing("BUG: no bonus outside combat — 2 Might at rest even when it is the only friendly unit there", async () => {
    // Expected: neither attacking nor defending → printed 2 Might. Actual: the +2 is applied
    // unconditionally (might reads 4) once statics are evaluated.
    const game = await warm(await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", WIELDER, "ww").hand(P1, TICK, "tick").build());
    expect(game.state("ww").combatRole).toBeNull();
    expect(game.state("ww").might).toBe(2);
  });

  test("attacking alone → 4 Might during the combat showdown", async () => {
    const game = await warm(
      await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", WIELDER, "ww").unit(P2, "bf1", { might: 7 }, "foe").hand(P1, TICK, "tick").build(),
    );
    await game.p1.move("ww", "bf1");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.state("ww").might).toBe(4);
  });

  test("attacking alone with 4 Might kills a 3-Might defender", async () => {
    const game = await warm(
      await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", WIELDER, "ww").unit(P2, "bf1", { might: 3 }, "foe").hand(P1, TICK, "tick").build(),
    );
    await game.p1.move("ww", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test.failing("BUG: attacking together with another friendly unit: not alone → 2 Might, so 2 + 1 does not kill a 4-Might defender", async () => {
    // Expected: ww (2) + pal (1) = 3 < 4, foe survives. Actual: ww counts 4 → foe dies.
    const game = await warm(
      await scenario()
        .battlefield("bf1", { controller: P2 })
        .unit(P1, "base", WIELDER, "ww")
        .unit(P1, "base", { might: 1 }, "pal")
        .unit(P2, "bf1", { might: 4 }, "foe")
        .hand(P1, TICK, "tick")
        .build(),
    );
    await game.p1.move(["ww", "pal"], "bf1");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.state("ww").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
  });

  test("defending alone → 4 Might; a 3-Might attacker dies and Wielder survives", async () => {
    const game = await warm(
      await scenario()
        .active(P2)
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", WIELDER, "ww")
        .unit(P2, "base", { might: 3 }, "attacker")
        .hand(P2, TICK, "tick")
        .build(),
      "p2",
    );
    await game.p2.move("attacker", "bf1");
    expect(game.state("ww").combatRole).toBe("defender");
    expect(game.state("ww").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("battlefield-bf1");
  });

  test.failing("BUG: defending alongside another friendly unit: not alone → 2 Might", async () => {
    // Expected: printed 2 Might (a friendly unit shares the battlefield). Actual: 4.
    const game = await warm(
      await scenario()
        .active(P2)
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", WIELDER, "ww")
        .unit(P1, "bf1", { might: 1 }, "pal")
        .unit(P2, "base", { might: 3 }, "attacker")
        .hand(P2, TICK, "tick")
        .build(),
      "p2",
    );
    await game.p2.move("attacker", "bf1");
    expect(game.state("ww").combatRole).toBe("defender");
    expect(game.state("ww").might).toBe(2);
  });
});
