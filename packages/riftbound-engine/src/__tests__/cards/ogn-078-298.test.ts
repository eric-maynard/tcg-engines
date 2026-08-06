/**
 * Lee Sin, Ascetic — ogn-078-298 · Champion Unit · Calm · 5 energy + 1 [calm] · 5 might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   [Exhaust]: Buff me. (I get a +1 [Might] buff.)
 *   I can have any number of buffs.
 *
 * Rules: 726 (Shield), 702.3/426.1.b.2 (one buff per unit unless an effect
 * permits more), 703 (each buff is +1 Might).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-078-298";
const EXHAUST_BUFF = 1; // ability index of "[Exhaust]: Buff me."

describe("Lee Sin, Ascetic (ogn-078-298)", () => {
  test("costs 5 energy + 1 calm power; unaffordable without the calm power", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "lee").build();
    await game.p1.play("lee", { to: "base" });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.state("lee").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "lee").build();
    expect(noPower.p1.can("play", "lee")).toBe(false);
  });

  test("Shield: as a defender he counts as 6 — a 5-might attacker dies and Lee Sin survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lee")
      .unit(P2, "base", { might: 5 }, "atk")
      .build();
    expect(game.state("lee").keywords).toContain("Shield");
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.locationOf("lee")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Shield does nothing while attacking: might at rest / as attacker is 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "def")
      .unit(P1, "base", CARD, "lee")
      .build();
    expect(game.state("lee").might).toBe(5);
    await game.p1.move("lee", "bf1");
    await game.settle();
    // 5 vs 5: both take lethal damage.
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("[Exhaust]: Buff me — the ability goes on the chain, exhausts him as its cost, and resolves into a buff (6 might)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lee").build();
    await game.p1.activate("lee", EXHAUST_BUFF);
    expect(game.state("lee").isExhausted).toBe(true); // cost paid up front
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lee", triggered: false })]);
    await game.settle();
    expect(game.state("lee").isBuffed).toBe(true);
    expect(game.state("lee").might).toBe(6);
    // Exhausted → cannot activate again this turn.
    expect(game.p1.can("activate", "lee")).toBe(false);
  });

  test("'I can have any number of buffs' — a second activation on a later turn stacks a second buff (7 might)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lee").build();
    await game.p1.activate("lee", EXHAUST_BUFF);
    await game.settle();
    expect(game.state("lee").might).toBe(6);
    await game.advanceTurn();
    await game.advanceTurn(); // Lee Sin readies at the start of P1's turn
    expect(game.state("lee").isReady).toBe(true);
    await game.p1.activate("lee", EXHAUST_BUFF);
    await game.settle();
    expect(game.state("lee").might).toBe(7);
  });
});
