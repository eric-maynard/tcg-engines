/**
 * Twilight Step — ven-105-166 · Spell · Chaos · 2 energy + [chaos] · (no [Action]/[Reaction])
 *
 *   Move a unit with 3 [Might] or less.
 *   [Flow] [4][chaos] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Rules: 449/449.1 (a spell may Move a unit; the spell states the destination limits — none here,
 * so any other location: its controller's base or a battlefield), 446.3.c (an effect-move is not
 * the Standard Move: no exhaust cost, an exhausted unit can be moved), 450 (destination becomes
 * contested → showdown / combat via the following cleanup), 190.4.c (a player with no units left at
 * a battlefield loses control of it at the next cleanup), 829 (Flow: alternate cost from trash,
 * then banished; timing unchanged), standard timing (your turn, Neutral Open only).
 *
 * Head-judge checklist for THIS card:
 *  1. "3 [Might] or less" is EFFECTIVE Might at play time: a 4-Might unit, or a 3-Might unit buffed
 *     to 4, is not a legal choice; a damaged 3-Might unit still is (damage does not lower Might).
 *  2. "a unit" — friendly OR enemy. Sending the lone enemy defender home strips P2's control of that
 *     battlefield at the next cleanup (190.4.c); the moved unit is NOT exhausted by this.
 *  3. Friendly exhausted 3-drop stepped onto an open battlefield → showdown → conquer for a point.
 *  4. Stepping into an enemy-held battlefield is a real attack: combat resolves with the mover as
 *     attacker.
 *  5. Flow: from trash only for [4][chaos], resolves fully, then BANISHED (cannot Flow twice); a
 *     hand-cast copy goes to the trash and becomes a Flow candidate.
 *  6. Timing: not with Focus in a showdown (hand or Flow), not on the opponent's turn; no unit ≤3 on
 *     the board → not castable at all.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-105-166";

function board(energy = 2, chaos = 1) {
  return scenario()
    .resources(P1, { energy, power: { chaos } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Duskrunner" }, "small", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "foe")
    .hand(P1, CARD, "ts");
}

const targetsOf = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, card = "ts") =>
  (game.p1.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options ?? []).map((o) => (o as string[])[0]).sort();

describe("Twilight Step (ven-105-166)", () => {
  test("registry payload should carry the '3 [Might] or less' filter on the move target", async () => {
    // Expected: move effect targeting { type: "unit", filter: { might: { lte: 3 } } } + Flow [4][chaos].
    // Actual: target is a bare { type: "unit" } — the Might restriction is silently lost.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 2, name: "Twilight Step", powerCost: ["chaos"] });
    expect(def?.timing ?? "standard").toBe("standard");
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[1]).toMatchObject({ cost: { energy: 4, power: ["chaos"] }, keyword: "Flow", type: "keyword" });
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { filter: { might: { lte: 3 } }, type: "unit" }, type: "move" },
      type: "spell",
    });
  });

  test("cost: 2 energy + 1 chaos, goes on the chain; 1 energy, or 2 energy with a non-chaos pip → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("ts", { targets: "small" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ts"]);
    expect((await board(1, 1).build()).p1.can("cast", "ts")).toBe(false);
    expect((await board(2, 0).resources(P1, { power: { fury: 1 } }).build()).p1.can("cast", "ts")).toBe(false);
  });

  test("friendly EXHAUSTED 3-Might unit is stepped onto the open battlefield (no exhaust cost, stays exhausted), showdown passes, P1 conquers bf2 for 1 point; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("ts", { targets: "small" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf2");
    await game.settle(); // rule 355.4: the destination is chosen at play, the move happens at resolution
    expect(game.zoneOf("small")).toBe("battlefield-bf2");
    await game.settle(); // hands back the auto-begun showdown once (344.2)
    await game.settle();
    expect(game.state("small")).toMatchObject({ isExhausted: true, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("destinations for a unit in base are the battlefields only (never 'stay in base')", async () => {
    const game = await board().build();
    await game.p1.cast("ts", { targets: "small" });
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bf1", "battlefield-bf2"]);
  });

  test("'a unit' includes enemies: the lone 2-Might Sentry is sent to ITS OWNER's base un-exhausted, and P2 loses control of the now-empty bf1 (190.4.c)", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toEqual(expect.arrayContaining(["foe", "small"]));
    await game.p1.cast("ts", { targets: "foe" });
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.p2.base()).toContain("foe");
    expect(game.p1.base()).not.toContain("foe");
    expect(game.state("foe")).toMatchObject({ controller: P2, isExhausted: false, owner: P2 });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0); // emptying a battlefield is not conquering it
  });

  test("stepping into the enemy-held bf1 is an attack: 3-Might Duskrunner (attacker) kills the 2-Might Sentry and conquers", async () => {
    const game = await board().build();
    await game.p1.cast("ts", { targets: "small" });
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    // rule 355.4: the destination is chosen at play; pass priority to resolve the spell only, so the
    // showdown it starts can be observed before combat resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("small").combatRole).toBe("attacker");
    expect(game.state("foe").combatRole).toBe("defender");
    await game.settle();
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'3 [Might] or less' — a 4-Might unit and a 3-Might unit buffed to 4 are not legal choices; a damaged 3-Might unit is", async () => {
    // Expected legal targets: small (3, exhausted), hurt (3 with 2 damage), foe (2). NOT big (4), NOT pumped (3+buff = 4).
    // Actual: every unit on the board is offered (the Might filter was never parsed).
    const game = await board()
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "big")
      .unit(P2, "bf1", { might: 3, name: "Pumped" }, "pumped", { buffed: true })
      .unit(P2, "bf1", { might: 3, name: "Hurt" }, "hurt", { damage: 2 })
      .build();
    expect(game.state("pumped").might).toBe(4);
    expect(game.state("hurt").might).toBe(3);
    expect(targetsOf(game)).toEqual(["foe", "hurt", "small"]);
    const r = await game.p1.try((p) => p.cast("ts", { targets: "big" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ts")).toBe("hand");
  });

  test("no unit on the board → not castable (a targeted spell needs a legal choice)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).battlefield("bf1").hand(P1, CARD, "ts").build();
    expect(game.p1.can("cast", "ts")).toBe(false);
  });

  test("timing: not castable with Focus inside a showdown (from hand or by Flow), nor on the opponent's turn", async () => {
    const sd = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P1, "base", { might: 2 }, "b")
      .hand(P1, CARD, "ts")
      .trash(P1, CARD, "tsTrash")
      .autoProcedures(false)
      .build();
    await sd.p1.move("a", "bf2");
    expect((sd.decision() as ActionDecision).context).toBe("showdown");
    expect(sd.p1.can("cast", "ts")).toBe(false);
    expect(sd.p1.can("cast", "tsTrash")).toBe(false);
    const opp = await board().active(P2).trash(P1, CARD, "tsTrash").resources(P1, { energy: 6, power: { chaos: 2 } }).build();
    expect(opp.p1.can("cast", "ts")).toBe(false);
    expect(opp.p1.can("cast", "tsTrash")).toBe(false);
  });

  test("Flow: from the trash it is offered only as a Flow play costing [4][chaos]; it resolves (unit moved) and is then BANISHED, so it cannot be Flowed again", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 2 } })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 1, name: "Wisp" }, "wisp")
      .trash(P1, CARD, "ts")
      .build();
    expect(game.p1.option("cast", "ts")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("ts", { flow: true, targets: "wisp" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } });
    expect(game.zoneOf("ts")).toBe("chain");
    await game.settle(); // single destination (bf2) is forced
    await game.settle();
    expect(game.zoneOf("wisp")).toBe("battlefield-bf2");
    expect(game.zoneOf("ts")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("ts");
    expect(game.p1.can("cast", "ts")).toBe(false); // 4 energy + 1 chaos left would pay for it — but it is gone
  });

  test("Flow cost is its own cost: 3 energy + chaos, or 4 energy without chaos, cannot Flow it; a hand-cast copy lands in the trash and THEN is a Flow candidate", async () => {
    const short = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).battlefield("bf2").unit(P1, "base", { might: 1 }, "u").trash(P1, CARD, "ts").build();
    expect(short.p1.can("cast", "ts")).toBe(false);
    const noPip = await scenario().resources(P1, { energy: 9 }).battlefield("bf2").unit(P1, "base", { might: 1 }, "u").trash(P1, CARD, "ts").build();
    expect(noPip.p1.can("cast", "ts")).toBe(false);

    const game = await board(6, 2).build();
    await game.p1.cast("ts", { targets: "foe" });
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.p1.can("cast", "ts")).toBe(true);
    await game.p1.cast("ts", { flow: true, targets: "small" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });
});
