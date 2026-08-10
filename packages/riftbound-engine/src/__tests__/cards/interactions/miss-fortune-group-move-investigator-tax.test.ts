/**
 * Interaction: a taxed GROUP move + a "first time I move" trigger whose best target is the co-mover.
 *   Miss Fortune, Captain (ogn-162-298) · Champion Unit · Body · 5 · 5 Might
 *     "[Accelerate] [Ganking] The first time I move each turn, you may ready something else that's exhausted."
 *   × Mageseeker Investigator (unl-163-219) · Unit · Order · 4 · 4 Might
 *     "Opponents must pay [rainbow] for each unit beyond the first to move multiple units to my
 *      battlefield at the same time."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit.
 *
 * Question. P1: Miss Fortune (MF) + Skulker ready in base. P2 holds bfB with the Investigator.
 *   (a) ONE Standard Move sending MF + Skulker to bfB — what is owed, when is it paid, can P2 react,
 *       what if P1 won't/can't pay?
 *   (b) Can P1 dodge the tax by moving MF first and Skulker right after (any per-turn move cap)?
 *   (c) After the paid group move, can MF's trigger ready Skulker (exhausted as the cost of that very
 *       move)? Does combat wait for it? How many combats, who attacks, outcome?
 *   (d) Had the attack failed and both been recalled, would MF (readied somehow) moving again this
 *       turn re-trigger? Did the recall count as / use up a move?
 *   (e) 2-player sanity: does the "2 other players" clause ever restrict anything here?
 *
 * Rules: 144.1.a / 410.1.b (Standard Move = discretionary, any number of times); 144.1.c (never
 * during a Showdown/Combat); 144.3 / 144.3.a / 144.3.c (multi-unit move = one action, one
 * destination, exhaust costs paid together); 204.4 / 204.4.b / 204.4.c (Investigator = applied
 * cost: paid as the action is performed, no chain, unpayable → no action); 383.3.a (leading "you
 * may" decided at finalization); 323.9 / 323.13 / 460 (arrival stages combat; it BEGINS only from a
 * Neutral Open state, i.e. after the move trigger's chain resolves); 464.2.c.1 / 464.2.c.3
 * (attacker = who applied Contested; all their units there attack); 465.2.c.3 (lethal-first
 * assignment); 456.1 (recalls are not moves and trigger nothing); 144.4.a.1 / 449.2 (the
 * "2 other players" clause — inert with two players).
 *
 * Expected: (a) 1 [rainbow] (power, any domain) paid together with exhausting both units as the
 * move happens; no chain, no reaction; with 0 power the pair move is simply unavailable while single
 * moves stay free. (b) No per-turn cap, but MF arriving alone stages and begins combat at once;
 * Standard Moves are illegal during it, so Skulker can only follow after that combat — MF fights
 * alone first. (c) Yes: Skulker is already exhausted when the trigger finalizes → legal target; P2
 * gets priority on it; it resolves and readies Skulker at bfB; only THEN does the single combat
 * begin, P1 attacking with both (8 vs 4): Investigator dies, P2 assigns 4 lethal-first (3→Skulker
 * +1→MF kills Skulker, or 4→MF kills nothing), P1 conquers bfB. (d) No re-trigger — the group move
 * was her first move; the recall is not a move. (e) No — reinforcing a battlefield where both P1 and
 * P2 already stand is ordinary.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-162-298";
const INVESTIGATOR = "unl-163-219";
const SKULKER = "ogn-175-298";

/** Inline "Ready a unit." action spell — the "readied somehow" of question (d). */
const SECOND_WIND = {
  abilities: [{ effect: { target: { type: "unit" }, type: "ready" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Second Wind",
  rulesText: "Ready a unit.",
  timing: "action",
};

/**
 * P1's turn 2, Neutral Open. bfA is P1's (a 1-Might Holder keeps it), bfB is P2's with the Investigator on it.
 * P1: MF + Skulker ready in base, pool = 0 energy / `body` Body power.
 */
function board(body: number) {
  return scenario()
    .resources(P1, { energy: 0, power: { body } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 1, name: "Holder" }, "holder") // rule 190.4.a — bfA is P1's only while a P1 unit holds it
    .unit(P2, "bfB", INVESTIGATOR, "msi")
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "base", SKULKER, "sk");
}

/** Unit-sets P1 may currently Standard-Move to `bf` (each sorted). */
function moveSetsOffered(game: Game, bf: string): string[][] {
  return (game.p1.option(`standardMove:to:${bf}`)?.variants ?? []).map((v) => [...((v.params.unitIds as string[]) ?? [])].sort());
}

/** Group move, then both players pass priority on MF's trigger (it resolves); stops at the combat showdown. */
async function groupMoveAndResolveTrigger(): Promise<Game> {
  const game = await board(1).build();
  await game.p1.move(["mf", "sk"], "bfB");
  await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("(a) one Standard Move of MF + Skulker onto the Investigator: 1 [rainbow] applied cost, paid with the exhausts, no chain", () => {
  test("with 1 Body power the pair move to bfB is enumerated alongside the free single moves", async () => {
    const game = await board(1).build();
    const sets = moveSetsOffered(game, "bfB");
    expect(sets).toContainEqual(["mf"]);
    expect(sets).toContainEqual(["sk"]);
    expect(sets).toContainEqual(["mf", "sk"]);
  });

  test("taking it pays the Body power AS the move is performed (pool → 0, energy untouched) and exhausts both movers, who are now at bfB (144.3.c, 204.4.b)", async () => {
    const game = await board(1).build();
    await game.p1.move(["mf", "sk"], "bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("mf")).toBe("bfB");
    expect(game.locationOf("sk")).toBe("bfB");
    expect(game.state("mf").isExhausted).toBe(true);
    expect(game.state("sk").isExhausted).toBe(true);
  });

  test("the tax itself never appears on the chain and P2 gets no window against it — the only chain item afterwards is MF's move trigger (204.4.b)", async () => {
    const game = await board(1).build();
    await game.p1.move(["mf", "sk"], "bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", controller: P1, triggered: true, type: "ability" })]);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.power()).toBe(0); // already paid before anyone holds priority
  });

  test("can't pay (0 power): the pair move is not enumerated and is rejected — nothing moves; either unit may still go alone for free (204.4.c)", async () => {
    const game = await board(0).build();
    expect(moveSetsOffered(game, "bfB")).not.toContainEqual(["mf", "sk"]);
    expect(moveSetsOffered(game, "bfB")).toContainEqual(["mf"]);
    expect(moveSetsOffered(game, "bfB")).toContainEqual(["sk"]);
    const r = await game.p1.try((p) => p.move(["mf", "sk"], "bfB"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("mf")).toBe("base");
    expect(game.locationOf("sk")).toBe("base");
    await game.p1.move("sk", "bfB");
    expect(game.locationOf("sk")).toBe("bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("the untaxed alternative destination: the same pair moves to P1's own bfA for nothing", async () => {
    const game = await board(0).build();
    expect(moveSetsOffered(game, "bfA")).toContainEqual(["mf", "sk"]);
    await game.p1.move(["mf", "sk"], "bfA");
    expect(game.p1.units("bfA").sort()).toEqual(["holder", "mf", "sk"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });
});

describe("(b) sequencing MF then Skulker: no per-turn cap, but MF's solo arrival starts a combat that Skulker cannot join", () => {
  test("MF alone moves in free (0 power); once her trigger clears, combat at bfB has begun and NO Standard Move is legal during it (144.1.c)", async () => {
    const game = await board(0).build();
    await game.p1.move("mf", "bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // rule 402.4: she moved alone, so nothing ELSE is exhausted — her optional
    // trigger has no legal target and is removed at finalization without ever
    // reaching the Chain, so the staged showdown opens straight away.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("mf").combatRole).toBe("attacker");
    expect(game.state("sk").location).toBe("base");
    expect(game.p1.can("standardMove:to:bfB")).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "standardMove")).toBe(false);
    await expect(game.p1.move("sk", "bfB")).rejects.toThrow();
  });

  test("MF fights alone first (5 vs 4: Investigator dies, MF survives and conquers); afterwards Skulker's own Standard Move to bfB is legal and free — two Standard Moves in one turn (410.1.b, 144.1.a)", async () => {
    const game = await board(0).build();
    await game.p1.move("mf", "bfB");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("msi")).toBe("trash");
    expect(game.locationOf("mf")).toBe("bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(moveSetsOffered(game, "bfB")).toEqual([["sk"]]);
    await game.p1.move("sk", "bfB");
    expect(game.locationOf("sk")).toBe("bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([]); // Skulker has no move trigger; MF did not move
  });
});

describe("(c) MF's 'first time I move' trigger after the paid group move readies Skulker; combat waits; one combat, P1 attacks with both", () => {
  test("the trigger finalizes with Skulker — exhausted by the very same move — as its chosen 'something else that's exhausted', and P1 holds priority first", async () => {
    const game = await board(1).build();
    await game.p1.move(["mf", "sk"], "bfB");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", targets: ["sk"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("sk").isExhausted).toBe(true); // not readied yet — the ability is still on the chain
  });

  // Expected (383.3.a): "you MAY ready something else" — at finalization P1 is asked whether to
  // perform the trigger at all (a yes/no, or at least a declinable target pick) before anyone holds
  // priority. Actual: with exactly one exhausted candidate the engine binds Skulker and puts the
  // ability on the chain without ever offering P1 the choice not to.
  test("the leading 'you may' is put to P1 at finalization — an opt-in / declinable choice before the ability sits on the chain (383.3.a)", async () => {
    const game = await board(1).build();
    await game.p1.move(["mf", "sk"], "bfB");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    const optional = d?.kind === "yes-no" || (d?.kind === "pick" && d.allowDecline === true);
    expect(optional).toBe(true);
  });

  test("combat WAITS: while the trigger is on the chain no showdown has begun and nobody has a combat role; P2 gets priority and may React (323.13, 460)", async () => {
    const game = await board(1).build();
    await game.p1.move(["mf", "sk"], "bfB");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    expect(game.state("mf").combatRole).toBeNull();
    expect(game.state("msi").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfB?.contested).toBe(true);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
  });

  test("both pass → the trigger resolves: Skulker is READY at bfB; only now the combat showdown opens with P1 (attacker) holding Focus, MF + Skulker attackers, Investigator defender (464.2.c.1, 464.2.c.3)", async () => {
    const game = await groupMoveAndResolveTrigger();
    expect(game.chain()).toEqual([]);
    expect(game.state("sk")).toMatchObject({ isReady: true, location: "bfB" });
    expect(game.state("mf").isExhausted).toBe(true); // "something ELSE" — never herself
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("mf").combatRole).toBe("attacker");
    expect(game.state("sk").combatRole).toBe("attacker");
    expect(game.state("msi").combatRole).toBe("defender");
  });

  test("ONE combat, 8 vs 4: Investigator takes lethal; P2 is asked to assign its 4 lethal-first between MF (lethal 5) and Skulker (lethal 3) (465.2.c.3)", async () => {
    const game = await groupMoveAndResolveTrigger();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    const buckets = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(buckets).toEqual({ mf: 5, sk: 3 });
  });

  test("line 1 — P2 assigns 3 to Skulker then 1 to MF: Skulker dies, MF survives, Investigator dies, P1 conquers bfB (+1 point)", async () => {
    const game = await groupMoveAndResolveTrigger();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p2.distribute({ mf: 1, sk: 3 });
    await game.settle();
    expect(game.zoneOf("msi")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("trash");
    expect(game.locationOf("mf")).toBe("bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("line 2 — P2 puts all 4 into MF: nothing of P1's dies, Investigator dies, P1 conquers bfB with both units there; Skulker is still READY afterwards", async () => {
    const game = await groupMoveAndResolveTrigger();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p2.distribute({ mf: 4 });
    await game.settle();
    expect(game.zoneOf("msi")).toBe("trash");
    expect(game.p1.units("bfB").sort()).toEqual(["mf", "sk"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sk").isReady).toBe(true);
    expect(game.state("mf").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // exactly one combat happened
  });

  test("an illegal non-lethal-first split (2 / 2) is refused (465.2.c.3)", async () => {
    const game = await groupMoveAndResolveTrigger();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const r = await game.p2.try((p) => p.distribute({ mf: 2, sk: 2 }));
    expect(r.ok).toBe(false);
  });
});

describe("(d) failed attack → recall is not a move; MF readied and moving again this turn does NOT re-trigger", () => {
  /** bfB additionally holds a stunned 10-Might Wall (deals no combat damage, survives 8) so the attack fails and both attackers are recalled alive. */
  function wallBoard() {
    return board(1)
      .unit(P2, "bfB", { might: 10, name: "Wall" }, "wall", { stunned: true })
      .hand(P1, SECOND_WIND, "wind");
  }

  test("group move (trigger readies Skulker) → combat: Investigator dies but the Wall survives → attack fails, MF and Skulker are recalled to base; the recall neither exhausts, readies nor triggers anything (456.1)", async () => {
    const game = await wallBoard().script(P2, [{ allocation: { mf: 4 }, kind: "distribute" }]).build();
    await game.p1.move(["mf", "sk"], "bfB");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("msi")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.locationOf("mf")).toBe("base");
    expect(game.locationOf("sk")).toBe("base");
    expect(game.state("mf").isExhausted).toBe(true); // still exhausted from her move
    expect(game.state("sk").isReady).toBe(true); // readied by the trigger before combat; recall keeps it so
    expect(game.chain()).toEqual([]); // the recall put no "move" trigger anywhere
    expect(game.p1.points()).toBe(0);
  });

  test("MF readied by a spell then Standard-Moves again (to bfA): this is her SECOND move of the turn — no trigger, no prompt, chain stays empty", async () => {
    const game = await wallBoard().script(P2, [{ allocation: { mf: 4 }, kind: "distribute" }]).build();
    await game.p1.move(["mf", "sk"], "bfB");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    await game.settle();
    await game.p1.cast("wind", { targets: "mf" });
    await game.settle();
    expect(game.state("mf").isReady).toBe(true);
    // exhaust Skulker again by moving it first, so a (wrong) re-trigger would have a visible target
    await game.p1.move("sk", "bfA");
    expect(game.state("sk").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    await game.p1.move("mf", "bfA");
    expect(game.locationOf("mf")).toBe("bfA");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("sk").isExhausted).toBe(true); // nothing readied it
  });

  test("control: on the NEXT turn her first move triggers again", async () => {
    const game = await wallBoard().script(P2, [{ allocation: { mf: 4 }, kind: "distribute" }]).build();
    await game.p1.move(["mf", "sk"], "bfB");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (turn 4): her units ready in the Awaken step
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mf").isReady).toBe(true);
    await game.p1.move("sk", "bfA"); // exhaust Skulker → a target exists
    await game.p1.move("mf", "bfA");
    await game.p1.yes(); // rule 383.3.a — her leading "you may" is answered at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", targets: ["sk"], triggered: true })]);
  });
});

describe("(e) two players: the '2 other players' destination ban (144.4.a.1 / 449.2) is inert", () => {
  test("bfB already holding a P2 unit AND a P1 unit is still a legal destination for more P1 units — singly or as the (taxed) pair", async () => {
    const game = await board(1).unit(P1, "bfB", { might: 1, name: "Scout" }, "scout").build();
    const sets = moveSetsOffered(game, "bfB");
    expect(sets).toContainEqual(["mf"]);
    expect(sets).toContainEqual(["sk"]);
    expect(sets).toContainEqual(["mf", "sk"]);
    await game.p1.move(["mf", "sk"], "bfB");
    expect(game.p1.units("bfB").sort()).toEqual(["mf", "scout", "sk"]);
    expect(game.p1.power()).toBe(0); // the Investigator tax still applied, nothing else did
  });
});
