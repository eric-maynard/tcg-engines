/**
 * Ruling 5e0322260fb84f76 — Get Excited! (OGN-008 → ogn-008-298) · [Action] · [2]+[fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Wind Wall (OGN-064 → ogn-064-298) · [Reaction] "Counter a spell."
 *
 * Q: When Get Excited is countered by Wind Wall, does the discard still happen?
 * A: No. The discard is part of Get Excited's RESOLUTION, not a cost. A cost would already have been paid before it
 *    could be countered; a countered spell never resolves, so nothing is discarded (and no damage is dealt).
 * Rules: 356 (costs are paid during finalization), 412.1.a / 425.1.a (countered → does not resolve, to trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const WIND_WALL = "ogn-064-298";

/** P1's turn. P1: Get Excited + a 4-cost Fodder card in hand, exactly [2]+fury. P2: Wind Wall, exactly [3]+2 calm; Target (5) at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Fodder" }, "fodder")
    .hand(P2, WIND_WALL, "ww");
}

async function castGetExcited(game: Game): Promise<void> {
  await game.p1.cast("ge", { targets: "target" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ge"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // the COST is paid now …
  expect(game.p1.hand()).toEqual(["fodder"]); // … but nothing was discarded: the discard is not a cost
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no discard prompt at play time
}

describe("Ruling 5e0322260fb84f76 — a Wind-Walled Get Excited! discards nothing (the discard is resolution, not cost)", () => {
  test("playing Get Excited pays its cost but asks for no discard — Fodder is still in hand while it sits on the chain", async () => {
    const game = await board().build();
    await castGetExcited(game);
  });

  test("Wind Wall counters it: Get Excited goes to trash unresolved — no discard prompt ever appears, Fodder stays in hand, Target takes no damage", async () => {
    const game = await board().script(P1, [], { strict: true }).build();
    await castGetExcited(game);
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "ge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ge", "ww"]);
    await game.settle(); // strict P1: any discard prompt would throw UNSCRIPTED_DECISION
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.hand()).toEqual(["fodder"]);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.state("target").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-countered, the discard is asked ON RESOLUTION — P1 discards Fodder (cost 4) and Target takes 4", async () => {
    const game = await board().build();
    await castGetExcited(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves now
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["fodder"]);
    await game.p1.pick("fodder");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("target").damage).toBe(4);
    expect(game.zoneOf("ge")).toBe("trash");
  });
});
