/**
 * Ruling 1985c6950a8837c2 — En Garde (OGN-046 → ogn-046-298) · Reaction · Calm · [1][calm]
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit
 *      you control there."
 *
 * Q: Does the "only unit you control there" +1 apply to an ATTACKER, given the attacker does not control the
 *    location until after combat?
 * A: Yes. Controlling UNITS and controlling LOCATIONS are separate things. The bonus asks whether the chosen unit
 *    is the only unit YOU control at its location — enemy units standing there (including the battlefield's
 *    controller's defenders) do not count, and who holds the battlefield is irrelevant.
 * Rules: 359 (conditions evaluated on resolution), 323.6 / 190.4 (battlefield control), 740.1.a ("friendly" =
 *        control of the object, not of the location).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";

/**
 * P1's turn. P2 holds bf1 with a lone 4-Might Defender. P1's 3-Might Raider waits in base with En Garde + [1][calm]
 * in hand. (A second P1 unit, Buddy, stays home so it never joins the attack unless a test moves it.)
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Defender" }, "defender")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, EN_GARDE, "engarde");
}

/** Raider (alone) attacks bf1 → showdown opens with P1 holding Focus, P2 still controlling the battlefield. */
async function loneAttackerInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.locationOf("raider")).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacker does NOT control the spot yet
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  return game;
}

describe("Ruling 1985c6950a8837c2 — En Garde's alone bonus counts YOUR units at the location, not control of the location", () => {
  test("premise: while attacking, P1 controls the Raider but P2 still controls bf1 (and P2's Defender is standing there)", async () => {
    const game = await loneAttackerInShowdown();
    expect(game.state("raider").controller).toBe(P1);
    expect(game.state("defender").controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("ruling: En Garde on the lone attacker gives +2 (3 → 5) even though P2 controls the location — the enemy Defender is not a unit P1 controls", async () => {
    const game = await loneAttackerInShowdown();
    await game.p1.cast("engarde", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    expect(game.state("raider").might).toBe(3); // nothing applied while it sits on the chain
    await game.p1.passPriority();
    await game.p2.passPriority(); // En Garde resolves
    expect(game.state("raider")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // still not P1's spot
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("…and the +2 attacker wins the showdown it would otherwise lose: 5 vs the 4-Might Defender ⇒ P1 conquers bf1", async () => {
    const game = await loneAttackerInShowdown();
    await game.p1.cast("engarde", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: bring a SECOND friendly unit along and the attacker is no longer alone there — only +1 (3 → 4)", async () => {
    const game = await board().build();
    await game.p1.move(["raider", "buddy"], "bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["buddy", "raider"]);
    await game.p1.cast("engarde", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(game.state("buddy").might).toBe(2);
  });

  test("control: the same lone unit gets +2 in base too — 'there' is wherever it is, and P1 controls no battlefield at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Defender" }, "defender")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, EN_GARDE, "engarde")
      .build();
    await game.p1.cast("engarde", { targets: "raider" });
    await game.settle();
    expect(game.state("raider")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
