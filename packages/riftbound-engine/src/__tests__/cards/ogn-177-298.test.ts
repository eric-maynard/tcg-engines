/**
 * Stealthy Pursuer — ogn-177-298 · Unit · Chaos · 4 energy + [chaos] · 4 Might
 *
 *   When a friendly unit moves from my location, I may be moved with it.
 *
 * Rules: 411 (triggered abilities; "may" = optional), 143.4 (units enter exhausted),
 * a Standard Move exhausts the moving unit as its cost — being "moved" by an effect
 * does not; a unit arriving at an enemy-held battlefield joins the attack.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-177-298";

/** Accept the Pursuer's "you may" however the engine surfaces it (yes/no or a single pick). */
async function acceptFollow(game: Game) {
  // The optional trigger sits on the chain (rule 419): settle passes priority
  // until its opt-in prompt is the pending decision.
  await game.settle();
  const d = game.decision();
  expect(d?.seat).toBe(P1);
  expect(["yes-no", "pick"]).toContain(d?.kind as string);
  if (d?.kind === "yes-no") {
    await game.p1.yes();
  } else {
    await game.p1.pick("sp");
  }
}

describe("Stealthy Pursuer (ogn-177-298)", () => {
  test("costs 4 energy + 1 chaos; a 4-Might unit that enters exhausted; unaffordable without the chaos", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "sp").build();
    await game.p1.play("sp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("sp")).toBe("base");
    expect(game.state("sp").might).toBe(4);
    expect(game.state("sp").isExhausted).toBe(true);
    const noChaos = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sp").build();
    expect(noChaos.p1.can("play", "sp")).toBe(false);
    const low = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "sp").build();
    expect(low.p1.can("play", "sp")).toBe(false);
  });

  test("a friendly unit moving out of the Pursuer's location asks 'may be moved with it' and, on yes, the Pursuer follows", async () => {
    // Expected: ally base→bf1 triggers the Pursuer (also in base); P1 accepts; Pursuer ends at bf1,
    // still ready (moved by an effect, not by its own Standard Move). Actual: no trigger fires at all.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "sp")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    expect(game.locationOf("ally")).toBe("bf1");
    await game.settle(); // the trigger sits on the chain until priority passes
    await acceptFollow(game);
    await game.settle();
    expect(game.locationOf("sp")).toBe("bf1");
    expect(game.state("sp").isReady).toBe(true);
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("'I may' — declining leaves the Pursuer where it is", async () => {
    // Expected: a prompt appears and P1 may say no. Actual: no prompt is ever offered.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "sp")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["yes-no", "pick"]).toContain(d?.kind as string);
    await (d?.kind === "yes-no" ? game.p1.no() : game.p1.decline());
    await game.settle();
    expect(game.locationOf("sp")).toBe("base");
    expect(game.locationOf("ally")).toBe("bf1");
  });

  test("works from a battlefield too — ally retreats bf1→base and the Pursuer may go home with it", async () => {
    // Expected: Pursuer at bf1 follows the ally to base. Actual: no trigger.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sp")
      .unit(P1, "bf1", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "base");
    await game.settle(); // the trigger sits on the chain until priority passes
    await acceptFollow(game);
    await game.settle();
    expect(game.locationOf("sp")).toBe("base");
  });

  test("following into an enemy battlefield makes the Pursuer an attacker in that combat (4+2 vs 5 → defender dies)", async () => {
    // Expected: ally (2) attacks bf1 held by a 5-Might foe; Pursuer (4) tags along → 6 damage kills
    // the foe and P1 conquers bf1. Actual: Pursuer never moves; the ally dies alone.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", CARD, "sp")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle(); // the trigger sits on the chain until priority passes
    await acceptFollow(game);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("only from MY location: a friendly unit leaving a different location does not involve the Pursuer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", CARD, "sp")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("sp")).toBe("bf2");
  });

  test("only FRIENDLY units: an enemy unit leaving the Pursuer's battlefield does not trigger it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sp")
      .unit(P2, "bf1", { might: 2 }, "foe")
      .build();
    await game.p2.move("foe", "base");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
    expect(game.locationOf("sp")).toBe("bf1");
  });
});
