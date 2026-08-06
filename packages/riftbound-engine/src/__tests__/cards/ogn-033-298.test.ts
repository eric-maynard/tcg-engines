/**
 * Shakedown — ogn-033-298 · Spell · Fury · 2 energy + 1 [fury]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose an enemy unit. Deal 6 to it unless its controller has you draw 2.
 *
 * "unless its controller has you draw 2": on resolution the targeted unit's
 * controller decides — either the caster draws 2, or the unit is dealt 6.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-033-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7 }, "foe")
    .unit(P2, "base", { might: 2 }, "foeHome")
    .unit(P1, "base", { might: 2 }, "ally")
    .hand(P1, CARD, "sd");
}

/** After Shakedown resolves, P2 must be the one deciding; answer "let them draw" or "take the damage". */
async function opponentChooses(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, letDraw: boolean) {
  const d = game.decision();
  expect(d?.seat).toBe(P2);
  if (d?.kind === "yes-no") {
    await (letDraw ? game.p2.yes() : game.p2.no());
  } else if (d?.kind === "pick") {
    const opt = d.options.find((o) => /draw/i.test(o.label) === letDraw) ?? d.options[letDraw ? 0 : 1];
    await game.p2.pick(opt?.key as string);
  } else {
    throw new Error(`expected a P2 prompt, got ${d?.kind} for ${d?.seat}`);
  }
  await game.settle();
}

describe("Shakedown (ogn-033-298)", () => {
  test("costs 2 energy + 1 fury; only ENEMY units (anywhere) are legal choices", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "sd")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["foeHome"]]));
    const t = await game.p1.try((p) => p.cast("sd", { targets: "ally" }));
    expect(t.ok).toBe(false);
    await game.p1.cast("sd", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("sd")).toBe("chain");
  });

  test("not affordable without 2 energy or without the fury power", async () => {
    const a = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "f").hand(P1, CARD, "sd").build();
    expect(a.p1.can("cast", "sd")).toBe(false);
    const b = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 2 }, "f").hand(P1, CARD, "sd").build();
    expect(b.p1.can("cast", "sd")).toBe(false);
  });

  test("[Reaction] timing: playable on the opponent's turn and onto an existing chain", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "sd")).toBe(false); // rule 316.5.b: not in the opponent's Neutral Open State

    const game = await board().resources(P2, { energy: 1, power: { fury: 1 } }).battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 4 }, "bfAlly").hand(P2, "ogn-009-298", "ray").active(P2).build();
    await game.p2.cast("ray", { targets: "bfAlly" });
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.settle({ maxSteps: 1 }); // P2 passes priority to P1
    expect(game.p1.can("cast", "sd")).toBe(true);
    await game.p1.cast("sd", { targets: "foe" });
    expect(game.chain()).toHaveLength(2);
  });

  test("on resolution the target's controller is asked whether to have the caster draw 2 (the 'unless' choice)", async () => {
    // Expected: after both pass, P2 (foe's controller) gets a prompt. Actual: the parsed
    // ability is a bare `damage 6`, so 6 is dealt with no choice offered.
    const game = await board().build();
    await game.p1.cast("sd", { targets: "foe" });
    await game.settle();
    expect(game.decision()?.seat).toBe(P2);
    expect(["yes-no", "pick"]).toContain(game.decision()?.kind as string);
  });

  test("if the controller declines, the unit is dealt 6", async () => {
    // Expected: P2 refuses to let P1 draw → foe (7 Might) takes 6 and survives; P1 draws nothing.
    const game = await board().build();
    const handBefore = game.p1.hand().length; // includes sd
    await game.p1.cast("sd", { targets: "foe" });
    await game.settle();
    await opponentChooses(game, false);
    expect(game.state("foe").damage).toBe(6);
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
    expect(game.zoneOf("sd")).toBe("trash");
  });

  test("if the controller has the caster draw 2, no damage is dealt", async () => {
    // Expected: P2 opts to let P1 draw 2 → foe undamaged, P1 hand = before - sd + 2.
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("sd", { targets: "foe" });
    await game.settle();
    await opponentChooses(game, true);
    expect(game.state("foe").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.zoneOf("sd")).toBe("trash");
  });
});
