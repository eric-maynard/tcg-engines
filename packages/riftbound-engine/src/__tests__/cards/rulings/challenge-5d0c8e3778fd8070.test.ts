/**
 * Ruling 5d0c8e3778fd8070 — Challenge (OGN-128 → ogn-128-298) · Action · [2][body] "Choose a friendly unit and an enemy unit.
 *     They deal damage equal to their Mights to each other."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   (Might reduction below zero supplied by Frigid Touch sfd-066-221, Reaction [2] [Repeat][2] "Give a unit -2 [Might] this turn"
 *    — a Set-2 card with no "to a minimum of 1" clause.)
 *
 * Q: Can Might be reduced to 0 or below, and when does a 0/negative-Might unit die?
 * A: Yes, Might can go to 0 or negative. Negative Might counts as 0 when it is USED (a -2 unit deals 0 damage in Challenge)
 *    but stays negative for arithmetic (Discipline on a -2 unit gives 0, not +2). 0 Might alone is never lethal — the unit
 *    only dies once it also has non-zero damage ≥ its Might.
 * Rules: 140.3 (lethal damage = NON-ZERO damage ≥ Might), 140.2.a / 700 (Might arithmetic; negative treated as 0 when
 *        performing actions), 417.6.b.3 (Challenge: the units deal the damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DISCIPLINE = "ogn-058-298";
const FRIGID_TOUCH = "sfd-066-221";
/** Inline 0-cost Action "Deal 1 to a unit." — the smallest possible non-zero damage. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Ping",
  timing: "action",
};

/**
 * P1's turn. P2's 2-Might Weakling stands at P2's bf1; P1's 3-Might Brawler is in base. P1 holds Frigid Touch (2, Repeat 2),
 * Challenge (2 + body), Discipline (2) and a free Ping, with [8] + [body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Weakling" }, "weakling")
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .hand(P1, FRIGID_TOUCH, "ft")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, PING, "ping");
}

/** Frigid Touch, repeated once, on the 2-Might Weakling: −4 this turn → −2 Might. */
async function weaklingToMinusTwo(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ft", { repeat: 1, targets: "weakling" });
  expect(game.p1.energy()).toBe(4); // 2 + 2 for the repeat
  await game.settle();
  expect(game.zoneOf("ft")).toBe("trash");
  return game;
}

describe("Ruling 5d0c8e3778fd8070 — Might can go to 0 or below; negative acts as 0 but computes as negative; 0 Might alone never kills", () => {
  test("Might CAN be reduced below 1: Frigid Touch ×2 takes the 2-Might Weakling to −2 — and with no damage on it, it does NOT die", async () => {
    const game = await weaklingToMinusTwo();
    expect(game.state("weakling").mightModifier).toBe(-4);
    expect(game.state("weakling").might).toBeLessThanOrEqual(0); // reported as −2 (raw) or 0 (floored) — either way not positive
    expect(game.state("weakling").baseMight + game.state("weakling").mightModifier).toBe(-2); // the calculation value is −2
    expect(game.state("weakling").damage).toBe(0);
    expect(game.zoneOf("weakling")).toBe("battlefield-bf1"); // 0/negative Might with zero damage is not lethal (140.3)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative is 0 for INTERACTION: Challenge (Brawler 3 vs Weakling −2) — the Weakling deals 0 (Brawler unmarked), the Brawler deals 3 and the Weakling, now damaged, dies", async () => {
    const game = await weaklingToMinusTwo();
    await game.p1.cast("challenge", { targets: ["brawler", "weakling"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("brawler").damage).toBe(0); // −2 treated as 0: no damage dealt, certainly no "healing"
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.zoneOf("weakling")).toBe("trash"); // 3 non-zero damage ≥ its Might
    expect(game.violations()).toEqual([]);
  });

  test("negative stays negative for CALCULATION: Discipline (+2) on the −2 Weakling leaves it at exactly 0 Might — not +2 — and it still lives (0 Might, 0 damage); P1 draws 1", async () => {
    const game = await weaklingToMinusTwo();
    const hand = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "weakling" });
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("weakling").mightModifier).toBe(-2); // −4 + 2
    expect(game.state("weakling").might).toBe(0);
    expect(game.zoneOf("weakling")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("a 0-Might unit dies the moment it takes ANY non-zero damage: after Discipline (→ 0 Might), a 1-damage Ping kills it", async () => {
    const game = await weaklingToMinusTwo();
    await game.p1.cast("discipline", { targets: "weakling" });
    await game.settle();
    expect(game.state("weakling").might).toBe(0);
    expect(game.zoneOf("weakling")).toBe("battlefield-bf1");
    await game.p1.cast("ping", { targets: "weakling" });
    await game.settle();
    expect(game.zoneOf("weakling")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("all of it is 'this turn': left alone, the −2 Weakling is a plain 2-Might unit again on the next turn", async () => {
    const game = await weaklingToMinusTwo();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("weakling")).toMatchObject({ might: 2, mightModifier: 0, zone: "battlefield-bf1" });
  });
});
