/**
 * Ruling d2fc9e02ef2f40d6 — Falling Star (OGN-029 → ogn-029-298) · Fury · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   (× Icathian Rain OGN-248 — cited only as another non-combat damage source.)
 *
 * Q: When a combat ends at one battlefield, do units at OTHER battlefields and in bases heal too — including damage from
 *    spells like Falling Star?
 * A: Yes. The combat cleanup at the end of any combat clears all marked damage from ALL units everywhere, regardless of where
 *    the damage came from or whether the unit took part in that combat.
 * Rules: 466.1 / 323 (combat cleanup → special cleanup heals all units), 443.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";

/**
 * P1's turn with exactly [2][fury][fury]. P2: Brute (6) at P2's bf2, Idler (5) in P2's base, Guard (2) at P2's bf1.
 * P1: Attacker (4) in base to fight at bf1, and a Homebody (5) in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 5, name: "Idler" }, "idler")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .unit(P1, "base", { might: 5, name: "Homebody" }, "home")
    .hand(P1, FALLING_STAR, "star");
}

/** Falling Star: 3 to the Brute (other battlefield) and 3 to `second`. */
async function starThen(second: "idler" | "home"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("star", { targets: ["brute", second] });
  await game.settle();
  expect(game.zoneOf("star")).toBe("trash");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.state("brute")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
  expect(game.state(second)).toMatchObject({ damage: 3, zone: "base" });
  return game;
}

describe("Ruling d2fc9e02ef2f40d6 — the end of ANY combat heals every unit everywhere, spell damage included", () => {
  test("premise: Falling Star's damage stays marked through ordinary (non-combat) play that turn", async () => {
    const game = await starThen("idler");
    await game.settle();
    expect(game.state("brute").damage).toBe(3);
    expect(game.state("idler").damage).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a combat at bf1 (Attacker 4 vs Guard 2) ends → the Brute at bf2 AND the Idler in P2's base are healed to 0, though neither was anywhere near that combat", async () => {
    const game = await starThen("idler");
    await game.p1.move("atk", "bf1");
    await game.settle(); // showdown passes, combat resolves, combat cleanup
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // participant healed (took 2)
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf2" }); // other battlefield
    expect(game.state("idler")).toMatchObject({ damage: 0, zone: "base" }); // in a base
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("it is truly 'all units': P1's own spell-damaged Homebody sitting in P1's base is healed by that same combat ending", async () => {
    const game = await starThen("home");
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("brute").damage).toBe(0);
  });
});
