/**
 * Sky Cruiser — ven-060-166 · Unit · Mind · 4 energy + [mind] · 3 Might
 *
 *   Discard a gear, [1], [Exhaust]: Deal 4 to a unit at a battlefield.
 *
 * Rules: 357.2 / 422.3 — every part of an activation cost is mandatory and is paid as the
 * ability is activated; "Discard a gear" is payable only with a GEAR in hand, and the
 * discarded gear hits the trash before the ability goes on the chain.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-060-166";
const GEAR = "sfd-046-221"; // Poro Snax — a gear

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Target" }, "foe")
    .unit(P1, "base", CARD, "cruiser");
}

describe("Sky Cruiser (ven-060-166)", () => {
  test("the 'discard a gear' cost is unpayable with no gear in hand", async () => {
    const empty = await board().build();
    expect(empty.p1.can("activate", "cruiser")).toBe(false);
    // a non-gear card in hand does not pay a "discard a gear" cost either
    const nonGear = await board().hand(P1, "ogn-175-298", "spellInHand").build();
    expect(nonGear.p1.can("activate", "cruiser")).toBe(false);
  });

  test("with a gear in hand the ability is activatable; the gear is trashed and 4 damage lands", async () => {
    const game = await board().hand(P1, GEAR, "snaxInHand").build();
    expect(game.p1.can("activate", "cruiser")).toBe(true);
    await game.p1.activate("cruiser", undefined, { params: { discardId: "snaxInHand" } });
    expect(game.zoneOf("snaxInHand")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    await game.settle({ policy: "first" });
    expect(game.state("foe").damage).toBe(4);
  });
});
