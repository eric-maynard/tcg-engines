/**
 * Ruling bc668a3cc274e81b — Pack of Wonders (OGN-181 → ogn-181-298) · Gear · Chaos · [2]
 *   "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *
 * Q: Can Pack of Wonders target cards in the trash to return them to hand?
 * A: No. It only reaches things on the board — friendly gear, friendly units and friendly facedown cards.
 *    "Its owner's hand" says WHERE the returned card goes, not which cards may be chosen; and "another"
 *    excludes the Pack itself.
 * Rules: 355.10/355.11 (a target descriptor names a zone — board permanents here), 812 (facedown cards are
 *        on the board), 056 (a returned card goes to its OWNER's hand).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";
const UNLICENSED_ARMORY = "ogn-023-298"; // a second friendly gear
const SKULKER = "ogn-175-298"; // a unit — seeded into the TRASH
const ZHONYAS = "ogn-077-298"; // a gear — seeded into the TRASH
const TEEMO_SCOUT = "ogn-197-298"; // [Hidden] — the friendly facedown card

/** P1's turn. P1 holds bf1. Board: Pack, a second gear, two units, a facedown card. Trash: a unit + a gear. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .gear(P1, PACK_OF_WONDERS, "pack")
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .trash(P1, SKULKER, "deadUnit")
    .trash(P1, ZHONYAS, "deadGear");
}

const targetOptions = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  (game.p1.option("activate", "pack")?.fields?.find((f) => f.name === "targets")?.options ?? [])
    .map((o) => (Array.isArray(o) ? o[0] : o))
    .sort();

describe("Ruling bc668a3cc274e81b — Pack of Wonders reaches the board only, never the trash", () => {
  test("ruling: the trashed unit and the trashed gear are NOT offered as targets", async () => {
    const game = await board().build();
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("deadGear")).toBe("trash");
    const options = targetOptions(game);
    expect(options).not.toContain("deadUnit");
    expect(options).not.toContain("deadGear");
  });

  test("ruling: friendly gear, friendly units and the friendly facedown card ARE offered", async () => {
    const game = await board().build();
    expect(targetOptions(game)).toEqual(["ally", "armory", "home", "teemo"]);
  });

  test("nuance: 'another' excludes the Pack itself, and 'friendly' excludes the enemy unit", async () => {
    const game = await board().build();
    const options = targetOptions(game);
    expect(options).not.toContain("pack");
    expect(options).not.toContain("foe");
  });

  test("the ability does return a board card to its owner's hand — and exhausts the Pack as its cost", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "teemo" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("with only the Pack on an otherwise empty board there is nothing to return, so the ability is not available", async () => {
    const game = await scenario().gear(P1, PACK_OF_WONDERS, "pack").trash(P1, SKULKER, "deadUnit").build();
    expect(game.p1.can("activate", "pack")).toBe(false);
  });
});
