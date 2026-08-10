/**
 * Ruling be54c62e77134a85 — Stare Down (UNL-107 → unl-107-219) · Spell · Body · [2] · standard timing
 *     "Choose a friendly unit and a battlefield. Move all enemy units at that battlefield with less Might than the chosen
 *      unit to their base. Gain 1 XP."
 *
 * Q: Can you play Stare Down if there are no enemy units at the chosen battlefield?
 * A: Yes. Its only targets are a friendly unit and a battlefield. "Move all enemy units …" acts on whatever is there at
 *    resolution — with none it does nothing, and the rest (Gain 1 XP) still resolves.
 * Rules: 355.6–355.8 (only the targeting requirements gate a play), 355.10 ("all enemy units" is not a target),
 *        359.3.e.7 (an instruction with nothing to act on does nothing), 730.1 (Gain XP).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STARE_DOWN = "unl-107-219";

/** P1's turn with [2]. P1: Big (4) in base. bf1 is P1's own with Holder (1) and NO enemy units; P2's units are at bf2 / base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Big" }, "big")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Away" }, "away")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .hand(P1, STARE_DOWN, "sd");
}

describe("Ruling be54c62e77134a85 — Stare Down is playable at a battlefield with no enemy units; it still gains the XP", () => {
  test("bf1 (no enemy units there) is offered as the battlefield choice alongside bf2, with Big as the friendly unit", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "sd")).toBe(true);
    const targets = (game.p1.option("cast", "sd")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(targets).toContainEqual(["big", "bf1"]);
    expect(targets).toContainEqual(["big", "bf2"]);
  });

  test("cast at [Big, bf1]: paid ([2] → 0), it resolves — nothing moves anywhere (no enemy unit was at bf1), P1 still gains 1 XP, spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P1 })]);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("away")).toBe("battlefield-bf2"); // enemies elsewhere untouched
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // friendly units never move
    expect(game.zoneOf("big")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("even with NO enemy unit anywhere on the board the spell is playable and gains the XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 4, name: "Big" }, "big")
      .hand(P1, STARE_DOWN, "sd")
      .build();
    expect(game.p1.can("cast", "sd")).toBe(true);
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("sd")).toBe("trash");
  });

  test("contrast: aimed at bf2 the movement portion does work — Away (2 < 4) is sent to P2's base, +1 XP", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf2"] });
    await game.settle();
    expect(game.state("away")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p1.xp()).toBe(1);
  });
});
