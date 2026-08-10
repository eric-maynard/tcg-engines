/**
 * Ruling 6507c240aba29865 — Get Excited! (OGN-008 → ogn-008-298) · Action · [2][fury] · "Discard 1. Deal its Energy cost as damage to a
 *     unit at a battlefield. (Ignore its Power cost.)"
 *   × Sky Splitter (OGN-014 → ogn-014-298) · Action · [8][fury] · "This spell's Energy cost is reduced by the highest Might among units
 *     you control. Deal 5 to a unit at a battlefield."
 *   × Kadregrin the Infernal (ogn-038-298) · 9 Might — on P1's board, so Sky Splitter would cost [0] to PLAY.
 *
 * Q: With Kadregrin in base, I Get Excited and discard Sky Splitter — 0 damage (reduced cost) or 8 (printed)?
 * A: 8. Effects that reference a card's cost read the PRINTED value; Sky Splitter's self-reduction only matters while actually
 *    playing it, and the card is discarded, never played.
 * Rules: 132/153 (Energy cost = printed characteristic), 357 (cost modifications apply during the pay step of a play only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const SKY_SPLITTER = "ogn-014-298";
const KADREGRIN = "ogn-038-298";
const SKULKER = "ogn-175-298"; // a second card in hand so the discard is a real choice

/** P1's turn with [2] + fury×2. Kadregrin (9) in P1's base; Get Excited, Sky Splitter + a Skulker in hand. P2's 10-Might Titan holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 10, name: "Titan" }, "titan")
    .unit(P1, "base", KADREGRIN, "kadregrin")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, SKULKER, "skulker");
}

describe("Ruling 6507c240aba29865 — Get Excited! reads Sky Splitter's PRINTED 8, not its Kadregrin-reduced play cost", () => {
  test("premise: Kadregrin's 9 Might really does zero out Sky Splitter's Energy cost for PLAYING it — castable right now with only [2] in the pool", async () => {
    const game = await board().build();
    expect(game.state("kadregrin").might).toBe(9);
    expect(game.p1.can("cast", "sky")).toBe(true);
    await game.p1.cast("sky", { targets: "titan" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // paid [0] + [fury]
  });

  test("Get Excited discarding Sky Splitter deals its printed Energy cost — 8 — to the Titan (not 0)", async () => {
    const game = await board().build();
    await game.p1.cast("ge", { targets: "titan" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["skulker", "sky"]);
    await game.p1.pick("sky");
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash"); // discarded, never played
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.state("titan")).toMatchObject({ damage: 8, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // nothing further paid for the Splitter
    expect(game.violations()).toEqual([]);
  });

  test("and 8 is lethal where 0 would not be: against a 8-Might defender the discard kills it", async () => {
    const game = await board().unit(P2, "bf1", { might: 8, name: "Eight" }, "eight").build();
    await game.p1.cast("ge", { targets: "eight" });
    await game.settle();
    await game.p1.pick("sky");
    await game.settle();
    expect(game.zoneOf("eight")).toBe("trash");
  });
});
