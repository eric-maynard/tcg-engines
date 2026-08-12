/**
 * Ruling 2d65cb4053a9879f — Deadbloom Predator (OGN-161 → ogn-161-298) · [8][body][body] · 8 Might
 *   "[Deflect] You may play me to an occupied enemy battlefield."
 *
 * Q: When I play Deadbloom Predator straight to an enemy battlefield, can I move readied units out of my
 *    base to join it in the showdown?
 * A: No. The Predator is being PLAYED, not moving — the rule that lets you take several units along
 *    applies to a Standard Move only. The Predator starts the showdown by itself.
 * Rules: 330 (a Standard Move may take several of your units at once), 355.2.a / 419 (playing a unit to a
 *        location is not a move), 323.8 (its arrival contests the battlefield and stages the combat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEADBLOOM_PREDATOR = "ogn-161-298";

/** P1's turn with exactly [8][body][body]; P2 holds bf1 with a 3-Might Sentry; P1 has two ready units in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 4, name: "Buddy A" }, "a")
    .unit(P1, "base", { might: 4, name: "Buddy B" }, "b")
    .hand(P1, DEADBLOOM_PREDATOR, "pred");
}

describe("Ruling 2d65cb4053a9879f — the Predator is played, not moved, so no friends tag along", () => {
  test("ruling: playing it to the enemy bf1 brings nobody — the ready base units stay in base", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["pred"]);
    expect(game.state("a").isReady).toBe(true);
    expect(game.state("b").isReady).toBe(true);
  });

  test("ruling: the showdown starts with the Predator alone as P1's only attacker", async () => {
    const game = await board().build();
    await game.p1.play("pred", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // 8 vs 3
    expect(game.p1.units("bf1")).toEqual(["pred"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a Standard MOVE of the same two base units does take them together", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b"], "bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["a", "b"]);
  });
});
