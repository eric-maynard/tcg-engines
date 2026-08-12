/**
 * Ruling eb6bbaf0bfcd12ac — Mask of Foresight (OGN-060 → ogn-060-298) · gear · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: Does Mask of Foresight have to be attached to something, or exhausted, to be used?
 * A: No. It is a plain triggered ability on a gear you control: it fires by itself whenever a friendly unit attacks
 *    or defends ALONE, as often as that happens. The gear is never attached and never taps.
 * Rules: 383 (triggered abilities need no activation), 204 (a cost only exists where the card prints one), 828 (Equipment attach — Mask is not one).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK = "ogn-060-298";

/** P1's turn. P1 owns the Mask; P2 holds bf1 with a 5-Might defender; P1 has two attackers in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .gear(P1, MASK, "mask")
    .unit(P2, "bf1", { might: 5, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 2, name: "Solo" }, "solo")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy");
}

async function attackAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("solo", "bf1");
  await game.settle({ maxSteps: 2 });
  return game;
}

describe("Ruling eb6bbaf0bfcd12ac — Mask of Foresight is an unattached, untapped triggered gear", () => {
  test("the Mask sits in play attached to nothing and ready — no equip, no exhaust", async () => {
    const game = await board().build();
    expect(game.state("mask")).toMatchObject({ attachedTo: undefined, cardType: "gear", isExhausted: false });
    expect(game.state("mask").attachments).toEqual([]);
    expect(game.p1.gear()).toEqual(["mask"]);
  });

  test("a friendly unit attacking ALONE gets +1 Might, and the Mask is still unattached and ready afterwards", async () => {
    const game = await attackAlone();
    expect(game.state("solo").might).toBe(3);
    expect(game.state("mask")).toMatchObject({ attachedTo: undefined, isExhausted: false });
  });

  test("it fires again for a friendly unit DEFENDING alone on the opponent's turn — no once-per-turn, no tap", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .active(P2)
      .gear(P1, MASK, "mask")
      .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle({ maxSteps: 2 });
    expect(game.state("warden").might).toBe(3);
    expect(game.state("mask")).toMatchObject({ attachedTo: undefined, isExhausted: false });
  });

  test("with two friendly units at the battlefield nobody is 'alone', so nothing triggers", async () => {
    const game = await board().build();
    await game.p1.move(["solo", "buddy"], "bf1");
    await game.settle({ maxSteps: 2 });
    expect(game.state("solo").might).toBe(2);
    expect(game.state("buddy").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
