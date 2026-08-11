/**
 * Interaction: Wuju Apprentice (unl-040-219) · Unit · Calm · 2 · 2 Might
 *     "[Hunt] (When I conquer or hold, gain 1 XP.) [Level 6][>] When you play me, draw 1. (While you have 6+ XP, get the effect.)"
 *   × Blood Rose (unl-109-219) · Gear · Body · 1
 *     "When you play a unit, you may pay [1] to gain 1 XP. Spend 3 XP, [Exhaust]: Ready a unit."
 *
 * Position: P1's turn, Neutral Open. P1 controls Blood Rose, has 4 energy, and plays Wuju Apprentice (2) to base.
 *
 * Question:
 *  Case NO  — P1 has exactly 5 XP when the Apprentice enters. Which triggers go on the chain? If P1 pays the Rose's [1]
 *             (when — finalization or resolution?) and reaches 6 XP "in the middle of playing" the Apprentice, does the
 *             Level-6 play effect trigger late, i.e. does P1 draw?
 *  Case YES — exactly 6 XP at entry: how many items, is P1 offered their order, FIN vs RES steps, end state?
 *  Case EDGE — 6 XP but P1 declines the Rose's "may".
 *
 * Rules: 419.4.a / 383.4.a.2 (both abilities key off the same event — the Apprentice being finalized and entering the
 * board), 383.2.c (trigger conditions are evaluated immediately after that event is processed), 824.1.b.1 / 824.1.c /
 * 824.1.d / 727.1.b.2 (Level text is ACTIVE only while you have 6+ XP; inactive text cannot trigger), 383.3.a (leading
 * "you may" decided at FINALIZATION), 383.3.a.2 (declined ⇒ removed, never triggered), 383.3.b / .b.1 ("pay [1]" right
 * after the may is the BASE COST, paid at FIN), 383.3.d (simultaneous same-controller triggers: controller orders them).
 *
 * Expected:
 *  NO:   only Blood Rose's item (1 item, no order offer). Yes ⇒ [1] paid at FIN, XP 5→6 at RES. The play event is in the
 *        past and is not re-evaluated ⇒ NO draw. End: XP 6, hand = before − Apprentice, energy 4−2−1 = 1.
 *  YES:  two P1 triggers at once (Apprentice draw; Rose) ⇒ P1 offered their ORDER; Rose may+pay at FIN; draw / XP at
 *        the respective RES in LIFO order. End: hand net 0 (−Apprentice +1 draw), XP 7, energy 1 — either order.
 *  EDGE: declining removes the Rose item; the Apprentice's draw still resolves ⇒ hand net 0, XP 6, energy 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_APPRENTICE = "unl-040-219";
const BLOOD_ROSE = "unl-109-219";

/** P1's turn: Blood Rose in base, Wuju Apprentice in hand, 4 energy, `xp` XP. P2 has nothing relevant. */
function board(xp: number) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy: 4 })
    .gear(P1, BLOOD_ROSE, "rose")
    .hand(P1, WUJU_APPRENTICE, "app");
}

/** Play the Apprentice to base; returns the hand size BEFORE the play. */
async function playApprentice(game: Game): Promise<number> {
  const hand0 = game.p1.hand().length;
  await game.p1.play("app");
  expect(game.zoneOf("app")).toBe("base");
  expect(game.p1.energy()).toBe(2); // 4 − 2
  return hand0;
}

function triggeredItems(game: Game): string[] {
  return game.chain().filter((i) => i.triggered && i.controller === P1).map((i) => i.cardId);
}

describe("Wuju Apprentice × Blood Rose — reaching Level 6 via the Rose's XP does not retro-trigger 'When you play me, draw 1'", () => {
  test("setup sanity: the Apprentice costs 2, is a unit; Blood Rose is P1's gear", async () => {
    const game = await board(5).build();
    expect(game.state("app")).toMatchObject({ cardType: "unit", energyCost: 2 });
    expect(game.p1.gear()).toContain("rose");
    expect(game.p1.xp()).toBe(5);
  });

  // ── Case NO: 5 XP ─────────────────────────────────────────────────────────────────────────────

  test("NO (5 XP): after the Apprentice enters, ONLY Blood Rose's trigger is on the chain — the Level-6 'When you play me' text is inactive at the moment of the event (824.1.d, 383.2.c); P1 is asked the Rose's 'you may pay [1]' at FINALIZATION (timing FIN), no order offer", async () => {
    const game = await board(5).build();
    await playApprentice(game);
    expect(triggeredItems(game)).toEqual(["rose"]);
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
  });

  test("NO (5 XP): YES pays the [1] immediately at FIN (energy 2→1, XP still 5, before anyone holds priority); the XP arrives at RESOLUTION → 6", async () => {
    const game = await board(5).build();
    await playApprentice(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1); // base cost paid at finalization (383.3.b.1)
    expect(game.p1.xp()).toBe(5); // not resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(triggeredItems(game)).toEqual(["rose"]);
    await game.p1.passPriority();
    expect(game.p1.xp()).toBe(5);
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(6); // resolved
  });

  test("NO (5 XP): reaching 6 XP while the Apprentice's play is 'still settling' does NOT put a late 'draw 1' on the chain — no new item appears, P1 draws nothing; end state XP 6, hand = before − the Apprentice, energy 1", async () => {
    const game = await board(5).build();
    const hand0 = await playApprentice(game);
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Rose resolves → XP 6, Level 6 text now active
    expect(game.p1.xp()).toBe(6);
    expect(triggeredItems(game)).toEqual([]); // nothing triggered late
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // Apprentice left the hand; no draw
    expect(game.p1.xp()).toBe(6);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NO (5 XP), control: declining the Rose keeps XP 5 and energy 2; still no draw", async () => {
    const game = await board(5).build();
    const hand0 = await playApprentice(game);
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(5);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
  });

  // ── Case YES: 6 XP ────────────────────────────────────────────────────────────────────────────

  test("YES (6 XP): Level 6 is active at the moment of entry → TWO P1 triggers go on the chain together (Apprentice 'draw 1' + Blood Rose); the Rose's may+pay is asked first at FIN, then P1 is offered the ORDER of its two items (383.3.d, soft/defaultable)", async () => {
    const game = await board(6).build();
    await playApprentice(game);
    expect(triggeredItems(game).sort()).toEqual(["app", "rose"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1); // paid at FIN
    expect(game.p1.xp()).toBe(6);
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["app", "rose"]);
  });

  test("YES (6 XP), order Rose on TOP: LIFO — first resolution gives XP 7 (no draw yet), second resolution draws 1; end: hand net 0 (−Apprentice +1), XP 7, energy 1", async () => {
    const game = await board(6).build();
    const hand0 = await playApprentice(game);
    await game.p1.yes();
    const d = game.decision();
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("app"), keyOf("rose")]); // first = bottom, last = top → Rose resolves first
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // draw not yet
    expect(triggeredItems(game)).toEqual(["app"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(hand0); // drew 1
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(7);
    expect(game.p1.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("YES (6 XP), order Apprentice on TOP: draw resolves first (hand +1, XP 6), then the Rose (XP 7); same end state — nothing depends on the order", async () => {
    const game = await board(6).build();
    const hand0 = await playApprentice(game);
    await game.p1.yes();
    const d = game.decision();
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("rose"), keyOf("app")]); // Apprentice on top
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(hand0); // −1 played, +1 drawn
    expect(game.p1.xp()).toBe(6);
    expect(triggeredItems(game)).toEqual(["rose"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.xp()).toBe(7);
    expect(game.p1.energy()).toBe(1);
  });

  test("YES (6 XP): ignoring the soft order offer (just settling) reaches the same end state: hand net 0, XP 7, energy 1, Apprentice in base", async () => {
    const game = await board(6).build();
    const hand0 = await playApprentice(game);
    await game.p1.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.xp()).toBe(7);
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("app")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── Case EDGE: 6 XP, Rose declined ────────────────────────────────────────────────────────────

  test("EDGE (6 XP, Rose declined at FIN): the Rose item is removed from the chain (383.3.a.2) — only the Apprentice's draw remains, no order offer; it resolves → hand net 0, XP 6, energy 2 (nothing paid)", async () => {
    const game = await board(6).build();
    const hand0 = await playApprentice(game);
    await game.p1.no();
    expect(triggeredItems(game)).toEqual(["app"]);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain().some((i) => i.countered)).toBe(false); // removed, not countered
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority, no order
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.xp()).toBe(6);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (P2 irrelevant): 'When YOU play a unit' — the whole exchange asks P2 nothing but priority passes; P2's XP and hand never change", async () => {
    const game = await board(6).build();
    const p2Hand = game.p2.hand().length;
    await playApprentice(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p2.xp()).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()?.seat).not.toBe(P2);
  });
});
