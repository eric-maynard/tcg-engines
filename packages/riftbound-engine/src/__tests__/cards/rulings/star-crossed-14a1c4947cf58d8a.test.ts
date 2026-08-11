/**
 * Ruling 14a1c4947cf58d8a — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · [3][chaos] · [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: If you Star-Crossed your way out of a showdown, is it still considered a combat?
 * A: Playing Star-Crossed decides nothing about that. Whether there is a combat is decided by the UNITS present at
 *    the battlefield, not by the spells played. Star-Crossed does not end the showdown either — a showdown only
 *    closes when every player passes Focus in a row. So: the spell resolves, the units go home, the showdown keeps
 *    running (players may keep playing spells), and only then does the board decide who won / whether anyone scores.
 * Rules: 348 (a Showdown Closes only when all players pass Focus without acting), 348.1/348.2 (what happens then,
 *        Combat vs Non-Combat), 323.9.a / 323.10 (a Combat is staged/kept by opposing units being present),
 *        466.3.a–d (combat result read off the units remaining), 466.5/466.5.b (control at the end).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/**
 * P1's turn. P2 holds bf1 with Defender A (2) and Defender B (2) and has Star-Crossed + [3][chaos] in hand.
 * P1 has Attacker A (3) and Attacker B (3) in base.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender A" }, "defA")
    .unit(P2, "bf1", { might: 2, name: "Defender B" }, "defB")
    .unit(P1, "base", { might: 3, name: "Attacker A" }, "atkA")
    .unit(P1, "base", { might: 3, name: "Attacker B" }, "atkB")
    .hand(P2, STAR_CROSSED, "sc");
}

/** Both attackers charge bf1 → a COMBAT showdown opens with P1 attacking; P1 passes Focus so P2 may react. */
async function combatShowdown(attackers: readonly string[]): Promise<Game> {
  const game = await board().build();
  await game.p1.move([...attackers], "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({
    attackingPlayer: P1,
    battlefieldId: "bf1",
    defendingPlayer: P2,
    isCombatShowdown: true,
  });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 14a1c4947cf58d8a — Star-Crossed neither ends the showdown nor decides whether there is a combat", () => {
  test("the spell goes on the chain during the showdown and resolves; the showdown is STILL open afterwards and P2 may keep acting (348)", async () => {
    const game = await combatShowdown(["atkA", "atkB"]);
    await game.p2.cast("sc", { targets: ["defA", "atkA"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("defA")).toBe("hand");
    expect(game.zoneOf("atkA")).toBe("hand");
    // The showdown did NOT end just because units left the battlefield.
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("units of both players still remain ⇒ it is still a Combat Showdown, and the combat resolves with the survivors", async () => {
    const game = await combatShowdown(["atkA", "atkB"]);
    await game.p2.cast("sc", { targets: ["defA", "atkA"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(stack(game)[0]?.isCombatShowdown).toBe(true);
    expect(game.p1.units("bf1")).toEqual(["atkB"]);
    expect(game.p2.units("bf1")).toEqual(["defB"]);
    expect(game.state("atkB").combatRole).toBe("attacker");
    expect(game.state("defB").combatRole).toBe("defender");

    await game.settle();
    // Attacker B (3) kills Defender B (2) and survives → P1 takes bf1 and scores it.
    expect(game.zoneOf("defB")).toBe("trash");
    expect(game.zoneOf("atkB")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the return leaves only the ATTACKER's unit there: no combat damage is ever dealt, yet P1 still takes the battlefield when the showdown closes", async () => {
    const game = await combatShowdown(["atkA", "atkB"]);
    // P2 returns its own last defender plus one attacker — one side of the combat is now unrepresented.
    await game.p2.cast("sc", { targets: ["defB", "atkA"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("defB")).toBe("hand");
    expect(game.zoneOf("atkA")).toBe("hand");
    expect(game.p2.units("bf1")).toEqual(["defA"]); // Defender A is still there — still a combat

    await game.settle();
    expect(game.zoneOf("defA")).toBe("trash"); // Attacker B (3) beats Defender A (2)
    expect(game.state("atkB").damage).toBe(0); // healed by the Combat Cleanup after taking 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a lone attacker vs a lone defender, both returned: the showdown still has to be passed out; nobody takes damage, nobody scores, bf1 ends uncontrolled", async () => {
    const game = await combatShowdown(["atkA"]);
    await game.p2.cast("sc", { targets: ["defA", "atkA"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // resolves — bf1 now has defB only (P2's other defender)
    expect(game.zoneOf("defA")).toBe("hand");
    expect(game.zoneOf("atkA")).toBe("hand");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["defB"]);
    // Still open — the spell did not close it (348).
    expect(stack(game)).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });

    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("defB")).toBe("battlefield-bf1");
    expect(game.state("defB").damage).toBe(0); // no combat damage was ever dealt
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // P2 kept what it already held
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // it is P1's turn — P2 does not score on it
    expect(game.violations()).toEqual([]);
  });

  test("emptying the battlefield entirely: no combat result, no score for either player", async () => {
    const game = await scenario()
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Lone Defender" }, "def")
      .unit(P1, "base", { might: 3, name: "Lone Attacker" }, "atk")
      .hand(P2, STAR_CROSSED, "sc")
      .build();
    await game.p1.move("atk", "bf1");
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    await game.p1.passFocus();
    await game.p2.cast("sc", { targets: ["def", "atk"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("def")).toBe("hand");
    expect(game.zoneOf("atk")).toBe("hand");
    expect(stack(game)).toHaveLength(1); // still open

    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
