/**
 * Ruling 17a963a1fb5511ca — Fight or Flight (OGN-168 → ogn-168-298) · Action · Chaos · [2]
 *     "[Hidden] [Action] Move a unit from a battlefield to its base."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Vilemaw (UNL-060 → unl-060-219) · 8 Might (the enemy unit standing at the Lair)
 *
 * Q: What happens if I Fight-or-Flight an enemy unit at Vilemaw's Lair?
 * A: The spell can be played and resolves (it counts as played), but the Lair's static forbids the move, so the
 *    "move to base" instruction can't be followed and is ignored — the unit stays at the battlefield.
 * Rules: 356.3.e.6 / 359.3.e (instructions that can't be followed are ignored), 522 (battlefield statics apply
 *        continuously), 419.4 (a resolved spell was played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const VILEMAWS_LAIR = "ogn-295-298";
const VILEMAW = "unl-060-219";

/** P1's turn with exactly [2]. P2's Vilemaw stands at `lair` (live Vilemaw's Lair) — or at an inert bf for the control. */
function board(liveLair: boolean) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: !liveLair })
    .unit(P2, "lair", VILEMAW, "vilemaw")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

describe("Ruling 17a963a1fb5511ca — Fight or Flight at Vilemaw's Lair resolves but the move is ignored", () => {
  test("at the live Lair: P1 may cast Fight or Flight on the enemy Vilemaw; it resolves to trash and counts as played, yet Vilemaw stays at the battlefield (the Lair forbids moving to base)", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "vilemaw" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1 })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash"); // resolved, not countered
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // "is considered played"
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair"); // the move was ignored
    expect(game.p2.units("base")).toEqual([]);
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — the same cast at an inert battlefield moves Vilemaw to P2's base", async () => {
    const game = await board(false).build();
    await game.p1.cast("fof", { targets: "vilemaw" });
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("vilemaw")).toBe("base");
    expect(game.state("vilemaw")).toMatchObject({ controller: P2, location: "base" });
  });
});
