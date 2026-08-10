/**
 * Interaction: King's Edict (ogn-237-298) · Spell · Order · 6 + [order][order]
 *     "Starting with the next player, each other player chooses a unit you don't control that hasn't been chosen
 *      for this spell. Kill those units."
 *   × Whirlwind (ogn-187-298) · Spell · Chaos · 3 + [chaos]
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might · [Deflect]
 *
 * Question: both spells are written for multiplayer seat order and existing coverage casts them on P1's turn.
 * Here it is P2's TURN and P2 casts them, so "the next player in Turn Order" must WRAP to P1. Board: P1 has
 * Pouty Poro in base and a vanilla unit alone at bfA (P1 controls bfA); P2 has one vanilla unit in base.
 *   (a) P2 plays King's Edict: who holds Priority after finalization, whom does P2 pass to, does it resolve after
 *       P1 passes? On resolution who is prompted, how many units die, does P2 ever choose, is Deflect owed?
 *   (b) P2 plays Whirlwind: who chooses first, may P1 bounce P2's unit, does P2's later choice see the new board?
 * Failure modes to exclude: next player = seat+1 without wrap (nobody after P2 → Edict kills nothing / only P2
 * chooses for Whirlwind); "each other player" evaluated as 0 or as both players.
 *
 * Rules: 115.1 / 115.1.c (Turn Order is a repeating loop — after the last player comes the first), 337.4 (after
 * finalizing, the controller of the newest item has Priority), 338.1.b.1 / 339.2 (passing hands Priority to the
 * next player in Turn Order), 339.1 (all passed in sequence → resolve), 340.1, 355.10.e (a set chosen by players at
 * resolution is not targeting → no Deflect, which is a cost on a spell/ability's choice), 323.6 (a controlled
 * battlefield left without units is lost at the next Cleanup), 401 (return to OWNER's hand).
 *
 * Expected: (a) no target field, 6 + [order][order] paid; P2 has Priority → passes to P1 → P1 passes → resolves;
 * "each other player" = {P1}, "starting with the next player" = P1: P1 gets ONE mandatory prompt over exactly its
 * own two units (no decline, no Deflect surcharge), P2 is never asked; exactly one unit dies; picking the bfA unit
 * saves the Poro but empties bfA → P1 loses bfA. (b) P1 chooses first from ALL units (may take P2's vanilla →
 * P2's hand, or decline); THEN P2 chooses from what is left (may take the Poro for free) or declines — exactly two
 * optional prompts, P1 → P2. In 1v1: Edict ≡ "your opponent kills one of their units", Whirlwind ≡ "opponent
 * first, then you", whichever seat casts it.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINGS_EDICT = "ogn-237-298";
const WHIRLWIND = "ogn-187-298";
const POUTY_PORO = "ogn-013-298";

/**
 * P2's turn (turn 2). P1: Pouty Poro in base, "P1 Vanilla" alone at bfA (P1 controls bfA). P2: "P2 Vanilla" in
 * base, King's Edict + Whirlwind in hand. P2's pool defaults to EXACTLY both spells' costs (9, order 2, chaos 1).
 */
function board(pool: { energy: number; order?: number; chaos?: number } = { chaos: 1, energy: 9, order: 2 }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: pool.energy, power: { chaos: pool.chaos ?? 0, order: pool.order ?? 0 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "base", POUTY_PORO, "poro")
    .unit(P1, "bfA", { might: 3, name: "P1 Vanilla" }, "p1v")
    .unit(P2, "base", { might: 3, name: "P2 Vanilla" }, "p2v")
    .hand(P2, KINGS_EDICT, "edict")
    .hand(P2, WHIRLWIND, "ww");
}

function offered(d: Decision | null): string[] {
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

/** P2 casts `spell`, P2 passes, P1 passes → it starts resolving; returns the game at its first resolution prompt. */
async function castAndResolve(spell: "edict" | "ww", pool?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(pool).build();
  await game.p2.cast(spell);
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("P2 casts King's Edict / Whirlwind on P2's own turn — 'the next player' wraps around to P1 (115.1.c)", () => {
  test("setup sanity: it is P2's turn-2 main phase; the Poro has Deflect; P1 controls bfA through its lone vanilla unit", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.gameState.battlefields.bfA.controller).toBe(P1);
    expect(game.p1.units("bfA")).toEqual(["p1v"]);
  });

  // ---- (a) King's Edict — priority trace -----------------------------------------------------------------------------

  test("(a) King's Edict targets nothing (355.10.e): P2's cast option has no field at all — no unit list, no Deflect opt-in — and is payable with exactly 6 + [order][order]", async () => {
    const game = await board({ energy: 6, order: 2 }).build();
    expect(game.p2.can("cast", "edict")).toBe(true);
    expect(game.p2.option("cast", "edict")?.fields ?? []).toEqual([]);
    await game.p2.cast("edict");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P2, triggered: false })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("(a) priority trace: after finalization P2 (controller of the newest item) holds Priority and P1 has nothing (337.4); P2 passes → Priority wraps to P1 (339.2); P1 passes → all passed in sequence → it resolves (339.1) and the chain is empty", async () => {
    const game = await board({ energy: 6, order: 2 }).build();
    await game.p2.cast("edict");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["edict"]); // not resolved yet — it did come back round
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("edict")).not.toBe("hand");
  });

  // ---- (a) King's Edict — resolution -----------------------------------------------------------------------------------

  test("(a) resolution: 'each OTHER player, starting with the NEXT player' = exactly P1 — P1 (not P2) gets ONE mandatory prompt over the units P2 doesn't control = P1's own {Poro, P1 Vanilla}; no decline, no Deflect surcharge on the Poro", async () => {
    const game = await castAndResolve("edict", { energy: 6, order: 2 });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, timing: "RES" });
    expect(offered(d)).toEqual(["p1v", "poro"]);
    expect(d.options.every((o) => (o.deflect ?? 0) === 0)).toBe(true);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("p2v"))).ok).toBe(false); // "a unit you don't control" — never P2's own
  });

  test("(a) P1 picks its bfA vanilla to save the Poro: exactly ONE unit is killed (→ P1's trash), the Poro and P2's unit are untouched, King's Edict → P2's trash, and P2 was never asked to choose anything", async () => {
    const game = await board({ energy: 6, order: 2 }).build();
    const p2Prompts: Decision[] = [];
    game.script(P2, [(d) => {
      if (d.kind !== "action") {
        p2Prompts.push(d);
      }
      return undefined;
    }]);
    await game.p2.cast("edict");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("p1v");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(p2Prompts).toEqual([]);
    expect(game.zoneOf("p1v")).toBe("trash");
    expect(game.p1.trash()).toEqual(["p1v"]);
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("p2v")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.p2.trash()).toEqual(["edict"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) …that vanilla was alone at bfA, so at the next open Cleanup P1 loses control of bfA (323.6) — it is nobody's now", async () => {
    const game = await castAndResolve("edict", { energy: 6, order: 2 });
    await game.p1.pick("p1v");
    await game.settle();
    expect(game.cardsAt("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(0); // losing control is not P2 conquering it
  });

  test("(a) alternatively P1 may sacrifice the Poro: it dies with NOBODY paying Deflect (a player chose, not the spell); the bfA unit lives and P1 keeps bfA", async () => {
    const game = await castAndResolve("edict", { energy: 6, order: 2 });
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash()).toEqual(["poro"]);
    expect(game.zoneOf("p1v")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA.controller).toBe(P1);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } }); // nothing beyond the printed cost
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // ---- (b) Whirlwind ------------------------------------------------------------------------------------------------------

  test("(b) Whirlwind cast by P2 (3 + [chaos], no field): P2 has Priority, passes to P1, P1 passes → resolves; the FIRST chooser is the next player = P1, offered EVERY unit on the board (its Poro, its vanilla AND P2's vanilla), optional", async () => {
    const game = await board({ chaos: 1, energy: 3 }).build();
    expect(game.p2.option("cast", "ww")?.fields ?? []).toEqual([]);
    await game.p2.cast("ww");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1, timing: "RES" });
    expect(offered(d)).toEqual(["p1v", "p2v", "poro"]);
  });

  test("(b) P1 may bounce P2's unit (player choice, not targeting): P2 Vanilla → its OWNER's (P2's) hand; THEN P2 is asked, and its list is the UPDATED board — {Poro, P1 Vanilla}, its own unit no longer available — also optional", async () => {
    const game = await castAndResolve("ww", { chaos: 1, energy: 3 });
    await game.p1.pick("p2v");
    expect(game.zoneOf("p2v")).toBe("hand");
    expect(game.p2.hand().sort()).toEqual(["edict", "p2v"]);
    expect(game.p1.hand()).toEqual([]);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, timing: "RES" });
    expect(offered(d)).toEqual(["p1v", "poro"]);
    expect((await game.p2.try((p) => p.pick("p2v"))).ok).toBe(false);
  });

  test("(b) P2, choosing second with ZERO spare power, may name the Pouty Poro — no Deflect is owed mid-resolution: the Poro returns to P1's hand; Whirlwind → P2's trash; P2's main phase resumes", async () => {
    const game = await castAndResolve("ww", { chaos: 1, energy: 3 });
    await game.p1.pick("p2v");
    const d = game.decision() as PickDecision;
    expect(d.options.find((o) => (o.card ?? o.key) === "poro")?.deflect ?? 0).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    await game.p2.pick("poro");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    expect(game.zoneOf("p1v")).toBe("battlefield-bfA");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p2.trash()).toEqual(["ww"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) exactly TWO sequential optional prompts in the order P1 → P2: both decline → nothing moves, Whirlwind still resolves to P2's trash and counts as played", async () => {
    const game = await castAndResolve("ww", { chaos: 1, energy: 3 });
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      order.push(d.seat);
      expect(d.allowDecline).toBe(true);
      await game.seat(d.seat).decline();
    }
    expect(order).toEqual([P1, P2]);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("p1v")).toBe("battlefield-bfA");
    expect(game.zoneOf("p2v")).toBe("base");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(b) if P1 declines, P2 (second) still sees all three units and may bounce P1's bfA vanilla → P1's hand; bfA, now empty, is lost by P1 at the Cleanup (323.6)", async () => {
    const game = await castAndResolve("ww", { chaos: 1, energy: 3 });
    await game.p1.decline();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(offered(d)).toEqual(["p1v", "p2v", "poro"]);
    await game.p2.pick("p1v");
    await game.settle();
    expect(game.zoneOf("p1v")).toBe("hand");
    expect(game.p1.hand()).toEqual(["p1v"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
  });

  // ---- (a)+(b) in sequence on the same turn ---------------------------------------------------------------------------------

  test("(a→b) the full line on one turn: Edict (P1 kills its bfA vanilla), then Whirlwind (P1 bounces P2's vanilla, P2 bounces the Poro): P2 spent exactly 9 + [order][order] + [chaos]; board empty of units; hands P1 {Poro}, P2 {P2 Vanilla}", async () => {
    const game = await board().build();
    await game.p2.cast("edict");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.pick("p1v");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    await game.p2.cast("ww");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(offered(game.decision())).toEqual(["p2v", "poro"]); // p1v is already dead
    await game.p1.pick("p2v");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(offered(game.decision())).toEqual(["poro"]);
    await game.p2.pick("poro");
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.hand()).toEqual(["poro"]);
    expect(game.p2.hand()).toEqual(["p2v"]);
    expect(game.p1.trash()).toEqual(["p1v"]);
    expect(game.p2.trash().sort()).toEqual(["edict", "ww"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
