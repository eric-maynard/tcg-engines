/**
 * Interaction: conceding while a PENDING play-trigger is still being finalized.
 *
 *   Void Seeker      (ogn-024-298) — [Action] spell, "Deal 4 to a unit at a battlefield. Draw 1."
 *   Watchful Sentry  (ogn-096-298) — 1 [Might] unit, "[Deathknell] — Draw 1."
 *   Grim Apothecary  (unl-021-219) — 3 [Might] unit, "[Ambush] (You may play me as a [Reaction] to a
 *                                     battlefield where you have units.) When you play me, you may
 *                                     return a friendly unit at a battlefield to its owner's hand."
 *
 * P1 casts Void Seeker at the Sentry; P2 Ambushes in the Apothecary in response. A finalized UNIT
 * resolves the instant it is finalized (337.2), so the Apothecary is already ON THE BOARD while its
 * "you may" play-effect sits on the chain as a PENDING item awaiting P2's finalization opt-in
 * (383.3.a) — a state in which NOBODY holds priority (337.1.a).
 *
 * Question: what does a concede do from exactly there?
 *
 * Rules: 650 (concede is legal at any time), 651 / 651.1 (last player left wins), 652 / 652.4
 * (the removal pipeline — including countering the conceder's spells — runs only "if the game
 * continues", which in a duel it does not), 196 (the game ends immediately), 337.2 (units resolve
 * on finalization), 337.1.a (no priority passes during finalization), 337.4 (priority after the
 * chain item leaves), 383.3.a / 383.3.a.2 (opt-in at finalization; a decline removes the item and it
 * is treated as never having triggered), 383.4.a.2, 330.2 (chain items resolve one at a time).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const APOTHECARY = "unl-021-219";
const VOID_SEEKER = "ogn-024-298";
const SENTRY = "ogn-096-298";

function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SENTRY, "sentry")
    .resources(P1, { energy: 6, power: { fury: 3, rainbow: 3 } })
    .resources(P2, { energy: 6, power: { body: 3, calm: 3, chaos: 3, fury: 3, mind: 3, order: 3, rainbow: 3 } })
    .hand(P1, VOID_SEEKER, "voidSeeker")
    .hand(P2, APOTHECARY, "apothecary");
}

/** Drive to the exact position: Void Seeker unresolved, Apothecary on bf1, its "may" pending. */
async function upToPendingMay() {
  const game = await board().build();
  await game.p1.cast("voidSeeker", { targets: "sentry" });
  await game.p1.passPriority();
  await game.p2.play("apothecary", { to: "bf1" });
  return game;
}

describe("Concede while a play-trigger is unfinalized (Void Seeker × Watchful Sentry × Grim Apothecary)", () => {
  test("the position: unit already resolved onto bf1 (337.2), its 'you may' pending at FIN, nobody holds priority", async () => {
    const game = await upToPendingMay();
    expect(game.zoneOf("apothecary")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["voidSeeker", "apothecary"]);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind).toBe("yes-no");
    expect(d?.timing).toBe("FIN"); // 383.3.a — opt-in at finalization, before anyone gets priority
    expect(game.state("sentry").damage).toBe(0);
  });

  test("(a) P2 concedes AT the pending 'you may' — legal (650); P1 wins and the game ends at once (651.1 / 196)", async () => {
    const game = await upToPendingMay();
    await game.p2.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.status).toBe("finished");
    expect((game.gameState as unknown as { removedPlayers?: string[] }).removedPlayers).toEqual([P2]);
  });

  test("(a) the chain FREEZES: the play-effect never finalizes, Void Seeker is neither resolved nor countered (652.4 never runs)", async () => {
    const game = await upToPendingMay();
    await game.p2.do("concede");
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["voidSeeker", "apothecary"]);
    // 652 removal (652.4 "counter the conceder's spells") only runs "if the game continues" — in a
    // two-player game it does not, so nothing is countered and nothing resolves.
    expect(chain.every((c) => c.countered === false)).toBe(true);
    expect(game.zoneOf("voidSeeker")).toBe("chain");
  });

  test("(a) nothing resolved: Sentry undamaged and alive, no Deathknell, nobody drew, Apothecary still on the board", async () => {
    const game = await upToPendingMay();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.do("concede");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand); // Void Seeker's "Draw 1" never happened
    expect(game.p2.hand()).toHaveLength(p2Hand); // no Deathknell draw
    // 337.2 — the unit resolved when it was finalized, so it is on the board in the terminal snapshot.
    expect(game.zoneOf("apothecary")).toBe("battlefield-bf1");
    expect(game.p2.units("bf1")).toContain(game.card("apothecary"));
  });

  test("(a) no Decision is surfaced and every later move by either seat is rejected, state byte-identical", async () => {
    const game = await upToPendingMay();
    await game.p2.do("concede");
    expect(game.decision()).toBeNull();
    expect(game.actingSeat()).toBeUndefined();
    const hash = game.stateHash();
    expect((await game.p2.try((p) => p.yes())).ok).toBe(false);
    expect((await game.p1.try((p) => p.passPriority())).ok).toBe(false);
    expect((await game.p2.try((p) => p.do("concede"))).ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
    expect(game.violations()).toEqual([]);
  });

  test("(b) P1 concedes while the engine waits on P2 — symmetric: P2 wins at once, same frozen chain", async () => {
    const game = await upToPendingMay();
    const p2Hand = game.p2.hand().length;
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["voidSeeker", "apothecary"]);
    expect(game.chain().every((c) => c.countered === false)).toBe(true);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.zoneOf("apothecary")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toBeNull(); // P2 is never asked its "may"
    expect(game.violations()).toEqual([]);
  });

  test("(c) control — declining the 'may' removes the item (383.3.a.2) and 337.4 hands priority to P1; Void Seeker then kills the Sentry and its Deathknell draws for P2", async () => {
    const game = await upToPendingMay();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.no();
    // 383.3.a.2 — treated as never having triggered; 337.1.a — no priority passed during the decision.
    expect(game.chain().map((c) => c.cardId)).toEqual(["voidSeeker"]);
    expect(game.actingSeat()).toBe(P1); // 337.4 — controller of the next item
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // 4 damage on a 1-Might unit
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // [Deathknell] — Draw 1
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // Void Seeker's "Draw 1"
    expect(game.zoneOf("voidSeeker")).toBe("trash");
    expect(game.zoneOf("apothecary")).toBe("battlefield-bf1"); // nothing was returned to hand
    expect(game.violations()).toEqual([]);
  });

  test("the seat holding an open prompt CAN take the concede action its own Decision advertises (rule 650 — conceding is legal at any time)", async () => {
    const game = await upToPendingMay();
    // The Decision lists `concede` in its `actions`, but answering with it is refused with
    // WRONG_ANSWER_KIND ("opt-in needs a yes-no answer"): only the raw `do("concede")` escape hatch
    // gets through. The opponent (who holds no prompt) concedes fine — see (b).
    expect(game.decision()?.actions?.map((a) => a.moveId)).toContain("concede");
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
