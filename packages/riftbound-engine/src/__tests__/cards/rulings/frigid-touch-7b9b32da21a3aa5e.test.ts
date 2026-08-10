/**
 * Ruling 7b9b32da21a3aa5e — Frigid Touch (SFD-066 → sfd-066-221) · Reaction [2] "[Repeat][2] Give a unit -2 [Might] this turn."
 *   × Rocket Barrage (SFD-077 → sfd-077-221) · Action [4][mind] "Choose one — Deal 4 to a unit in a base. · Kill a gear."
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) · 5 Might champion
 *
 * Q: Opponent Rocket Barrages my Yone, Blademaster (4 damage) and then Frigid Touches him (−2 Might). Dead?
 * A: Yes. After the Barrage Yone carries 4 damage at 5 Might → alive. Frigid Touch drops his Might to 3; the 4
 *    marked damage now meets/exceeds his Might, so he is killed (passive kill / lethal-damage check).
 * Rules: 428.1.a.2 (a unit with non-zero damage ≥ its Might is killed), 406 (damage stays marked for the turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_TOUCH = "sfd-066-221";
const ROCKET_BARRAGE = "sfd-077-221";
const YONE_BLADEMASTER = "sfd-116-221";

/** P1's turn with [6]+[mind]. P2's Yone, Blademaster (5) sits undamaged in P2's base. P1 holds both spells. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 1 } })
    .unit(P2, "base", YONE_BLADEMASTER, "yone")
    .hand(P1, ROCKET_BARRAGE, "barrage")
    .hand(P1, FRIGID_TOUCH, "frigid");
}

/** Rocket Barrage, mode "Deal 4 to a unit in a base", on Yone; resolves. */
async function barraged(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("barrage", { mode: 0, targets: "yone" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "barrage", mode: 0, targets: ["yone"] })]);
  await game.settle();
  expect(game.zoneOf("barrage")).toBe("trash");
  return game;
}

describe("Ruling 7b9b32da21a3aa5e — Rocket Barrage (4 dmg) then Frigid Touch (−2 Might) kills a 5-Might Yone", () => {
  test("step 1: Rocket Barrage resolves — Yone has 4 damage marked at 5 Might and is NOT killed", async () => {
    const game = await barraged();
    expect(game.state("yone")).toMatchObject({ damage: 4, might: 5, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("step 2: Frigid Touch resolves — Might 5 → 3 while 4 damage is still marked → 4 ≥ 3, Yone is killed (to P2's trash)", async () => {
    const game = await barraged();
    await game.p1.cast("frigid", { targets: "yone" });
    expect(game.p1.energy()).toBe(0);
    // Nothing changes until it resolves.
    expect(game.state("yone")).toMatchObject({ damage: 4, might: 5, zone: "base" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.zoneOf("yone")).toBe("trash");
    expect(game.state("yone").owner).toBe(P2);
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: Frigid Touch alone (no damage marked) merely leaves Yone at 3 Might this turn — the kill needs the pre-existing 4 damage", async () => {
    const game = await board().build();
    await game.p1.cast("frigid", { targets: "yone" });
    await game.settle();
    expect(game.state("yone")).toMatchObject({ damage: 0, might: 3, zone: "base" });
    await game.advanceTurn();
    expect(game.state("yone").might).toBe(5);
  });
});
