/**
 * Ruling 7b851930d12bb503 — Zenith Blade (OGN-262 → ogn-262-298) · Spell · Calm/Order · [3][rainbow][rainbow] · [Action]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *
 * Q: A unit moves to an UNCONTROLLED battlefield; during the resulting non-combat showdown the opponent moves a
 *    unit in with Zenith Blade. Who is attacker and who is defender in the combat that follows?
 * A: The player who applied Contested first (the one who moved in first) is the ATTACKER; the one whose unit
 *    arrived second is the DEFENDER — even though neither controlled the battlefield. This "active defense" is
 *    the only way to defend, and to conquer on defence, at a battlefield you do not control. The combat cannot
 *    start inside the existing non-combat showdown; it begins after that showdown ends.
 * Rules: 340 / 429.1 (contesting opens a showdown), 464.2.c.3 (attacker = who applied Contested, defender = the
 *        other), 345 (a showdown closes on passed Focus), 466.5 (combat resolution establishes control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";

/** P1's turn, bf1 open and empty. P1's Vanguard (5) is in base; P2 has a Bulwark (6) and Zenith Blade + [3][rainbow][rainbow]. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 5, name: "Vanguard" }, "van")
    .unit(P2, "base", { might: 6, name: "Bulwark" }, "bul")
    .hand(P2, ZENITH_BLADE, "zenith");
}

/** P1 walks into the open bf1 (non-combat showdown, P1 contesting) and passes Focus to P2. */
async function p1ContestsFirst(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("van", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.state("van").combatRole).toBeNull(); // nobody to fight yet — this is a NON-combat showdown
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 7b851930d12bb503 — active defense: the first contester is the attacker, the arriving unit is the defender", () => {
  test("P2 answers inside the non-combat showdown with Zenith Blade: P1's Vanguard is stunned and P2's Bulwark walks into bf1", async () => {
    const game = await p1ContestsFirst();
    expect(game.p2.can("cast", "zenith")).toBe(true);
    await game.p2.cast("zenith", { targets: ["van", "bul"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Zenith Blade resolves
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // where the friendly unit is moved to
    await game.p2.pick("battlefield-bf1");
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.state("van").isStunned).toBe(true);
    expect(game.locationOf("bul")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // still nobody's
  });

  test("the roles are assigned by who applied Contested first: P1 (who moved in first) is the ATTACKER, P2's late arrival is the DEFENDER — at a battlefield neither controls", async () => {
    const game = await p1ContestsFirst();
    await game.p2.cast("zenith", { targets: ["van", "bul"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("battlefield-bf1");
    expect(game.state("van").combatRole).toBe("attacker"); // P1 moved in first
    expect(game.state("bul").combatRole).toBe("defender"); // P2 arrived second
    expect(game.gameState.battlefields.bf1).toMatchObject({ contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(0); // nothing was conquered inside the non-combat showdown
  });

  test("resolution: the stunned attacker deals nothing, the defending Bulwark kills it — so P2 conquers ON DEFENCE and scores, at a battlefield P2 never controlled", async () => {
    const game = await p1ContestsFirst();
    await game.p2.cast("zenith", { targets: ["van", "bul"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("van")).toBe("trash"); // 6 combat damage on a 5-Might unit
    expect(game.state("bul").damage).toBe(0); // the stunned attacker dealt none
    expect(game.locationOf("bul")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — P2 stays home: P1's lone unit closes the non-combat showdown and conquers bf1 itself", async () => {
    const game = await p1ContestsFirst();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("bul")).toBe("base");
  });
});
