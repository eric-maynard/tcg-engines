/**
 * Clockwork Keeper — ogn-044-298 · Unit · Calm · 2 energy · 2 might
 *
 *   You may pay [calm] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, draw 1.
 *
 * Rules: 356.3.b (optional "as an additional cost … may"), 356.4.f.1 (an
 * optional additional cost counts as paid if the player chose to pay it).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const KEEPER = "ogn-044-298";

function board(power: Record<string, number> = { calm: 1 }) {
  return scenario().resources(P1, { energy: 2, power }).hand(P1, KEEPER, "ck");
}

describe("Clockwork Keeper (ogn-044-298)", () => {
  test("base cost: 2 energy, no power; the additional cost is optional; unaffordable with 1 energy", async () => {
    const game = await board({}).build();
    expect(game.p1.can("play", "ck")).toBe(true);
    await game.p1.play("ck", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ck")).toBe("base");
    expect(game.state("ck").might).toBe(2);
    const poor = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).hand(P1, KEEPER, "ck").build();
    expect(poor.p1.can("play", "ck")).toBe(false);
  });

  test("paying the additional [calm] deducts 2 energy + 1 calm and the play trigger draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("ck", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    // The play trigger is on the chain as a triggered ability of the Keeper.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ck", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("ck")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
  });

  test("declining the additional cost: no calm spent and no card drawn", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("ck", { payOptional: false, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("ck")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore - 1);
  });

  test("without [calm] available the additional cost is not offered (only the plain play is legal)", async () => {
    const game = await board({ fury: 1 }).build();
    const payField = game.p1.option("play", "ck")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options ?? [false]).not.toContain(true);
    const t = await game.p1.try((p) => p.play("ck", { payOptional: true, to: "base" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("ck")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });
});
