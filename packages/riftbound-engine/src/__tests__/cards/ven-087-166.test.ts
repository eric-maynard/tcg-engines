/**
 * Hextech Disc — ven-087-166 · Gear · Body · 4 energy + [body]
 *
 *   [Empower] — [Exhaust] (Pay the cost: Empower this. Use only if not Empowered.)
 *   Disempower this, [1], [Exhaust]: Play a 3 [Might] Mech unit token to your base.
 *
 * Rule 827.1.d: "Disempower this" is a cost — payable only while the Disc is
 * [Empowered], and paying it clears the Empowered state.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-087-166";

describe("Hextech Disc (ven-087-166)", () => {
  test("[Empower] — [Exhaust]: empowers the Disc and exhausts it", async () => {
    const game = await scenario().gear(P1, CARD, "disc").build();
    await game.p1.activate("disc", 0);
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.state("disc").meta).toMatchObject({ empowered: true });
  });

  // rule 827.1.d — the token ability's cost includes "Disempower this".
  test("the token ability cannot be activated while the Disc is not [Empowered]", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, CARD, "disc").build();
    const r = await game.p1.try((p) => p.activate("disc", 1));
    expect(r.ok).toBe(false);
  });

  test("Disempower this, [1], [Exhaust]: plays a 3 [Might] Mech token to the base and clears [Empowered]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P1, CARD, "disc", { empowered: true })
      .build();
    const baseBefore = new Set(game.p1.base());
    await game.p1.activate("disc", 1);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.state("disc").meta).toMatchObject({ empowered: false });
    const added = game.p1.base().filter((id) => !baseBefore.has(id));
    expect(added).toHaveLength(1);
    const token = added[0];
    expect(game.state(token)).toMatchObject({ isToken: true, might: 3 });
    // rule 476.1 — the Disc is a plain Gear with no printed [Equip]; it can
    // never be attached to a unit, not even the Mech it just made.
    expect(game.p1.can("equip", "disc")).toBe(false);
  });
});
