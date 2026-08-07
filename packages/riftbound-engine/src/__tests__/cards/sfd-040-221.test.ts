/**
 * Thwonk! — sfd-040-221 · Spell · Calm · 2 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Stun an attacking unit. (It doesn't deal combat damage this turn.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "Attacking" is a designation units only carry during a combat at the contested battlefield
 *     (464.2.c.3, removed at 466.7.a). Outside combat there is NO legal target, so the spell cannot
 *     even be put on the chain (355.8) — including on your own quiet main phase.
 *  2. Action timing inside a showdown = only while YOU hold Focus. The natural caster is the
 *     DEFENDER on the opponent's turn, after the attacker passes Focus; never while the attacker
 *     still holds it, never before the showdown opens on their turn.
 *  3. "An attacking unit" is not "an enemy unit": the attacker may Thwonk their own attacker; the
 *     defender's units, units in bases and units at other battlefields are never offered.
 *  4. Stunned ≠ safe: a stunned unit contributes 0 to combat damage (423.1.b) but still dies to
 *     damage ≥ its full Might (423.1.c). Stun is binary and falls off at end of turn (423.1.a.2).
 *  5. Repeat [2] (820): one chain item, 4 energy total, and per 820.2.a the second execution may
 *     pick a DIFFERENT attacker — that is the whole point of repeating a single-target stun.
 *  6. Deflect on the attacker (Navori Scout) taxes the defender's Thwonk by [rainbow] (809.1.c).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-040-221";
const NAVORI_SCOUT = "sfd-037-221"; // 4-Might Calm unit with [Deflect]

/** P2 (turn player) has attackers in base ready to swing into P1's bf1; P1 holds Thwonk. */
function siege(energy = 2, defenderMight = 2) {
  return scenario()
    .active(P2)
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: defenderMight, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "atkA")
    .unit(P2, "base", { might: 3, name: "Attacker B" }, "atkB")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P2, "bf2", { might: 3, name: "Far Away" }, "far")
    .hand(P1, CARD, "thwonk");
}

describe("Thwonk! (sfd-040-221)", () => {
  test("defender casts it with Focus for 2 energy: the stunned attacker deals no combat damage, the 2-Might defender survives and the attack is recalled", async () => {
    const game = await siege(2).build();
    await game.p2.move("atkA", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("thwonk", { targets: "atkA" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "thwonk", controller: P1, triggered: false })]);
    await game.settle(); // both pass → resolves → focus passes around → combat resolves
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1"); // took 0
    expect(game.state("def").damage).toBe(0);
    expect(game.zoneOf("atkA")).toBe("base"); // 2 damage on a 3-Might unit → survives → recalled (466.1.a.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("atkA").isStunned).toBe(true); // still stunned for the rest of P2's turn
    expect(game.violations()).toEqual([]);
  });

  test("only ATTACKING units are offered: not the defender, not units in a base, not units at another battlefield", async () => {
    const game = await siege(2).build();
    await game.p2.move(["atkA", "atkB"], "bf1");
    await game.p2.passFocus();
    const targets = game.p1.option("cast", "thwonk")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["atkA"], ["atkB"]]));
    expect(targets).toHaveLength(2);
    for (const illegal of ["def", "home", "far"]) {
      const r = await game.p1.try((p) => p.cast("thwonk", { targets: illegal }));
      expect(r.ok).toBe(false);
    }
    expect(game.zoneOf("thwonk")).toBe("hand");
  });

  test("no combat → no attacking unit → not castable at all, even on your own open main phase with plenty of energy (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "theirs")
      .unit(P1, "base", { might: 3 }, "mine")
      .hand(P1, CARD, "thwonk")
      .build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("cast", "thwonk")).toBe(false);
  });

  test("[Action] timing: not on the opponent's turn before the showdown, and not while the attacker still holds Focus", async () => {
    const game = await siege(2).build();
    expect(game.p1.can("cast", "thwonk")).toBe(false); // P2's neutral open state
    await game.p2.move("atkA", "bf1");
    expect(game.actingSeat()).toBe(P2); // attacker gains Focus first (464.2.d)
    expect(game.p1.can("cast", "thwonk")).toBe(false);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "thwonk")).toBe(true);
  });

  test("'an attacking unit' is not 'an enemy unit': the attacker, holding Focus on their own turn, may Thwonk their own attacker", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "def")
      .unit(P1, "base", { might: 3 }, "mine")
      .hand(P1, CARD, "thwonk")
      .build();
    await game.p1.move("mine", "bf1");
    expect(game.p1.option("cast", "thwonk")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["mine"]]);
    await game.p1.cast("thwonk", { targets: "mine" });
    await game.settle();
    // Stunned attacker deals 0; the 2-Might defender deals 2 < 3 → nobody dies → attacker recalled.
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").isStunned).toBe(true);
  });

  test("stunned is not invulnerable (423.1.c): a 5-Might defender still kills the stunned 3-Might attacker and takes nothing back", async () => {
    const game = await siege(2, 5).build();
    await game.p2.move("atkA", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("thwonk", { targets: "atkA" });
    await game.settle();
    expect(game.zoneOf("atkA")).toBe("trash");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: without Thwonk the same 3-vs-2 combat kills the defender and the battlefield falls", async () => {
    const game = await siege(2).build();
    await game.p2.move("atkA", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("stun wears off at end of turn (423.1.a.2): after the attacker's turn ends the unit is no longer stunned", async () => {
    const game = await siege(2).build();
    await game.p2.move("atkA", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("thwonk", { targets: "atkA" });
    await game.settle();
    expect(game.state("atkA").isStunned).toBe(true);
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("atkA").isStunned).toBe(false);
  });

  test("[Repeat] [2]: paying 4 keeps it ONE chain item; the repeat variant is refused with only 3 energy while the plain cast is fine", async () => {
    const game = await siege(4).build();
    await game.p2.move(["atkA", "atkB"], "bf1");
    await game.p2.passFocus();
    await game.p1.cast("thwonk", { repeat: 1, targets: "atkA" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    const poor = await siege(3).build();
    await poor.p2.move(["atkA", "atkB"], "bf1");
    await poor.p2.passFocus();
    const r = await poor.p1.try((p) => p.cast("thwonk", { repeat: 1, targets: "atkA" }));
    expect(r.ok).toBe(false);
    expect(poor.zoneOf("thwonk")).toBe("hand");
    await poor.p1.cast("thwonk", { targets: "atkA" });
    expect(poor.p1.energy()).toBe(1);
  });

  // BUG — expected (820.2 / 820.2.a): with the Repeat cost paid the caster makes a second, possibly
  // different choice at play time, so both attackers can be stunned and the defender takes 0.
  // Actual: the repeat variant only carries one target; a two-target repeat cast is not a legal
  // variant, and the second execution just re-stuns the same unit.
  test.failing("BUG: Repeat should let the second execution choose a DIFFERENT attacking unit (820.2.a) — both attackers stunned, defender unharmed", async () => {
    const game = await siege(4).build();
    await game.p2.move(["atkA", "atkB"], "bf1");
    await game.p2.passFocus();
    await game.p1.cast("thwonk", { repeat: 1, targets: ["atkA", "atkB"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("atkA").isStunned).toBe(true);
    expect(game.state("atkB").isStunned).toBe(true);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
  });

  test("vs Deflect (Navori Scout attacking): the defender must add [rainbow] — refused with no power, paid from any domain when available (809.1.c.1)", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "def")
      .unit(P2, "base", NAVORI_SCOUT, "scout")
      .hand(P1, CARD, "thwonk")
      .build();
    await broke.p2.move("scout", "bf1");
    await broke.p2.passFocus();
    expect((await broke.p1.try((p) => p.cast("thwonk", { targets: "scout" }))).ok).toBe(false);
    const rich = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "def")
      .unit(P2, "base", NAVORI_SCOUT, "scout")
      .hand(P1, CARD, "thwonk")
      .build();
    await rich.p2.move("scout", "bf1");
    await rich.p2.passFocus();
    await rich.p1.cast("thwonk", { targets: "scout" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await rich.settle();
    expect(rich.state("scout").isStunned).toBe(true);
    expect(rich.zoneOf("def")).toBe("battlefield-bf1");
  });

  test("parsed abilities: an Action-timed spell with Repeat {energy:2} whose single effect stuns a unit filtered to state 'attacking'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def?.timing).toBe("action");
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { filter: { state: "attacking" }, type: "unit" }, type: "stun" },
      repeat: { energy: 2 },
      timing: "action",
      type: "spell",
    });
  });
});
