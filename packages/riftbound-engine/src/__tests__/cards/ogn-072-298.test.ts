/**
 * Solari Shrine — ogn-072-298 · Gear · Calm · 3 energy
 *
 *   When you kill a stunned enemy unit, you may exhaust this to draw 1.
 *
 * Rule 383.3.b: "you may exhaust this" right after "you may" is the trigger's
 * cost — declining (or being unable to exhaust) means no draw.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-072-298";
const HEXTECH_RAY = "ogn-009-298"; // Deal 3 to a unit at a battlefield (1 energy + 1 fury)
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function board(shrineMeta?: Record<string, unknown>) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "shrine", shrineMeta)
    .unit(P2, "bf1", { might: 3 }, "dazedFoe", { stunned: true })
    .unit(P2, "bf1", { might: 3 }, "alertFoe")
    .unit(P1, "bf1", { might: 3 }, "dazedAlly", { stunned: true })
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Solari Shrine (ogn-072-298)", () => {
  test("costs 3 energy to play; enters the base", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "shrine").build();
    await game.p1.play("shrine");
    await game.settle();
    expect(game.zoneOf("shrine")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "shrine").build();
    expect(poor.p1.can("play", "shrine")).toBe(false);
  });

  test.failing("BUG: killing a stunned enemy unit (lethal spell damage, rule 428.5.c.1) offers 'exhaust this to draw 1'; accepting exhausts the Shrine and draws 1", async () => {
    // Expected: Hextech Ray kills the stunned foe → P1 gets a yes/no; yes → Shrine exhausted, +1 card.
    // Actual: the parsed `kill-enemy` trigger event is never emitted by the engine (not for
    // damage kills, kill instructions, nor combat), so nothing is offered.
    const game = await board().build();
    await game.p1.cast("ray", { targets: "dazedFoe" });
    const handAfterCast = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("dazedFoe")).toBe("trash");
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.yes();
    await game.settle();
    expect(game.state("shrine").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(handAfterCast + 1);
  });

  test.failing("BUG: 'you may' — the prompt is offered and declining leaves the Shrine ready and draws nothing", async () => {
    // Expected: a yes/no prompt after the kill; "no" → Shrine ready, no draw. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.cast("ray", { targets: "dazedFoe" });
    const handAfterCast = game.p1.hand().length;
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    await game.settle();
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(handAfterCast);
  });

  test.failing("BUG: killing a stunned enemy defender in combat also counts as 'you kill' (rule 428.5.c.2) and offers the draw", async () => {
    // Expected: a 4-Might attacker kills the stunned 3-Might foe in combat → yes/no for P1. Actual: no prompt.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "shrine")
      .unit(P2, "bf1", { might: 3 }, "dazedFoe", { stunned: true })
      .unit(P1, "base", { might: 4 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("dazedFoe")).toBe("trash");
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P1);
  });

  test("killing an enemy unit that is NOT stunned does not trigger the Shrine", async () => {
    // NOTE: the parsed trigger carries no "stunned" qualifier; this passes today only because
    // the kill-enemy trigger never fires at all (see BUG tests above).
    const game = await board().build();
    await game.p1.cast("ray", { targets: "alertFoe" });
    const handAfterCast = game.p1.hand().length;
    await game.settle({ policy: "first" });
    expect(game.zoneOf("alertFoe")).toBe("trash");
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(handAfterCast);
  });

  test("killing a stunned FRIENDLY unit does not trigger the Shrine", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "dazedAlly" });
    const handAfterCast = game.p1.hand().length;
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dazedAlly")).toBe("trash");
    expect(game.state("shrine").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(handAfterCast);
  });

  test("an already-exhausted Shrine cannot pay 'exhaust this' — no card is drawn", async () => {
    const game = await board(EXHAUSTED).build();
    await game.p1.cast("ray", { targets: "dazedFoe" });
    const handAfterCast = game.p1.hand().length;
    await game.settle({ policy: "first" }); // say "yes" to anything offered
    expect(game.zoneOf("dazedFoe")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handAfterCast);
  });
});
