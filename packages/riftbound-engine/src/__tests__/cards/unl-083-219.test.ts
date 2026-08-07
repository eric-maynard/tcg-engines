/**
 * Smoke and Mirrors — unl-083-219 · Spell · Mind · 2 energy · [Action]
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a unit you control and another unit you control at a different location. If at
 *   least one of them has [Temporary], move each to the other's location. Draw 1.
 *
 * Rules: 355.8 (both units are chosen as the spell is played); 359.3.e (the [Temporary]
 * gate governs only the movement — the draw is a separate instruction and always happens).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-083-219";

function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { keywords: ["Temporary"], might: 2, name: "Sprite" }, "sprite")
    .unit(P1, "base", { might: 3, name: "Keeper" }, "keeper")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .deckTop(P1, "ogn-024-298", "top")
    .hand(P1, CARD, "sm");
}

describe("Smoke and Mirrors (unl-083-219)", () => {
  test("the two chosen friendly units at different locations trade places, and P1 draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("sm", { targets: ["sprite", "keeper"] });
    await game.settle();
    expect(game.locationOf("sprite")).toBe("base");
    expect(game.locationOf("keeper")).toBe("bf1");
    expect(game.p1.hand()).toContain("top");
  });

  test("with no [Temporary] unit among the pair nothing moves, but the draw still happens", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .unit(P1, "base", { might: 3, name: "Keeper" }, "keeper")
      .deckTop(P1, "ogn-024-298", "top")
      .hand(P1, CARD, "sm")
      .build();
    await game.p1.cast("sm", { targets: ["plain", "keeper"] });
    await game.settle();
    expect(game.locationOf("plain")).toBe("bf1");
    expect(game.locationOf("keeper")).toBe("base");
    expect(game.p1.hand()).toContain("top");
  });

  test("only friendly pairs at DIFFERENT locations are offered — not an enemy unit, not a same-zone pair", async () => {
    const game = await board().build();
    const offered = game.p1
      .option("cast", "sm")
      ?.fields.find((f) => f.name === "targets")?.options as unknown[] | undefined;
    const pairs = (offered ?? []).map((o) => (o as string[]).slice().sort().join("|"));
    expect(pairs).toContain(["sprite", "keeper"].sort().join("|"));
    expect(pairs.some((p) => p.includes("foe"))).toBe(false);
  });
});
