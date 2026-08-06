/**
 * Captain Farron — ogn-015-298 · Unit · Fury · 4 energy + 1 [fury] · 5 might
 *
 *   Other friendly units here have [Assault]. (+1 [Might] while they're attackers.)
 *
 * Rule 719 — Assault: +X Might while attacking (bare Assault = Assault 1).
 * "here" = the same location (base or battlefield) as Captain Farron.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-015-298";

describe("Captain Farron (ogn-015-298)", () => {
  test("costs 4 energy + 1 fury power; both are deducted and he enters the base", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "farron").build();
    await game.p1.play("farron", { to: "base" });
    await game.settle();
    expect(game.zoneOf("farron")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("farron").might).toBe(5);
  });

  test("not playable without the [fury] power or with only 3 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "farron").build();
    expect(noPower.p1.can("play", "farron")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "farron").build();
    expect(noEnergy.p1.can("play", "farron")).toBe(false);
  });

  test("other friendly units at Farron's location have Assault (static grant, rule 719)", async () => {
    // Once Farron and an ally share a location, the ally's keywords include Assault
    // (granted with duration "static").
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "farron")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally").keywords).toContain("Assault");
  });

  test("'Other' / 'friendly' / 'here': Farron himself, enemies here and friends elsewhere get no Assault", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .rune(P1, "fury", { alias: "r1" })
      .unit(P1, "bf1", CARD, "farron")
      .unit(P2, "bf1", { might: 2 }, "foeHere")
      .unit(P1, "base", { might: 2 }, "allyElsewhere")
      .build();
    await game.p1.tapRune("r1"); // any move → state-based static recalculation
    expect(game.state("farron").keywords).not.toContain("Assault");
    expect(game.state("foeHere").keywords).not.toContain("Assault");
    expect(game.state("allyElsewhere").keywords).not.toContain("Assault");
  });

  test("in combat the ally's Assault counts — Farron (5) + a 2-might ally deal 8 and kill 5+3 defenders", async () => {
    // Attackers deal 5 + (2+1) = 8, enough to assign lethal damage to both defenders.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "d5")
      .unit(P2, "bf1", { might: 3 }, "d3")
      .unit(P1, "base", CARD, "farron")
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    await game.p1.move(["farron", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("d5")).toBe("trash");
    expect(game.zoneOf("d3")).toBe("trash");
  });
});
