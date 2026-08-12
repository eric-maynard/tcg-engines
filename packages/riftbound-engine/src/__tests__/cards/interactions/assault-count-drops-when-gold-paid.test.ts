/**
 * Interaction: Repair Specialist (ven-076-166) 3 Might, "I have [Assault] equal to the number of
 *     gear you control."
 *   × Gold (sfd-t03, gear token) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Counter Strike (sfd-194-221) "[Reaction] Choose a unit. The next time that unit would be
 *     dealt damage this turn, prevent it. Draw 1." — 2 energy + [rainbow]
 *   × Horns of the Dragon (ven-118-166) 6 Might, [Tank]
 *
 * Question: P1 attacks a lone [Tank] Horns with the Specialist while controlling three Golds and
 * wants Counter Strike on its own attacker. Does WHERE the [rainbow] comes from decide the
 * battlefield? Killing two Golds as the cost drops the gear count 3 → 1 before combat damage is
 * summed; paying from the rune pool keeps all three.
 *
 * Rules: 465.2 / 465.2.a (the damage step sums each unit's CURRENT Might — nothing is snapshotted
 * when the combat showdown opened at 464.2), 465.2.c.3 / .c.4 / .c.10 (assignment: lethal on one
 * unit before starting another, never more than the minimum while another has none, a unit assigned
 * less than lethal still deals all of its damage), 465.3 (the damage step's tasks are consecutive
 * outstanding tasks — no FEPR between them, and outstanding tasks are cancelled when combat ends),
 * 466.1.a.1 (heal all damage in the Combat Cleanup), 466.1.a.2 (recall the attackers when defenders
 * remain), 466.3.a / 466.3.d (one player left with units = they won; both = No Result), 466.5.d
 * (the winner Establishes Control ⇒ Conquer), 807.1.c ([Assault] is +1 Might per instance while
 * attacking), 815.1.b ([Tank] must be assigned combat damage first).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REPAIR_SPECIALIST = "ven-076-166";
const HORNS_OF_THE_DRAGON = "ven-118-166";
const COUNTER_STRIKE = "sfd-194-221";
const GOLD = "sfd-t03";

/**
 * P2 holds bf1 with a lone 6-Might [Tank]. P1's 3-Might Specialist waits in base with exactly three
 * Gold gear tokens, and holds two Counter Strikes. `pool` is P1's rune pool: with no `rainbow` in
 * it the only way to pay Counter Strike's [rainbow] pip is to kill Golds.
 */
function board(pool: { energy: number; power?: Record<string, number> }, opts: { auto?: boolean } = {}) {
  let s = scenario();
  if (opts.auto === false) {
    s = s.autoProcedures(false);
  }
  return s
    .resources(P1, pool)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", HORNS_OF_THE_DRAGON, "horns")
    .unit(P1, "base", REPAIR_SPECIALIST, "spec")
    .gear(P1, GOLD, "g1")
    .gear(P1, GOLD, "g2")
    .gear(P1, GOLD, "g3")
    .hand(P1, COUNTER_STRIKE, "cs")
    .hand(P1, COUNTER_STRIKE, "cs2");
}

describe("Repair Specialist × Gold × Counter Strike × Horns of the Dragon", () => {
  test("[Assault] is a live passive: three gear ⇒ 3 + 3 = 6 the moment the Specialist becomes an attacker (807.1.c)", async () => {
    const game = await board({ energy: 4 }).build();
    expect(game.state("spec").might).toBe(3); // in base it is not an attacker
    expect(game.state("spec").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 3 }]);

    await game.p1.move("spec", "bf1");
    expect(game.state("spec").combatRole).toBe("attacker");
    expect(game.state("spec").might).toBe(6);
  });

  test(
    "killing Golds as a cost must drop [Assault] at once — 465.2 sums CURRENT Might and nothing is snapshotted at 464.2",
    async () => {
      // Expected: each Gold killed to pay a cost lowers "the number of gear you control" the instant
      // it is paid, so the attacking Specialist reads 5 after one Gold and 4 after two.
      // Actual: the granted [Assault] value is only recomputed at the next static recalculation (the
      // spell it paid for resolving), so it still reads 6 while the gear is already gone.
      const game = await board({ energy: 4 }).build();
      await game.p1.move("spec", "bf1");

      await game.p1.activate("g1");
      expect(game.p1.gear()).toEqual(["g2", "g3"]);
      expect(game.state("spec").might).toBe(5);

      await game.p1.activate("g2");
      expect(game.p1.gear()).toEqual(["g3"]);
      expect(game.state("spec").might).toBe(4);
    },
  );

  test("(a) paying with two Golds: the Specialist is 4 at the damage step, Horns is marked 4, survives and is healed — Counter Strike blanks its 6, No Result, P2 keeps bf1", async () => {
    const game = await board({ energy: 4 }, { auto: false }).build();
    await game.p1.move("spec", "bf1");
    await game.p1.activate("g1"); // kill Gold → [Add] [rainbow]
    await game.p1.activate("g2");
    await game.p1.cast("cs", { targets: "spec" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    // The gear count is 1 by the time the chain has emptied: 3 + Assault 1 = 4 attacking.
    expect(game.p1.gear()).toEqual(["g3"]);
    expect(game.state("spec").might).toBe(4);

    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.state("spec").might).toBe(4); // what 465.2.a sums

    await game.p1.choose("resolveFullCombat");

    // 815.1.b — all 4 goes to the lone [Tank]; 4 < 6 so Horns lives and 466.1.a.1 heals it to 0.
    expect(game.zoneOf("horns")).toBe("battlefield-bf1");
    expect(game.state("horns").damage).toBe(0);
    // Counter Strike prevents Horns' whole 6, so the Specialist takes nothing …
    expect(game.state("spec").damage).toBe(0);
    // … and, defenders remaining, it is recalled at 466.1.a.2 ⇒ 466.3.d No Result.
    expect(game.zoneOf("spec")).toBe("base");
    expect(game.locationOf("spec")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) control — the same 4-Might attack WITHOUT Counter Strike: Horns' 6 kills the Specialist, so the prevention is what saved it", async () => {
    const game = await board({ energy: 4 }).build();
    await game.p1.move("spec", "bf1");
    await game.p1.activate("g1");
    await game.p1.activate("g2");
    await game.p1.passFocus();
    await game.p2.passFocus();

    expect(game.zoneOf("spec")).toBe("trash");
    expect(game.zoneOf("horns")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("(a) the assignment is forced, not a Decision: one [Tank] defender leaves exactly one legal line (465.2.c.3/.c.4, 815.1.b)", async () => {
    const game = await board({ energy: 4 }, { auto: false }).build();
    await game.p1.move("spec", "bf1");
    await game.p1.activate("g1");
    await game.p1.activate("g2");
    await game.p1.passFocus();
    await game.p2.passFocus();

    await game.p1.choose("resolveFullCombat");
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.zoneOf("horns")).toBe("battlefield-bf1");
  });

  test("(b) paying from the rune pool keeps all three Golds: the Specialist is 6, Horns takes exactly lethal and dies, and P1 conquers bf1 for a point (466.3.a / 466.5.d)", async () => {
    const game = await board({ energy: 2, power: { rainbow: 1 } }, { auto: false }).build();
    await game.p1.move("spec", "bf1");
    await game.p1.cast("cs", { targets: "spec" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.p1.gear()).toEqual(["g1", "g2", "g3"]);
    expect(game.state("spec").might).toBe(6);

    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.p1.choose("resolveFullCombat");

    expect(game.zoneOf("horns")).toBe("trash"); // 6 assigned to a 6-Might [Tank] is lethal
    // No defender remains ⇒ the attacker is NOT recalled (466.1.a.2) and Horns' prevented 6 does nothing.
    expect(game.zoneOf("spec")).toBe("battlefield-bf1");
    expect(game.state("spec").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) there is no window once the showdown closes: the last focus pass runs the whole combat, so the second Counter Strike is still in hand with the damage already dealt (465.3)", async () => {
    const game = await board({ energy: 4 }).build();
    await game.p1.move("spec", "bf1");
    await game.p1.activate("g1");
    await game.p1.activate("g2");
    await game.p1.cast("cs", { targets: "spec" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    // Mid-showdown P1 still holds focus windows — this is the LAST legal moment to act.
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cs2")).toBe(true);

    // 465.2.c/.d are consecutive outstanding tasks and 465.3 skips the FEPR: passing focus resolves
    // assignment, dealing and the Resolution Step in one uninterrupted step.
    const closing = await game.p1.passFocus();
    expect(closing.executed.map((e) => e.moveId)).toEqual(["passShowdownFocus", "resolveFullCombat"]);
    expect(game.p1.hand()).toContain("cs2");
    expect(game.zoneOf("spec")).toBe("base");
    expect(game.zoneOf("horns")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
