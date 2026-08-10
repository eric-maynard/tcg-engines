/**
 * Ruling 88cb59fee255470f — Commander Ledros (OGN-231 → ogn-231-298) × Soraka, Wanderer (SFD-173 → sfd-173-221)
 *   (× Baited Hook OGN-242, cited as the analogous "only if it actually dies" precedent)
 *
 *   Commander Ledros — Unit · Order · 6 + [order]×4 · 8 Might
 *     "As you play me, you may kill any number of friendly units as an additional cost. Reduce my cost by
 *      [order] for each killed this way. [Deflect] [Ganking]"
 *   Soraka, Wanderer — Unit · Order · 4 · 4 Might
 *     "If another unit you control here would die, if it has less Might than me, instead heal it, exhaust it,
 *      and recall it."
 *
 * Q: Does Ledros's cost reduction count a unit that survives being killed (e.g. saved by Soraka)?
 * A: No. "For each killed this way" counts only units that actually die. A unit whose death Soraka replaces
 *    does not reduce the cost.
 * Rules: 356.2.b / 356.4 (additional cost + linked discount), 370 (replacement effects), card text "killed this way".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEDROS = "ogn-231-298";
const SORAKA = "sfd-173-221";

/**
 * P1's turn, full price available (6 energy + 4 order) so legality never depends on the discount.
 * bf1 (P1): Soraka (4) + Pawn (1) — Pawn's death there is replaced by Soraka. Base: Big (5) — not saved (5 ≥ 4).
 */
function board(withSoraka: boolean) {
  const b = scenario()
    .resources(P1, { energy: 6, power: { order: 4 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, LEDROS, "ledros");
  return withSoraka ? b.unit(P1, "bf1", SORAKA, "soraka") : b;
}

describe("Ruling 88cb59fee255470f — Ledros's discount counts only units that actually die", () => {
  test("control (no Soraka): killing Pawn + Big as the additional cost discounts [order]×2 — pays 6 + [order]×2, both in trash", async () => {
    const game = await board(false).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["pawn", "big"] } } });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 2 } });
  });

  test("Soraka saves Pawn (healed, exhausted, recalled to base) while Big really dies — the kill of Pawn was replaced, so it is not 'killed this way'", async () => {
    const game = await board(true).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["pawn", "big"] } } });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base"); // recalled, not dead
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  // BUG — expected: only Big died, so the discount is [order]×1 → P1 pays 6 + [order]×3 and keeps 1 order.
  // Actual: the engine counts every unit named for the cost (357.2.a-style "cost still paid"), discounting
  // [order]×2 and leaving 2 order.
  test("engine discounts for the Soraka-saved unit too (order left 2, should be 1)", async () => {
    const game = await board(true).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["pawn", "big"] } } });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } }); // 4 − 3 = 1
  });

  // BUG — expected: naming ONLY the Soraka-saved Pawn yields no discount at all: full 6 + [order]×4 is paid
  // (order 4 → 0). Actual: [order]×1 is discounted (order left 1).
  test("a cost-kill that Soraka replaces still discounts [order] (should be full price)", async () => {
    const game = await board(true).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["pawn"] } } });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
