/**
 * Ruling 8df828aeef334247 — Smoke and Mirrors (UNL-083 → unl-083-219) · [Hidden][Action] · 2
 *     "Choose a unit you control and another unit you control at a different location. If at least one of them has
 *      [Temporary], move each to the other's location. Draw 1."
 *   × Tideturner (OGN-199 → ogn-199-298) — the rules' own example of the same exception.
 *
 * Q: Can I play Smoke and Mirrors from hidden to swap a unit at the hidden battlefield with a unit somewhere else?
 * A: Yes. Hidden plays normally may only choose things at that battlefield, but this card REQUIRES "another unit …
 *    at a different location", which can never be met there alone — so the 811.1.d.2 exception applies (as for
 *    Tideturner). You still choose one unit at the hidden battlefield and the other elsewhere.
 * Rules: 811.1.d.2 (hidden targeting restriction and its impossible-requirement exception), 811.1.b (play for 0).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_AND_MIRRORS = "unl-083-219";

/**
 * Turn 3, P1 active, NO resources (the hidden play costs 0). P1 holds bf1 with Sprite (2, [Temporary]) and Anchor (1),
 * and hid Smoke and Mirrors there earlier; Keeper (3) waits in base. P2 holds bf2 with a Foe. Known deck top.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { keywords: ["Temporary"], might: 2, name: "Sprite" }, "sprite")
    .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 3, name: "Keeper" }, "keeper")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .facedown(P1, "bf1", SMOKE_AND_MIRRORS, "sm")
    .deckTop(P1, "ogn-175-298", "top");
}

const pairsOffered = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  ((game.p1.option("reveal", "sm")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][]).map((p) => p.join(">"));

describe("Ruling 8df828aeef334247 — Smoke and Mirrors from hidden may pair a unit here with a unit at a different location", () => {
  test("the facedown Smoke and Mirrors is playable, and its legal pairs are exactly {a unit AT bf1} × {a friendly unit ELSEWHERE}: sprite>keeper and anchor>keeper", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "sm")).toBe(true);
    const pairs = pairsOffered(game);
    expect(pairs.sort()).toEqual(["anchor>keeper", "sprite>keeper"]);
    // Not two units at the hidden battlefield (same location), not the enemy Foe, not Keeper as the "here" unit.
    expect(pairs).not.toContain("sprite>anchor");
    expect(pairs.some((p) => p.includes("foe"))).toBe(false);
    expect(pairs.some((p) => p.startsWith("keeper>"))).toBe(false);
  });

  test("ruling 8df828aeef334247 — revealing it for 0 with [sprite, keeper]: Sprite (Temporary) and Keeper trade places across locations, and P1 draws 1", async () => {
    const game = await board().build();
    await game.p1.reveal("sm", { targets: ["sprite", "keeper"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sm", controller: P1 })]);
    await game.settle();
    expect(game.locationOf("sprite")).toBe("base");
    expect(game.locationOf("keeper")).toBe("bf1");
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("sm")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the [Temporary] gate only governs the swap: pairing the non-Temporary Anchor with Keeper moves nothing but still draws 1", async () => {
    const game = await board().build();
    await game.p1.reveal("sm", { targets: ["anchor", "keeper"] });
    await game.settle();
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.locationOf("keeper")).toBe("base");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("sm")).toBe("trash");
  });
});
