/**
 * Interaction: Tianna Crownguard (sfd-060-221) · Unit · Calm · 4 Might · "[Deflect] … While I'm at a
 *     battlefield, opponents can't gain points."                        — P2's, at bf2
 *   × Grove of the God-Willow (ogn-280-298) · Battlefield · "When you hold here, draw 1."   — bf1, P1's
 *   × Keeper of the Hammer (unl-203-219) · Legend · "When you hold, gain 1 XP. …"           — P1's legend
 *   (+ Plundering Poro sfd-069-221 "When I conquer, play a Gold gear token exhausted." as P1's
 *    conquer-trigger probe, Falling Comet ogn-085-298 "Deal 6 to a unit at a battlefield" to kill Tianna)
 *
 * Rules: 469.2 (Hold = maintaining control during your Beginning Phase of a battlefield not yet scored
 * this turn), 471.1 (the scorer gains up to one point) vs Tianna's static + 054.1 (can't beats can),
 * 383.4.d.2.c ("If the act of gaining one point from Holding is negated or replaced in any way, the
 * Hold Effect will still trigger"), 471.2.b (hold abilities trigger at the held battlefield), 383.3.d
 * (same-controller simultaneous triggers: that player orders them), 470 (score once per battlefield per
 * turn, either method), 469.1 (Conquer needs a battlefield "they did not yet Score this turn"),
 * 471.1.b.1 (Final Point through Conquer only if every battlefield was scored this turn).
 *
 * Question: P1 on 5, controls bf1 = Grove with a lone unit, legend Keeper of the Hammer; P2's Tianna
 * is at bf2. P1's turn begins. (a) Is there a Hold/score at bf1 and what is the point delta? (b) Do the
 * Grove and Keeper hold abilities still trigger? (c) Is bf1 'scored this turn' — after killing Tianna,
 * vacating bf1 and re-taking it, is that a Conquer (point / conquer triggers)? Does the pointless hold
 * still count toward "scored every battlefield" for a Final-Point conquer of bf2? (d) Contrast: Tianna
 * in P2's base.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
const GROVE = "ogn-280-298";
const KEEPER = "unl-203-219";
const PLUNDERING_PORO = "sfd-069-221"; // 2-might unit · "When I conquer, play a Gold gear token exhausted."
const FALLING_COMET = "ogn-085-298"; // [Action] 5 · mind · "Deal 6 to a unit at a battlefield."

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active and about to end the turn. P1 (Keeper of the Hammer, `points`) controls bf1 = a
 * LIVE Grove of the God-Willow with a lone vanilla Holder; Plundering Poro waits in P1's base and
 * Falling Comet is in P1's hand. P2 controls bf2; Tianna is at `where` (bf2 or P2's base).
 */
function board(where: "bf2" | "base", points = 5) {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, points)
    .points(P2, 0)
    .legend(P1, KEEPER, "keeper")
    .battlefield("bf1", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", PLUNDERING_PORO, "pporo")
    .unit(P2, where, TIANNA, "tianna")
    .hand(P1, FALLING_COMET, "comet");
}

/** P2 ends the turn → P1's Beginning Phase; keep the engine's listed trigger order if it is offered. */
async function p1TurnBegins(where: "bf2" | "base", points = 5): Promise<{ game: Game; hand0: number }> {
  const game = await board(where, points).build();
  const hand0 = game.p1.hand().length;
  await game.p2.endTurn();
  return { game, hand0 };
}

/** From P1's open main phase: pay for and cast Falling Comet through Deflect at Tianna, resolve it. */
async function killTianna(game: Game): Promise<void> {
  await game.p1.do("addResources", { energy: 5, power: { mind: 1 } }); // 5 for the Comet + 1 power for Deflect
  await game.p1.cast("comet", { targets: "tianna" });
  await game.settle();
  expect(game.zoneOf("tianna")).toBe("trash");
}

describe("Tianna at a battlefield × P1 holding the Grove with Keeper of the Hammer — 0 points, triggers still fire", () => {
  // ── (a) the Hold happens, the point does not ─────────────────────────────────────────────

  test("(a) Scoring Step: P1 DOES hold bf1 — it is recorded as scored this turn by P1 — but Tianna forbids the point: P1 stays on 5 (469.2, 471.1, 054.1)", async () => {
    const { game } = await p1TurnBegins("bf2");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still P1's — only the point is denied
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(0);
  });

  // ── (b) both hold abilities trigger anyway ─────────────────────────────────────────────────

  test("(b) both Hold effects still trigger (383.4.d.2.c, 471.2.b): P1 is offered the order of its two simultaneous triggers (383.3.d), then Keeper of the Hammer AND the Grove sit on the chain as P1's triggered items", async () => {
    const { game, hand0 } = await p1TurnBegins("bf2");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["bf1", "keeper"]);
    await game.acceptTriggerOrder();
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items.map((c) => c.cardId).sort()).toEqual(["bf1", "keeper"]);
    expect(items.every((c) => c.triggered && c.controller === P1)).toBe(true);
    // Nothing resolved yet.
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) P2 gets priority after P1 passes; once both pass the triggers resolve: P1 +1 XP (Keeper), +1 card (Grove) +1 card (Draw Phase), still +0 points, and the turn opens in P1's Main Phase", async () => {
    const { game, hand0 } = await p1TurnBegins("bf2");
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain()).toHaveLength(2); // one pass resolves nothing
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.points()).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) bf1 is Scored this turn: re-taking it is not a Conquer ─────────────────────────────

  test("(c) bf1 stays 'scored this turn' for P1 into the Main Phase (470) even though the hold paid 0", async () => {
    const { game } = await p1TurnBegins("bf2");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
  });

  test("(c) kill Tianna (Comet through Deflect), vacate bf1 (control lapses), re-take it with Plundering Poro via the showdown: P1 controls bf1 again but gains NO point and Poro's 'When I conquer' does NOT fire — not a Conquer of an already-scored battlefield (469.1, 470)", async () => {
    const { game } = await p1TurnBegins("bf2");
    await game.settle();
    await killTianna(game);
    expect(game.p1.points()).toBe(5);
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.locationOf("holder")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // empty + open state → control lost
    await game.p1.move("pporo", "bf1");
    const r = await game.settle(); // non-combat showdown, both pass focus
    expect(r.reason).toBe("open");
    expect(game.locationOf("pporo")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5); // Tianna is gone — this 0 is the once-per-battlefield rule, not her lock
    expect(game.p1.gear()).toEqual([]); // no Gold token: the conquer trigger never fired
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1); // and certainly no second hold
  });

  test("(c) contrast — the same Poro taking bf2 (unscored, empty after Tianna dies) IS a Conquer: +1 point (5 → 6, her lock died with her) and a Gold token from 'When I conquer'", async () => {
    const { game } = await p1TurnBegins("bf2");
    await game.settle();
    await killTianna(game);
    await game.p1.move("pporo", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(6);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.state(game.p1.gear()[0] as string).name).toMatch(/gold/i);
    expect([...game.gameState.scoredThisTurn[P1] ?? []].sort()).toEqual(["bf1", "bf2"]);
  });

  test("(c) the pointless hold still counts as 'scored' for the Final Point (471.1.b.1): P1 on 7/8 holds bf1 for 0, kills Tianna, conquers bf2 → every battlefield scored this turn → gains the 8th point and wins", async () => {
    const { game } = await p1TurnBegins("bf2", 7);
    await game.settle();
    expect(game.p1.points()).toBe(7); // hold denied by Tianna
    expect(game.isOver()).toBe(false);
    await killTianna(game);
    await game.p1.move("pporo", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── (d) contrast: Tianna in P2's base ──────────────────────────────────────────────────────

  test("(d) Tianna in P2's BASE: her static is off — the hold scores normally (5 → 6) already in the Scoring Step, with the same two triggers on the chain", async () => {
    const { game } = await p1TurnBegins("base");
    expect(game.phase()).toBe("beginning");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(6);
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["bf1", "keeper"]);
  });

  test("(d) …and after resolution: 6 points, +1 XP, +2 cards (Grove + Draw Phase) — identical to (b) except for the point", async () => {
    const { game, hand0 } = await p1TurnBegins("base");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(6);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
