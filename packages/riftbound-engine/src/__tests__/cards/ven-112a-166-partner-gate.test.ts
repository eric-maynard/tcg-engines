/**
 * Zed, Without a Sound (VEN-112a → ven-112a-166) · Champion Unit · Chaos · [5] · 5 Might
 *   "[Action] [1][chaos]: Move me and a Shadow Clone you control to each other's locations."
 *
 * rule 355.8 — an ability whose effect chooses an object may not be activated when no legal
 * choice exists. The swap names its chosen object on `partner` (not `target`), so the play /
 * activation gate has to read that descriptor; otherwise the [1][chaos] is paid for an effect
 * that resolves to nothing and is never refunded.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const ZED = "ven-112a-166";
const SHADOW = "unl-194-219";

describe("ven-112a-166 — Zed's swap needs a Shadow Clone partner", () => {
  test("with no Shadow Clone anywhere, the activated ability is not offered (cost is never charged)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ZED, "zed")
      .unit(P1, "base", SHADOW, "shadow")
      .build();

    expect(game.p1.can("activate", "zed")).toBe(false);
    expect(game.p1.resources()).toMatchObject({ energy: 3, power: { chaos: 3 } });
    expect(game.locationOf("zed")).toBe("bf1");
    expect(game.locationOf("shadow")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
