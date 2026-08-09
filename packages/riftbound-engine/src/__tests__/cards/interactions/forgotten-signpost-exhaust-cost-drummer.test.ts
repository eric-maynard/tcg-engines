/**
 * Interaction: Forgotten Signpost (unl-045-219) · Gear · Calm · 2
 *     "[Action][>] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the
 *      location of the unit you exhausted to pay for this ability."
 *   × Noxian Drummer (ogn-222-298) · Unit · Order · 3 · 3 Might
 *     "When I move to a battlefield, play a 1 [Might] Recruit unit token here."
 *
 * Rules: 404.1 / 414.4 / 414.1.b (the exhaust-a-unit is a COST, paid — by a READY unit — during Pay
 * Costs), 355.10.c / 355.10.c.1 (a cost object is chosen, not targeted), 355.5 (the "different unit" IS
 * the target, chosen at activation), 355.4 / 355.4.a (a Move effect needs a destination other than the
 * mover's current location — here fixed by the exhausted unit's location), 402.3 (no legal options → not
 * activatable), 406.4 (opponents react only after costs are paid), 347.1 (an [Action] may be played by
 * whoever holds Focus in a showdown; contrast 381 / 343.1.b for untagged abilities), 323.2.a (units that
 * turn up at the combat battlefield undesignated take their controller's designation at the cleanup).
 *
 * Board: P1 controls bf1 with a READY vanilla 3-Might "X"; P1's base holds a ready Signpost and an
 * EXHAUSTED Noxian Drummer. P2 has a 4-Might Raider in base.
 *
 * Q (a) P1's turn, Open state, P1 activates: X is the cost object (exhausted while paying, before P2 has
 *       priority — not a target), the Drummer is the target/mover (needn't be ready — effect move, not a
 *       Standard Move), destination = X's location bf1. Resolution: Drummer base→bf1, its trigger plays a
 *       Recruit token at bf1.
 *   (b) P2's turn, P2 attacks bf1; once Focus reaches P1 the [Action] ability IS listed; exhausting
 *       defender X is a fine cost; Drummer + its Recruit arrive at the combat battlefield and become
 *       Defenders (323.2.a) — 3+3+1 = 7 kills the 4-Might Raider and bf1 stays P1's.
 *   (c) Correctly ABSENT from the legal actions: no ready unit to pay with; only one unit; X and Drummer
 *       at the same location (no valid destination, 355.4.a); Signpost itself exhausted.
 *   (d) P2's turn with no showdown: not listed ([Action] = your turn or a showdown only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGNPOST = "unl-045-219";
const DRUMMER = "ogn-222-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "X" }, "x")
    .unit(P1, "base", DRUMMER, "drummer", { exhausted: true })
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .gear(P1, SIGNPOST, "post");
}

/** Card ids offered for the `targets` field of P1's Signpost activation. */
function moversOffered(game: Game): string[] {
  const field = game.p1.option("activate", "post")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const recruitsAt = (game: Game, bf: string) => game.cardsAt(bf).filter((c) => game.state(c).name === "Recruit");

/** Pass priority (whoever holds it) until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Forgotten Signpost × Noxian Drummer — exhaust-a-unit is a cost, the mover is the target", () => {
  // ── (a) P1's turn, Open state ───────────────────────────────────────────────────────────────

  test("(a) the only unit offered to MOVE is the Drummer: X is the sole ready unit able to pay, so it can't also be the 'different' mover; enemy units are never offered (355.5, 402.3)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "post")).toBe(true);
    expect(moversOffered(game)).toEqual(["drummer"]);
    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "x" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "raider" }))).ok).toBe(false);
    // Nothing was paid by the rejected attempts.
    expect(game.state("post").isReady).toBe(true);
    expect(game.state("x").isReady).toBe(true);
  });

  test("(a) the mover need NOT be ready: activating on the EXHAUSTED Drummer is legal; the Signpost exhausts, the ability sits on the chain naming the Drummer, and P1 then P2 receive priority (406.4)", async () => {
    const game = await board().build();
    expect(game.state("drummer").isExhausted).toBe(true);
    await game.p1.activate("post", 0, { targets: "drummer" });
    expect(game.state("post").isExhausted).toBe(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "post", controller: P1, targets: ["drummer"], triggered: false }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    // Nothing has moved yet — the move is the effect.
    expect(game.locationOf("drummer")).toBe("base");
  });

  // Expected (404.1, 414.4, 355.10.c, 406.4): "Exhaust a unit you control" is a COST — X is chosen and
  // exhausted while the ability is being finalized, so by the time P2 holds priority X is already
  // exhausted (and cannot be "responded to"). Actual: the engine only exhausts the Signpost at
  // activation and picks/exhausts X when the ability RESOLVES — X is still ready in P2's window.
  test("(a) X is exhausted as a COST at activation — already exhausted when P2 gets priority (404.1 / 414.4 / 406.4)", async () => {
    const game = await board().build();
    await game.p1.activate("post", 0, { targets: "drummer" });
    expect(game.state("post").isExhausted).toBe(true);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("x").isExhausted).toBe(true);
  });

  test("(a) on resolution the Drummer moves base → bf1 (X's location) and its 'When I move to a battlefield' trigger goes on the chain as P1's item; X is exhausted and has not moved", async () => {
    const game = await board().build();
    await game.p1.activate("post", 0, { targets: "drummer" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("drummer")).toBe("bf1");
    expect(game.state("drummer").isExhausted).toBe(true); // an effect move neither needs nor changes readiness
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.state("x").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    expect(recruitsAt(game, "bf1")).toEqual([]); // not until the trigger resolves
  });

  test("(a) end state: Drummer + a 1-Might P1 Recruit token at bf1 beside exhausted X, Signpost exhausted, P1's base empty of units, chain empty, back in P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.activate("post", 0, { targets: "drummer" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("drummer")).toBe("bf1");
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.state("x").isExhausted).toBe(true);
    expect(game.state("post").isExhausted).toBe(true);
    const recruits = recruitsAt(game, "bf1");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1, owner: P1, zone: "battlefield-bf1" });
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["drummer", "x", recruits[0] as string].sort());
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) / (b) P2's turn ─────────────────────────────────────────────────────────────────────

  test("(d) P2's turn, Open state, no showdown: the Signpost is NOT listed for P1 ([Action] = your turn or a showdown)", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("(b) P2 attacks bf1: while P2 (attacker) holds Focus P1 still can't act; once Focus passes to P1 the [Action] Signpost IS listed, again offering only the Drummer (347.1)", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("activate", "post")).toBe(false);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "post")).toBe(true);
    expect(moversOffered(game)).toEqual(["drummer"]);
  });

  test("(b) exhausting DEFENDER X is a legal cost; when the chain closes the Drummer and its Recruit are at the combat battlefield and both carry P1's designation — Defender (323.2.a); the showdown continues", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.state("x").combatRole).toBe("defender");
    await game.p1.activate("post", 0, { targets: "drummer" });
    expect(game.state("post").isExhausted).toBe(true);
    await drainChain(game); // Signpost ability, then the Drummer trigger
    expect(game.state("x")).toMatchObject({ combatRole: "defender", isExhausted: true, location: "bf1" });
    expect(game.state("drummer")).toMatchObject({ combatRole: "defender", controller: P1, location: "bf1" });
    const recruits = recruitsAt(game, "bf1");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ combatRole: "defender", controller: P1, might: 1 });
    expect(game.state("raider").combatRole).toBe("attacker");
    // Still mid-showdown: somebody holds Focus, combat has not resolved.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
  });

  test("(b) they count for combat: 3 + 3 + 1 = 7 defending Might kills the 4-Might Raider; bf1 stays P1's and P2 scores nothing", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.activate("post", 0, { targets: "drummer" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1); // 4 damage cannot clear 7 Might of bodies
    expect(game.locationOf("drummer")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("(b) control: if P1 just passes Focus, lone X (3) dies to the Raider (4) and P2 conquers bf1 for 1 point", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.locationOf("drummer")).toBe("base");
  });

  // ── (c) not-enumerated cases ────────────────────────────────────────────────────────────────

  test("(c) X already exhausted and Drummer exhausted — no ready unit to pay with → not activatable; nothing is exhausted on spec (414.1.b / 414.4 / 402.3)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "X" }, "x", { exhausted: true })
      .unit(P1, "base", DRUMMER, "drummer", { exhausted: true })
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.state("post").isReady).toBe(true);
  });

  test("(c) P1 controls only one unit — it can't be both the exhausted payer and the 'different' mover → not activatable (402.3)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "X" }, "x")
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.state("x").isReady).toBe(true);
    expect(game.state("post").isReady).toBe(true);
  });

  // Expected (355.4 / 355.4.a, 402.3): with ready X and the exhausted Drummer BOTH in P1's base, the only
  // payable line (exhaust X, move Drummer) has destination = X's location = the Drummer's own location,
  // which is not a valid Move destination — so there is no legal target and the ability must not be
  // listed (and nothing may be exhausted "on spec"). Actual: the engine lists the activation with the
  // Drummer as target; on resolution it exhausts X and the Signpost and moves nothing.
  test("(c) X and Drummer at the SAME location (both in base) → no valid destination → not activatable (355.4.a / 402.3)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 3, name: "X" }, "x")
      .unit(P1, "base", DRUMMER, "drummer", { exhausted: true })
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(moversOffered(game)).toEqual([]);
    expect(game.p1.can("activate", "post")).toBe(false);
  });

  test("(c) the Signpost itself exhausted → its [Exhaust] cost is unpayable → not activatable, even with a perfect X / Drummer set-up", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "X" }, "x")
      .unit(P1, "base", DRUMMER, "drummer", { exhausted: true })
      .gear(P1, SIGNPOST, "post", { exhausted: true })
      .build();
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.state("x").isReady).toBe(true);
  });
});
