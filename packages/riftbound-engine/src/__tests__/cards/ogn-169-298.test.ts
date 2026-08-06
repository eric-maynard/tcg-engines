/**
 * Gust — ogn-169-298 · Spell (Reaction) · Chaos · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Return a unit at a battlefield with 3 [Might] or less to its owner's hand.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const GUST = "ogn-169-298";
const CLEAVE = "ogn-004-298"; // 1-energy action spell used to open a chain

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .hand(P1, GUST, "gust");
}

describe("Gust (ogn-169-298)", () => {
  test("costs 1 energy; returns a ≤3-Might unit at a battlefield to its owner's hand; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "small" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p2.hand()).toContain("small");
    expect(game.zoneOf("gust")).toBe("trash");
    const poor = await board().resources(P1, { energy: 0 }).build();
    expect(poor.p1.can("cast", "gust")).toBe(false);
  });

  test("legal targets: units AT A BATTLEFIELD with 3 Might or less (either side) — not 4-Might, not base units", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options;
    expect(new Set(targets as string[][])).toEqual(new Set([["small"], ["mine"]]));
    const big = await game.p1.try((p) => p.cast("gust", { targets: "big" }));
    expect(big.ok).toBe(false);
    const home = await game.p1.try((p) => p.cast("gust", { targets: "home" }));
    expect(home.ok).toBe(false);
  });

  test("'its owner's hand': a friendly unit goes back to your own hand", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "mine" });
    await game.settle();
    expect(game.p1.hand()).toContain("mine");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("returned unit loses damage and temporary modifications (rule 124.1)", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Hurt" }, "hurt", { damage: 2 }).build();
    await game.p1.cast("gust", { targets: "hurt" });
    await game.settle();
    expect(game.zoneOf("hurt")).toBe("hand");
    expect(game.state("hurt").damage).toBe(0);
  });

  function response() {
    return scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, GUST, "gust");
  }

  test("Reaction: castable on the opponent's turn in response to their spell, and resolves first", async () => {
    const game = await response().build();
    await game.p2.cast("cleave", { targets: "small" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "small" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "gust"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves (LIFO), Cleave still pending
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave"]);
  });

  test.failing("BUG: the spell Gust answered then fizzles — a unit bounced to hand is no longer a legal target (rule 359.3.e.5)", async () => {
    // Expected: Cleave's target left the board, so it resolves with no effect. Actual: the
    // Assault grant is applied to the card sitting in its owner's hand.
    const game = await response().build();
    await game.p2.cast("cleave", { targets: "small" });
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("small").grantedKeywords).toEqual([]);
  });
});
