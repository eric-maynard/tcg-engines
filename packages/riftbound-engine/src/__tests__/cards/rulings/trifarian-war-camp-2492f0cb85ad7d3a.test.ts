/**
 * Ruling 2492f0cb85ad7d3a — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield
 *     "Units here have +1 [Might]. (This includes attackers.)"
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Action] · "Move a unit from a battlefield to its base."
 *
 * Q: A 1-Might unit is buffed to 2 by the War Camp and attacks Ahri. Does the War Camp's static keep it at 2,
 *    or does Ahri's reduction bring it to 1?
 * A: It becomes 1. Ahri's reduction reads the unit at its current 2 Might and snapshots how much it may take
 *    off (the clamp allows only -1 here), then that -1 keeps applying. Leaving the War Camp costs the +1 too,
 *    so the unit falls to 0 — and a 0-Might unit with no damage does not die.
 * Rules: 611 (continuous Might modification), 359 (values fixed on resolution), 465 (0-Might is not lethal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P2 holds the live Trifarian War Camp with Ahri on it. P1's 1-Might Pawn waits at home with a
 * Fight or Flight in hand. (Ahri prints -2 "to a minimum of 1"; against a 2-Might attacker the clamp
 * lets only -1 through, which is the "-1 Might" the question describes.)
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false })
    .unit(P2, "camp", AHRI_INQUISITIVE, "ahri")
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** Pawn attacks the War Camp; Ahri defends and her reduction resolves onto the Pawn. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("pawn").might).toBe(1);
  await game.p1.move("pawn", "camp");
  expect(game.state("pawn").combatRole).toBe("attacker");
  expect(game.state("ahri").combatRole).toBe("defender");
  // Ahri's defend trigger: its only enemy unit here is the Pawn.
  if (game.decision()?.kind === "pick") {
    await game.acting().pick("pawn");
  }
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling 2492f0cb85ad7d3a — the War Camp's static +1 does not protect the attacker from Ahri", () => {
  test("premise: on the War Camp the 1-Might Pawn shows 2 Might (attackers included)", async () => {
    const game = await board().build();
    await game.p1.move("pawn", "camp");
    expect(game.state("pawn").might).toBe(2);
    expect(game.state("ahri").might).toBe(4); // Ahri gets the +1 too
  });

  test("ruling: Ahri's reduction takes the 2-Might attacker down to 1", async () => {
    const game = await attacked();
    expect(game.state("pawn").might).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: leaving the War Camp costs the +1 while the snapshotted -1 stays — the Pawn falls to 0 and lives", async () => {
    const game = await attacked();
    await game.p1.cast("fof", { targets: "pawn" });
    await game.settle();
    expect(game.locationOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ might: 0, damage: 0 });
    expect(game.zoneOf("pawn")).toBe("base");
  });

  test("the reduction is 'this turn' only — next turn the Pawn is a plain 1-Might unit again", async () => {
    const game = await attacked();
    await game.p1.cast("fof", { targets: "pawn" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("pawn").might).toBe(1);
  });
});
