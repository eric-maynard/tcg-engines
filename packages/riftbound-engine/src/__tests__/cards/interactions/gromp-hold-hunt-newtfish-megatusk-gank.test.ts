/**
 * Interaction: Voracious Gromp (unl-100-219) · Unit · Body · 5 Might · "[Hunt 3] (When I conquer or hold, gain 3 XP.)"
 *   × Wily Newtfish (unl-108-219) · Unit · Body · 4 Might · "If you've gained XP this turn, I have +1 [Might] and [Ganking]."
 *   × Megatusk (unl-126-219) · Unit · Chaos · 6 Might · "Spend 3 XP: Give your units here [Ganking] this turn."
 *   vs a vanilla 5-Might "Wall" of P2's holding bfB.
 *
 * Rules: 315.2.b / 469.2 / 471.1 (Hold in the Scoring Step of the Beginning Phase → 1 point), 471.2.b +
 * 383.4.d.2.a (THEN the Hold abilities of units present go on the chain), 823.1.b/823.1.c.1 (Hunt = "When I
 * conquer or hold, my controller gains X XP" — only Gromp has one), 470 / 471.2.c (once per battlefield per
 * turn — a later Conquer of a DIFFERENT battlefield scores and triggers again), 381 (activated abilities:
 * your turn, Open State — not on the Beginning-Phase chain, not in a Showdown), 144.1.a/144.1.c (Standard
 * Move: Main Phase, never during a Showdown), 144.3/144.3.a/144.3.c (multi-unit Standard Move = one action,
 * same destination, exhaust together), 144.4.c.1 + 810.1.b (Ganking adds battlefield→battlefield to THAT
 * unit's Standard Move), 810.2 (extra Ganking is redundant), 464.2.c.3 (all the mover's units there become
 * Attackers → one combat), 730.1 vs 730.2 (gaining ≠ spending XP; Newtfish asks "gained this turn").
 *
 * Question: P1 (0 XP) has held bfA since last turn with Gromp, Newtfish and Megatusk; P2's Wall (5) holds bfB.
 * P2 ends the turn.
 *   (a) How many Hold/Hunt items go on the chain, when (relative to the point), and does P2 get a window first?
 *   (b) During P2's turn just ended, was Newtfish 5 / Ganking?  (c) After Hunt (XP 3): who may move bfA→bfB?
 *   (d) Megatusk spends all 3 XP (→ 0): does Newtfish switch off? "Ganking twice"? Can all three make ONE
 *       Standard Move bfA→bfB, how many combats, and what happens (incl. Gromp's Hunt on the Conquer)?
 *   (e) Could Megatusk have been activated on the Beginning-Phase chain or inside the showdown?
 *
 * Expected: (a) exactly ONE item (Gromp's Hunt 3), after the hold point is already scored; P1 then P2 get
 * priority; on resolution XP 0→3. (b) No — plain 4, no Ganking. (c) Only Newtfish (5, Ganking) is offered
 * bfA→bfB; Gromp/Megatusk only bfA→base. (d) XP 3→0; Newtfish stays ON (it GAINED XP this turn); its second
 * Ganking is redundant; all three move as one action, exhaust together, ONE combat with three attackers:
 * 16 vs 5 → Wall dies, P1 conquers bfB (2 points). P2 assigns its 5 lethal-first to ONE attacker of its
 * choice: on Megatusk (or Newtfish) Gromp survives → Hunt 3 triggers again on the Conquer → XP 3; if P2 kills
 * Gromp with it, Gromp is not there to conquer → XP stays 0. (e) No and no.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GROMP = "unl-100-219";
const NEWTFISH = "unl-108-219";
const MEGATUSK = "unl-126-219";

/** Turn 2, P2 active and about to end the turn. P1 (startXp) controls bfA with all three units ready; P2's Wall (5) at bfB. */
function board(startXp = 0) {
  return scenario()
    .turn(2)
    .active(P2)
    .xp(P1, startXp)
    .xp(P2, 0)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", GROMP, "gromp")
    .unit(P1, "bfA", NEWTFISH, "newt")
    .unit(P1, "bfA", MEGATUSK, "mega")
    .unit(P2, "bfB", { might: 5, name: "Wall" }, "wall");
}

const hasGanking = (game: Game, u: string) => game.state(u).keywords.includes("Ganking");

/** Unit-groups offered for a Standard Move to `dest` (each a sorted list of unit ids). */
function moveGroupsOffered(game: Game, dest: string): string[][] {
  const opt = game.p1.option(`standardMove:to:${dest}`);
  const field = opt?.fields.find((f) => f.arg === "units");
  return ((field?.options ?? []) as string[][]).map((g) => [...g].sort());
}

/** P2 ends the turn and everything settles into P1's open Main Phase (Hunt resolved). */
async function intoP1Main(game: Game): Promise<void> {
  await game.p2.endTurn();
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
}

/** …then Megatusk spends 3 XP and its grant resolves. */
async function megatuskResolved(game: Game): Promise<void> {
  await intoP1Main(game);
  await game.p1.activate("mega");
  await game.settle();
}

/** …then all three move bfA → bfB as one Standard Move and both players pass Focus up to P2's damage assignment. */
async function groupAttackUntilP2Assigns(game: Game): Promise<void> {
  await megatuskResolved(game);
  await game.p1.move(["gromp", "newt", "mega"], "bfB");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
}

describe("Gromp holds (Hunt 3) → Newtfish wakes → Megatusk spends the XP → three-unit ganking Standard Move", () => {
  // ── (b) the NO side first ─────────────────────────────────────────────────────────────────────

  test("(b) during P2's turn (no XP gained by P1 this turn) Newtfish is a plain 4 with no Ganking; Gromp 5 [Hunt], Megatusk 6", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("newt")).toMatchObject({ baseMight: 4, might: 4 });
    expect(hasGanking(game, "newt")).toBe(false);
    expect(game.state("gromp")).toMatchObject({ keywords: ["Hunt"], might: 5 });
    expect(game.state("mega")).toMatchObject({ keywords: [], might: 6 });
  });

  test("(b) even with 7 XP banked from earlier turns Newtfish is OFF on P2's turn — the gate is 'gained THIS turn', not 'have XP'", async () => {
    const game = await board(7).build();
    expect(game.p1.xp()).toBe(7);
    expect(game.state("newt").might).toBe(4);
    expect(hasGanking(game, "newt")).toBe(false);
  });

  // ── (a) the hold ──────────────────────────────────────────────────────────────────────────────

  test("(a) P2 ends turn → P1's Beginning Phase: the hold point is scored FIRST (0→1), then exactly ONE triggered item — Gromp's Hunt — is on the chain; Newtfish/Megatusk add nothing; XP still 0", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gromp", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("newt").might).toBe(4); // nothing gained yet
  });

  test("(a) the Hunt item is finalized with no choices; P1 then P2 each get priority (P2 has a real response window while XP is still 0), and only after both pass does XP go 0→3", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.key)).toContain("passChainPriority:-");
    expect(game.p1.xp()).toBe(0);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) once per battlefield per turn (470/471.2.c): through the rest of the Beginning Phase and into the Main Phase no second bfA hold/Hunt item ever appears — XP is exactly 3, points exactly 1", async () => {
    const game = await board().build();
    await intoP1Main(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  });

  // ── (c) after Hunt ────────────────────────────────────────────────────────────────────────────

  test("(c) in P1's Main Phase after Hunt: Newtfish has 'gained XP this turn' → 5 Might + Ganking; Gromp and Megatusk have no Ganking", async () => {
    const game = await board().build();
    await intoP1Main(game);
    expect(game.state("newt")).toMatchObject({ baseMight: 4, might: 5 });
    expect(hasGanking(game, "newt")).toBe(true);
    expect(hasGanking(game, "gromp")).toBe(false);
    expect(hasGanking(game, "mega")).toBe(false);
  });

  test("(c) Standard Move menu: bfA→bfB is offered for Newtfish ONLY; Gromp/Megatusk (and any group containing them) are offered bfA→base only; a group gank including Gromp is refused", async () => {
    const game = await board().build();
    await intoP1Main(game);
    expect(moveGroupsOffered(game, "bfB")).toEqual([["newt"]]);
    expect(game.p1.can("gank", "newt")).toBe(true);
    expect(game.p1.can("gank", "gromp")).toBe(false);
    expect(game.p1.can("gank", "mega")).toBe(false);
    expect(moveGroupsOffered(game, "base")).toEqual(expect.arrayContaining([["gromp"], ["mega"], ["newt"], ["gromp", "mega", "newt"]]));
    const r = await game.p1.try((p) => p.move(["gromp", "newt"], "bfB"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("gromp")).toBe("bfA");
    expect(game.state("gromp").isReady).toBe(true);
  });

  // ── (d) Megatusk spends the XP ────────────────────────────────────────────────────────────────

  test("(d) Megatusk's 'Spend 3 XP' is legal at exactly 3 XP in the open Main Phase: XP 3→0 on activation, one un-triggered item, and Newtfish does NOT switch off while it is pending (spending ≠ un-gaining)", async () => {
    const game = await board().build();
    await intoP1Main(game);
    expect(game.p1.can("activate", "mega")).toBe(true);
    await game.p1.activate("mega");
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mega", controller: P1, triggered: false })]);
    expect(game.state("newt").might).toBe(5);
    expect(hasGanking(game, "newt")).toBe(true);
    expect(hasGanking(game, "gromp")).toBe(false); // grant lands only on resolution
  });

  test("(d) on resolution every P1 unit at bfA — Gromp, Newtfish AND Megatusk itself — has Ganking this turn; Newtfish is still 5 and simply carries a redundant second Ganking instance (810.2); XP stays 0; no further activation possible", async () => {
    const game = await board().build();
    await megatuskResolved(game);
    expect(game.p1.xp()).toBe(0);
    for (const u of ["gromp", "newt", "mega"]) {
      expect(hasGanking(game, u)).toBe(true);
      expect(game.state(u).grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "Ganking" }));
    }
    expect(game.state("newt").might).toBe(5);
    expect(game.state("newt").grantedKeywords.filter((k) => k.keyword === "Ganking")).toHaveLength(2);
    expect(game.state("newt").keywords.filter((k) => k === "Ganking")).toHaveLength(1); // a characteristic you have or don't
    expect(game.p1.can("activate", "mega")).toBe(false); // 0 XP
  });

  test("(d) now the menu offers the full group: [gromp, mega, newt] (and every subset) as ONE Standard Move bfA→bfB", async () => {
    const game = await board().build();
    await megatuskResolved(game);
    const groups = moveGroupsOffered(game, "bfB");
    expect(groups).toContainEqual(["gromp", "mega", "newt"]);
    expect(groups).toEqual(expect.arrayContaining([["gromp"], ["mega"], ["newt"], ["gromp", "newt"], ["gromp", "mega"], ["mega", "newt"]]));
    for (const u of ["gromp", "newt", "mega"]) {
      expect(game.p1.can("gank", u)).toBe(true);
    }
  });

  test("(d) declaring it: all three leave bfA and arrive at bfB in one action, exhausted together (144.3.c), nothing on the chain, bfB Contested by P1 exactly once, ONE combat showdown with all three as Attackers and the Wall defending; P1 has Focus", async () => {
    const game = await board().build();
    await megatuskResolved(game);
    await game.p1.move(["gromp", "newt", "mega"], "bfB");
    for (const u of ["gromp", "newt", "mega"]) {
      expect(game.locationOf(u)).toBe("bfB");
      expect(game.state(u).isExhausted).toBe(true);
      expect(game.state(u).combatRole).toBe("attacker");
    }
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(d) the combat: P1's 5+5+6 = 16 is forced onto the lone Wall; P2 assigns its 5 lethal-first to ONE attacker of its choice (Gromp 5 / Newtfish 5 / all on Megatusk 6) — splits like {gromp 3, newt 2} are refused (465.2.c.3)", async () => {
    const game = await board().build();
    await groupAttackUntilP2Assigns(game);
    const d = game.decision();
    expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.key, b.lethal]).sort() : []).toEqual([
      ["gromp", 5],
      ["mega", 6],
      ["newt", 5],
    ]);
    expect((await game.p2.try((p) => p.distribute({ gromp: 3, newt: 2 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ gromp: 2, mega: 3 }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  });

  test("(d) P2 dumps its 5 on Megatusk (5 < 6, nobody dies): Wall dies to 16, P1 wins the ONE combat and Conquers bfB → 2 points; Gromp conquered → Hunt 3 triggers AGAIN (different battlefield, 470) with a response window → XP 0→3; empty bfA becomes uncontrolled", async () => {
    const game = await board().build();
    await groupAttackUntilP2Assigns(game);
    await game.p2.distribute({ mega: 5 });
    // The conquer put Gromp's Hunt on the chain; both players get priority before the XP lands.
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gromp", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect([...game.p1.units("bfB")].sort()).toEqual(["gromp", "mega", "newt"]);
    expect(game.state("mega").damage).toBe(0); // healed in the Combat Cleanup
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBe(null);
    const combatHits = (game.gameState.damageLog ?? []).filter((r) => r.combat);
    expect(combatHits).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 16, target: "wall" }), expect.objectContaining({ amount: 5, target: "mega" })]));
    expect(combatHits).toHaveLength(2); // one combat: one hit each way
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast — P2 kills Gromp with its 5 instead: bfB is still conquered by the survivors (2 points) but Gromp is in the trash when control is established → no Hunt, XP stays 0", async () => {
    const game = await board().build();
    await groupAttackUntilP2Assigns(game);
    await game.p2.distribute({ gromp: 5 });
    await game.settle();
    expect(game.zoneOf("gromp")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect([...game.p1.units("bfB")].sort()).toEqual(["mega", "newt"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(d) after the turn passes the Ganking grants and Newtfish's bonus are gone (P2's turn: Newtfish 4, nobody has Ganking) while the 3 XP re-gained from the conquer stays banked", async () => {
    const game = await board().build();
    await groupAttackUntilP2Assigns(game);
    await game.p2.distribute({ mega: 5 });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("newt").might).toBe(4);
    for (const u of ["gromp", "newt", "mega"]) {
      expect(hasGanking(game, u)).toBe(false);
      expect(game.state(u).grantedKeywords).toEqual([]);
    }
  });

  // ── (e) timing ────────────────────────────────────────────────────────────────────────────────

  test("(e) not on the Beginning-Phase chain: even a P1 who already HAS 3 XP is offered nothing but pass/concede while Gromp's Hunt is pending (381 — closed state, not the Main Phase); no Standard Move either (144.1)", async () => {
    const game = await board(3).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.xp()).toBe(3);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "mega")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.activate("mega"))).ok).toBe(false);
    expect(game.p1.xp()).toBe(3);
    await game.settle();
    expect(game.p1.xp()).toBe(6); // 3 banked + Hunt 3
    expect(game.p1.can("activate", "mega")).toBe(true); // NOW, in the open Main Phase
  });

  test("(e) not during the Showdown/Combat: with 3 XP still in hand (started at 3 → 6 → spent 3) neither Megatusk's ability nor any Standard Move is offered while P1 holds Focus at bfB", async () => {
    const game = await board(3).build();
    await megatuskResolved(game);
    expect(game.p1.xp()).toBe(3);
    await game.p1.move(["gromp", "newt", "mega"], "bfB");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "mega")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.activate("mega"))).ok).toBe(false);
    expect(game.p1.xp()).toBe(3);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("activate", "mega")).toBe(false);
  });
});
