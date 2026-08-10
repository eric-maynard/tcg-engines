/**
 * Interaction: Stellacorn Herder (sfd-048-221) · Unit · Calm · 4 · 3 Might — "When I move, draw 1."
 *   × Possession (ogn-203-298) · Spell · Chaos · 8+[chaos]x3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.
 *      This isn't a move.)"
 *   × Charm (ogn-043-298) · Spell · Calm · 1+[calm] · Action — "Move an enemy unit."
 *
 * Rules: 455 / 456 / 456.1 / 456.2 (a Recall relocates a permanent but is NOT a Move and never fires
 * move-triggered abilities), 458.1 (a recall leaves statuses untouched → arrives ready), 477.1.a
 * (controller is a layer-1 trait: take-control changes who "you"/"I" answer to), 144.2 (the Standard
 * Move exhausts as its cost), 449.1 (an effect Move IS a move), 383.3 (a triggered ability is
 * controlled by the controller of its source), 337.1 (pending items are finalized by their controller),
 * 337.4 (after finalizing, the controller of the newest item receives priority first), 323.6 (an Open
 * cleanup strips control of a battlefield emptied of its controller's units).
 *
 * Question: P2's Herder ready at P2's bf1; P1's turn.
 *   Case A — P1 resolves Possession on it: does anyone draw off "When I move"? Is it exhausted? bf1?
 *            Later P1 Standard-Moves the Herder base → open bf2: who draws — P1 (controller) or P2 (owner)?
 *   Case B — P1 resolves Charm moving the Herder bf1 → P2's base: does the trigger fire, whose chain item
 *            is it on P1's turn, who gets priority first, who draws?
 *
 * Expected: A — nobody draws (recall ≠ move); Herder READY in P1's base, controller P1 / owner P2; bf1
 * goes uncontrolled at the next cleanup. The later Standard Move exhausts it, triggers "When I move"
 * as a P1-controlled item; P1 draws 1, P2 draws 0; P1 then conquers open bf2. B — Charm's relocation is
 * a Move: the trigger fires as a P2-controlled item even on P1's turn; P2 holds priority first; P2 draws
 * 1, P1 draws 0; bf1 goes uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERDER = "sfd-048-221";
const POSSESSION = "ogn-203-298";
const CHARM = "ogn-043-298";

/** P1's turn. P2's ready Herder alone at P2's bf1; bf2 open. P1 holds Possession + Charm with exact costs for both. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 3, calm: 1 } }) // Possession 8+[chaos]x3, Charm 1+[calm]
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", HERDER, "herder")
    .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "p2home") // so P2's base is a real, distinct place
    .hand(P1, POSSESSION, "poss")
    .hand(P1, CHARM, "charm");
}

/** Case A: Possession cast on the Herder and fully resolved. */
async function possessed(): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board().build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  expect(game.state("herder")).toMatchObject({ controller: P2, isReady: true, owner: P2, zone: "battlefield-bf1" });
  await game.p1.cast("poss", { targets: "herder" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("poss")).toBe("trash");
  return { game, p1Hand0, p2Hand0 };
}

/** Case B: Charm cast on the Herder, destination = (P2's) base, both passed → Charm resolved; the move trigger (if any) is pending. */
async function charmedHome(): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board().build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  await game.p1.cast("charm", { targets: "herder" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("base");
  await game.p1.pick("base");
  expect(game.locationOf("herder")).toBe("bf1"); // chosen, not yet moved
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves
  expect(game.zoneOf("charm")).toBe("trash");
  return { game, p1Hand0, p2Hand0 };
}

describe("Stellacorn Herder × Possession (recall) vs Charm (move)", () => {
  // ── Case A: Possession ───────────────────────────────────────────────────────────────────────

  test("A: Possession takes control (controller P1, owner P2) and puts the Herder in P1's base — not P2's (477.1.a, 455)", async () => {
    const { game } = await possessed();
    expect(game.state("herder")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.base()).toContain("herder");
    expect(game.p2.base()).not.toContain("herder");
    expect(game.p1.units("base")).toContain("herder");
  });

  test("A: the recall is NOT a move — 'When I move' never triggers: chain empty, nobody drew (456, 456.1)", async () => {
    const { game, p1Hand0, p2Hand0 } = await possessed();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Possession left the hand
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("A: the Herder arrives READY — a recall leaves statuses alone and Possession says nothing about exhausting (458.1)", async () => {
    const { game } = await possessed();
    expect(game.state("herder")).toMatchObject({ damage: 0, isExhausted: false, isReady: true, might: 3 });
  });

  test("A: bf1, emptied of P2's units, is uncontrolled after the Open cleanup; P1 does not gain it (323.6)", async () => {
    const { game } = await possessed();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
  });

  test("A→move: P1 may Standard-Move the still-ready Herder base → bf2; that exhausts it (144.2) and 'When I move' goes on the chain as a P1-CONTROLLED item (449.1, 383.3)", async () => {
    const { game } = await possessed();
    expect(game.p1.can("standardMove")).toBe(true);
    await game.p1.move("herder", "bf2");
    expect(game.zoneOf("herder")).toBe("battlefield-bf2");
    expect(game.state("herder").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("A→move: 'draw 1' is performed by the CURRENT controller — P1 draws 1, owner P2 draws nothing (477.1.a)", async () => {
    const { game, p1Hand0, p2Hand0 } = await possessed();
    await game.p1.move("herder", "bf2");
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1); // −Possession, +1 draw
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.chain()).toEqual([]);
  });

  test("A→move: the arrival at open bf2 opens a non-combat showdown; unopposed, P1 conquers bf2 and scores 1", async () => {
    const { game, p2Hand0 } = await possessed();
    await game.p1.move("herder", "bf2");
    await game.settle(); // trigger resolves; the auto-begun showdown is handed back once
    const settled = await game.settle(); // both pass focus
    expect(settled.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf2")).toEqual(["herder"]);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.violations()).toEqual([]);
  });

  // ── Case B: Charm ────────────────────────────────────────────────────────────────────────────

  test("B: Charm ('an enemy unit') offers the enemy Herder at bf1 (and P2's base unit too — no location restriction)", async () => {
    const game = await board().build();
    const offered = (game.p1.option("cast", "charm")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("herder");
    expect(offered).toContain("p2home"); // Charm is not restricted to battlefields
  });

  test("B: Charm's relocation bf1 → P2's base IS a Move: the Herder sits in P2's base, still P2's, still ready (449.1, 420.3.a)", async () => {
    const { game } = await charmedHome();
    expect(game.state("herder")).toMatchObject({ controller: P2, isReady: true, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("herder");
    expect(game.p1.base()).not.toContain("herder");
  });

  test("B: 'When I move' triggers as a P2-CONTROLLED chain item even on P1's turn — the Herder doesn't care who moved it (383.3)", async () => {
    const { game } = await charmedHome();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P2, triggered: true })]);
  });

  test("B: P2 — controller of the newest item — receives priority FIRST, then P1 (337.1, 337.4)", async () => {
    const { game } = await charmedHome();
    await game.acceptTriggerOrder();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("passPriority")).toBe(true);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("B: on resolution P2 draws 1; P1 (who cast Charm) draws nothing", async () => {
    const { game, p1Hand0, p2Hand0 } = await charmedHome();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Charm left P1's hand
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("B: bf1, emptied of P2's units, is lost at the Open cleanup; nothing is contested, no showdown (323.6)", async () => {
    const { game } = await charmedHome();
    await game.settle();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
