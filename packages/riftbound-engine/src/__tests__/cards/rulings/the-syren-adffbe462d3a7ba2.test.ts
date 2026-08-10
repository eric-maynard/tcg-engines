/**
 * Ruling adffbe462d3a7ba2 — The Syren (OGN-184 → ogn-184-298) · Gear · [2] · "[1], [Exhaust]: Move a friendly unit at a
 *     battlefield to its base."   (asked about the Magma Chamber team format)
 *   × Possession (OGN-203 → ogn-203-298) · [8][chaos]×3 · "Choose an enemy unit at a battlefield. Take control of it and
 *     recall it."   (Blind Fury OGN-025 is cited as another steal effect.)
 *
 * Q: Can The Syren move an allied unit to MY base?
 * A: No. "Its base" is the base of the unit's current CONTROLLER — never the Syren player's by choice. Controller ≠ owner:
 *    a unit stolen with Possession goes to its current controller's base, not its owner's.
 * Rules: 108.2 (controller vs owner), 140 / 402 ("its base" = its controller's base), The Syren's "friendly unit".
 * Note: the harness has no 2v2 teams, so "an ally's unit" is exercised through the controller-vs-owner distinction the
 * answer rests on (a Possessed unit), plus the fact that only units YOU control are "friendly" to the Syren at all.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_SYREN = "ogn-184-298";
const POSSESSION = "ogn-203-298";

/**
 * P1's turn: [8]+chaos×3 for Possession, +[1] for the Syren, +[1] spare. P1 holds bf2 with Mine (2); The Syren ready in base.
 * P2 holds bf1 with Raider (3, ready) and Pawn (2).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .gear(P1, THE_SYREN, "syren")
    .hand(P1, POSSESSION, "poss");
}

const syrenTargets = (game: Game) =>
  (game.p1.option("activate", "syren")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

/** Possess the Raider (→ P1's control, recalled to P1's base), then walk it to P1's bf2. */
async function stolenRaiderAtBf2(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "raider" });
  await game.settle();
  expect(game.state("raider")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
  expect(game.p1.units("base")).toContain("raider");
  await game.p1.move("raider", "bf2");
  await game.settle();
  expect(game.state("raider")).toMatchObject({ controller: P1, location: "bf2", owner: P2 });
  return game;
}

describe("Ruling adffbe462d3a7ba2 — The Syren sends a unit to its CONTROLLER's base; it can't pull someone else's unit into yours", () => {
  test("'a friendly unit at a battlefield': the Syren offers only units P1 controls at a battlefield (Mine) — never P2's Raider/Pawn, so another player's unit can't be sent anywhere by it", async () => {
    const game = await board().build();
    expect(syrenTargets(game)).toEqual(["mine"]);
    const r = await game.p1.try((p) => p.activate("syren", 0, { targets: "raider" }));
    expect(r.ok).toBe(false);
    expect(game.state("syren").isReady).toBe(true);
  });

  test("own unit: [1] + exhaust, Mine moves from bf2 to ITS base — P1's", async () => {
    const game = await board().build();
    await game.p1.activate("syren", 0, { targets: "mine" });
    expect(game.p1.energy()).toBe(9);
    expect(game.state("syren").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("mine")).toMatchObject({ controller: P1, location: "base", zone: "base" });
    expect(game.p1.units("base")).toContain("mine");
    expect(game.p2.units("base")).not.toContain("mine");
  });

  test("stolen unit (Possession): the Raider — owner P2, controller P1 — is now 'friendly' and offered; the Syren moves it to its CONTROLLER's base (P1's), not its owner's (P2's)", async () => {
    const game = await stolenRaiderAtBf2();
    expect(syrenTargets(game).sort()).toEqual(["mine", "raider"]);
    await game.p1.activate("syren", 0, { targets: "raider" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("raider"); // in P1's base …
    expect(game.p2.units("base")).not.toContain("raider"); // … not back home with its owner
    expect(game.p2.units()).toEqual(["pawn"]);
    expect(game.violations()).toEqual([]);
  });
});
