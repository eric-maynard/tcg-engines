/**
 * Ruling 9c33a6305e740c2a — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · Action · [Hidden]
 *     "Move a unit from a battlefield to its base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Fight or Flight targets my unit at the battlefield where my Zhonya's is hidden — I would lose the battlefield.
 *    If I react by playing Zhonya's from hidden, where does the Hourglass go?
 * A: A Zhonya's played from hidden is always recalled to its controller's base right after it resolves — whether or
 *    not you go on to lose control of that battlefield.
 * Rules: 811.1.c–d (play from facedown for [0] as a Reaction), 518 / 457.1 (a gear cannot remain at a battlefield —
 *        it is recalled to base), 323 (Cleanup after an item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const ZHONYAS = "ogn-077-298";

/**
 * P1's turn (turn 3, so P2's facedown was hidden on an earlier turn). P2 holds bf1 with a lone Keeper (3) and a
 * facedown Zhonya's there. P1 has Fight or Flight in hand with exactly [2].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** P1 casts Fight or Flight at the Keeper and passes; P2 flips the Hourglass in response. */
async function fofThenFlip(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("fof", { targets: "keeper" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["keeper"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  expect(game.p2.energy()).toBe(0); // played for [0]
  return game;
}

describe("Ruling 9c33a6305e740c2a — a Zhonya's played from hidden goes to base right away, battlefield loss or not", () => {
  test("immediately after the Hourglass resolves (Fight or Flight still pending) it is face up in P2's BASE — not at bf1, not facedown", async () => {
    const game = await fofThenFlip();
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
    expect(game.state("zh")).toMatchObject({ controller: P2, isHidden: false, location: "base", zone: "base" });
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.cardsAt("battlefield-bf1")).toEqual(["keeper"]);
  });

  test("Fight or Flight then resolves: the Keeper is moved home, P2 loses bf1 — and the Hourglass is (still) in P2's base, untouched by the loss of the battlefield", async () => {
    const game = await fofThenFlip();
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("keeper")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2); // control lapsed with no unit left there
    expect(game.state("zh")).toMatchObject({ controller: P2, isHidden: false, zone: "base" });
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.zoneOf("zh")).not.toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control case — battlefield NOT lost (a second defender stays): the flipped Hourglass ends in P2's base all the same", async () => {
    const game = await board().unit(P2, "bf1", { might: 4, name: "Wall" }, "wall").build();
    await game.p1.cast("fof", { targets: "keeper" });
    await game.p1.passPriority();
    await game.p2.reveal("zh");
    expect(game.state("zh").zone).toBe("base");
    await game.settle();
    expect(game.locationOf("keeper")).toBe("base");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("zh")).toMatchObject({ controller: P2, isHidden: false, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
