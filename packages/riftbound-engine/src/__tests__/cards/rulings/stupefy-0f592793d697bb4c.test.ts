/**
 * Ruling 0f592793d697bb4c — Stupefy (OGN-095 → ogn-095-298) × Smoke Screen (OGN-093 → ogn-093-298)
 *                           × Discipline (OGN-058 → ogn-058-298) × Ravenborn Tome (OGN-032 → ogn-032-298)
 *                           (× Rabadon's Deathcrown sfd-191-221 — "Your spells and abilities deal 3 Bonus Damage")
 *   Stupefy: [Reaction] "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   Smoke Screen: [Reaction] "Give a unit -4 [Might] this turn, to a minimum of 1."
 *   Discipline: [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *   Ravenborn Tome: "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage."
 *
 * Q: Does Bonus Damage (Rabadon / Ravenborn Tome) make damage-less spells like Stupefy or Smoke Screen deal
 *    damage to the enemy unit they target?
 * A: No. Bonus Damage increases each instance of damage a spell already deals; it never ADDS a damage
 *    component. Otherwise Discipline would kill your own units. Ravenborn Tome uses the same templating.
 * Rules: 712–715 (Bonus Damage: "each instance of damage … is increased"), 715.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const SMOKE_SCREEN = "ogn-093-298";
const DISCIPLINE = "ogn-058-298";
const RAVENBORN_TOME = "ogn-032-298";
const RABADONS = "sfd-191-221";

/** Inline 1-cost action spell that DOES deal damage (1) — the control for "bonus damage is live". */
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's turn. P1: a 1-Might Page in base, Ravenborn Tome ready; P2: a 6-Might Brute and a 3-Might Grunt at bf1. */
function tomeBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Page" }, "page")
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .gear(P1, RAVENBORN_TOME, "tome")
    .hand(P1, BOLT, "bolt")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, DISCIPLINE, "disc");
}

/** Exhaust the Tome so "the next spell you play this turn deals 1 Bonus Damage" is pending. */
async function primeTome(game: Game): Promise<void> {
  const opt = game.p1.option("activate", "tome");
  const wantsTarget = opt?.fields.some((f) => f.name === "targets" && f.required);
  await game.p1.activate("tome", 0, wantsTarget ? { targets: "tome" } : {});
  await game.settle();
  expect(game.state("tome").isExhausted).toBe(true);
}

/** Same board but the bonus source is Rabadon's Deathcrown worn by the Page. */
function crownBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Page" }, "page", { equippedWith: ["crown"] })
    .card("crown", { def: RABADONS, meta: { attachedTo: "page" }, owner: P1, zone: "base" })
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, BOLT, "bolt")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, DISCIPLINE, "disc");
}

describe("Ruling 0f592793d697bb4c — Bonus Damage never adds a damage component to Stupefy / Smoke Screen / Discipline", () => {
  // ── Ravenborn Tome (implemented bonus-damage source) ────────────────────────────────────────

  test("control: the Tome's bonus is live — a 1-damage spell played next deals 2 to the Brute", async () => {
    const game = await tomeBoard().build();
    await primeTome(game);
    await game.p1.cast("bolt", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(2);
  });

  test("Tome primed, then Stupefy on the enemy Brute: −1 Might this turn (6 → 5), P1 draws 1 — and ZERO damage is dealt", async () => {
    const game = await tomeBoard().build();
    await primeTome(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("stupefy")).toBe("trash");
  });

  test("Tome primed, then Smoke Screen on the 3-Might Grunt: Might floors at 1, no damage, the Grunt is alive at bf1", async () => {
    const game = await tomeBoard().build();
    await primeTome(game);
    await game.p1.cast("smoke", { targets: "grunt" });
    await game.settle();
    expect(game.state("grunt")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" });
    expect(game.p2.trash()).not.toContain("grunt");
  });

  test("the reductio in the ruling: Tome primed, Discipline on my own 1-Might Page — +2 Might (3), draw 1, and it certainly takes no damage / does not die", async () => {
    const game = await tomeBoard().build();
    await primeTome(game);
    await game.p1.cast("disc", { targets: "page" });
    await game.settle();
    expect(game.state("page")).toMatchObject({ damage: 0, might: 3, zone: "base" });
    expect(game.p1.trash()).not.toContain("page");
    expect(game.violations()).toEqual([]);
  });

  // ── Rabadon's Deathcrown (the card the question names) ──────────────────────────────────────

  test("with Rabadon's Deathcrown worn (Page 1+3 = 4): Stupefy, Smoke Screen and Discipline still deal no damage to anything", async () => {
    const game = await crownBoard().build();
    expect(game.state("crown").attachedTo).toBe("page");
    expect(game.state("page").might).toBe(4);
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    await game.p1.cast("smoke", { targets: "grunt" });
    await game.settle();
    await game.p1.cast("disc", { targets: "page" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 5 });
    expect(game.state("grunt")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" });
    expect(game.state("page")).toMatchObject({ damage: 0, might: 6, zone: "base" });
  });

  // rule 715.1 — the Deathcrown's Effect Text ("Your spells and abilities deal 3 Bonus Damage while attached")
  // increases each damage instance, so a 1-damage spell deals 4.
  test("ruling 0f592793d697bb4c — control for the Deathcrown case: its 3 Bonus Damage turns a 1-damage spell into 4", async () => {
    const game = await crownBoard().build();
    await game.p1.cast("bolt", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(4);
  });
});
