/**
 * Ruling 240f3deeb2a308ca — Fight or Flight (OGN-168 → ogn-168-298) · Chaos · [2] · [Hidden] [Action]
 *   "Move a unit from a battlefield to its base."
 *
 * Q: If the attacking unit is sent back to base during the showdown, does its "When I attack" trigger still occur?
 * A: Yes — the trigger is already on the chain and losing the Attacker designation is immaterial. Only
 *    location-dependent wording is re-read: "here" is checked at RESOLUTION, so a trigger that hits units "here"
 *    now hits units in the base. A trigger with no location reference ("draw 1") resolves normally.
 * Rules: 383 (a queued trigger resolves independently of its source), 359.3.e.5 (targets re-checked on
 *        resolution), 471.2 ("here" = the source's location when the ability resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** 2-Might attacker with "When I attack, draw 1." — no location reference at all. */
const RAIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 2,
  name: "Raider",
  rulesText: "When I attack, draw 1.",
} as const;

/** 2-Might attacker with "When I attack, deal 1 to each other unit here." — location-dependent. */
const ANIVIA = {
  abilities: [
    {
      effect: { amount: 1, target: { excludeSelf: true, location: "here", quantity: "all", type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 2,
  name: "Anivia (test)",
  rulesText: "When I attack, deal 1 to each other unit here.",
} as const;

/** P1's turn. P2 holds bf1 with a 5-Might Guard and a hidden Fight or Flight there. P1 keeps a Squire at home. */
function board(attacker: unknown) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Enemy Reserve" }, "reserve")
    .unit(P1, "base", { might: 4, name: "Squire" }, "squire")
    .unit(P1, "base", attacker as never, "atk")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Attack, then P2 answers the queued attack trigger with the hidden Fight or Flight aimed at the attacker. */
async function attackAndEvict(attacker: unknown): Promise<Game> {
  const game = await board(attacker).build();
  await game.p1.move("atk", "bf1");
  expect(game.state("atk").combatRole).toBe("attacker");
  expect(game.chain().map((c) => c.cardId)).toEqual(["atk"]);
  await game.p1.passPriority();
  await game.p2.reveal("fof");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("atk");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["atk", "fof"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Fight or Flight resolves first
  expect(game.zoneOf("atk")).toBe("base");
  expect(game.state("atk").combatRole).toBeNull(); // no longer an attacker …
  expect(game.chain().map((c) => c.cardId)).toEqual(["atk"]); // … but the trigger is still there
  return game;
}

describe("Ruling 240f3deeb2a308ca — an attack trigger resolves even after the attacker is sent home; only 'here' is re-read", () => {
  test("no location reference ('draw 1'): the trigger resolves normally and P1 draws, though the unit is back in base", async () => {
    const game = await attackAndEvict(RAIDER);
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("atk")).toBe("base");
  });

  test("location-dependent ('each other unit here'): 'here' is the unit's location ON RESOLUTION — the damage lands in P1's base on the Squire, not on the defender at bf1", async () => {
    const game = await attackAndEvict(ANIVIA);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("squire").damage).toBe(1); // "here" = P1's base
    expect(game.state("guard").damage).toBe(0); // the battlefield it left is not "here" any more
    expect(game.state("reserve").damage).toBe(0); // P2's base is a different location
    expect(game.violations()).toEqual([]);
  });

  test("control: undisturbed, the same 'here' trigger hits the defender at the battlefield instead", async () => {
    const game = await board(ANIVIA).build();
    await game.p1.move("atk", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(1);
    expect(game.state("squire").damage).toBe(0);
  });
});
