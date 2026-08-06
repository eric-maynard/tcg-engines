/**
 * Albus Ferros — ogn-230-298 · Unit · Order · 4 energy · 3 might
 *
 *   When you play me, spend any number of buffs. For each buff spent, channel 1 rune exhausted.
 *
 * Rules: 702.2.b (spending a buff removes the counter; only buffs on units YOU control may be
 * spent — 702.2.b.2); "any number" is the player's choice, 0..N; channel exhausted = top rune of
 * the rune deck enters the rune pool tapped (no energy).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-230-298";

function board(buffedAllies: number) {
  const b = scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "albus");
  for (let i = 0; i < buffedAllies; i++) {
    b.unit(P1, "base", { might: 2, name: `Buffed ${i}` }, `b${i}`, { buffed: true });
  }
  return b.unit(P2, "base", { might: 2, name: "Enemy Buffed" }, "eb", { buffed: true });
}

describe("Albus Ferros (ogn-230-298)", () => {
  test("cost: 4 energy, no power, 3 might; play puts his trigger on the chain; unaffordable with 3", async () => {
    const game = await board(0).build();
    await game.p1.play("albus");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("albus")).toBe("base");
    expect(game.state("albus").might).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "albus", controller: P1, triggered: true })]);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "albus").build();
    expect(poor.p1.can("play", "albus")).toBe(false);
  });

  test("spending one buff channels 1 rune exhausted (pool +1 tapped, rune deck −1, no energy) and removes that buff", async () => {
    const game = await board(1).build();
    const pool0 = game.p1.runes().length;
    const deck0 = game.p1.runeDeck().length;
    await game.p1.play("albus");
    game.script(P1, ["b0"]);
    await game.settle();
    expect(game.state("b0").isBuffed).toBe(false);
    expect(game.state("b0").might).toBe(2);
    expect(game.p1.runes()).toHaveLength(pool0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(deck0 - 1);
    expect(game.p1.energy()).toBe(0);
  });

  test("no friendly buffs to spend → nothing is channeled; enemy buffs cannot be spent (702.2.b.2)", async () => {
    const game = await board(0).build();
    const pool0 = game.p1.runes().length;
    await game.p1.play("albus");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(pool0);
    expect(game.state("eb").isBuffed).toBe(true);
    expect(game.p2.runes()).toHaveLength(0);
  });

  test("'any number' — with two buffed allies you may spend BOTH and channel 2 exhausted runes", async () => {
    // Expected: the resolution prompt lets P1 select both b0 and b1 → both buffs removed, pool +2 exhausted.
    // Actual: the hand-authored ability is a single-target spend-buff (max 1) that channels once.
    const game = await board(2).build();
    const pool0 = game.p1.runes().length;
    await game.p1.play("albus");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" && d.max).toBeGreaterThanOrEqual(2);
    await game.p1.pick("b0", "b1");
    await game.settle();
    expect(game.state("b0").isBuffed).toBe(false);
    expect(game.state("b1").isBuffed).toBe(false);
    expect(game.p1.runes()).toHaveLength(pool0 + 2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
  });

  test("'any number' includes zero — the player may keep the buff and channel nothing", async () => {
    // Expected: the which-buffs prompt can be declined / answered with none → b0 stays buffed, no rune.
    // Actual: the prompt is a mandatory min-1 pick (allowDecline false), so a buff is always spent.
    const game = await board(1).build();
    const pool0 = game.p1.runes().length;
    await game.p1.play("albus");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && (d.allowDecline || d.min === 0)).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.state("b0").isBuffed).toBe(true);
    expect(game.p1.runes()).toHaveLength(pool0);
  });
});
