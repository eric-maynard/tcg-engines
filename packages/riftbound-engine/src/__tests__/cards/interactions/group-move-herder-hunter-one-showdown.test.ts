/**
 * Interaction: ONE group Standard Move vs TWO sequential Standard Moves onto an empty battlefield.
 *   Stellacorn Herder (sfd-048-221) · Unit · Calm · 4 · 3 Might — "When I move, draw 1."
 *   × Treasure Hunter (sfd-130-221) · Unit · Chaos · 2 · 1 Might — "When I move, play a Gold gear token exhausted."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3 Might (already EXHAUSTED in base).
 *
 * Question. P1's turn, Neutral Open. P1's base: Herder (ready), Hunter (ready), Skulker (exhausted).
 * bfC empty + uncontrolled; bfA P2-held with a P2 bystander.
 *   (a) GROUP: is {Herder, Hunter} → bfC ONE action? Is the exhausted Skulker selectable as a co-mover?
 *       May the movers split destinations? After it: exhausts / Contested / cleanups / showdowns; the
 *       two "When I move" triggers are simultaneous — who orders them, does the showdown wait, who
 *       holds Focus, result on pass/pass.
 *   (b) SEQUENTIAL: Herder alone → bfC; during its Non-Combat Showdown is Hunter's / Skulker's
 *       Standard Move listed? After P1 conquers, Hunter → bfC: Contested? 2nd showdown? Gold trigger?
 *       2nd point? Compare totals.
 *
 * Rules: 144.2 / 420.3.a / 414.1.b (exhaust is the cost; an exhausted permanent can't pay it), 144.3
 * (multi-unit move = one action) / 144.3.a (one destination) / 144.3.c (exhausted together), 446.3
 * (simultaneous arrival), 190.3.a.1 / 450 (Contested applied once, only at a bf you don't control),
 * 453 (one Cleanup after a move), 323.8 / 323.9 (showdown staged; no combat without opposing units),
 * 383.3.d (controller orders simultaneous triggers), 344 / 323.12 (showdown begins only from Neutral
 * Open — after the chain empties), 345 (contester gets Focus), 348.2.a / 348.2.a.1 (sole remaining
 * player conquers, +1, once per bf per turn), 144.1.c (no Standard Move during a showdown), 144.4.a
 * (base → battlefield), 446.1 (every move fires move triggers).
 *
 * Expected: (a) one action; mover sets offered = {Herder}, {Hunter}, {Herder, Hunter} — Skulker never;
 * one shared destination; both exhaust, both at bfC, Contested-by-P1 once, ONE showdown staged, no
 * combat; both triggers on the chain, P1 offered their order (383.3.d); showdown opens only after both
 * resolve (draw 1 + exhausted Gold token), P1 holds Focus; pass/pass → P1 conquers bfC, +1.
 * (b) Herder alone: same shape with one trigger; during the showdown no Standard Move at all for P1;
 * pass/pass → conquer +1; then Hunter → bfC is listed, exhausts Hunter, NO Contested (P1 controls it),
 * no showdown, Gold trigger still fires, no 2nd point. Totals: (a) 1 move action / 1 showdown / 1 pt;
 * (b) 2 move actions / 1 showdown / 1 pt.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERDER = "sfd-048-221";
const HUNTER = "sfd-130-221";
const SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P2, "bfA", { might: 2, name: "Bystander" }, "bystander")
    .unit(P1, "base", HERDER, "herder")
    .unit(P1, "base", HUNTER, "hunter")
    .unit(P1, "base", SKULKER, "skulker", { exhausted: true });
}

/** Unit-sets P1 may currently Standard-Move to `bf` (each sorted). */
function moveSetsOffered(game: Game, bf: string): string[][] {
  return (game.p1.option(`standardMove:to:${bf}`)?.variants ?? []).map((v) =>
    [...((v.params.unitIds as string[]) ?? [])].sort(),
  );
}

function activeShowdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

function goldTokens(game: Game): string[] {
  return game.p1.gear().filter((id) => game.state(id).name === "Gold");
}

/** (a) group move done and both move triggers resolved (everyone passes priority twice). */
async function groupMovedTriggersResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["herder", "hunter"], "bfC");
  await game.p1.passPriority();
  await game.p2.passPriority();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** (b) Herder alone moved, its draw resolved, showdown passed out → P1 conquered bfC; back in Neutral Open. */
async function herderAloneConquered(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("herder", "bfC");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

describe("(a) GROUP form — {Herder, Hunter} → bfC as ONE Standard Move", () => {
  test("one 'standardMove:to:bfC' action offers exactly the READY mover sets {Herder}, {Hunter}, {Herder, Hunter}; the exhausted Skulker is never selectable (144.2, 144.3, 420.3.a, 414.1.b)", async () => {
    const game = await board().build();
    const sets = moveSetsOffered(game, "bfC");
    expect(sets).toContainEqual(["herder"]);
    expect(sets).toContainEqual(["hunter"]);
    expect(sets).toContainEqual(["herder", "hunter"]);
    expect(sets.flat()).not.toContain("skulker");
    expect(sets).toHaveLength(3);
    await expect(game.p1.move(["herder", "skulker"], "bfC")).rejects.toThrow();
    await expect(game.p1.move("skulker", "bfC")).rejects.toThrow();
  });

  test("one shared destination only: the move option carries a single destination per action — no per-unit destination field (144.3.a)", async () => {
    const game = await board().build();
    const opt = game.p1.option("standardMove:to:bfC");
    expect(opt).toBeDefined();
    expect(new Set(opt?.variants.map((v) => v.params.destination))).toEqual(new Set(["bfC"]));
    expect(opt?.fields.map((f) => f.name)).toEqual(["unitIds"]);
  });

  test("executing it is ONE engine action; both movers are exhausted and both stand at bfC; Skulker untouched (144.3.c, 446.3)", async () => {
    const game = await board().build();
    const r = await game.p1.move(["herder", "hunter"], "bfC");
    expect(r.executed.filter((m) => m.moveId === "standardMove")).toHaveLength(1);
    expect(game.state("herder")).toMatchObject({ isExhausted: true, location: "bfC" });
    expect(game.state("hunter")).toMatchObject({ isExhausted: true, location: "bfC" });
    expect(game.state("skulker")).toMatchObject({ isExhausted: true, location: "base" });
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(2);
  });

  test("Contested is applied to bfC once, by P1; ONE showdown is staged there and it is NOT combat (190.3.a.1, 450, 453, 323.8, 323.9)", async () => {
    const game = await board().build();
    await game.p1.move(["herder", "hunter"], "bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    // staged, not yet begun: the triggers' chain is still open
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.state("herder").combatRole).toBeNull();
    expect(game.state("bystander").combatRole).toBeNull();
  });

  test("both 'When I move' triggers go on the chain as P1-controlled triggered items; the showdown WAITS for them (344, 323.12)", async () => {
    const game = await board().build();
    await game.p1.move(["herder", "hunter"], "bfC");
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered]).sort()).toEqual(
      [
        ["herder", P1, true],
        ["hunter", P1, true],
      ].sort(),
    );
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // rule 383.3.d / 446.3: the two units move simultaneously, so their two move triggers are ONE
  // simultaneous batch controlled by P1 → P1 is offered the soft `order` decision naming both items.
  test("P1 should be offered the order of the two simultaneous move triggers (383.3.d, 446.3)", async () => {
    const game = await board().build();
    await game.p1.move(["herder", "hunter"], "bfC");
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card).sort() : [];
    expect(items).toEqual(["herder", "hunter"]);
  });

  test("Herder's draw and Hunter's exhausted Gold token both resolve BEFORE the showdown opens; then the Non-Combat Showdown at bfC opens with P1 (the contester) holding Focus (344, 345)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move(["herder", "hunter"], "bfC");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // one trigger resolved, one still on the chain → still no showdown
    expect(game.chain()).toHaveLength(1);
    expect(activeShowdowns(game)).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(goldTokens(game)).toHaveLength(1);
    expect(game.state(goldTokens(game)[0] as string).isExhausted).toBe(true);
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1 pass, P2 pass → only P1's units remain: P1 establishes control = Conquer bfC, +1 point; exactly one showdown happened (348.2.a, 348.2.a.1)", async () => {
    const game = await groupMovedTriggersResolved();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfC"]);
    expect(game.p1.units("bfC").sort()).toEqual(["herder", "hunter"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("log totals for (a): 1 move action, 2 units moved, 1 showdown, 1 conquer, 1 point", async () => {
    const game = await groupMovedTriggersResolved();
    let showdownsSeen = activeShowdowns(game).length; // the one now open
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    showdownsSeen += activeShowdowns(game).length; // none re-opened
    const moves = game.transcript().steps.flatMap((s) => s.executed).filter((m) => m.moveId === "standardMove");
    expect(moves).toHaveLength(1);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(2);
    expect(showdownsSeen).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfC"]);
    expect(game.p1.points()).toBe(1);
  });
});

describe("(b) SEQUENTIAL form — Herder alone, then Hunter after the showdown", () => {
  test("Herder alone: exhausted, at bfC, Contested by P1, its draw trigger is the only chain item; the showdown waits for it, then opens with P1 holding Focus", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move("herder", "bfC");
    expect(game.state("herder")).toMatchObject({ isExhausted: true, location: "bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
    expect(activeShowdowns(game)).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("while that showdown is open NO Standard Move is listed for P1 — not for ready Hunter (144.1.c), not for exhausted Skulker — whether P1 or P2 holds Focus", async () => {
    const game = await board().build();
    await game.p1.move("herder", "bfC");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.moveId === "standardMove")).toBe(false);
    expect(game.p1.can("standardMove:to:bfC")).toBe(false);
    await expect(game.p1.move("hunter", "bfC")).rejects.toThrow();
    await expect(game.p1.move("skulker", "bfC")).rejects.toThrow();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal().some((o) => o.moveId === "standardMove")).toBe(false);
    expect(game.state("hunter").location).toBe("base");
  });

  test("pass/pass → P1 conquers bfC (+1); back in Neutral Open Hunter's Standard Move → bfC IS listed (144.4.a), Skulker's still is not", async () => {
    const game = await herderAloneConquered();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(moveSetsOffered(game, "bfC")).toEqual([["hunter"]]);
  });

  test("Hunter → bfC (a battlefield P1 already controls): Hunter exhausts and arrives, NO Contested is applied, NO showdown is staged, the Gold trigger still fires and resolves, NO second point (190.3.a.1, 453, 446.1, 348.2.a.1)", async () => {
    const game = await herderAloneConquered();
    await game.p1.move("hunter", "bfC");
    expect(game.state("hunter")).toMatchObject({ isExhausted: true, location: "bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hunter", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(goldTokens(game)).toHaveLength(1);
    expect(game.state(goldTokens(game)[0] as string).isExhausted).toBe(true);
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfC"]);
    expect(game.violations()).toEqual([]);
  });

  test("log totals for (b): 2 move actions, 2 units moved, 1 showdown, 1 conquer, 1 point — same score as (a), one more action, Hunter locked out for the showdown's duration", async () => {
    const game = await board().build();
    let showdownsSeen = 0;
    await game.p1.move("herder", "bfC");
    await game.p1.passPriority();
    await game.p2.passPriority();
    showdownsSeen += activeShowdowns(game).length;
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    await game.p1.move("hunter", "bfC");
    await game.p1.passPriority();
    await game.p2.passPriority();
    showdownsSeen += activeShowdowns(game).length;
    const moves = game.transcript().steps.flatMap((s) => s.executed).filter((m) => m.moveId === "standardMove");
    expect(moves).toHaveLength(2);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(2);
    expect(showdownsSeen).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfC"]);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
