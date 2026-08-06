/**
 * Alpha Strike — unl-192-219 · Spell · Calm/Body · 3 energy · 1 [rainbow] power
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a friendly unit. It deals damage equal to its Might split among
 *   enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP.
 *
 * Rule 355.14.b/c / 355.15 — split targets are caster-chosen at play time and
 * capped at N = the friendly reference unit's current Might.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-192-219";

function build() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "bf1", { might: 5 }, "e1")
    .unit(P2, "bf1", { might: 5 }, "e2")
    .unit(P2, "bf1", { might: 5 }, "e3")
    .hand(P1, CARD, "alpha")
    .build();
}

describe("Alpha Strike (unl-192-219) — split target cap", () => {
  test("enumerator offers 0..Might split targets, never more", async () => {
    const game = await build();
    expect(game.p1.can("cast", "alpha")).toBe(true);
    await game.p1.cast("alpha", { targets: ["ally", "e1", "e2"] });
    expect(game.zoneOf("alpha")).toBe("chain");
  });

  // rule-id: unl-192-219 (355.14.b/c) — a raw playSpell with more split
  // targets than the reference unit's Might must be rejected by validation,
  // not just omitted from enumeration.
  test("raw playSpell with split targets > Might is rejected", async () => {
    const game = await build();
    const r = await game.p1.try((p) =>
      p.do("playSpell", { cardId: "alpha", targets: ["ally", "e1", "e2", "e3"] }),
    );
    expect(r.ok).toBe(false);
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.power()).toBe(1);
  });

  test("raw playSpell with split targets == Might is accepted", async () => {
    const game = await build();
    await game.p1.do("playSpell", { cardId: "alpha", targets: ["ally", "e1", "e2"] });
    expect(game.zoneOf("alpha")).toBe("chain");
    expect(game.p1.energy()).toBe(0);
  });
});
