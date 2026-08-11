/**
 * Interaction: Maduli the Gatekeeper (unl-144-219) · Unit · Chaos · 7 + [chaos] · 6 Might
 *     "I can't be readied.
 *      [chaos]: Move me to an occupied enemy battlefield if my Might is greater than the total Might
 *      of enemy units there."
 *   × Gust (ogn-169-298) · [Reaction] Spell · Chaos · 1 — "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *   × Shen, Kinkou (ogn-241-298) · [Reaction] Unit · Order · 3 + [order] · 3 Might · [Shield 2] [Tank]
 *
 * Q: Maduli sits in P1's base. P1 pays [chaos] naming P2's bf1. Three reactions land before the ability
 *    resolves. Does Maduli move in each case, and is the [chaos] refunded when he doesn't?
 *  (a) bf1 = a 5-Might A + a 1-Might Recruit (total 6, so 6 > 6 is FALSE at activation). P1 himself
 *      Gusts the Recruit away → total 5. Rules: the 'if' clause is part of the INSTRUCTION, not an
 *      activation requirement, so it is read as the ability RESOLVES → Maduli moves.
 *  (b) bf1 = A alone (5; the check passes at activation). P2 Reacts with Shen to bf1 → total 8 → no move.
 *  (c) bf1 = a lone 3-Might unit; P1 Gusts it away → bf1 is no longer an OCCUPIED ENEMY battlefield, so
 *      the destination fails its own requirement even though 6 > 0 → no move.
 *
 * Rules
 *   135.2.b.5.a  the condition under which a game action is performed is part of that instruction's
 *                complement — read when the instruction executes.
 *   383.2.a.1    contrast: a conditional immediately after a TRIGGER condition is part of the trigger and
 *                is locked when it fires. Maduli's is an activated ability's instruction, not a trigger.
 *   337.2        a Unit chain item resolves immediately once finalized (Shen is on the board at once).
 *   359.3.e.2 / .5 / .9  a choice that no longer meets its requirement is mistargeted; the related
 *                instructions can't be followed.
 *   359.3.e.6    instructions that can't be followed are ignored.
 *   359.3.e.10   an ability whose every instruction is ignored has no effect but is still considered played.
 *   355.14.i     costs already paid, and effects already triggered, remain paid / in effect.
 *   190.3.a.1    a unit arriving at a battlefield its controller does not control applies Contested.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MADULI = "unl-144-219";
const GUST = "ogn-169-298";
const SHEN = "ogn-241-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — Gustable

/** P1: exhausted Maduli in base + one [chaos] + energy for Gust. P2 controls bf1 with `enemies` on it. */
function gate(enemies: { might: number; name: string; alias: string }[]) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 });
  for (const e of enemies) {
    b.unit(P2, "bf1", { might: e.might, name: e.name }, e.alias);
  }
  b.unit(P1, "base", MADULI, "mad", { exhausted: true });
  return b;
}

describe("Maduli the Gatekeeper — is the 'if my Might is greater' clause re-checked as the ability resolves?", () => {
  // ── activation legality ────────────────────────────────────────────────────────────────────────

  test("the 'if' is not an activation requirement: with the enemy total at exactly 6 (5 + 1) the [chaos] ability is still legal to activate, and the item sits on the chain with Maduli in base (135.2.b.5.a)", async () => {
    const game = await gate([
      { alias: "A", might: 5, name: "A" },
      { alias: "recruit", might: 1, name: "Recruit" },
    ])
      .hand(P1, GUST, "gust")
      .build();
    expect(game.p1.can("activate", "mad")).toBe(true);
    await game.p1.activate("mad");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mad", controller: P1, triggered: false })]);
    expect(game.locationOf("mad")).toBe("base");
    expect(game.p1.power("chaos")).toBe(0); // the cost is paid on activation (404.1)
  });

  test("control — nothing interferes and the total is already below 6: the ability resolves, Maduli lands at bf1 and applies Contested (190.3.a.1)", async () => {
    const game = await gate([{ alias: "A", might: 5, name: "A" }]).build();
    await game.p1.activate("mad");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("mad")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  // ── (a) a mid-chain change that ENABLES the instruction ────────────────────────────────────────

  // Expected (135.2.b.5.a, 359.3.e.6): the "if my Might is greater than the total Might of enemy units
  // there" clause belongs to the move INSTRUCTION, so it is evaluated on the board as the ability
  // resolves. Gust resolves first, bf1's total drops 6 → 5, and 6 > 5 is now true, so Maduli moves.
  // Actual: the engine folds the Might gate into the set of legal MOVE DESTINATIONS and fixes that set
  // when the item is finalized (rule 355.4, `abilities/move-destinations.ts moveDestinationOptions`,
  // hooked from `trigger-finalization.ts`). At finalization no battlefield passed 6 > 6, so no
  // destination was bound and the move is skipped even though the board later satisfies the clause.
  test("(a) Gust bounces the 1-Might Recruit before the ability resolves — 6 > 5 now holds, so Maduli MUST move to bf1 (135.2.b.5.a)", async () => {
    const game = await gate([
      { alias: "A", might: 5, name: "A" },
      { alias: "recruit", might: 1, name: "Recruit" },
    ])
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.activate("mad");
    await game.p1.cast("gust", { targets: "recruit" }); // P1 reacts to their own ability
    expect(game.chain().map((c) => c.cardId)).toEqual(["mad", "gust"]);
    await game.settle();

    expect(game.zoneOf("recruit")).toBe("hand"); // Gust resolved first
    expect(game.locationOf("mad")).toBe("bf1");
    // 190.3.a.1 — arriving Contested opens the showdown, which `settle()` also
    // plays out: 6 vs 5 kills A and P1 takes the battlefield (so `contested`
    // is already back to false by the time the dust settles).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(a) whatever the move does, the [chaos] is spent and Maduli is neither readied nor refunded (355.14.i)", async () => {
    const game = await gate([
      { alias: "A", might: 5, name: "A" },
      { alias: "recruit", might: 1, name: "Recruit" },
    ])
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.activate("mad");
    await game.p1.cast("gust", { targets: "recruit" });
    await game.settle();
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } }); // Gust cost 1 of the 2 energy
    expect(game.state("mad").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) a mid-chain change that DISABLES the instruction ───────────────────────────────────────

  test("(b) P2 Reacts with Shen, Kinkou to bf1: he is on the board as soon as his item finalizes (337.2), the total is 5 + 3 = 8, and 6 > 8 is false — the move instruction is ignored (359.3.e.6)", async () => {
    const game = await gate([{ alias: "A", might: 5, name: "A" }])
      .resources(P2, { energy: 3, power: { order: 1 } })
      .hand(P2, SHEN, "shen")
      .build();
    await game.p1.activate("mad");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.play("shen", { to: "bf1" });
    expect(game.locationOf("shen")).toBe("bf1"); // 337.2 — a unit resolves immediately
    expect(game.chain().map((c) => c.cardId)).toEqual(["mad"]);
    await game.settle();

    expect(game.locationOf("mad")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  });

  test("(b) the [chaos] is NOT refunded and the ability is still considered used: it left the chain having done nothing (359.3.e.10, 355.14.i)", async () => {
    const game = await gate([{ alias: "A", might: 5, name: "A" }])
      .resources(P2, { energy: 3, power: { order: 1 } })
      .hand(P2, SHEN, "shen")
      .build();
    await game.p1.activate("mad");
    await game.p1.passPriority();
    await game.p2.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("mad")).toBe("base");
    expect(game.state("mad").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) the destination itself stops qualifying ────────────────────────────────────────────────

  test("(c) Gust clears the only unit off bf1: the destination is no longer an OCCUPIED ENEMY battlefield, so the move is ignored as a mistarget even though 6 > 0 is trivially true (359.3.e.2 / .5 / .9)", async () => {
    const game = await gate([]).unit(P2, "bf1", SKULKER, "sk").hand(P1, GUST, "gust").build();
    expect(game.p1.can("activate", "mad")).toBe(true); // 6 > 3 at activation, bf1 occupied and enemy
    await game.p1.activate("mad");
    await game.p1.cast("gust", { targets: "sk" });
    await game.settle();

    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.locationOf("mad")).toBe("base");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    // Both halves of "occupied enemy battlefield … if my Might is greater" are re-read on the CURRENT
    // board, and either one failing blanks the ability while the cost stays spent (359.3.e.10).
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
