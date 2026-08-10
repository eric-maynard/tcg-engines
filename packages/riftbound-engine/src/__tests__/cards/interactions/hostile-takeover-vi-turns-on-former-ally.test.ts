/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Vi, Peacekeeper (unl-176-219) · Champion Unit · Order · 5 Might
 *     "[Ambush] When I attack, [Stun] an enemy unit here. (It doesn't deal combat damage this turn.)"
 *
 * Question: P1's turn. P2 controls bfA with Vi (exhausted) next to P2's vanilla 4-Might Brute. P1
 * resolves Hostile Takeover on Vi.
 *   (YES) Vi never moved — does bfA still become Contested, by whom, and when does combat begin?
 *         Who attacks/defends, does Vi's "When I attack" fire for P1 and may it stun Brute? Outcome,
 *         scoring, end of turn?
 *   (NO)  Vi alone at bfA: is there a combat, how does P1 conquer? Parity with P1 Standard-Moving a
 *         Vi of its own onto bfA.
 *
 * Rules: 477.1.a (control change is a layer-1 continuous effect); 190.3.a / 323.11.a (a unit that
 * "otherwise becomes present" under a non-controller applies Contested); 323.13 (Combat begins only in
 * a Neutral Open state — not mid-resolution); 323.8 / 323.9 (Showdown + Combat staged); 464.2.c.1 /
 * 464.2.c.3 (Attacker = who applied Contested; units gain designations); 383.4.e (attack trigger on
 * first gaining Attacker); 423.1 / 423.1.b (Stun; no combat damage); 466.3.a / 466.5.d (winner
 * establishes control = Conquer); 317.1 + 455 / 456.1 (EOT: lose control, Recall — not a move);
 * 190.4.c / 323.6 (no units → lose the battlefield); 323.12 / 344.2 / 345 / 348.2.a (NO: Non-Combat
 * Showdown with P1's Focus, then establish control = Conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const VI = "unl-176-219";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: G, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn. P2 holds bfA with an exhausted Vi (+ optionally the 4-Might Brute). P1 has exactly HT's cost. */
function board(opts: { brute?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", VI, "vi", { exhausted: true });
  if (opts.brute !== false) {
    s = s.unit(P2, "bfA", { might: 4, name: "Brute" }, "brute");
  }
  return s.hand(P1, HOSTILE_TAKEOVER, "ht");
}

/** Cast HT on Vi and let exactly the spell resolve (both pass once). */
async function resolved(opts: { brute?: boolean } = {}): Promise<G> {
  const game = await board(opts).build();
  await game.p1.cast("ht", { targets: "vi" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

describe("Hostile Takeover × Vi, Peacekeeper — the stolen unit attacks her former ally", () => {
  // ---- setup ------------------------------------------------------------------------------------

  test("setup: HT offers exactly the enemy units at a battlefield (Vi, Brute) and costs 5 + 2 power", async () => {
    const game = await board().build();
    expect(game.state("vi")).toMatchObject({ controller: P2, isExhausted: true, might: 5, owner: P2, zone: "battlefield-bfA" });
    expect(targetsOffered(game, "ht").sort()).toEqual(["brute", "vi"]);
    await game.p1.cast("ht", { targets: "vi" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ht"]);
  });

  // ---- YES: Brute is there ------------------------------------------------------------------------

  test("YES: while HT is still on the chain nothing has begun — bfA is not Contested, Vi is still P2's, no combat roles (323.13)", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "vi" });
    await game.p1.passPriority(); // P2 now holds priority; HT unresolved
    expect(game.zoneOf("ht")).toBe("chain");
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.state("vi").controller).toBe(P2);
    expect(game.state("vi").combatRole).toBeNull();
    expect(game.state("brute").combatRole).toBeNull();
  });

  test("YES: after HT resolves Vi is P1-controlled (owner P2), READY, still at bfA — and bfA becomes Contested BY P1 while P2 still controls it (477.1.a, 190.3.a)", async () => {
    const game = await resolved();
    expect(game.state("vi")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
    expect(game.gameState.battlefields.bfA?.contestedBy).toBe(P1);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("YES: Combat begins in the cleanup — Attacker = P1 (applied Contested), Defender = P2; Vi is the attacking unit, Brute the defending unit (464.2.c.1 / 464.2.c.3)", async () => {
    const game = await resolved();
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("brute").combatRole).toBe("defender");
  });

  test("YES: Vi's 'When I attack' trigger fires under P1's control and targets Brute — 'enemy' is relative to her CURRENT controller (383.4.e)", async () => {
    const game = await resolved();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "vi", controller: P1, targets: ["brute"], triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("brute").isStunned).toBe(true);
    expect(game.state("vi").isStunned).toBe(false);
    // The combat showdown proper: the Attacker (P1) holds Focus first.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
  });

  test("YES outcome: stunned Brute deals 0 and dies to Vi's 5; Vi undamaged and still READY; P1 conquers bfA for +1 (423.1.b, 466.3.a, 466.5.d)", async () => {
    const game = await resolved();
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("vi")).toMatchObject({ controller: P1, damage: 0, isReady: true, owner: P2, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("YES end of turn: control reverts to P2 and Vi is Recalled to P2's base; bfA is left without P1 units so P1 no longer controls it (317.1, 455/456.1, 190.4.c/323.6)", async () => {
    const game = await resolved();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("vi")).toMatchObject({ controller: P2, damage: 0, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("vi");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller ?? null).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("YES: P1 cannot Hold bfA — back on P1's next turn the score is still 1", async () => {
    const game = await resolved();
    await game.settle();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bfA?.controller ?? null).not.toBe(P1);
  });

  // ---- NO: Vi alone ---------------------------------------------------------------------------------

  // With no opposing units only a Showdown is staged (323.8, not 323.9); at the Neutral Open cleanup a
  // Non-Combat Showdown begins with P1 (who applied Contested) holding Focus (323.12, 344.2, 345), so P2
  // gets a window for Action / Reaction plays before P1 conquers (348.2.a). In that same Cleanup step 4
  // (323.6 / 190.4.c) runs BEFORE the Showdown begins, and P2 — whose only unit at bfA has just become
  // P1's — has no unit there and no Showdown ongoing yet, so P2's control lapses first: bfA is
  // uncontrolled while the Showdown runs and P1 establishes control at its close.
  test("NO — after HT resolves a Non-Combat Showdown opens at bfA with P1's Focus BEFORE control is established (323.12, 344.2, 345)", async () => {
    const game = await resolved({ brute: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
    expect(game.gameState.battlefields.bfA?.controller ?? null).not.toBe(P1); // 323.6 already took it from P2
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("NO: there is no combat and Vi's attack trigger never fires; once all is settled P1 has established control of bfA = Conquer, +1 (348.2.a — 'Otherwise, conquer.')", async () => {
    const game = await resolved({ brute: false });
    expect(game.chain()).toEqual([]); // no 'When I attack' item
    await game.settle(); // hands back the auto-begun Non-Combat Showdown (344.2) once …
    await game.settle(); // … then passes Focus through it and conquers
    expect(game.state("vi")).toMatchObject({ combatRole: null, controller: P1, damage: 0, isReady: true, isStunned: false, owner: P2, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("NO end of turn: Vi reverts to P2 and is recalled to P2's base; P1 keeps the point but not the battlefield", async () => {
    const game = await resolved({ brute: false });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("vi")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller ?? null).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ---- PARITY: P1 Standard-Moves its own Vi onto bfA ----------------------------------------------

  test("PARITY (YES): P1's own ready Vi moving onto bfA next to Brute — same roles, same P1-controlled attack trigger on Brute, same conquer +1; the only difference is that she is exhausted by the move", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P2 })
      .unit(P1, "base", VI, "vi")
      .unit(P2, "bfA", { might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.move("vi", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.state("vi")).toMatchObject({ combatRole: "attacker", isExhausted: true });
    expect(game.state("brute").combatRole).toBe("defender");
    expect(game.chain()[0]).toMatchObject({ cardId: "vi", controller: P1, targets: ["brute"], triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brute").isStunned).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("vi")).toMatchObject({ damage: 0, isExhausted: true, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("PARITY (NO): P1's own Vi moving onto an EMPTY P2-held bfA opens a Non-Combat Showdown with P1's Focus; after both pass P1 conquers for +1 and no attack trigger fires", async () => {
    const game = await scenario().battlefield("bfA", { controller: P2 }).unit(P1, "base", VI, "vi").build();
    await game.p1.move("vi", "bfA");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    // rule 323.6 / 190.4.c — P2's unit-less (seeded) control lapses in the Cleanup after the move, before the
    // showdown begins (it is only staged then): the showdown runs at an uncontrolled, P1-contested bfA.
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.state("vi").isStunned).toBe(false);
  });
});
