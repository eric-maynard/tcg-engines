/**
 * Interaction: Vi, Destructive (ogn-036-298 · Fury champion unit, 2, 3 Might, [Ganking]; "Recycle 1 from your trash:
 *     Give me +1 [Might] this turn.")
 *   × Back-Alley Bar (ogn-277-298 · Battlefield) "When a unit moves from here, give it +1 [Might] this turn."
 *   × Vanguard Sergeant (ogn-219-298 · Order unit, 4, 4 Might, no text)
 *   with a lone P2 6-Might vanilla unit holding bfB.
 *
 * Question: P1's turn, Neutral Open. bfA IS Back-Alley Bar (live text), controlled by P1 with a READY Vi there. P1's
 * base: ready Vanguard Sergeant. bfB: P2 with one 6-Might unit.
 *   (a) May P1 declare ONE Standard Move whose movers have DIFFERENT origins — Vi from bfA (via Ganking) and Sergeant
 *       from base — to the SAME destination bfB? Both exhausted in one event? Does the Bar fire for Vi only? How many
 *       Contested applications / staged combats; who attacks; what happens to bfA's control; combat result.
 *   (b) Contrast: Sergeant alone base → bfB first. Is Vi's move to bfB listed while the showdown at bfB is open?
 *   (c) Contrast: Vi EXHAUSTED at bfA — what mover set is offered toward bfB?
 *   (d) Contrast: swap — the non-Ganking Sergeant is the one at bfA. Can it be part of any bfA → bfB move?
 *
 * Rules: 144.3 / 144.3.a / 144.3.b / 144.3.c (multi-unit Standard Move = ONE action, shared Destination, Origins free,
 * exhaust costs paid simultaneously), 144.4.a / 144.4.c.1 + 810.1.b / 810.1.c (Ganking only ADDS bf→bf to THAT unit's
 * Standard Move), 144.2 / 414.1.b (exhausting is the cost; an exhausted unit can't pay it), 144.1.c (no Standard Move
 * during a Showdown/Combat), 446.3 (moving is instantaneous, no chain), 190.3.a.1 / 450 (Contested applied once by the
 * arriving controller), 453 (one Cleanup after the move), 323.6 / 190.4.c (a battlefield with none of your units becomes
 * uncontrolled at an Open-state Cleanup), 323.8 / 323.9 / 323.13 (Combat staged, begins from Neutral Open — i.e. after
 * the Bar's trigger has resolved), 345 / 464.2.c.1 (P1 applied Contested → Attacker, gains Focus), 464.2.c.3 (all P1
 * units there are attackers), 465.2.c.3 (lethal-first assignment).
 *
 * Expected: (a) legal; both exhausted, both at bfB, chain holds exactly ONE Bar trigger (for Vi); after it resolves Vi is
 * 4 and Sergeant 4; bfB contested once by P1; ONE combat with P1 attacking (Focus) and both units attackers; bfA
 * uncontrolled; 8 into the 6 kills it, 6 back kills exactly one of Vi/Sergeant; P1 conquers bfB, +1.
 * (b) Sergeant's arrival begins combat at once; while it is open no Standard/Ganking move for Vi is listed; Sergeant (4)
 * dies to the 6, P2 keeps bfB; afterwards Vi's gank to bfB is listed again. (c) only {Sergeant} is offered toward bfB.
 * (d) Sergeant-at-bfA is never offered toward bfB (only toward base); Vi from base alone is.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";
const BACK_ALLEY_BAR = "ogn-277-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/** Unit-groups the engine offers P1 for a Standard Move to `dest` (each option is a sorted list of unit ids). */
function moveGroupsOffered(game: Game, dest: string): string[][] {
  const opt = game.p1.option(`standardMove:to:${dest}`);
  const field = opt?.fields.find((f) => f.arg === "units");
  return ((field?.options ?? []) as string[][]).map((g) => [...g].sort());
}

/** Every Standard-Move / Ganking option currently listed for P1 that carries `unit`. */
function moveOptionsCarrying(game: Game, unit: string): string[] {
  const out: string[] = [];
  for (const o of game.p1.legal()) {
    if (o.moveId === "standardMove" && o.variants.some((v) => ((v.params.unitIds as string[] | undefined) ?? []).includes(unit))) {
      out.push(o.key);
    }
    if (o.moveId === "gankingMove" && o.card === unit) {
      out.push(o.key);
    }
  }
  return out;
}

/** Sum of combat damage dealt to `target` according to the public damage log. */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/**
 * P1's turn 2, Neutral Open. bfA = Back-Alley Bar (live text) controlled by P1 with Vi on it; Sergeant in P1's base;
 * bfB controlled by P2 with a lone 6-Might vanilla unit. `viExhausted` / `swap` build the (c) / (d) contrasts.
 */
function board(opts: { viExhausted?: boolean; swap?: boolean } = {}) {
  const s = scenario()
    .battlefield("bfA", { controller: P1, def: BACK_ALLEY_BAR, inert: false })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 6, name: "Big Six" }, "six");
  if (opts.swap) {
    return s.unit(P1, "bfA", VANGUARD_SERGEANT, "sarge").unit(P1, "base", VI, "vi");
  }
  return s
    .unit(P1, "bfA", VI, "vi", opts.viExhausted ? { exhausted: true } : undefined)
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge");
}

describe("Vi (Ganking, from Back-Alley Bar) + Vanguard Sergeant (from base) — one mixed-origin Standard Move into a defended battlefield", () => {
  test("setup: Vi (3, Ganking, ready) at bfA = the Bar, Sergeant (4) in base, P2's 6 at bfB; Neutral Open with P1 to act", async () => {
    const game = await board().build();
    expect(game.state("vi")).toMatchObject({ isReady: true, location: "bfA", might: 3 });
    expect(game.state("vi").keywords).toContain("Ganking");
    expect(game.state("sarge")).toMatchObject({ isReady: true, location: "base", might: 4 });
    expect(game.state("sarge").keywords).not.toContain("Ganking");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ================================================================== (a) YES — one move, two origins
  test("(a) the mover set {Vi (bfA, Ganking), Sergeant (base)} IS offered for ONE Standard Move to bfB (144.3.a/b, 144.4.a, 144.4.c.1)", async () => {
    const game = await board().build();
    const groups = moveGroupsOffered(game, "bfB");
    expect(groups).toContainEqual(["sarge", "vi"]);
    expect(groups).toContainEqual(["sarge"]); // Sergeant alone from base
    expect(groups).toContainEqual(["vi"]); // Vi alone via Ganking
    const r = await game.p1.try((p) => p.move(["vi", "sarge"], "bfB"));
    expect(r.ok).toBe(true);
  });

  test("(a) right after the move: both are AT bfB and BOTH exhausted (144.3.c, 446.3); bfB is Contested by P1 once (450); the chain holds exactly ONE Back-Alley Bar trigger — for Vi, who moved FROM there — and combat has not begun yet (323.13)", async () => {
    const game = await board().build();
    await game.p1.move(["vi", "sarge"], "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.locationOf("sarge")).toBe("bfB");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("sarge").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const items = game.chain();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cardId: "bfA", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing has resolved yet: both still at printed Might, no combat designations.
    expect(game.state("vi").might).toBe(3);
    expect(game.state("sarge").might).toBe(4);
    expect(game.state("six").combatRole ?? null).not.toBe("defender");
  });

  test("(a) the Bar's trigger resolves for Vi ONLY: Vi 3 → 4 this turn, Sergeant stays 4 (it moved from base, not 'from here')", async () => {
    const game = await board().build();
    await game.p1.move(["vi", "sarge"], "bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("vi")).toMatchObject({ baseMight: 3, might: 4, mightModifier: 1 });
    expect(game.state("sarge")).toMatchObject({ baseMight: 4, might: 4, mightModifier: 0 });
  });

  test("(a) once the chain is empty (Neutral Open) ONE combat begins at bfB: P1 — who applied Contested — is the Attacker and holds Focus; BOTH Vi and Sergeant carry the Attacker designation, the 6 is the Defender (345, 464.2.c.1, 464.2.c.3)", async () => {
    const game = await board().build();
    await game.p1.move(["vi", "sarge"], "bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack.filter((s) => s.active)).toHaveLength(1);
    expect(stack.at(-1)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("six").combatRole).toBe("defender");
    // bfA is not contested and stages nothing — nobody arrived there.
    expect(game.gameState.battlefields.bfA?.contested ?? false).toBe(false);
  });

  test("(a) bfA — the Bar — is left with no P1 unit: by the time combat opens at bfB (an Open-state Cleanup has run) it is UNCONTROLLED (190.4.c, 323.6)", async () => {
    const game = await board().build();
    await game.p1.move(["vi", "sarge"], "bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.units("bfA")).toHaveLength(0);
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
  });

  test("(a) combat: 4 + 4 = 8 into the 6 kills it; its 6 comes back lethal-first — exactly ONE of Vi (4) / Sergeant (4) dies, the other survives healed; P1 conquers bfB and scores 1 (465.2.c.3, 466.5)", async () => {
    const game = await board().build();
    await game.p1.move(["vi", "sarge"], "bfB");
    await game.settle();
    expect(combatDamageTo(game, "six")).toBe(8);
    expect(combatDamageTo(game, "vi") + combatDamageTo(game, "sarge")).toBe(6);
    expect(game.zoneOf("six")).toBe("trash");
    const dead = ["vi", "sarge"].filter((u) => game.zoneOf(u) === "trash");
    const alive = ["vi", "sarge"].filter((u) => game.zoneOf(u) === "battlefield-bfB");
    expect(dead).toHaveLength(1);
    expect(alive).toHaveLength(1);
    expect(game.state(alive[0] as string).damage).toBe(0);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (b) contrast — sequential
  test("(b) Sergeant ALONE base → bfB: no trigger (not from the Bar), so its arrival stages a Combat that begins AT ONCE from Neutral Open — P1 has Focus, Sergeant attacks alone (323.13)", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bfB");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("six").combatRole).toBe("defender");
    expect(game.state("vi")).toMatchObject({ combatRole: null, isReady: true, location: "bfA" });
  });

  test("(b) while that Showdown/Combat is open NO Standard Move (Ganking or otherwise) is listed for Vi — she cannot join (144.1.c); forcing it is rejected and she stays ready at bfA", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bfB");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(moveOptionsCarrying(game, "vi")).toEqual([]);
    expect(game.p1.can("move")).toBe(false);
    expect(game.p1.can("gank", "vi")).toBe(false);
    await expect(game.p1.gank("vi", "bfB")).rejects.toThrow();
    await expect(game.p1.move("vi", "bfB")).rejects.toThrow();
    expect(game.state("vi")).toMatchObject({ isReady: true, location: "bfA" });
    // Same after Focus passes to P2 and back — still a showdown, still no move.
    await game.p1.passFocus();
    expect(moveOptionsCarrying(game, "vi")).toEqual([]);
  });

  test("(b) outcome: Sergeant 4 into 6 — Sergeant dies, the 6 survives, P2 keeps bfB, nobody scores; only NOW, back in Neutral Open, is Vi's Ganking move to bfB listed again (a second action / second combat)", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bfB");
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("six")).toBe("battlefield-bfB");
    expect(game.state("six").damage).toBe(0);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("gank", "vi")).toBe(true);
    expect(moveGroupsOffered(game, "bfB")).toContainEqual(["vi"]);
    // And it really is a second, separate combat with its own Contested application.
    await game.p1.gank("vi", "bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bfA", triggered: true })]); // the Bar fires for this move
  });

  // ================================================================== (c) contrast — Vi exhausted
  test("(c) an EXHAUSTED Vi cannot pay the move's cost (144.2, 414.1.b): toward bfB the only mover set offered is {Sergeant}; any set containing Vi is rejected", async () => {
    const game = await board({ viExhausted: true }).build();
    expect(game.state("vi").isExhausted).toBe(true);
    const groups = moveGroupsOffered(game, "bfB");
    expect(groups).toEqual([["sarge"]]);
    expect(groups.some((g) => g.includes("vi"))).toBe(false);
    expect(game.p1.can("gank", "vi")).toBe(false);
    await expect(game.p1.move(["vi", "sarge"], "bfB")).rejects.toThrow();
    await expect(game.p1.gank("vi", "bfB")).rejects.toThrow();
    expect(game.locationOf("vi")).toBe("bfA");
    expect(game.locationOf("sarge")).toBe("base");
    expect(game.state("sarge").isReady).toBe(true); // a rejected bundle paid nothing
  });

  // ================================================================== (d) contrast — the non-Ganker is at bfA
  test("(d) swapped: Sergeant (no Ganking) at bfA is NEVER offered toward bfB — alone or alongside Vi-from-base; its only Standard-Move destination is base (144.4, 810.1.c is per unit)", async () => {
    const game = await board({ swap: true }).build();
    expect(game.state("sarge")).toMatchObject({ isReady: true, location: "bfA" });
    expect(game.state("vi")).toMatchObject({ isReady: true, location: "base" });
    const toB = moveGroupsOffered(game, "bfB");
    expect(toB).toEqual([["vi"]]); // Vi from base (144.4.a) is the only mover toward bfB
    expect(toB.some((g) => g.includes("sarge"))).toBe(false);
    expect(moveGroupsOffered(game, "base")).toEqual([["sarge"]]);
    expect(game.p1.can("gank", "sarge")).toBe(false);
    await expect(game.p1.move(["vi", "sarge"], "bfB")).rejects.toThrow();
    await expect(game.p1.move("sarge", "bfB")).rejects.toThrow();
    await expect(game.p1.gank("sarge", "bfB")).rejects.toThrow();
    expect(game.locationOf("sarge")).toBe("bfA");
    expect(game.state("sarge").isReady).toBe(true);
    expect(game.locationOf("vi")).toBe("base");
  });
});
