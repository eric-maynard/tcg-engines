/**
 * Ruling 45437c75337982a8 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: Does the Mask trigger more than once a turn if the same unit fights in several combats —
 *    can it collect +2 or more?
 * A: Yes: once per combat, per unit. A unit that attacks alone, conquers, and then attacks alone
 *    again at another battlefield triggers the Mask a second time, and the two "this turn" bonuses
 *    stack (+2 total until end of turn). Two units attacking together are not "alone" and get nothing.
 * Rules: 383.4.e/f (attack/defend triggers fire on GAINING the designation, once per combat),
 *        740.2 (alone), 317.2 ("this turn" effects lapse in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298"; // [Action] "Move a friendly unit and ready it." — the way back out of bf1

/** P1's turn. Mask in P1's base; a 3-Might Runner at home; P2 keeps a 1-Might speed bump on each of two battlefields. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bf1", { might: 1, name: "Bump A" }, "bumpA")
    .unit(P2, "bf2", { might: 1, name: "Bump B" }, "bumpB");
}

/** Attack `bf` alone with the Runner and let the whole combat resolve. */
async function attackAlone(game: Game, bf: string): Promise<void> {
  await game.p1.move("runner", bf);
  expect(game.state("runner").combatRole).toBe("attacker");
  await game.settle();
}

/** Ride the Wind the (exhausted) Runner home and ready it, so it can start a SECOND combat this turn. */
async function rideHome(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "runner" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
    await game.settle();
  }
  expect(game.locationOf("runner")).toBe("base");
  expect(game.state("runner").isReady).toBe(true);
}

describe("Ruling 45437c75337982a8 — the Mask triggers once per combat per unit, and the +1s stack across combats in a turn", () => {
  test("first combat: the lone attacker trips the Mask and is a 4 — it kills the 1-Might defender and conquers bf1", async () => {
    const game = await board().build();
    await attackAlone(game, "bf1");
    expect(game.state("runner").mightModifier).toBe(1);
    expect(game.state("runner").might).toBe(4);
    expect(game.zoneOf("bumpA")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("ruling 45437c75337982a8 — the SAME unit attacking alone again at bf2 later in the turn triggers the Mask a second time: +1 becomes +2 (a 5-Might Runner)", async () => {
    const game = await board().build();
    await attackAlone(game, "bf1");
    await rideHome(game); // out of bf1 and ready for a new combat
    expect(game.state("runner").mightModifier).toBe(1); // still just the first bonus
    await attackAlone(game, "bf2");
    expect(game.state("runner").mightModifier).toBe(2);
    expect(game.state("runner").might).toBe(5);
    expect(game.zoneOf("bumpB")).toBe("trash");
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("both bonuses are 'this turn' and expire together — next turn the Runner is a plain 3 again", async () => {
    const game = await board().build();
    await attackAlone(game, "bf1");
    await rideHome(game);
    await attackAlone(game, "bf2");
    expect(game.state("runner").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("runner").mightModifier).toBe(0);
    expect(game.state("runner").might).toBe(3);
  });

  test("not alone, no trigger: two friendly units attacking one battlefield together get no +1 at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .unit(P1, "base", { might: 2, name: "Escort" }, "escort")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .build();
    await game.p1.move(["runner", "escort"], "bf1");
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("escort").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([]);
    expect(game.state("runner").mightModifier).toBe(0);
    expect(game.state("escort").mightModifier).toBe(0);
  });

  test("each qualifying unit gets its OWN +1: a lone attacker and a lone defender in the same combat both trigger the two players' Masks", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "maskP1")
      .gear(P2, MASK_OF_FORESIGHT, "maskP2")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .build();
    await game.p1.move("runner", "bf1");
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("runner").mightModifier).toBe(1);
    expect(game.state("guard").mightModifier).toBe(1);
  });
});
