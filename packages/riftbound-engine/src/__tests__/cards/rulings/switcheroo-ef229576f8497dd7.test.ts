/**
 * Ruling ef229576f8497dd7 — Switcheroo (SFD-145 → sfd-145-221) · [Hidden] [Action] · Chaos · 2 + [chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · 2 + [chaos] · "Move a friendly unit and ready it."
 *
 * Q: After Switcheroo swaps Might, does the unit keep that Might for the rest of the turn even if I Ride the Wind it over to
 *    the other battlefield?
 * A: Yes. Switcheroo applies a persistent +X / −X modifier to each unit until end of turn (not a location-locked snapshot);
 *    moving the unit does not remove it. It expires at end of turn.
 * Rules: 433 (Swap = increase one / decrease the other), "this turn" duration (317.2 expiration), 449 (move keeps modifiers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn with 4 + [chaos]×3: Small (2) and Large (6) at P1's bf1; bf2 open; both spells in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2")
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P1, "bf1", { might: 6, name: "Large" }, "large")
    .hand(P1, SWITCHEROO, "roo")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

async function swapped(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("roo", { targets: ["small", "large"] });
  await game.settle();
  expect(game.zoneOf("roo")).toBe("trash");
  return game;
}

describe("Ruling ef229576f8497dd7 — Switcheroo's swap is a turn-long modifier that travels with the unit", () => {
  test("Switcheroo on {Small 2, Large 6} at bf1: Small becomes 6 (a +4 MODIFIER), Large becomes 2 (−4)", async () => {
    const game = await swapped();
    expect(game.state("small")).toMatchObject({ baseMight: 2, might: 6, mightModifier: 4 });
    expect(game.state("large")).toMatchObject({ baseMight: 6, might: 2, mightModifier: -4 });
  });

  test("Ride the Wind moves Small to bf2 and readies it — Small is STILL 6 there (modifier kept through the move); Large still 2 at bf1", async () => {
    const game = await swapped();
    await game.p1.cast("rtw", { targets: "small" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("bf2");
    await game.settle(); // resolves; Small alone at open bf2 → non-combat showdown (handed back once)
    await game.settle();
    expect(game.locationOf("small")).toBe("bf2");
    expect(game.state("small")).toMatchObject({ isReady: true, might: 6, mightModifier: 4 });
    expect(game.state("large")).toMatchObject({ location: "bf1", might: 2 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // and it conquered bf2 as a 6-Might unit
  });

  test("'this turn': after the turn ends both units are back to their printed Might (Small 2 at bf2, Large 6)", async () => {
    const game = await swapped();
    await game.p1.cast("rtw", { targets: "small" });
    await game.p1.pick("bf2");
    await game.settle();
    await game.settle();
    await game.advanceTurn();
    expect(game.state("small")).toMatchObject({ location: "bf2", might: 2, mightModifier: 0 });
    expect(game.state("large")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
