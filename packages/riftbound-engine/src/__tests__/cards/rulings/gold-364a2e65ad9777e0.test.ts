/**
 * Ruling 364a2e65ad9777e0 — Gold (SFD-T03 → sfd-t03) · Gear token
 *   "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: Playing 2v2, can teammates share Gold to pay each other's recycle costs?
 * A: No. Control is never shared in 2v2: each player has their own Rune Pool and controls only their own
 *    cards. You can only activate the Gold tokens YOU control, and the [rainbow] they add goes into your
 *    own pool — a teammate cannot spend it, and you cannot spend theirs.
 * Rules: 484.8.c (control is not shared in 2v2), 136 (a player controls their own objects),
 *        205 / 130 (costs are paid from the paying player's own resources).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

const GOLD = "sfd-t03";

/** A four-seat game. P1 and their partner P3 each control one Gold; nobody has any power banked. */
function board() {
  return scenario({ players: 4 })
    .resources(P1, { energy: 0 })
    .resources(P3, { energy: 0 })
    .gear(P1, GOLD, "goldP1")
    .gear(P3, GOLD, "goldP3");
}

describe("Ruling 364a2e65ad9777e0 — in 2v2 nobody may activate or spend a teammate's Gold", () => {
  test("each Gold is controlled by exactly one seat", async () => {
    const game = await board().build();
    expect(game.state("goldP1")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.state("goldP3")).toMatchObject({ controller: P3, owner: P3 });
    expect(game.p1.gear()).toEqual(["goldP1"]);
  });

  test("ruling: P1 cannot activate the teammate's Gold — it is simply not one of P1's options", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "goldP3")).toBe(false);
    const r = await game.p1.try((p) => p.activate("goldP3"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("goldP3")).toBe("base"); // not killed, not exhausted
    expect(game.state("goldP3").isExhausted).toBe(false);
  });

  test("ruling: activating your OWN Gold adds the [rainbow] to your own pool only — the teammate gains nothing", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "goldP1")).toBe(true);
    await game.p1.activate("goldP1");
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.seat(P3).power("rainbow")).toBe(0);
    expect(game.seat(P2).power("rainbow")).toBe(0);
    expect(game.zoneOf("goldP1")).toBe("gone"); // "Kill this" was part of the cost; a token ceases to exist (186.1)
    expect(game.violations()).toEqual([]);
  });

  test("ruling: a teammate's banked power cannot pay your cost — P3 holding [rainbow] does not make P1's spell castable", async () => {
    const game = await scenario({ players: 4 })
      .resources(P1, { energy: 0 })
      .resources(P3, { energy: 1, power: { rainbow: 1 } })
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Recruit", powerCost: ["rainbow"] }, "recruit")
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("play", "recruit")).toBe(false);
  });
});
