/**
 * Cannon Barrage — ogn-127-298 · Spell · Body · 2 energy + [body]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Deal 2 to all enemy units in combat.
 *
 * Rule 740.2.c — a unit is "in combat" if it is at a battlefield where combat is ongoing and has
 * a combat designation. Rule 355.10.d — "all enemy units in combat" is programmatic, not a
 * choice: nothing is targeted (so no Deflect tax, and the spell needs no target to be played).
 * Rule 813 — Reaction: playable in Closed States / showdowns on any player's turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-127-298";
const POUTY_PORO = "ogn-013-298"; // 2-might Deflect unit

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4 }, "d1")
    .unit(P2, "bf1", { might: 4 }, "d2")
    .unit(P2, "bf2", { might: 4 }, "away")
    .unit(P2, "base", { might: 4 }, "home")
    .unit(P1, "base", { might: 3 }, "attacker")
    .hand(P1, CARD, "barrage");
}

describe("Cannon Barrage (ogn-127-298)", () => {
  test("costs 2 energy + 1 body; unaffordable without the body power", async () => {
    const game = await board().build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("barrage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    const short = await board().resources(P1, { energy: 2, power: { body: 0 } }).build();
    await short.p1.move("attacker", "bf1");
    expect(short.p1.can("cast", "barrage")).toBe(false);
  });

  test.failing("BUG: deals 2 to every enemy unit IN THE COMBAT only — not to enemies at other locations or in base", async () => {
    // Expected (740.2.c): only d1/d2 (defenders at bf1) take 2; "away" (bf2) and "home" (base) take 0.
    // Actual: the parsed effect has no in-combat restriction, so every enemy unit on the board takes 2.
    const game = await board().build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.cast("barrage");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves; showdown still open
    expect(game.chain()).toHaveLength(0);
    expect(game.state("d1").damage).toBe(2);
    expect(game.state("d2").damage).toBe(2);
    expect(game.state("away").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("attacker").damage).toBe(0);
    expect(game.zoneOf("barrage")).toBe("trash");
  });

  test("[Reaction]: the defender may play it on the attacker's turn in response to a chain item; attackers are its 'enemy units in combat'", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .resources(P2, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "defender")
      .unit(P2, "base", { might: 2 }, "a1")
      .unit(P2, "base", { might: 2 }, "a2")
      .hand(P1, CARD, "barrage")
      .hand(P2, CARD, "theirs")
      .build();
    await game.p2.move(["a1", "a2"], "bf1");
    await game.p2.cast("theirs"); // P2 opens a chain during the showdown
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "barrage")).toBe(true); // Closed State, not P1's turn
    await game.p1.cast("barrage");
    expect(game.chain().map((i) => i.cardId)).toEqual(["theirs", "barrage"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Barrage (P1's) resolves first: 2 to each 2-might attacker
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.state("defender").damage).toBe(0);
  });

  test("no choosing: a Deflect unit in combat is hit without any extra power being paid (355.10.d)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .unit(P1, "base", { might: 1 }, "attacker")
      .hand(P1, CARD, "barrage")
      .build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("barrage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("wall").damage).toBe(2);
  });

  test.failing("BUG: outside combat it is still playable (nothing is targeted, 355.10.d) and damages nobody", async () => {
    // Expected: legal to cast in Neutral Open with no combat; resolves with no enemy unit damaged.
    // Actual: castable, but it deals 2 to every enemy unit on the board.
    const game = await board().build();
    expect(game.p1.can("cast", "barrage")).toBe(true);
    await game.p1.cast("barrage");
    await game.settle();
    for (const u of ["d1", "d2", "away", "home"]) {
      expect(game.state(u).damage).toBe(0);
    }
    expect(game.zoneOf("barrage")).toBe("trash");
  });
});
