/**
 * Ruling 1bb6bb386306ea47 — Noxian Guillotine (OGN-254 → ogn-254-298) · Fury/Order Action spell · [4][rainbow]
 *   "Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead."
 *
 * Q: A 5-Might defender is marked by Guillotine's non-Legion effect (dies to the next damage) and blocks
 *    alongside a second defender. May the attacker assign just 1 to the marked unit and the rest elsewhere?
 * A: No. Lethal damage for ASSIGNMENT is the unit's Might (5), not what an effect would make fatal. The
 *    mark does not lower the assignment threshold, so 5 must be assigned to it before any other defender.
 *    (The mark still works: whatever damage does land kills it.)
 * Rules: 465.2.c.2 (lethal = damage equalling/exceeding Might), 465.2.c.3 (lethal in full before the next
 *        unit), 465.2.c.4 (no overkill while another unit lacks lethal), 142.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_GUILLOTINE = "ogn-254-298";

/**
 * P1's turn, nothing played yet (so Guillotine takes its NON-Legion branch).
 * P2 holds bf1 with Shen (5 Might) and a 3-Might Squire. P1 has a 2-Might attacker and [4] + 1 rainbow.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Shen" }, "shen")
    .unit(P2, "bf1", { might: 3, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 2, name: "Raider" }, "atk")
    .hand(P1, NOXIAN_GUILLOTINE, "guillotine");
}

/** Guillotine marks Shen (no Legion ⇒ "kill it the next time it takes damage"), then the Raider attacks bf1. */
async function markAndAttack(withGuillotine = true): Promise<Game> {
  const game = await board().build();
  if (withGuillotine) {
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0); // Legion NOT satisfied
    await game.p1.cast("guillotine", { targets: "shen" });
    await game.settle();
    expect(game.zoneOf("guillotine")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1"); // not killed now
    expect(game.state("shen").damage).toBe(0);
  }
  await game.p1.move("atk", "bf1");
  expect(game.state("atk").combatRole).toBe("attacker");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 1bb6bb386306ea47 — a Guillotine mark does not lower the LETHAL threshold for combat damage assignment", () => {
  test("the attacker is asked to assign its 2 damage, and the marked 5-Might Shen's bucket still reports lethal 5 (not 1)", async () => {
    const game = await markAndAttack();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 2 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal])) : {};
    expect(lethal).toMatchObject({ shen: 5, squire: 3 });
  });

  test("ruling: '1 on the marked Shen (enough to kill it), the rest on the Squire' is ILLEGAL — 1 is not lethal for a 5-Might unit, so damage may not move on to another defender", async () => {
    const game = await markAndAttack();
    expect((await game.p1.try((p) => p.distribute({ shen: 1, squire: 1 }))).ok).toBe(false);
    // Still waiting for a legal assignment; nothing has been dealt.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 2 });
    expect(game.state("shen").damage).toBe(0);
    expect(game.state("squire").damage).toBe(0);
  });

  test("control: the same split is illegal WITHOUT any Guillotine mark — the rule is about Might, not about the mark", async () => {
    const game = await markAndAttack(false);
    expect((await game.p1.try((p) => p.distribute({ shen: 1, squire: 1 }))).ok).toBe(false);
  });

  test("legal instead: all 2 onto the marked Shen — the mark then kills it even though 2 < 5 Might, and the Squire is untouched", async () => {
    const game = await markAndAttack();
    await game.p1.distribute({ shen: 2, squire: 0 });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("trash"); // Guillotine's replacement, not lethal Might
    expect(game.state("squire")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("atk")).toBe("trash"); // 8 defender Might vs a 2-Might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("legal instead: all 2 onto the un-marked Squire — Shen survives untouched, the mark is simply never triggered", async () => {
    const game = await markAndAttack();
    await game.p1.distribute({ shen: 0, squire: 2 });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("battlefield-bf1"); // 2 < 3 Might, healed in the Combat Cleanup
    expect(game.state("squire").damage).toBe(0);
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
