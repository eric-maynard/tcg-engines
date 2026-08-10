/**
 * Ruling 0c3cd636df2a5d1a — Volibear, Imposing (OGN-158 → ogn-158-298) · Champion Unit · Body · 10 Might · [Shield 3] [Tank]
 *   × Carnivorous Snapvine (ogn-149-298) · 6 Might "When you play me, choose an enemy unit at a battlefield. We deal
 *     damage equal to our Mights to each other."
 *
 * Q: When Snapvine deals its damage to Volibear (at a battlefield), does Volibear's Might decrease, or does he stay at
 *    full Might with the damage marked?
 * A: Volibear remains at 10 Might with 6 damage marked. Damage is MARKED on a unit; it never reduces the Might value.
 *    ("Bastion Fortress" from the question is not in this card pool — a plain battlefield is used; the principle is the same.)
 * Rules: 143.3 (units have damage marked on them), 142.4.b / 143.2.a (lethal = marked damage ≥ Might — Might is the
 *        yardstick, not what is reduced), 317.2.c (marked damage heals at end of turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_IMPOSING = "ogn-158-298";
const CARNIVOROUS_SNAPVINE = "ogn-149-298";

/** P2's turn. P1's Volibear (10) holds bf1; P2 has Snapvine in hand with its 5 + [body][body]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { body: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VOLIBEAR_IMPOSING, "voli")
    .hand(P2, CARNIVOROUS_SNAPVINE, "vine");
}

describe("Ruling 0c3cd636df2a5d1a — Snapvine's damage is marked on Volibear; his Might stays 10", () => {
  test("Snapvine is played and its trigger picks Volibear (the only enemy unit at a battlefield): they deal 6 and 10 to each other", async () => {
    const game = await board().build();
    expect(game.state("voli")).toMatchObject({ damage: 0, might: 10 });
    await game.p2.play("vine");
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
      await game.p2.pick("voli");
      await game.settle();
    }
    // Volibear: full Might, damage MARKED
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("voli").might).toBe(10);
    expect(game.state("voli").baseMight).toBe(10);
    expect(game.state("voli").damage).toBe(6);
    expect(game.state("voli").mightModifier).toBe(0);
    // Snapvine took 10 ≥ 6 → dead
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the marked damage matters only against his (unchanged) Might: 6 < 10 so he lives; a further 4 this turn WOULD be lethal — and at end of turn the 6 simply heals off, Might still 10", async () => {
    const game = await board().build();
    await game.p2.play("vine");
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      await game.p2.pick("voli");
      await game.settle();
    }
    expect(game.state("voli")).toMatchObject({ damage: 6, might: 10 });
    await game.advanceTurn(); // → P1's turn; Expiration Step healed everything
    expect(game.state("voli")).toMatchObject({ damage: 0, might: 10 });
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
  });
});
