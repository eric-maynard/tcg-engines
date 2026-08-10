/**
 * Ruling 4017fff5d2eb4d2a — Lee Sin, Centered (OGN-151 → ogn-151-298) · Champion · Body · 6 · 6 Might
 *   "[Accelerate] Other buffed friendly units at my battlefield have +2 [Might]."
 *   × Icathian Rain (OGN-248 → ogn-248-298) · Spell [7][rainbow]×3 "Deal 2 to a unit." ×6
 *
 * Q: Buffed Lee Sin (7) and another buffed unit (5 thanks to Lee) are hit by Icathian Rain — Lee 4×, the other 2×.
 *    Do both die even if Lee takes the LAST instance? Does the order matter?
 * A: Order doesn't matter; both die. Lee (8 dmg ≥ 7) dies in a cleanup; the other then loses Lee's +2 (5 → 3) and,
 *    carrying 4 damage, dies in the next loop of the cleanup.
 * Rules: 318/323 (cleanup repeats until nothing happens), 142.4.b (lethal = damage ≥ Might), statics end when the
 *        source leaves the board.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN_CENTERED = "ogn-151-298";
const ICATHIAN_RAIN = "ogn-248-298";

/** P2's turn with Icathian Rain money. P1 holds bf1 with buffed Lee Sin and a buffed 2-Might Disciple. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN_CENTERED, "lee", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Disciple" }, "disciple", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Caster" }, "caster")
    .hand(P2, ICATHIAN_RAIN, "rain");
}

/** Cast the Rain with the six instances in EXACTLY this order (raw move: the order is the point of the question). */
async function rain(game: Game, order: string[]): Promise<void> {
  expect(order).toHaveLength(6);
  await game.p2.do("playSpell", { cardId: "rain", playerId: P2, targets: order });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", controller: P2, targets: order })]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
}

describe("Ruling 4017fff5d2eb4d2a — Icathian Rain 4× on buffed Lee Sin + 2× on his buffed ally kills both, in any order", () => {
  test("premise: buffed Lee Sin is 7; the buffed Disciple is 2 +1 (buff) +2 (Lee's aura) = 5", async () => {
    const game = await board().build();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.state("disciple")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("Lee takes the LAST instance (L,L,L,D,D,L): Lee dies (8 ≥ 7); Disciple drops to 3 with 4 damage and dies in the following cleanup loop", async () => {
    const game = await board().build();
    await rain(game, ["lee", "lee", "lee", "disciple", "disciple", "lee"]);
    await game.settle();
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("disciple")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("order does not matter — Lee first (L,L,L,L,D,D): same result, both in the trash", async () => {
    const game = await board().build();
    await rain(game, ["lee", "lee", "lee", "lee", "disciple", "disciple"]);
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("disciple")).toBe("trash");
  });

  test("order does not matter — Disciple first (D,D,L,L,L,L): same result, both in the trash", async () => {
    const game = await board().build();
    await rain(game, ["disciple", "disciple", "lee", "lee", "lee", "lee"]);
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("disciple")).toBe("trash");
  });

  test("contrast — why the Disciple dies: with the same 4 damage but Lee SURVIVING (3× Lee, 1× elsewhere), the Disciple lives at 5 Might", async () => {
    // 2× on the Disciple, 3× on Lee (6 < 7, survives), 1× on P2's own Caster.
    const game = await board().build();
    await rain(game, ["disciple", "disciple", "lee", "lee", "lee", "caster"]);
    await game.settle();
    expect(game.zoneOf("lee")).toBe("battlefield-bf1");
    expect(game.state("lee").damage).toBe(6);
    expect(game.zoneOf("disciple")).toBe("battlefield-bf1");
    expect(game.state("disciple")).toMatchObject({ damage: 4, might: 5 }); // alive only because Lee's aura still holds
    expect(game.zoneOf("caster")).toBe("trash"); // 2 on a 2-Might unit
  });
});
