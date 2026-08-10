/**
 * Ruling 5ab44419fda825cd — Orb of Regret (OGN-090 → ogn-090-298) · Gear · [1] · "[Exhaust]: Give a unit -1 [Might] this turn,
 *     to a minimum of 1 [Might]."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *   Kill source: Hextech Ray (ogn-009-298) "Deal 3 to a unit at a battlefield."
 *
 * Q: A unit carrying both a buff and Orb of Regret's −1 would die and is saved by Zhonya's — do both effects persist?
 * A: Yes, both stay on the unit when it lands in base. The Orb's −1 still expires at end of turn as usual (it does not become
 *    permanent because of the save).
 * Rules: 371–373 (a replacement replaces only the death; the unit never leaves the board), 702 (buff object), 517.2 (turn
 *        modifiers expire in the Ending Step), 453 (recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ORB_OF_REGRET = "ogn-090-298";
const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P1: buffed 3-Might Squire (=4) at bf1, Orb of Regret + Zhonya's in base, Hextech Ray in hand with [1][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, ORB_OF_REGRET, "orb")
    .gear(P1, ZHONYAS, "zhonyas")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Orb −1 on the Squire (4 → 3), then Hextech Ray for 3 on it → would die → Zhonya's replaces the death. */
async function orbThenLethalRay(): Promise<Game> {
  const game = await board().build();
  expect(game.state("squire")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p1.activate("orb", 0, { targets: "squire" });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.state("orb").isExhausted).toBe(true);
  expect(game.state("squire")).toMatchObject({ isBuffed: true, might: 3, mightModifier: -1 });
  await game.p1.cast("ray", { targets: "squire" });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
  return game;
}

describe("Ruling 5ab44419fda825cd — a Zhonya's-saved unit keeps both its buff and Orb of Regret's −1 (until end of turn)", () => {
  test("Zhonya's is killed instead; the Squire is healed, exhausted and recalled to base STILL buffed and STILL at −1 → 3 Might (3 + 1 − 1)", async () => {
    const game = await orbThenLethalRay();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, mightModifier: -1, might: 3 });
    expect(game.p1.trash()).not.toContain("squire");
    expect(game.violations()).toEqual([]);
  });

  test("the Orb's −1 is still only 'this turn': after the turn ends the Squire is 4 again (3 + its buff), the buff persists", async () => {
    const game = await orbThenLethalRay();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("squire")).toMatchObject({ isBuffed: true, mightModifier: 0, might: 4, zone: "base" });
  });
});
