/**
 * Dragon Roost — ven-157-166 · Battlefield
 *
 *   Any player may pay [rainbow][rainbow] as an additional cost to play a Dragon. If they do, they play
 *   it to this battlefield.
 *
 * Rules: 356.2 (optional additional costs are declared and paid as the card is played), 143 / 355 (a
 * unit is normally played to your base or a battlefield you CONTROL — this text overrides the location,
 * not the timing), 190.2 ("being played to a battlefield" you don't control applies Contested → a
 * combat is staged at the next cleanup with the Dragon's controller as attacker), 143.4 (units enter
 * exhausted; an exhausted unit still fights), "Dragon" = the tag (763.1), "any player" = the Roost's
 * controller, its opponent, or nobody's-battlefield alike.
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. The payer need not control the Roost: P1 can drop a Dragon straight onto P2's held Roost; that
 *     contests it and a combat follows once the play has resolved.
 *  2. It is OPTIONAL and ADDITIONAL: not paying plays the Dragon normally (base) for its normal cost;
 *     paying costs the full printed cost PLUS two power.
 *  3. Only Dragons — a non-Dragon never gets the Roost as a destination; a Dragon with only one power
 *     to spare cannot take the option.
 *  4. "Any player" includes the opponent on their own turn, even onto an uncontrolled Roost.
 *  5. Engine status: the VEN set JSON carries `abilities: []` for this card (parseSuccess false), so
 *     every positive clause below is a BUG test; the negative-space tests hold today and must keep
 *     holding once it is implemented.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-157-166";
const MOUNTAIN_DRAKE = "ogn-142-298"; // 9 energy, 10 Might, Dragon, no text
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla non-Dragon unit

/** P1's turn with 9 energy + 2 power and a Mountain Drake in hand; P2 holds the live Roost with a 2-Might Whelp. */
function board(power: Record<string, number> = { rainbow: 2 }) {
  return scenario()
    .resources(P1, { energy: 9, power })
    .battlefield("roost", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "roost", { might: 2, name: "Whelp-Keeper" }, "keeper")
    .hand(P1, MOUNTAIN_DRAKE, "drake");
}

const destinations = (game: Game, seat: "p1" | "p2", card: string): string[] =>
  ((game[seat].option("play", card)?.fields.find((f) => f.arg === "to")?.options as string[] | undefined) ?? []).map((z) =>
    z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z,
  );

describe("Dragon Roost (ven-157-166)", () => {
  test("registry payload — the battlefield must carry an ability for the optional [rainbow][rainbow] Dragon redirect (currently `abilities` is empty)", async () => {
    // Expected: at least one ability mentioning the Dragon tag and an additional/optional cost.
    // Actual: the VEN JSON has abilities: [] (parseSuccess: false).
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Dragon Roost" });
    expect((def?.abilities ?? []).length).toBeGreaterThan(0);
    expect(JSON.stringify(def?.abilities)).toMatch(/dragon/i);
  });

  test("negative space: WITHOUT paying, the Drake is played as usual — to base for exactly 9 energy, power untouched, Roost untouched", async () => {
    const game = await board().build();
    expect(destinations(game, "p1", "drake")).toContain("base");
    await game.p1.play("drake", { to: "base" });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.gameState.battlefields.roost?.controller).toBe(P2);
    expect(game.state("drake")).toMatchObject({ isExhausted: true, might: 10 });
  });

  test("negative space: a NON-Dragon never gets the Roost as a destination, however much power is floating", async () => {
    const game = await board({ rainbow: 4 }).hand(P1, SKULKER, "skulker").build();
    expect(destinations(game, "p1", "skulker")).toEqual(["base"]);
    const r = await game.p1.try((p) => p.play("skulker", { to: "roost" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("skulker")).toBe("hand");
  });

  test("negative space: a Dragon with only ONE power available cannot take the Roost option (the cost is two)", async () => {
    const game = await board({ rainbow: 1 }).build();
    expect(destinations(game, "p1", "drake")).not.toContain("roost");
    const r = await game.p1.try((p) => p.play("drake", { to: "roost" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("drake")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { rainbow: 1 } });
  });

  test("with [rainbow][rainbow] to spare, the enemy-held Roost is offered as a destination for my Dragon", async () => {
    // Expected: playUnit:drake lists "roost" (a battlefield P1 does NOT control) beside "base".
    // Actual: only "base" — the Roost's text is not implemented.
    const game = await board().build();
    expect(destinations(game, "p1", "drake").sort()).toEqual(["base", "roost"]);
    expect(destinations(game, "p1", "drake")).not.toContain("bf2"); // the redirect is to THIS battlefield only
  });

  test("paying it — 9 energy AND both power are taken and the Drake is put onto the Roost (exhausted), not into my base", async () => {
    // Expected: full printed cost + the additional [rainbow][rainbow]; location = roost.
    // Actual: the play to "roost" is not legal at all.
    const game = await board().build();
    await game.p1.play("drake", { to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle({ maxSteps: 2 }); // let the play itself resolve, stop before any combat
    expect(game.locationOf("drake")).toBe("roost");
    expect(game.state("drake").isExhausted).toBe(true);
    expect(game.p1.base()).not.toContain("drake");
  });

  test("landing on P2's Roost contests it — a combat follows in which my 10-Might Drake (attacker) kills the 2-Might keeper and conquers (+1 point)", async () => {
    // Expected (190.2): played-to applies Contested → staged combat → 10 v 2 → keeper dies, P1 controls roost, scores 1.
    // Actual: unreachable — the Dragon cannot be played there.
    const game = await board().build();
    await game.p1.play("drake", { to: "roost" });
    await game.settle();
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.locationOf("drake")).toBe("roost");
    expect(game.gameState.battlefields.roost?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'ANY player' — on P2's turn P2 may pay [rainbow][rainbow] to play its own Dragon onto an UNCONTROLLED Roost (and then takes it)", async () => {
    // Expected: the Roost (controller null, no units) is a legal paid destination for P2's Drake; afterwards P2 controls it.
    // Actual: P2 may only play to base.
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 9, power: { rainbow: 2 } })
      .battlefield("roost", { controller: null, def: CARD, inert: false, owner: P1 })
      .hand(P2, MOUNTAIN_DRAKE, "theirDrake")
      .build();
    expect(destinations(game, "p2", "theirDrake").sort()).toEqual(["base", "roost"]);
    await game.p2.play("theirDrake", { to: "roost" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    await game.settle();
    expect(game.locationOf("theirDrake")).toBe("roost");
    expect(game.gameState.battlefields.roost?.controller).toBe(P2);
  });

  test.failing("BUG: the Roost's controller can use it too — P2 holding the Roost pays the extra two power and the Drake arrives THERE rather than in base", async () => {
    // Expected: even for the controller the paid play lands on the Roost (a normal play there would also be legal —
    // the point is that the PAID variant exists and routes to this battlefield): 9 energy + 2 power spent.
    // Actual: no paid variant; a play to "roost" costs 9 and leaves the power alone.
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 9, power: { rainbow: 2 } })
      .battlefield("roost", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "roost", { might: 2, name: "Whelp-Keeper" }, "keeper")
      .hand(P2, MOUNTAIN_DRAKE, "theirDrake")
      .build();
    await game.p2.play("theirDrake", { payOptional: true, to: "roost" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.locationOf("theirDrake")).toBe("roost");
  });
});
