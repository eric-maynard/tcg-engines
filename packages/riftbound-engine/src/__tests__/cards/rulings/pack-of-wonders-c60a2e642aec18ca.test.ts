/**
 * Ruling c60a2e642aec18ca — Pack of Wonders (OGN-181 → ogn-181-298) · Gear · [2]
 *   "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *
 * Q: Can Pack of Wonders return a TRASHED gear or unit to hand?
 * A: No. It can only affect objects in play. "Friendly" means something you CONTROL, and nobody controls
 *    cards in the trash — a trashed unit is just a card, not a unit on the board. Unless a card says
 *    otherwise, it reaches only objects in play.
 * Rules: 119 (game objects on the board), 191 (control is a property of objects in play), 711 (cards in
 *        Non-Board zones keep printed characteristics but are not board objects), 355.10 (descriptor scope).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";

const SOLDIER = { cardType: "unit", energyCost: 3, might: 3, name: "Soldier" } as const;
const TRINKET = { cardType: "gear", energyCost: 2, name: "Trinket" } as const;

/** P1's turn: the Pack plus a Soldier and a Trinket on the board; a dead Soldier and a dead Trinket in the trash. */
function board() {
  return scenario()
    .gear(P1, PACK_OF_WONDERS, "pack")
    .gear(P1, TRINKET, "livegear")
    .unit(P1, "base", SOLDIER, "liveunit")
    .trash(P1, SOLDIER, "deadunit")
    .trash(P1, TRINKET, "deadgear")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Enemy" }, "enemy");
}

describe("Ruling c60a2e642aec18ca — Pack of Wonders reaches only objects in play, never the trash", () => {
  test("setup: the trashed cards really are in the trash and the live ones on the board", async () => {
    const game = await board().build();
    expect(game.p1.trash().sort()).toEqual(["deadgear", "deadunit"]);
    expect(game.zoneOf("liveunit")).toBe("base");
    expect(game.zoneOf("livegear")).toBe("base");
  });

  test("ruling: the ability's choices are the board permanents only — neither trashed card is offered", async () => {
    const game = await board().build();
    const keys = (game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets")?.options ?? [])
      .flat()
      .map(String)
      .sort();
    expect(keys).not.toContain("deadunit");
    expect(keys).not.toContain("deadgear");
    expect(keys).toEqual(["livegear", "liveunit"]);
  });

  test("ruling: naming a trashed card is refused outright", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.activate("pack", 0, { targets: "deadunit" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("pack", 0, { targets: "deadgear" }))).ok).toBe(false);
    expect(game.state("pack").isExhausted).toBe(false); // nothing was paid
  });

  test("ruling: 'another FRIENDLY' — the enemy unit and the Pack itself are not choices either", async () => {
    const game = await board().build();
    const keys = (game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets")?.options ?? [])
      .flat()
      .map(String);
    expect(keys).not.toContain("enemy");
    expect(keys).not.toContain("pack"); // "another" excludes itself
  });

  test("contrast: on a board object it works — the live Soldier goes back to P1's hand and the Pack is exhausted", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "liveunit" });
    await game.settle();
    expect(game.zoneOf("liveunit")).toBe("hand");
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.p1.trash().sort()).toEqual(["deadgear", "deadunit"]); // the trash is untouched
    expect(game.violations()).toEqual([]);
  });
});
