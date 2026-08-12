/**
 * Ruling 84e6c975077e8917 — (general combat damage assignment; no specific card)
 *   Stand-ins: one 8-Might attacker against a 3-Might and a 4-Might defender.
 *
 * Q: Attacking with more Might than the defenders' combined Might, may the attacker pick just one to destroy?
 * A: No. Damage is assigned unit by unit and a unit must be assigned LETHAL damage in full before any is
 *    assigned to another; only the last unit assigned may receive excess. With 8 Might against a 3 and a 4 the
 *    only legal distributions are 3/5 and 4/4 — both kill everything.
 * Rules: 465.2.c (the attacker assigns their summed Might among the enemy units), 465.2.c.3 (lethal in full
 *        before moving on), 465.2.c.4 (no more than lethal unless no units remain to assign to).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's Brute attacks bf1, defended by a 3-Might Small and a 4-Might Big. */
function board(attackerMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P1, "base", { might: attackerMight, name: "Brute" }, "brute")
    .autoProcedures(false);
}

/** With `autoProcedures(false)` the combat procedure is an explicit option; take it while it is offered. */
async function resolveCombatStep(game: Game): Promise<boolean> {
  const combat = game.p1.legal().find((o) => o.verb === "resolveCombat");
  if (!combat) {
    return false;
  }
  await game.p1.choose(combat.key);
  return true;
}

/** Attack and drive the showdown up to the combat-damage assignment. */
async function toAssignment(attackerMight = 8): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p1.move("brute", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  await resolveCombatStep(game);
  return game;
}

/** Finish the combat after the assignment and settle the board. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 4 && (await resolveCombatStep(game)); i++) {
    /* keep taking the procedure until the combat is done */
  }
  await game.settle();
}

describe("Ruling 84e6c975077e8917 — combat damage must be assigned lethally, unit by unit", () => {
  test("the attacker is asked to assign, and the prompt states each defender's lethal amount", async () => {
    const game = await toAssignment();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 8 });
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => [b.card, b.lethal])).toEqual([
        ["small", 3],
        ["big", 4],
      ]);
    }
  });

  test("only two distributions of the 8 exist — 3/5 and 4/4 — and both are lethal to both defenders", async () => {
    const game = await toAssignment();
    const spared = await game.p1.try((p) => p.distribute({ big: 8, small: 0 }));
    expect(spared.ok).toBe(false); // 465.2.c.3 — the Small must be given its 3 before the Big gets any
    const chipped = await game.p1.try((p) => p.distribute({ big: 6, small: 2 }));
    expect(chipped.ok).toBe(false); // 2 is not lethal to a 3-Might unit
    const overkill = await game.p1.try((p) => p.distribute({ big: 3, small: 5 }));
    expect(overkill.ok).toBe(false); // 465.2.c.4 — 5 on the Small leaves the Big short of lethal
  });

  test("3 to the Small and 5 to the Big kills BOTH — the excess rides on the last unit assigned", async () => {
    const game = await toAssignment();
    await game.p1.distribute({ big: 5, small: 3 });
    await finish(game);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the mirror distribution 4 / 4 is equally legal and equally lethal", async () => {
    const game = await toAssignment();
    await game.p1.distribute({ big: 4, small: 4 });
    await finish(game);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
  });

  test("with only 6 Might there IS a choice of who dies: the attacker may leave the Big alive", async () => {
    const game = await toAssignment(6);
    await game.p1.distribute({ big: 3, small: 3 }); // Small dies, Big survives on 3
    await finish(game);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });
});
