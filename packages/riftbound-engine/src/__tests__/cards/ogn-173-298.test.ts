/**
 * Ride the Wind — ogn-173-298 · Spell · Chaos · 2 energy + [chaos] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Move a friendly unit and ready it.
 *
 * Rules: 447 (moves by effects; the destination is chosen by the controller), 415 (Ready),
 * 323.9/460 (units of opposing players at a battlefield after a move stage a Combat that
 * begins once the chain is empty).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-173-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Other" }, "other")
    .hand(P1, CARD, "rtw");
}

/** Cast on `ally`, let it resolve and answer the destination prompt with `bf`. */
async function castMovingAllyTo(game: Game, bf: string): Promise<void> {
  await game.p1.cast("rtw", { targets: "ally" });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(`battlefield-${bf}`);
}

describe("Ride the Wind (ogn-173-298)", () => {
  test("costs 2 energy + 1 chaos; only FRIENDLY units are legal targets; goes to trash after resolving", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "rtw")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["other"]]));
    await game.p1.cast("rtw", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("rtw")).toBe("chain");
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
  });

  test("not affordable without the chaos power or with 1 energy", async () => {
    const noChaos = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 1 }, "ally").hand(P1, CARD, "rtw").build();
    expect(noChaos.p1.can("cast", "rtw")).toBe(false);
    const low = await scenario().resources(P1, { energy: 1, power: { chaos: 1 } }).unit(P1, "base", { might: 1 }, "ally").hand(P1, CARD, "rtw").build();
    expect(low.p1.can("cast", "rtw")).toBe(false);
  });

  test("Move: the controller picks a destination and the chosen unit moves there (base → open bf2); others stay", async () => {
    const game = await board().build();
    await castMovingAllyTo(game, "bf2");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.locationOf("other")).toBe("base");
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test.failing("BUG: '...and ready it' — the moved unit ends up ready (415)", async () => {
    // Expected: ally was exhausted, is moved to bf2 and readied by the same spell.
    // Actual: the move happens but the ready step never applies to the moved unit; it stays exhausted.
    const game = await board().build();
    await castMovingAllyTo(game, "bf2");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("ally").isExhausted).toBe(false);
  });

  test.failing("BUG: moving into the enemy-held bf1 stages a Combat that is fought once the spell has resolved (323.9, 460)", async () => {
    // Expected: ally (3) arrives at bf1 facing foe (2) → combat: foe dies, ally holds and conquers bf1.
    // Actual: ally sits at bf1 next to the enemy unit with no showdown/combat; bf1 stays P2's.
    const game = await board().build();
    await castMovingAllyTo(game, "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Action]: castable with Focus in a showdown; not on the opponent's turn in an open state", async () => {
    const game = await board().unit(P1, "base", { might: 1 }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "rtw")).toBe(true);
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "rtw")).toBe(false);
  });
});
