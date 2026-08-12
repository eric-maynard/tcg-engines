/**
 * Ruling 1d48a08b476ab235 — Fight or Flight (OGN-168 → ogn-168-298) · Chaos · [2] · [Hidden] [Action]
 *   "Move a unit from a battlefield to its base."
 *
 * Q: A unit attacks and its "When I attack" trigger goes on the chain; Fight or Flight is used in response to
 *    pull a unit out of the battlefield. Does combat still resolve, and do damaged units still heal?
 * A: Yes. Combat does not fizzle once initiated — it runs through all its steps even when one or both sides
 *    have no unit left there, and the Combat Cleanup heals ALL units in play, not just those at that battlefield.
 * Rules: 466.1.a.1 (Combat Cleanup inserts "Heal all Units"), 466.3.a–d (combat result), 460 (combat steps).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** 2-Might attacker with "When I attack, draw 1." */
const RAIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 2,
  name: "Raider",
  rulesText: "When I attack, draw 1.",
} as const;

/**
 * P1's turn. P2 holds bf1 with a 3-Might Guard and a hidden Fight or Flight there. Damaged bystanders sit
 * elsewhere: P1's Veteran (2 damage) in base, P2's Sentry (1 damage) at bf2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 4, name: "Sentry" }, "sentry", { damage: 1 })
    .unit(P1, "base", { might: 5, name: "Veteran" }, "veteran", { damage: 2 })
    .unit(P1, "base", RAIDER, "raider")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, FIGHT_OR_FLIGHT, "fof2")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** The Raider attacks bf1; its "When I attack" trigger is on the chain. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.chain().map((c) => c.cardId)).toEqual(["raider"]);
  expect(game.state("veteran").damage).toBe(2);
  expect(game.state("sentry").damage).toBe(1);
  return game;
}

describe("Ruling 1d48a08b476ab235 — combat runs to the end (and heals every unit) even after Fight or Flight empties the battlefield", () => {
  test("P2 answers the attack trigger with the hidden Fight or Flight, sending the attacker home for [0]", async () => {
    const game = await attack();
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("raider");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["raider", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves first (LIFO)
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.locationOf("guard")).toBe("bf1");
  });

  test("ruling: with no attacker left the combat still resolves — and the Combat Cleanup heals BOTH damaged bystanders, at P1's base and at bf2", async () => {
    const game = await attack();
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("raider");
    }
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    // Combat did not fizzle: the Combat Cleanup's "Heal all Units" ran, everywhere.
    expect(game.state("veteran").damage).toBe(0);
    expect(game.state("sentry").damage).toBe(0);
    expect(game.state("guard").damage).toBe(0);
    // The attack trigger still resolved (see ruling 240f3deeb2a308ca) — P1 drew.
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the defender was the only side left
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected (466.1.a.1): the combat still reaches its Resolution Step and its Combat Cleanup heals all units.
  // Actual: with no unit left on either side the engine short-circuits combat resolution, so the damaged
  // bystanders keep their damage (the Veteran stays on 2).
  test("ruling 1d48a08b476ab235 — with BOTH sides pulled out the engine skips the Combat Cleanup, so damaged units elsewhere are not healed", async () => {
    const game = await attack();
    // Let only the attack trigger resolve; the showdown then opens with P1 on focus.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    await game.p1.cast("fof2", { targets: "guard" }); // Action speed, P1 holds focus in the showdown
    await game.p1.passPriority();
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("raider");
    }
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("veteran").damage).toBe(0);
    expect(game.state("sentry").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no Fight or Flight at all the same attack is an ordinary combat — and the bystanders heal there too", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 ≥ 2
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 2 < 3, then healed
    expect(game.state("veteran").damage).toBe(0);
    expect(game.state("sentry").damage).toBe(0);
  });
});
