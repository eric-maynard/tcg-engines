/**
 * Cruel Patron — ogn-208-298 · Unit · Order · 4 energy · 6 Might
 *
 *   As an additional cost to play me, kill a friendly unit.
 *
 * Rules: 204.2 / 356.2.a.1 (a MANDATORY additional cost — no "may" — must be paid to play the
 * card at all), 355.10.c (the kill is a cost, not a target), 428.1 (it is a real kill: the unit
 * goes to trash and death triggers fire).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-208-298";
const SENTRY = "ogn-096-298"; // Watchful Sentry: [Deathknell] — Draw 1

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .hand(P1, CARD, "patron")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs");
}

describe("Cruel Patron (ogn-208-298)", () => {
  test("cost: 4 energy, no power, 6 Might; unaffordable with 3 energy even with a unit to kill", async () => {
    const onBoard = await scenario().unit(P1, "base", CARD, "patron").build();
    expect(onBoard.state("patron").might).toBe(6);
    expect(onBoard.state("patron").powerCost).toEqual([]);
    expect(onBoard.state("patron").energyCost).toBe(4);
    const poor = await board(3).build();
    expect(poor.p1.can("play", "patron")).toBe(false);
  });

  test.failing("BUG: playing Cruel Patron kills the chosen friendly unit as an additional cost (4 energy + a kill)", async () => {
    // Expected: play offers a friendly-unit sacrifice (fodder only — never P2's unit); paying it puts
    // fodder in the trash and Cruel Patron in base with 0 energy left.
    // Actual: the card's `effect.additionalCost.kill` shape is not recognised by getOptionalPlayCost,
    // so no sacrifice is asked for and the Patron is played for 4 energy alone.
    const game = await board().build();
    const offered = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice")?.options;
    expect(offered).toEqual(["fodder"]);
    await game.p1.play("patron", { sacrifice: "fodder" });
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test.failing("BUG: the kill is MANDATORY — with no other friendly unit Cruel Patron cannot be played (rule 356.2.a.1)", async () => {
    // Expected: no friendly unit to kill → play is not legal; and with one available there is no
    // variant that skips the kill. Actual: playable with nothing to sacrifice.
    const alone = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "patron").unit(P2, "base", { might: 1 }, "theirs").build();
    expect(alone.p1.can("play", "patron")).toBe(false);
    const game = await board().build();
    const variants = game.p1.option("play", "patron")?.variants ?? [];
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.params.sacrificeId === "fodder")).toBe(true);
  });

  test.failing("BUG: the additional cost is a real kill — sacrificing Watchful Sentry fires its Deathknell (draw 1)", async () => {
    // Expected: Sentry dies to pay the cost → its Deathknell triggers and P1 draws 1. Actual: no kill happens.
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "patron").unit(P1, "base", SENTRY, "sentry").build();
    const before = game.p1.hand().length; // includes patron
    await game.p1.play("patron", { sacrifice: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.hand().length).toBe(before - 1 + 1);
  });
});
