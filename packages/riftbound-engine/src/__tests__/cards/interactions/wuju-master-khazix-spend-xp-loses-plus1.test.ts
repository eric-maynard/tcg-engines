/**
 * Interaction: Wuju Master (unl-191-219) · Legend · Calm/Body
 *     "[Level 6][>] Your units have +1 [Might]. (While you have 6+ XP, get the effect.)
 *      [Level 11][>] Your units enter ready."
 *   × Kha'Zix, Evolving Hunter (unl-119-219) · Champion Unit · Body · 5 · 5 Might
 *     "[Hunt] (When I conquer or hold, gain 1 XP.)
 *      When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here."
 *   × a vanilla 6-Might defender D (P2) alone at bf1.
 *
 * Question. P1's legend is Wuju Master; P1's READY Kha'Zix standard-moves from base into P2's bf1
 * (lone defender D, 6 Might). The combat showdown opens and the attack trigger pends.
 *   (a) Is P1 asked to opt in, and WHEN are the 3 XP deducted — at finalization or at resolution?
 *       With only 2 XP is P1 asked at all?
 *   (b) NO side — P1 has exactly 6 XP (Kha'Zix shows 6): after opting in, what is P1's XP and what
 *       Might does Kha'Zix show while the trigger waits on the chain? Damage to D on resolution — 6
 *       or 5? Rest of the combat, control of bf1, final XP.
 *   (c) YES side — P1 has 9 XP: same questions; who controls bf1, final XP incl. Hunt.
 *
 * Rules: 174.6 (legends have passives), 824.1.b.1 / 824.1.c / 824.1.d (a [Level N] ability is Active
 * only while the controller has ≥ N XP and turns Inactive AS SOON AS XP drops below N), 383.3.a /
 * 383.3.b / 383.3.b.1 + 403.1.b.1 ("you may spend 3 XP to …" is a leading opt-in whose cost is the
 * trigger's BASE cost, paid to FINALIZE it), 402.2 (the enemy target "here" is chosen at
 * finalization), 404.1 / 730.2 (spending XP = reducing the XP total, paid now), 404.2 (unpayable /
 * declined → the pending trigger is removed, never finalized, not countered), 823.1.c.1 (Hunt: +1 XP
 * on conquer), 465.2 / 466.1.a (combat damage is simultaneous; Combat Cleanup kills lethal units),
 * 466.3 / 466.5 / 466.5.b (winner establishes control = conquer; if NO units remain the battlefield
 * becomes Uncontrolled).
 *
 * Expected.
 *   (a) Yes/No opt-in for P1 at finalization; YES deducts 3 XP immediately (before P2 ever holds
 *       priority) and binds D (the only enemy unit here). With 2 XP the cost is unpayable → no prompt,
 *       nothing on the chain, XP untouched.
 *   (b) XP 6→3 at finalization → Wuju Master's Level 6 line goes Inactive at once (824.1.d): Kha'Zix
 *       shows 5 while its trigger is still on the chain; "damage equal to my Might" is read on
 *       resolution → 5 to D (6 Might) → D survives with 5. Damage step: 5 ⇄ 6 simultaneously → D
 *       (5+5 ≥ 6) and Kha'Zix (6 ≥ 5) both die. No units remain → no winner, no conquer, no Hunt;
 *       bf1 becomes UNCONTROLLED (466.5.b — the pairing brief said "stays P2's", but 466.5.b is
 *       explicit and P2 has no unit there; either way it is NOT P1's and nobody scores).
 *       Final XP: P1 3, P2 0; points 0–0.
 *   (c) XP 9→6 → Level 6 stays Active → Kha'Zix stays 6 → trigger deals 6 → D dies before combat
 *       damage; no defenders → Kha'Zix wins, conquers bf1 (P1 +1 point), Hunt → XP 7. P2 XP 0.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_MASTER = "unl-191-219";
const KHAZIX = "unl-119-219";

/** P1: Wuju Master legend, `xp` XP, ready Kha'Zix in base. P2: bf1 with a lone vanilla 6-Might defender D, 0 XP. */
function board(xp: number) {
  return scenario()
    .legend(P1, WUJU_MASTER, "wuju")
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KHAZIX, "khazix")
    .unit(P2, "bf1", { might: 6, name: "Defender D" }, "D");
}

/** Non-combat damage dealt to `target` by Kha'Zix's ability (public damage log). */
function abilityDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? [])
    .filter((r) => !r.combat && r.target === target && r.source?.cardId === "khazix")
    .reduce((s, r) => s + r.amount, 0);
}

/** Kha'Zix attacks bf1 and P1 opts in to the attack trigger (D is the only enemy unit here → auto-bound). */
async function attackAndOptIn(xp: number): Promise<Game> {
  const game = await board(xp).build();
  await game.p1.move("khazix", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "khazix" }, timing: "FIN" });
  await game.p1.yes();
  return game;
}

describe("setup — Wuju Master's Level 6 passive is XP-dependent (824.1.c)", () => {
  test("with 6 XP Kha'Zix (printed 5) shows 6; with 2 XP it shows 5; with 9 XP it shows 6", async () => {
    const six = await board(6).build();
    expect(six.p1.xp()).toBe(6);
    expect(six.state("khazix")).toMatchObject({ baseMight: 5, isReady: true, might: 6, zone: "base" });
    const two = await board(2).build();
    expect(two.state("khazix").might).toBe(5);
    const nine = await board(9).build();
    expect(nine.state("khazix").might).toBe(6);
    expect(six.p2.xp()).toBe(0);
  });
});

describe("(a) the attack trigger's 'you may spend 3 XP' is an opt-in BASE COST paid at finalization", () => {
  test("moving Kha'Zix into bf1 opens the combat showdown and pends the attack trigger as a Yes/No for P1 (timing FIN, canAccept with 6 XP); nothing paid yet", async () => {
    const game = await board(6).build();
    await game.p1.move("khazix", "bf1");
    expect(game.state("khazix")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(game.state("D").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "khazix" }, timing: "FIN" });
    expect(game.p1.xp()).toBe(6);
    expect(game.p2.legal()).toEqual([]); // P2 has no say until the item is finalized and P1 passes
  });

  test("YES deducts the 3 XP IMMEDIATELY (404.1 / 730.2) — before P2 ever holds priority — and the lone enemy unit D is bound as the target at finalization (402.2)", async () => {
    const game = await attackAndOptIn(6);
    expect(game.p1.xp()).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", targets: ["D"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("D").damage).toBe(0); // nothing resolved yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2's first look at the chain: cost already paid
    expect(game.p1.xp()).toBe(3);
    expect(game.state("D").damage).toBe(0);
  });

  test("with a second enemy unit here the target is a real choice, asked as part of finalization; the XP is spent once the item is finalized (target chosen), still before anyone gets priority", async () => {
    const game = await board(6).unit(P2, "bf1", { might: 1, name: "Other" }, "other").build();
    await game.p1.move("khazix", "bf1");
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["D", "other"]);
    await game.p1.pick("D");
    expect(game.p1.xp()).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", targets: ["D"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("NO removes the pending trigger (404.2 — not countered): XP stays 6, chain empty, the showdown simply continues with P1 holding Focus", async () => {
    const game = await board(6).build();
    await game.p1.move("khazix", "bf1");
    await game.p1.no();
    expect(game.p1.xp()).toBe(6);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("D").damage).toBe(0);
  });

  test("with only 2 XP the cost is unpayable → P1 is NOT asked, nothing goes on the chain, XP stays 2 (404.2); the showdown opens straight into P1's Focus", async () => {
    const game = await board(2).build();
    await game.p1.move("khazix", "bf1");
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.xp()).toBe(2);
    expect(game.state("khazix").might).toBe(5);
  });
});

describe("(b) NO side — exactly 6 XP: paying the cost switches Level 6 OFF mid-chain", () => {
  test("XP is 3 right after opting in, while the trigger is still on the chain", async () => {
    const game = await attackAndOptIn(6);
    expect(game.p1.xp()).toBe(3);
    expect(game.chain()).toHaveLength(1);
  });

  // Expected (824.1.d): the Level 6 line is Inactive the moment XP < 6, so Kha'Zix reads 5 while its
  // own trigger waits on the chain. Actual: the engine keeps showing 6 until the chain item resolves
  // (the legend's static +1 is not re-evaluated when XP is spent as a cost).
  test("Kha'Zix immediately shows 5 Might (Level 6 Inactive as soon as XP < 6, 824.1.d) while the trigger is on the chain", async () => {
    const game = await attackAndOptIn(6);
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
    expect(game.state("khazix").might).toBe(5);
  });

  // Expected: "damage equal to my Might" is read on resolution with Level 6 already off → 5 to the
  // 6-Might D, which survives with 5 damage. Actual: the engine deals 6 and D dies.
  test("on resolution the trigger deals 5 (not 6) to D — D (6 Might) survives with 5 damage", async () => {
    const game = await attackAndOptIn(6);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.chain()).toEqual([]);
    expect(abilityDamageTo(game, "D")).toBe(5);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(5);
    expect(game.state("khazix").might).toBe(5);
  });

  test("after the trigger resolves the engine does at least agree Kha'Zix is a 5-Might unit again (3 XP < 6)", async () => {
    const game = await attackAndOptIn(6);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("khazix").might).toBe(5);
  });

  // Expected: damage step 5 ⇄ 6 → D (5 + 5 ≥ 6) and Kha'Zix (6 ≥ 5) both die; no units remain → no
  // winner, no conquer, no Hunt; bf1 Uncontrolled (466.5.b); P1 3 XP / 0 points. Actual: D already died
  // to the 6-damage trigger, Kha'Zix conquers the empty bf1, scores 1 and Hunts to 4 XP.
  test("rest of the combat — mutual kill: Kha'Zix and D both in trash, nobody conquers, no Hunt; final XP P1 3 / P2 0, points 0–0, bf1 not P1's (Uncontrolled, 466.5.b)", async () => {
    const game = await attackAndOptIn(6);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("khazix")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
  });

  test("control (no legend involved): a plain 5-Might Kha'Zix with 6 XP deals 5, D survives with 5, then both die in combat; bf1 ends Uncontrolled, XP 3, no points — the outcome (b) should reach", async () => {
    const game = await scenario()
      .xp(P1, 6)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", KHAZIX, "khazix")
      .unit(P2, "bf1", { might: 6, name: "Defender D" }, "D")
      .build();
    expect(game.state("khazix").might).toBe(5);
    await game.p1.move("khazix", "bf1");
    await game.p1.yes();
    expect(game.p1.xp()).toBe(3);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(abilityDamageTo(game, "D")).toBe(5);
    expect(game.state("D")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("khazix")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) YES side — 9 XP: Level 6 survives the payment, the trigger kills D outright", () => {
  test("XP 9→6 at finalization; Level 6 still Active → Kha'Zix stays 6 Might on the chain", async () => {
    const game = await attackAndOptIn(9);
    expect(game.p1.xp()).toBe(6);
    expect(game.state("khazix").might).toBe(6);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", targets: ["D"], triggered: true })]);
  });

  test("resolution deals 6 to D (6 Might) → D is killed BEFORE the combat damage step; Kha'Zix undamaged, still 6", async () => {
    const game = await attackAndOptIn(9);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(abilityDamageTo(game, "D")).toBe(6);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("khazix")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    // still inside the showdown — Focus passes on
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("walk to the end: no defenders → Kha'Zix wins and CONQUERS bf1 (P1 +1 point), Hunt fires → XP 6 + 1 = 7; P2 stays at 0 XP; Kha'Zix remains at bf1 undamaged", async () => {
    const game = await attackAndOptIn(9);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("khazix")).toMatchObject({ combatRole: null, damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.xp()).toBe(7);
    expect(game.p2.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
