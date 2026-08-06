/**
 * Grand Strategem — ogn-233-298 · Spell (Action) · Order · 6 energy + [order][order][order]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give friendly units +5 [Might] this turn.
 *
 * "friendly units" is selected programmatically (rule 355.10.d) — no targets are chosen.
 * Action (806) + Focus (313/347): during a showdown only the player with Focus may play it.
 */

import { describe, expect, test } from "bun:test";
import type { SeatHandle } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const GRAND_STRATEGEM = "ogn-233-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Home" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Front" }, "front")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 3, name: "TheirHome" }, "theirHome")
    .hand(P1, GRAND_STRATEGEM, "gs");
}

/** Cast with no targets; tolerate the engine's current (wrong) single-target shape by naming "home". */
async function castIt(p: SeatHandle) {
  const r = await p.try((s) => s.cast("gs"));
  if (!r.ok) {
    await p.cast("gs", { targets: "home" });
  }
}

describe("Grand Strategem (ogn-233-298)", () => {
  test("costs 6 energy + 3 order power and goes to trash; +5 is applied as a this-turn modifier", async () => {
    const game = await board().build();
    await castIt(game.p1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.state("home").might).toBe(6);
    expect(game.state("home").baseMight).toBe(1);
  });

  test("ALL friendly units (base and battlefields) get +5 — nothing is targeted, castable even with no units", async () => {
    // Expected: no target prompt; home 1→6 and front 2→7. Actual: parsed as "a friendly unit":
    // the play requires exactly one target and only that unit gets +5.
    const game = await board().build();
    expect((game.p1.option("cast", "gs")?.fields ?? []).filter((f) => f.required)).toEqual([]);
    await game.p1.cast("gs");
    await game.settle();
    expect(game.state("home").might).toBe(6);
    expect(game.state("front").might).toBe(7);
    const empty = await scenario().resources(P1, { energy: 6, power: { order: 3 } }).hand(P1, GRAND_STRATEGEM, "gs").build();
    expect(empty.p1.can("cast", "gs")).toBe(true);
  });

  test("enemy units are unaffected", async () => {
    const game = await board().build();
    await castIt(game.p1);
    await game.settle();
    expect(game.state("foe").might).toBe(3);
    expect(game.state("theirHome").might).toBe(3);
  });

  test("'this turn': the bonus is gone on the next turn", async () => {
    const game = await board().build();
    await castIt(game.p1);
    await game.settle();
    expect(game.state("home").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("home").might).toBe(1);
    expect(game.state("front").might).toBe(2);
  });

  test("not affordable with 2 order power or 5 energy", async () => {
    const lowPower = await board().resources(P1, { energy: 6, power: { order: 2 } }).build();
    expect(lowPower.p1.can("cast", "gs")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 5, power: { order: 3 } }).build();
    expect(lowEnergy.p1.can("cast", "gs")).toBe(false);
  });

  function defended() {
    return scenario()
      .active(P2)
      .resources(P1, { energy: 6, power: { order: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "front")
      .unit(P2, "base", { might: 6 }, "attacker")
      .hand(P1, GRAND_STRATEGEM, "gs");
  }

  test("Action timing: illegal on the opponent's turn outside a showdown; legal once you hold Focus in their showdown", async () => {
    const idle = await board().active(P2).build();
    expect(idle.p1.can("cast", "gs")).toBe(false);
    const game = await defended().build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "gs")).toBe(true);
    await game.p1.cast("gs", game.p1.option("cast", "gs")?.fields.some((f) => f.required) ? { targets: "front" } : {});
    await game.settle();
    // 7-Might defender vs 6-Might attacker: attacker dies, defender survives and keeps bf1.
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("front")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: while the attacker still holds Focus the defender may not play an Action spell (rules 313.1, 347)", async () => {
    // Expected: right after the attack is declared P2 has Focus, so P1 cannot cast yet.
    // Actual: the engine lists playSpell:gs as legal for P1 immediately.
    const game = await defended().build();
    await game.p2.move("attacker", "bf1");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "gs")).toBe(false);
  });
});
