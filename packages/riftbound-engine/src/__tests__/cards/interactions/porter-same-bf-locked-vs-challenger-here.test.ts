/**
 * Interaction: Fae Porter (sfd-125-221) · Unit · Chaos · 4 + [chaos] · 4 Might
 *     "When I move to a battlefield, you may pay [chaos] to move a unit you control to the same
 *      battlefield."                                  — referent anchored in the TRIGGER CONDITION
 *   × Imposing Challenger (unl-105-219) · Unit · Body · 5 + [body] · 5 Might
 *     "When I move, you may move an enemy unit here with less Might than me to a different
 *      battlefield."                                  — referent anchored in the SOURCE
 *   × Flash (ogs-011-024) — "[Reaction] Move up to 2 friendly units to base."
 *   × Discipline (ogn-058-298) — "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * Question: P1 moves each of Porter and Challenger to bfA; each trigger goes on the chain (Porter
 * naming an ally in base, Challenger naming P2's 3-Might unit at bfA with bfB as its destination).
 * In reaction to each trigger, P1 Flashes the MOVING unit itself back to P1's base. For each
 * trigger: does it still do anything, where does the moved unit end up, and is the [chaos] still
 * payable? Second axis: if P2 instead Disciplines Challenger's chosen enemy from 3 to 5 Might,
 * what happens — and what if P1 then Disciplines Challenger from 5 to 7?
 *
 * Expected — the discriminator is WHERE the location referent is anchored:
 *   PORTER: "the same battlefield" refers back to the battlefield named in the TRIGGER CONDITION
 *     ("when I move to a battlefield"), so it is noted when the trigger condition is fulfilled and
 *     is never re-read (359.3.f.3 — the rulebook's Lillia example is exactly this shape). bfA is
 *     locked in. Flashing Porter to base afterwards changes nothing: the chosen ally still arrives
 *     at bfA (355.4 / 355.15) even though Porter now sits in base.
 *   CHALLENGER: "here" is a referent taken from the SOURCE, and source referents are checked on
 *     execution of the instruction (359.3.f.1 / 359.3.f.2). After Flash, "here" reads P1's base;
 *     the chosen enemy is not there (enemy units are never in your base), so the referent returns
 *     null and every instruction related to it is ignored (359.3.f.2.a / 359.3.e.6). Nothing moves
 *     — even though the destination bfB was locked in at finalization and is still perfectly legal,
 *     and even though the enemy unit itself never left the board.
 *   SECOND AXIS: "with less Might than me" is a targeting restriction re-tested against CURRENT
 *     Might at resolution (359.3.e.2, 710). Discipline taking the target 3 → 5 makes it no longer
 *     less than Challenger's 5 ⇒ illegal target ⇒ the move is ignored (359.3.e.5). A target that
 *     briefly stopped qualifying and qualifies again by resolution (Challenger pumped to 7) IS
 *     legal again (359.3.e.3).
 *   BOOKKEEPING: Flash moving Challenger is itself a move, so a SECOND Challenger trigger fires
 *     with "here" = base and mistargets the same way.
 *
 * Rules: 359.3.f.1, 359.3.f.2, 359.3.f.2.a, 359.3.f.3, 355.4, 355.5, 355.10.c.1, 355.15,
 *        359.3.e.2, 359.3.e.3, 359.3.e.5, 359.3.e.6, 710.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTER = "sfd-125-221";
const CHALLENGER = "unl-105-219";
const FLASH = "ogs-011-024";
const DISCIPLINE = "ogn-058-298";

/** Resolve every remaining chain item, declining any further optional trigger on the way. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no") await game.seat(d.seat).no();
    else await game.acting().pass();
  }
}

/** P1's Fae Porter and an ally wait in base; bfA is P1's; P1 holds Flash and one [chaos]. */
function porterBoard() {
  return scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "base", PORTER, "porter")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, FLASH, "flash");
}

/** P1's Challenger (5) waits in base; P2's 3-Might unit stands on P1's bfA; bfB and bfC are open. */
function challengerBoard() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: P1 })
    .unit(P1, "base", CHALLENGER, "ch")
    .unit(P2, "bfA", { might: 3, name: "Foe" }, "foe")
    .hand(P1, FLASH, "flash");
}

describe("Fae Porter's locked 'same battlefield' vs Imposing Challenger's live 'here'", () => {
  test("PORTER baseline: the trigger moves the named ally to the battlefield Porter moved to", async () => {
    const game = await porterBoard().build();
    await game.p1.move("porter", "bfA");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.p1.pick("ally"); // the unit to move is TARGETED at finalization (355.5 / 402.2)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "porter", targets: ["ally"], triggered: true })]);
    await game.settle();
    expect(game.locationOf("ally")).toBe("bfA");
    expect(game.locationOf("porter")).toBe("bfA");
  });

  test("PORTER: the [chaos] is charged when the optional trigger is finalized, before anyone can respond", async () => {
    // DESIGN (FIXER-PRIMER §2 "optional / costed parts of a triggered ability", adjudicated model
    // `cost-at-finalization`): a leading "you may pay [C] to …" is the trigger's BASE COST and is
    // paid on the finalization opt-in (383.3.b / 204.3.a / 404.1), not while the item resolves.
    // RULING-CONFLICT: the "cost within an instruction, paid on resolution" reading (355.10.c.1)
    // would keep the [chaos] in the pool until the item resolves — the engine follows the CR model.
    const game = await porterBoard().build();
    await game.p1.move("porter", "bfA");
    expect(game.p1.power("chaos")).toBe(1); // not yet
    await game.p1.yes();
    expect(game.p1.power("chaos")).toBe(0); // paid at FIN, while the item is still on the chain
    await game.p1.pick("ally");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bfA");
  });

  test("PORTER: Flashing Porter itself back to base does NOT unstick the destination — 'the same battlefield' was noted from the trigger condition (359.3.f.3)", async () => {
    const game = await porterBoard().build();
    await game.p1.move("porter", "bfA");
    await game.p1.yes();
    await game.p1.pick("ally");
    await game.p1.cast("flash", { targets: ["porter"] }); // resolves FIRST (LIFO)
    await game.settle();
    expect(game.locationOf("porter")).toBe("base"); // Porter is nowhere near bfA any more
    expect(game.locationOf("ally")).toBe("bfA"); // …and the ally still lands on bfA
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("CHALLENGER baseline: the chosen 3-Might enemy is moved off bfA to the locked-in bfB", async () => {
    const game = await challengerBoard().build();
    await game.p1.move("ch", "bfA");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // Only ONE enemy here with less Might, so the target auto-binds (402.2); the DESTINATION is a
    // real choice between bfB and bfC and is locked in at finalization (rule 355.4).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ch", targets: ["foe"], triggered: true })]);
    await game.settle();
    expect(game.locationOf("foe")).toBe("bfB");
    expect(game.locationOf("ch")).toBe("bfA");
  });

  test("CHALLENGER: Flashing Challenger to base makes 'here' read base at execution — nothing moves, though bfB is still a legal destination and the enemy never left the board", async () => {
    const game = await challengerBoard().build();
    await game.p1.move("ch", "bfA");
    await game.p1.yes();
    await game.p1.pick("bfB");
    await game.p1.cast("flash", { targets: ["ch"] });
    game.script(P1, ["decline"]); // the second Challenger trigger Flash sets off (below)
    await game.settle();
    expect(game.locationOf("ch")).toBe("base");
    expect(game.locationOf("foe")).toBe("bfA"); // 359.3.f.2.a — referent null ⇒ instruction ignored
    expect(game.gameState.battlefields.bfB?.controller ?? null).not.toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("CHALLENGER bookkeeping: Flash moving Challenger is itself a move, so a SECOND trigger fires with 'here' = base", async () => {
    const game = await challengerBoard().build();
    await game.p1.move("ch", "bfA");
    await game.p1.yes();
    await game.p1.pick("bfB");
    await game.p1.cast("flash", { targets: ["ch"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flash resolves → Challenger moves to base → second trigger
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("Imposing Challenger");
    expect(game.chain().filter((i) => i.cardId === "ch")).toHaveLength(2);
    await game.p1.no();
    await drainChain(game);
    expect(game.locationOf("foe")).toBe("bfA");
  });

  test("SECOND AXIS: Disciplining the chosen enemy 3 → 5 makes it no longer 'less Might than me' at resolution — the move is ignored (359.3.e.2 / 359.3.e.5)", async () => {
    const game = await challengerBoard().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.move("ch", "bfA");
    await game.p1.yes();
    await game.p1.pick("bfB");
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(5);
    expect(game.state("ch").might).toBe(5); // 5 is not LESS than 5
    expect(game.locationOf("foe")).toBe("bfA");
  });

  test("SECOND AXIS: a target that stops qualifying and qualifies again by resolution is legal (359.3.e.3) — Challenger pumped to 7 re-legalises the 5-Might enemy", async () => {
    const game = await challengerBoard()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2 })
      .hand(P1, DISCIPLINE, "mine")
      .hand(P2, DISCIPLINE, "theirs")
      .build();
    await game.p1.move("ch", "bfA");
    await game.p1.yes();
    await game.p1.pick("bfB");
    await game.p1.passPriority();
    await game.p2.cast("theirs", { targets: "foe" }); // 3 → 5: momentarily illegal
    await game.p2.passPriority();
    await game.p1.cast("mine", { targets: "ch" }); // 5 → 7: legal again
    await game.settle();
    expect(game.state("foe").might).toBe(5);
    expect(game.state("ch").might).toBe(7);
    expect(game.locationOf("foe")).toBe("bfB");
  });
});
