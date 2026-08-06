/**
 * Whiteflame Protector — ogn-082-298 · Unit · Calm · 8 energy + 2 [calm] · 8 might
 *
 *   When you play me, give a unit +8 [Might] this turn.
 *
 * "a unit": any unit on the board (friendly, enemy, or the Protector itself);
 * the bonus is a turn-scoped Might modification.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const PROTECTOR = "ogn-082-298";

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 2 } })
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "base", { might: 3 }, "foe")
    .hand(P1, PROTECTOR, "wp");
}

/** Play the Protector, let the trigger reach its target prompt, pick `target`, resolve. */
async function playAndBoost(target: string) {
  const game = await board().build();
  await game.p1.play("wp", { to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wp", controller: P1, triggered: true })]);
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "wp" } });
  await game.p1.pick(target);
  await game.settle();
  return game;
}

describe("Whiteflame Protector (ogn-082-298)", () => {
  test("cost: 8 energy + 2 calm deducted; an 8-might unit; unaffordable with 1 calm or 7 energy", async () => {
    const game = await board().build();
    await game.p1.play("wp", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("wp")).toBe("base");
    expect(game.state("wp").might).toBe(8);
    const oneCalm = await scenario().resources(P1, { energy: 8, power: { calm: 1 } }).hand(P1, PROTECTOR, "wp").build();
    expect(oneCalm.p1.can("play", "wp")).toBe(false);
    const sevenEnergy = await scenario().resources(P1, { energy: 7, power: { calm: 2 } }).hand(P1, PROTECTOR, "wp").build();
    expect(sevenEnergy.p1.can("play", "wp")).toBe(false);
  });

  test("play trigger offers every unit on the board (ally, enemy, itself) as the target", async () => {
    const game = await board().build();
    await game.p1.play("wp", { to: "base" });
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys.sort()).toEqual(["ally", "foe", "wp"]);
  });

  test("gives the chosen friendly unit +8 Might", async () => {
    const game = await playAndBoost("ally");
    expect(game.state("ally").might).toBe(10);
    expect(game.state("foe").might).toBe(3);
    expect(game.state("wp").might).toBe(8);
  });

  test("may target an enemy unit, or the Protector itself", async () => {
    const enemy = await playAndBoost("foe");
    expect(enemy.state("foe").might).toBe(11);
    const self = await playAndBoost("wp");
    expect(self.state("wp").might).toBe(16);
  });

  test("'this turn': the bonus is gone on the next turn", async () => {
    const game = await playAndBoost("ally");
    expect(game.state("ally").might).toBe(10);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
