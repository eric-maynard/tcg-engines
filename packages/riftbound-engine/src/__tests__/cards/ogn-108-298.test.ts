/**
 * Convergent Mutation — ogn-108-298 · Spell · Mind · 2 energy + 1 [mind] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit. This turn, increase its Might to the Might of
 *   another friendly unit.
 *
 * "Increase … to": a one-way, snapshotted arithmetic effect (rule 477.3.b) on the
 * chosen unit only — the reference unit is untouched and nothing ever decreases.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const MUTATION = "ogn-108-298";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit (something for P2 to put on the chain)

function board(active = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", { might: 2 }, "small")
    .unit(P1, "base", { might: 6 }, "big")
    .unit(P2, "base", { might: 9 }, "foe")
    .hand(P1, MUTATION, "cm");
}

/** rule 355.5 — both roles are named as it is played: targets [chosen = small, reference = big]; then it resolves. */
async function castOnSmall(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.cast("cm", { targets: ["small", "big"] });
  expect(game.chain().at(-1)).toMatchObject({ cardId: "cm", targets: ["small", "big"] });
  expect(game.decision()?.kind).toBe("action"); // nothing left to ask
  await game.settle();
}

describe("Convergent Mutation (ogn-108-298)", () => {
  test("cost: 2 energy + 1 mind deducted; resolves to trash; unaffordable without the mind", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["small", "big"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cm", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("cm")).toBe("trash");
    const noMind = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }).unit(P1, "base", { might: 6 }).hand(P1, MUTATION, "cm").build();
    expect(noMind.p1.can("cast", "cm")).toBe(false);
  });

  test("Reaction: playable on the opponent's turn, and in response to their spell on the chain", async () => {
    const theirTurn = await board(P2).build();
    expect(theirTurn.p1.can("cast", "cm")).toBe(false); // rule 316.5.b: not in the opponent's Neutral Open State

    const game = await board(P2).resources(P2, { energy: 8 }).hand(P2, FINAL_SPARK, "spark").build();
    await game.p2.cast("spark", { targets: "big" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "cm")).toBe(true);
    await game.p1.cast("cm", { targets: ["small", "big"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "cm"]); // resolves before Final Spark
  });

  test("rule 355.5 — both role slots are chosen as it is played: one variant per ordered [raised, reference] pair of friendly units, and a play naming none is not legal", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "cm")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(offered).toEqual(expect.arrayContaining([["small", "big"], ["big", "small"]]));
    expect(offered).toHaveLength(2); // never the enemy, never the same unit twice, never a lone unit
    expect((await game.p1.try((p) => p.do("playSpell", { cardId: "cm", playerId: P1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("cm", { targets: ["small", "foe"] }))).ok).toBe(false);
    // "another friendly unit": with a single friendly unit there is no legal pair → not castable (355.8)
    const lone = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", { might: 2 }, "solo").unit(P2, "base", { might: 9 }, "foe").hand(P1, MUTATION, "cm").build();
    expect(lone.p1.can("cast", "cm")).toBe(false);
  });

  test("the caster chooses the friendly unit (and the reference unit) — only friendly units are offered", async () => {
    // Expected: either cast-time targets or a resolution prompt lets P1 choose among small/big (never foe).
    // Actual: no choice is ever presented; the engine auto-pairs two friendly units.
    const game = await board().build();
    const field = game.p1.option("cast", "cm")?.fields.find((f) => f.arg === "targets");
    let offered: string[] = [...new Set((field?.options ?? []).flat() as string[])];
    if (offered.length === 0) {
      await game.p1.cast("cm");
      await game.settle();
      const d = game.decision();
      offered = d?.kind === "pick" && d.seat === P1 ? d.options.map((o) => o.key) : [];
    }
    expect(offered.sort()).toEqual(["big", "small"]);
  });

  test("increases the chosen unit’s Might TO the other unit’s Might; the other unit is unchanged", async () => {
    // Expected: small 2 → 6 this turn, big stays 6. Actual: modelled as a swap — big drops to 2.
    const game = await board().build();
    await castOnSmall(game);
    expect(game.state("small").might).toBe(6);
    expect(game.state("big").might).toBe(6);
    expect(game.state("foe").might).toBe(9);
  });

  test("'this turn': next turn both friendly units are back to their printed Might", async () => {
    const game = await board().build();
    await castOnSmall(game);
    expect(game.state("small").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("small").might).toBe(2);
    expect(game.state("big").might).toBe(6);
  });
});
