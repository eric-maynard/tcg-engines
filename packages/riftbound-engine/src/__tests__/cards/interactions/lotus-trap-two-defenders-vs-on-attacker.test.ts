/**
 * Interaction: Lotus Trap (unl-013-219, Reaction spell, 2) "Choose a unit. Double all damage that
 *   would be dealt to it this turn."
 *   × Mystic Poro (ogn-171-298, 2 Might) ×2 defending
 *   × Shipyard Skulker (ogn-175-298, 3 Might) attacking alone
 *
 * Question: P1 attacks P2's bf1 (two Mystic Poros) with a lone Skulker.
 *   Case A — during the showdown P1 Lotus-Traps Poro #1. With only 3 Might to assign, can P1 kill
 *   BOTH Poros (is the lethal threshold for Poro #1 computed with the doubling at ASSIGNMENT time),
 *   how much damage is actually dealt to Poro #1 (2 or 4), and may P1 instead put 2 raw on Poro #1?
 *   Case B — P2 Lotus-Traps the attacking Skulker instead. Does Skulker's OUTGOING damage double
 *   (no) and does the defenders' 4 back to Skulker double (yes)?
 *
 * Rules: 465.2.c.5 (replacement effects that would apply to the resulting damage apply to the
 * ASSIGNMENT — its second example is exactly this 3-vs-2+2 Lotus Trap board), 465.2.c.4 /
 * 465.2.c.4.a (no more than the minimum APPLIED lethal value while another unit lacks damage —
 * for the trapped 2-Might Poro that minimum is 1 raw → 2), 465.2.c.3 (full lethal to one unit
 * before the next), 465.2.c.1.a / 465.2.d (all assigned damage is then dealt simultaneously — the
 * doubling "is considered to have already happened", it is not applied again), 432.1 (doubling),
 * 417.6.c.1 (damage to the attacker has the defenders as its source — Lotus Trap on Skulker doubles
 * what Skulker RECEIVES, never what it deals).
 *
 * Expected: Case A — 1→Poro #1 (dealt 2, lethal) + 2→Poro #2: both die; Poro #1 is dealt 2, not 4;
 * 2 raw on Poro #1 while Poro #2 is unassigned is illegal; the Poros' 4 kills Skulker; without the
 * Trap only one Poro can die. Case B — Skulker still assigns exactly 3 (lethal 2 on one Poro first,
 * 1 on the other → one dies, the other survives and is healed), the Poros' 4 → 8 on Skulker, Skulker
 * dies, P2 holds bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const MYSTIC_PORO = "ogn-171-298";
const SHIPYARD_SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 }) // Lotus Trap from hand: 2 energy
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MYSTIC_PORO, "poro1")
    .unit(P2, "bf1", MYSTIC_PORO, "poro2")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
    .hand(P1, LOTUS_TRAP, "trapA")
    .hand(P2, LOTUS_TRAP, "trapB");
}

/** Combat damage records dealt to `target` this game (public `damageLog`, rule 417). */
function dealt(game: Game, target: string) {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target);
}

/**
 * Pass priority / focus for whoever holds it until the combat reaches either an assignment
 * prompt (`distribute`) or is over (open main phase). Returns the decision it stopped at.
 */
async function toAssignmentOrEnd(game: Game) {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.acting().pass();
  }
  return game.decision();
}

describe("Lotus Trap in combat — on a defender (Case A) vs on the attacker (Case B)", () => {
  test("control (no Trap): 3 into two 2-Might Poros kills exactly ONE (2 lethal + 1 leftover, healed); the Poros' 4 kills Skulker; P2 keeps bf1", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.settle();
    const dead = ["poro1", "poro2"].filter((p) => game.zoneOf(p) === "trash");
    const alive = ["poro1", "poro2"].filter((p) => game.zoneOf(p) === "battlefield-bf1");
    expect(dead).toHaveLength(1);
    expect(alive).toHaveLength(1);
    expect(game.state(alive[0] as string).damage).toBe(0); // 466.1.a.1 healed
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(dealt(game, "poro1").concat(dealt(game, "poro2")).reduce((s, r) => s + r.original, 0)).toBe(3);
  });

  test("Case A setup: P1 (attacker, holds Focus first) may cast Lotus Trap on Poro #1 during the combat showdown; it resolves and Poro #1 carries the doubling for the turn", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "trapA")).toBe(true);
    await game.p1.cast("trapA", { targets: "poro1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trapA", controller: P1, targets: ["poro1"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("trapA")).toBe("trash");
    expect(game.state("poro1").grantedKeywords).toEqual([{ duration: "turn", keyword: "DoubleIncomingDamage" }]);
    expect(game.state("poro2").grantedKeywords).toEqual([]);
    expect(game.zoneOf("poro1")).toBe("battlefield-bf1"); // no combat damage yet
  });

  test("Case A: with Poro #1 trapped, Skulker's 3 kills BOTH Poros — 1 raw → Poro #1 (doubled to its lethal 2 at assignment, 465.2.c.5/465.2.c.4.a) and 2 → Poro #2; the Poros' 4 kills Skulker; bf1 is left empty", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.cast("trapA", { targets: "poro1" });
    await game.settle();
    expect(game.zoneOf("poro1")).toBe("trash");
    expect(game.zoneOf("poro2")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0); // nobody left to conquer with
    expect(game.violations()).toEqual([]);
  });

  test("Case A: Poro #1 is DEALT 2, not 4 — the doubling happened during assignment (1 raw → 2) and is not applied again at 465.2.d; total raw assigned by Skulker is exactly its 3 Might", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.cast("trapA", { targets: "poro1" });
    await game.settle();
    const p1 = dealt(game, "poro1");
    const p2 = dealt(game, "poro2");
    expect(p1).toHaveLength(1);
    expect(p1[0]).toMatchObject({ amount: 2, original: 1 });
    expect(p1[0]?.modifiedBy.filter((m) => m.kind === "double")).toHaveLength(1); // doubled exactly once
    expect(p2).toHaveLength(1);
    expect(p2[0]).toMatchObject({ amount: 2, original: 2 });
    expect((p1[0]?.original ?? 0) + (p2[0]?.original ?? 0)).toBe(3);
    const sk = dealt(game, "skulker");
    expect(sk).toHaveLength(1);
    expect(sk[0]).toMatchObject({ amount: 4, original: 4 }); // defenders' damage is not doubled
  });

  test("Case A legality: P1 may NOT put 2 raw (→4) on Poro #1 while Poro #2 has nothing (465.2.c.4/.4.a) — the only legal line is {Poro #1: 1, Poro #2: 2}, so either no choice is offered or the overkill split is refused", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.cast("trapA", { targets: "poro1" });
    const d = await toAssignmentOrEnd(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      // A prompt was raised anyway: it must describe the trapped Poro's lethal as 1 raw and refuse 2/1.
      expect(d.total).toBe(3);
      expect(d.buckets.find((b) => b.key === "poro1")?.lethal).toBe(1);
      expect(d.buckets.find((b) => b.key === "poro2")?.lethal).toBe(2);
      expect((await game.p1.try((p) => p.distribute({ poro1: 2, poro2: 1 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ poro1: 3, poro2: 0 }))).ok).toBe(false);
      await game.p1.distribute({ poro1: 1, poro2: 2 });
    } else {
      // No attacker choice exists (single legal assignment) → the engine must not have asked P1.
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "poro1")[0]).toMatchObject({ amount: 2, original: 1 });
    expect(dealt(game, "poro2")[0]).toMatchObject({ amount: 2, original: 2 });
    expect(game.zoneOf("poro1")).toBe("trash");
    expect(game.zoneOf("poro2")).toBe("trash");
  });

  test("Case B setup: after P1 passes Focus, P2 may Lotus-Trap the ATTACKING Skulker; it resolves and only Skulker carries the doubling", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "trapB")).toBe(true);
    await game.p2.cast("trapB", { targets: "skulker" });
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("trapB")).toBe("trash");
    expect(game.state("skulker").grantedKeywords).toEqual([{ duration: "turn", keyword: "DoubleIncomingDamage" }]);
    expect(game.state("poro1").grantedKeywords).toEqual([]);
    expect(game.state("poro2").grantedKeywords).toEqual([]);
  });

  test("Case B: Skulker's OUTGOING damage is not doubled — P1 still assigns exactly 3: lethal 2 must go on one Poro first (465.2.c.3/.4), {3,0} is refused; P1 picks Poro #1 to die", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("trapB", { targets: "skulker" });
    const d = await toAssignmentOrEnd(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1 });
    if (d?.kind !== "distribute") {
      return;
    }
    expect(d.total).toBe(3); // not 6
    expect(d.buckets.map((b) => [b.key, b.lethal]).sort()).toEqual([
      ["poro1", 2],
      ["poro2", 2],
    ]);
    expect((await game.p1.try((p) => p.distribute({ poro1: 3, poro2: 0 }))).ok).toBe(false); // overkill while poro2 lacks lethal
    expect((await game.p1.try((p) => p.distribute({ poro1: 3, poro2: 3 }))).ok).toBe(false); // 6 ≠ 3: nothing was doubled
    await game.p1.distribute({ poro1: 2, poro2: 1 });
    await game.settle();
    expect(game.zoneOf("poro1")).toBe("trash");
    expect(game.zoneOf("poro2")).toBe("battlefield-bf1");
    expect(game.state("poro2").damage).toBe(0); // the 1 was non-lethal and is healed at Combat Cleanup
    expect(dealt(game, "poro1")[0]).toMatchObject({ amount: 2, modifiedBy: [], original: 2 });
    expect(dealt(game, "poro2")[0]).toMatchObject({ amount: 1, modifiedBy: [], original: 1 });
  });

  test("Case B: the defenders' combined 4 to the trapped Skulker IS doubled (→ 8) — Skulker dies, the surviving Poro means P2 holds bf1 and nobody scores", async () => {
    const game = await board().build();
    await game.p1.move("skulker", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("trapB", { targets: "skulker" });
    await game.settle(); // passes, then takes the forced/greedy attacker assignment (one Poro lethal, 1 on the other)
    const sk = dealt(game, "skulker");
    expect(sk).toHaveLength(1);
    expect(sk[0]).toMatchObject({ amount: 8, original: 4 });
    expect(sk[0]?.modifiedBy.filter((m) => m.kind === "double")).toHaveLength(1);
    expect(game.zoneOf("skulker")).toBe("trash");
    const alive = ["poro1", "poro2"].filter((p) => game.zoneOf(p) === "battlefield-bf1");
    expect(alive).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
