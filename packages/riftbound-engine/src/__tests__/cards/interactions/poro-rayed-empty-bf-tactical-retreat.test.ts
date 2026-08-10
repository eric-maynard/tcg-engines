/**
 * Interaction: Plundering Poro (sfd-069-221) · Unit · Mind · 2 · 2 Might
 *     "When I conquer, play a Gold gear token exhausted."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] "Deal 3 to a unit at a battlefield."
 *   × Tactical Retreat (unl-175-219) · Spell · Order · 2 · [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead."
 *
 * Question (P1's turn; bfC empty and uncontrolled): P1 Standard-Moves the Poro base → bfC. A Non-Combat
 * Showdown opens with P1 holding Focus; P1 passes; P2 (Focus) plays Hextech Ray on the Poro.
 *   (i)   P1 does not react: does the showdown end the moment the contester's only unit dies? Who gets
 *         Focus next? When it finally closes — control / point / Gold token? bfC's Contested status?
 *   (ii)  P1 reacts with Tactical Retreat on the Poro: where is the Poro, does P1 still conquer?
 *   (iii) Contrast: P2 simply passes.
 *
 * Rules: 450 (Contested applied by P1), 323.8/323.9 (Showdown staged, no Combat), 323.12/344.2 (Neutral
 * Open → the Non-Combat Showdown begins), 345 (P1 Focus), 347.2.b (pass → Focus on), 347.1 (Focus holder
 * plays an [Action]), 323.5 (lethal → killed in Cleanup), 347.2.a/348 (a showdown ends ONLY when all pass
 * in sequence — not when a unit dies), 347.1.b (chain closes → Focus passes to P1), 348.2.a/348.2.a.1
 * (control only if exactly one player's units remain → Conquer, 469.1), 323.11/190.3.b.1 (Contested
 * removed once the applier has no units there and no showdown is ongoing), 813 + LIFO (Retreat resolves
 * before the Ray), 370.1.a.1/455–456 (death replaced by heal+exhaust+recall; a recall is not a move).
 *
 * Expected: (i) Poro dies; showdown continues, Focus → P1; P1 pass, P2 pass → closes with nobody there →
 * no control, no point, no Gold; Contested cleared, bfC uncontrolled. (ii) chain [Ray, Retreat]; Retreat
 * resolves first; Ray's 3 would kill → instead Poro healed, exhausted, recalled to base; then as (i): no
 * control, no point, no Gold. (iii) all passed → only P1's unit remains → P1 conquers bfC (+1) → "When I
 * conquer" → Gold token in base, exhausted.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PLUNDERING_PORO = "sfd-069-221";
const HEXTECH_RAY = "ogn-009-298";
const TACTICAL_RETREAT = "unl-175-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn, Neutral Open. bfC uncontrolled and empty. P1: Plundering Poro ready in base, Tactical Retreat
 * in hand, exactly 2 energy. P2: a vanilla Homebody in base (never at bfC), Hextech Ray in hand, exactly 1+[fury].
 */
function board() {
  return scenario()
    .battlefield("bfC", { controller: null })
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .unit(P1, "base", PLUNDERING_PORO, "poro")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "homebody")
    .hand(P1, TACTICAL_RETREAT, "retreat")
    .hand(P2, HEXTECH_RAY, "ray");
}

function showdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

function goldTokens(game: Game): string[] {
  return game.p1.gear().filter((g) => game.state(g).name === "Gold");
}

/** Poro moved to bfC, Non-Combat Showdown open, P1 passed Focus → P2 holds Focus. */
async function p2HasFocus(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("poro", "bfC");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** …P2 cast Hextech Ray on the Poro and passed priority → P1's response window. */
async function rayOnChain(): Promise<Game> {
  const game = await p2HasFocus();
  await game.p2.cast("ray", { targets: "poro" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("opening — the move stages a Non-Combat Showdown, P1 has Focus, then P2", () => {
  test("Standard Move base → empty bfC: Poro exhausted at bfC; bfC Contested by P1, still uncontrolled; exactly one NON-combat showdown at bfC with P1 holding Focus; nothing scored yet (450, 323.8/323.12, 344.2, 345)", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bfC");
    expect(game.state("poro")).toMatchObject({ isExhausted: true, zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(goldTokens(game)).toEqual([]);
  });

  test("P1 passes → Focus to P2 (347.2.b), who — with no unit at bfC — may play Hextech Ray ([Action] is showdown-legal, 347.1); the Poro is its only legal target (a unit AT A BATTLEFIELD)", async () => {
    const game = await p2HasFocus();
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P2 });
    expect(game.p2.units("bfC")).toEqual([]);
    expect(game.p2.can("cast", "ray")).toBe(true);
    const offered = (game.p2.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["poro"]);
    await game.p2.cast("ray", { targets: "poro" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["poro"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });
});

describe("(i) P1 does not react — the Poro dies but the showdown goes on", () => {
  test("P2 pass, P1 pass → Ray resolves: 3 ≥ 2 → the Poro is killed in the Cleanup (323.5); the showdown does NOT close — the same non-combat showdown is still active at bfC and, the chain having closed, Focus is with P1 (347.1.b); bfC still Contested and uncontrolled; no points", async () => {
    const game = await rayOnChain();
    expect(game.p1.can("cast", "retreat")).toBe(true); // (the window P1 declines here)
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.cardsAt("battlefield-bfC")).toEqual([]);
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("P1 pass, P2 pass → all passed in sequence → the showdown closes (347.2.a, 348); NOBODY's units remain → no control established, no Conquer, no point, and Plundering Poro's 'When I conquer' never fires — no Gold token (348.2.a)", async () => {
    const game = await rayOnChain();
    await game.p1.passPriority();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdowns(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(goldTokens(game)).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the following Cleanup strips Contested from bfC — no units of the applier (P1) there and no showdown ongoing (323.11, 190.3.b.1); bfC stays uncontrolled into P2's turn; the Poro was never healed by any combat (there was none) — it is simply in the trash", async () => {
    const game = await rayOnChain();
    await game.p1.passPriority();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: null });
    expect(game.p1.trash()).toContain("poro");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bfC?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(ii) P1 answers with Tactical Retreat — the Poro lives, but nobody conquers", () => {
  test("Retreat ([Reaction]) is legal in P1's response window and goes on top: chain [Hextech Ray (P2), Tactical Retreat (P1)], both aimed at the Poro; P1 spent exactly 2", async () => {
    const game = await rayOnChain();
    await game.p1.cast("retreat", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P2, targets: ["poro"] }),
      expect.objectContaining({ cardId: "retreat", controller: P1, targets: ["poro"] }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("LIFO: Retreat resolves first (shield armed, Poro untouched), then the Ray's 3 WOULD kill the Poro → instead it is healed (0 damage), exhausted and RECALLED to P1's base — alive, not in the trash, not at bfC (370.1.a.1, 455)", async () => {
    const game = await rayOnChain();
    await game.p1.cast("retreat", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat resolves
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bfC" }); // nothing yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2 })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // 340.4
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves → replaced death
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.base()).toContain("poro");
    expect(game.p1.trash()).not.toContain("poro");
    expect(game.cardsAt("battlefield-bfC")).toEqual([]);
  });

  test("the showdown again survives the Poro leaving: still active at bfC, Focus → P1 after the chain closed; P1 pass, P2 pass → closes with nobody's units there → no control, no point, no Gold; Contested cleared at the next Cleanup; the Poro sits home exhausted", async () => {
    const game = await rayOnChain();
    await game.p1.cast("retreat", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(goldTokens(game)).toEqual([]);
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(iii) contrast: P2 simply passes", () => {
  test("P1 passed, P2 passes → all passed → the showdown closes with only P1's Poro at bfC, which P1 does not control → P1 establishes control = Conquer, +1 point (348.2.a, 348.2.a.1, 469.1); 'When I conquer' goes on the chain as P1's trigger", async () => {
    const game = await p2HasFocus();
    await game.p2.passFocus();
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(goldTokens(game)).toEqual([]); // only on resolution
  });

  test("…P1 pass, P2 pass → the trigger resolves: exactly one Gold gear token enters P1's base EXHAUSTED; the Poro stays at bfC (exhausted from its move); Hextech Ray unspent in P2's hand; back to P1's open main phase", async () => {
    const game = await p2HasFocus();
    await game.p2.passFocus();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    const gold = goldTokens(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold", zone: "base" });
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toContain("ray");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
