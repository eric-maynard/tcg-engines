/**
 * Ruling 9ce21da00f54e69a — Piltover Enforcer (UNL-187 → unl-187-219) · Legend (Vi)
 *     "When you conquer, if you assigned 3 or more excess damage, you may exhaust me to ready a unit."
 *
 * Q: Attacking with a 2-Might unit AND a 3-Might unit into a single 2-Might defender — is that 3 excess damage?
 * A: Yes. Total attacking Might 2 + 3 = 5 is all assigned to the lone defender (no further defenders, 460.2.c.4);
 *    lethal for a 2-Might unit is 2, so excess = 5 − 2 = 3, meeting the "3 or more" threshold — on the conquer the
 *    Enforcer's offer appears and you may exhaust it to ready a unit.
 * Rules: 465.2.c (each side assigns its combat damage; leftover piles onto the last defender), 383.2.a (intervening
 *        "if"), 467 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PILTOVER_ENFORCER = "unl-187-219";

/** P1 (Vi legend) with a 2 and a 3 in base; P2 holds bf1 with a lone defender. */
function board(defenderMight = 2) {
  return scenario()
    .legend(P1, PILTOVER_ENFORCER, "vi")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Two" }, "two")
    .unit(P1, "base", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def");
}

/** Both attackers move in; both pass Focus; the DEFENDER splits its damage (put it on Three so both attackers live). */
async function attackTogether(game: Game): Promise<void> {
  await game.p1.move(["two", "three"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  // P1's 5 has only one place to go (the lone defender) — nothing to ask P1. P2's defender must split ITS damage.
  const d = game.decision() as DistributeDecision;
  expect(d).toMatchObject({ kind: "distribute", seat: P2 });
  expect(d.buckets.map((b) => b.card).toSorted()).toEqual(["three", "two"]);
  await game.p2.distribute({ three: d.total });
}

describe("Ruling 9ce21da00f54e69a — 2 + 3 attacking into a lone 2 assigns 3 excess: Piltover Enforcer's conquer offer appears", () => {
  test("all 5 lands on the 2-Might defender (excess 3): it dies, P1 conquers bf1 for a point, and the Enforcer trigger is on the chain asking yes/no", async () => {
    const game = await board().build();
    await attackTogether(game);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("two")).toBe("battlefield-bf1");
    expect(game.state("three").damage).toBe(0); // 2 non-lethal damage, healed after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("accepting exhausts the legend and readies the chosen unit (either exhausted attacker is offered)", async () => {
    const game = await board().build();
    await attackTogether(game);
    expect(game.state("three").isExhausted).toBe(true);
    await game.p1.yes();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card)).toEqual(expect.arrayContaining(["two", "three"]));
    await game.p1.pick("three");
    await game.settle();
    expect(game.state("three").isReady).toBe(true);
    expect(game.state("two").isExhausted).toBe(true);
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same 2 + 3 into a lone 3-Might defender is only 5 − 3 = 2 excess: conquer and point, but no Enforcer offer", async () => {
    const game = await board(3).build();
    await attackTogether(game);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("vi").isReady).toBe(true);
  });
});
