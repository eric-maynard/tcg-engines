/**
 * Interaction: Caitlyn, Patrolling (ogn-068-298) · Champion Unit · Calm · 3 · 3 Might
 *     "I must be assigned combat damage last. [Exhaust]: Deal damage equal to my Might to a unit at a
 *      battlefield. Use this ability only while I'm at a battlefield."   — printed text, NO [Backline] keyword
 *   × Pyke, Returned (unl-145-219) · Champion Unit · Chaos · 3 · 3 Might
 *     "[Hidden] [Backline] Once each turn, when an enemy unit dies while I'm at a battlefield, play a
 *      Gold gear token exhausted."
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 Might (vanilla)
 *   attacked by a single vanilla 5-Might unit of P1's.
 *
 * Question: P1 attacks P2's bf1 with one 5-Might unit; nobody plays anything. Three P2 line-ups (each
 * unit 3 Might): (A) Skulker + Caitlyn; (B) Caitlyn + face-up Pyke; (C) Caitlyn alone. What does P1's
 * assignment Decision offer as the FIRST recipient, which per-unit numbers are legal, who dies, who holds
 * bf1? In (B): is Caitlyn's printed sentence the same tier as Pyke's [Backline] (free order) and does
 * Pyke's Gold trigger fire off the attacker's death when P1 killed Caitlyn vs when P1 killed Pyke?
 *
 * Rules: 826.3 (Backline is short for exactly Caitlyn's sentence), 826.4.a/b (still lethal-first; with
 * several Backline units any of them is valid once every non-Backline unit has lethal), 826.6; 465.2.a/b
 * (sums), 465.2.c (attacker assigns first), 465.2.c.3 (lethal in full before the next unit), 465.2.c.4
 * (no over-assignment while another unit remains — exception when none remain), 465.2.c.6 (must obey
 * "assign me last" — the CR example quotes Caitlyn's wording as Backline), 465.2.c.7 (same priority →
 * assigner picks the order), 465.2.c.1.a (dealt simultaneously); 466.1.a.1 (heal survivors), 466.2
 * (chain items from the Combat Cleanup resolve before the result), 466.3.a (winner), 466.5/466.5.d
 * (establish control → Conquer); 383.2.c.2 (a unit leaving the board in the same event as its trigger
 * condition cannot trigger), 383.3.e (once each turn).
 *
 * Expected: attackers 5; defenders 6 in A/B (all 6 forced onto the lone attacker → it dies), 3 in C.
 *  (A) Caitlyn is functionally Backline → invalid until Skulker has lethal: forced {Skulker 3, Caitlyn 2};
 *      Skulker dies, Caitlyn survives healed, attacker dies; P2 keeps bf1, no points.
 *  (B) Caitlyn and Pyke are the same "last" tier → P1 may start with EITHER: {3 → chosen, 2 → other}.
 *      Attacker dies either way; P2 keeps bf1. Killed Caitlyn → Pyke sees the enemy attacker die while at
 *      bf1 → one exhausted Gold token for P2. Killed Pyke → Pyke dies in the same event as the attacker →
 *      no trigger, no Gold.
 *  (C) Lone Caitlyn takes all 5 and dies; attacker takes 3 < 5, survives healed; P1 conquers bf1 (+1).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";
const PYKE = "unl-145-219";
const SKULKER = "ogn-175-298";

type Lineup = "A" | "B" | "C";

/** P1's turn. P2 holds bf1 with the given line-up; P1's vanilla 5-Might "Bruiser" is ready in base. */
function board(lineup: Lineup) {
  const s = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser");
  switch (lineup) {
    case "A": {
      return s.unit(P2, "bf1", SKULKER, "skulker").unit(P2, "bf1", CAITLYN, "cait");
    }
    case "B": {
      return s.unit(P2, "bf1", CAITLYN, "cait").unit(P2, "bf1", PYKE, "pyke");
    }
    default: {
      return s.unit(P2, "bf1", CAITLYN, "cait");
    }
  }
}

/** Total combat damage dealt to `target` (public damageLog). */
function dealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

const golds = (game: Game) => [...game.p2.base(), ...game.p2.gear()].filter((id, i, a) => a.indexOf(id) === i && game.state(id).name === "Gold");

/** Bruiser attacks bf1; pass focus/priority until a non-pass decision (the assignment) or the open main phase. */
async function attackUntilAssignment(game: Game): Promise<Decision | null> {
  await game.p1.move("bruiser", "bf1");
  expect(game.state("bruiser").combatRole).toBe("attacker");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.acting().pass();
  }
  return game.decision();
}

function asDistribute(d: Decision | null): DistributeDecision {
  expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
  return d as DistributeDecision;
}

describe("Caitlyn's printed 'assign me last' vs Pyke's [Backline] vs a vanilla Skulker — combat damage assignment tiers", () => {
  test("setup: Caitlyn's printed sentence IS the Backline characteristic (826.3/826.6); Pyke placed face-up at bf1 has Backline too; all defenders are 3 Might", async () => {
    const game = await board("B").build();
    expect(game.state("cait").keywords).toContain("Backline");
    expect(game.state("pyke").keywords).toContain("Backline");
    expect(game.state("pyke")).toMatchObject({ isHidden: false, might: 3, zone: "battlefield-bf1" });
    expect(game.state("cait").might).toBe(3);
    const a = await board("A").build();
    expect(a.state("skulker").keywords).not.toContain("Backline");
    expect(a.state("skulker").might).toBe(3);
  });

  // ---- (A) Skulker + Caitlyn ---------------------------------------------------------------------------

  test("(A) P1 can never choose 'Caitlyn first': either the assignment is forced without a prompt or {cait 3, skulker 2} / {cait 5} are refused; only {skulker 3, cait 2} goes through (826.4.b, 465.2.c.3/4/6)", async () => {
    const game = await board("A").build();
    const d = await attackUntilAssignment(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      expect(d.total).toBe(5);
      expect(d.buckets.find((b) => b.key === "skulker")?.lethal).toBe(3);
      expect((await game.p1.try((p) => p.distribute({ cait: 3, skulker: 2 }))).ok).toBe(false); // Backline before the vanilla unit
      expect((await game.p1.try((p) => p.distribute({ cait: 5, skulker: 0 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ cait: 0, skulker: 5 }))).ok).toBe(false); // 465.2.c.4: overkill while Caitlyn remains
      await game.p1.distribute({ cait: 2, skulker: 3 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "skulker")).toBe(3);
    expect(dealt(game, "cait")).toBe(2);
  });

  test("(A) P2's 3+3 = 6 all lands on the lone attacker (forced); dealt simultaneously: Skulker dies, Bruiser dies, Caitlyn survives and is healed (465.2.b, 465.2.c.1.a, 466.1.a.1)", async () => {
    const game = await board("A").build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(dealt(game, "bruiser")).toBe(6);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p1.trash()).toContain("bruiser");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0);
  });

  test("(A) P2 won the combat and simply keeps bf1 — no conquer, no points for anyone, nothing left contested/staged (466.3.a, 466.5)", async () => {
    const game = await board("A").build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.units("bf1")).toEqual(["cait"]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (B) Caitlyn + Pyke: same tier ---------------------------------------------------------------------

  test("(B) P1 gets a real assignment Decision offering BOTH Caitlyn and Pyke as first recipient (lethal 3 each) — keyword or printed sentence, it is one priority tier (465.2.c.7, 826.4.b)", async () => {
    const game = await board("B").build();
    const d = asDistribute(await attackUntilAssignment(game));
    expect(d.buckets.map((b) => [b.key, b.lethal]).sort()).toEqual([
      ["cait", 3],
      ["pyke", 3],
    ]);
    // Both orders are legal resolutions…
    expect((await game.p1.try((p) => p.distribute({ cait: 3, pyke: 2 }))).ok).toBe(true);
    const other = await board("B").build();
    asDistribute(await attackUntilAssignment(other));
    expect((await other.p1.try((p) => p.distribute({ cait: 2, pyke: 3 }))).ok).toBe(true);
  });

  test("(B) …but the per-unit numbers are still constrained: lethal in full on one before the other, no overkill while the other lacks lethal — {4,1}, {1,4}, {5,0}, {1,1} all refused (465.2.c.3, 465.2.c.4, 826.4.a)", async () => {
    const game = await board("B").build();
    asDistribute(await attackUntilAssignment(game));
    for (const alloc of [
      { cait: 4, pyke: 1 },
      { cait: 1, pyke: 4 },
      { cait: 5, pyke: 0 },
      { cait: 0, pyke: 5 },
      { cait: 1, pyke: 1 },
    ]) {
      expect((await game.p1.try((p) => p.distribute(alloc))).ok).toBe(false);
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 }); // still waiting for a legal line
  });

  test("(B, kill Caitlyn) {cait 3, pyke 2}: Caitlyn and the attacker die, Pyke survives healed; P2 keeps bf1, no points", async () => {
    const game = await board("B").build();
    asDistribute(await attackUntilAssignment(game));
    await game.p1.distribute({ cait: 3, pyke: 2 });
    await game.settle();
    expect(dealt(game, "bruiser")).toBe(6);
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.state("pyke").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("(B, kill Caitlyn) Pyke is on the board at bf1 when the enemy attacker dies in the Combat Cleanup → his trigger resolves in the 466.2 window: P2 gets exactly one Gold gear token, exhausted (383.2.c, 383.3.e)", async () => {
    const game = await board("B").build();
    expect(golds(game)).toEqual([]);
    asDistribute(await attackUntilAssignment(game));
    await game.p1.distribute({ cait: 3, pyke: 2 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, owner: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // combat fully over, back to P1's turn
  });

  test("(B, kill Pyke) {pyke 3, cait 2}: Pyke and the attacker die in the SAME cleanup event, Caitlyn survives healed; P2 keeps bf1", async () => {
    const game = await board("B").build();
    asDistribute(await attackUntilAssignment(game));
    await game.p1.distribute({ cait: 2, pyke: 3 });
    await game.settle();
    expect(dealt(game, "pyke")).toBe(3);
    expect(dealt(game, "cait")).toBe(2);
    expect(dealt(game, "bruiser")).toBe(6);
    expect(game.zoneOf("pyke")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  });

  test("(B, kill Pyke) Pyke left the board simultaneously with the enemy death → his trigger cannot evaluate: NO Gold token, nothing on the chain (383.2.c.2)", async () => {
    const game = await board("B").build();
    asDistribute(await attackUntilAssignment(game));
    await game.p1.distribute({ cait: 2, pyke: 3 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(golds(game)).toEqual([]);
    expect(game.p2.trash()).toContain("pyke");
    expect(game.violations()).toEqual([]);
  });

  // ---- (C) Caitlyn alone --------------------------------------------------------------------------------

  test("(C) lone Caitlyn: 'last' is trivially satisfied and the no-further-units exception applies — she is assigned all 5 (no real choice) and dies (465.2.c.4)", async () => {
    const game = await board("C").build();
    const d = await attackUntilAssignment(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      expect(d.buckets.map((b) => b.key)).toEqual(["cait"]);
      expect((await game.p1.try((p) => p.distribute({ cait: 3 }))).ok).toBe(false); // all 5 must be assigned
      await game.p1.distribute({ cait: 5 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "cait")).toBe(5);
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.p2.trash()).toContain("cait");
  });

  test("(C) the attacker takes Caitlyn's 3 < 5, survives and is healed; P1 won → establishes control of bf1 → Conquer, +1 point (466.1.a.1, 466.3.a, 466.5.d)", async () => {
    const game = await board("C").build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(dealt(game, "bruiser")).toBe(3);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("bf1")).toEqual(["bruiser"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
