/**
 * Ruling 9deee0d442cc6175 — Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · [1] · "Deal 1 to all units at battlefields."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 10 Might · "Any amount of your damage is enough to kill enemy units. …"
 *
 * Q: Does Flurry of Blades "activate" Elder Dragon's passive (any of your damage kills enemies)?
 * A: Yes. Flurry is your spell, so its 1 damage is YOUR damage; every ENEMY unit at a battlefield that takes it is
 *    killed. Your own units at battlefields also take 1 but survive (the passive only concerns enemy units) unless
 *    1 is lethal to them anyway. The source need not be the Dragon itself.
 * Rules: 361/522 (passives apply continuously), 404 (damage; "your damage" = damage from a source you control),
 *        322–323 (Cleanup kills units with lethal damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLURRY = "ogn-133-298";
const ELDER_DRAGON = "unl-118-219";

/**
 * P1's turn, [1] floating, Elder Dragon in P1's base. bf1 (P1): P1's Ally (3) + P2's Raider (5). bf2 (P2): P2's Wall (8).
 * P2's Homebody (2) sits in base (not "at a battlefield").
 */
function board(withDragon = true) {
  const b = scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 5, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 8, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, FLURRY, "flurry");
  return withDragon ? b.unit(P1, "base", ELDER_DRAGON, "dragon") : b;
}

describe("Ruling 9deee0d442cc6175 — Flurry of Blades under Elder Dragon: 1 of YOUR damage kills every enemy unit at a battlefield", () => {
  test("control (no Dragon): Flurry deals 1 to every unit at a battlefield — all survive with 1 damage; the base unit is untouched", async () => {
    const game = await board(false).build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("raider")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("wall")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("with Elder Dragon in play: the Raider (5) and the Wall (8) each take just 1 of P1's damage and are KILLED", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["raider", "wall"]);
    expect(game.violations()).toEqual([]);
  });

  test("P1's own Ally at bf1 also takes the 1 but survives — the passive only makes damage lethal to ENEMY units", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-bf1" });
    expect(game.p1.trash()).toEqual(["flurry"]);
  });

  test("units NOT at a battlefield are outside Flurry's reach: P2's Homebody in base and the Dragon itself take nothing", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("dragon")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("contrast: the passive is about YOUR damage — if P2 casts Flurry while P1 has the Dragon, nobody dies (P2's damage is not P1's)", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 1 })
      .hand(P2, FLURRY, "flurry2")
      .build();
    await game.p2.cast("flurry2");
    await game.settle();
    expect(game.zoneOf("flurry2")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("raider")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("wall")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
  });
});
