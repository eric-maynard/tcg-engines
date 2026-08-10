/**
 * Ruling 10265de6e97d121f — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · 1+[mind] "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the lethal hit Zhonya's replaces.)
 *
 * Q: When Zhonya's recalls a debuffed unit, does it recover its full Might for the turn?
 * A: No. The recall heals DAMAGE and exhausts the unit; Might reductions (e.g. Stupefy) and other layer alterations stay
 *    on it (rule 453.1: damage/exhausted/buffed status and layer alterations are unaffected by a Recall unless stated).
 * Rules: 453.1, 372 (the replacement does exactly heal / exhaust / recall), 423 (heal = remove damage), 317.2 (expiry).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const STUPEFY = "ogn-095-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with Stupefy (1+[mind]) and Void Seeker (3+[fury]). P1: Guard (3) holding bf1, face-up Zhonya's in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, VOID_SEEKER, "vs");
}

/** Stupefy the Guard (3 → 2), then Void Seeker it: 4 damage is lethal, Zhonya's replaces the death. */
async function debuffThenKill(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("stupefy", { targets: "guard" });
  await game.settle();
  expect(game.zoneOf("stupefy")).toBe("trash");
  expect(game.state("guard")).toMatchObject({ might: 2, mightModifier: -1 });
  await game.p2.cast("vs", { targets: "guard" });
  await game.settle();
  expect(game.zoneOf("vs")).toBe("trash");
  return game;
}

describe("Ruling 10265de6e97d121f — a unit recalled by Zhonya's keeps its debuffs", () => {
  test("Zhonya's replaces the death: the Hourglass is killed instead and the Guard is recalled to base, exhausted, with its damage healed", async () => {
    const game = await debuffThenKill();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("the -1 [Might] from Stupefy is NOT reset by the recall: the Guard is still 2 Might (base 3, modifier -1) this turn", async () => {
    const game = await debuffThenKill();
    expect(game.state("guard")).toMatchObject({ baseMight: 3, might: 2, mightModifier: -1 });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("the debuff expires normally at end of turn — next turn the Guard is back to 3", async () => {
    const game = await debuffThenKill();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("guard")).toMatchObject({ might: 3, mightModifier: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
