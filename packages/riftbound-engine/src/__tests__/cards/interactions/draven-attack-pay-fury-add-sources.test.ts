/**
 * Interaction: Draven's optional "pay [fury]" on attack — when is it asked, is the decline branch real, and
 * which [Add] sources may legally fund it?
 *
 *   × Draven, Vanquisher (sfd-020-221) · Champion Unit · Fury · 4 · 4 Might
 *       "When I win a combat, play a Gold gear token exhausted.
 *        When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn."      — P1
 *   × Gold (sfd-t03) · Gear token
 *       "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."                                        — P1
 *   × Butcher of the Sands (ven-141-166) · Legend · Fury/Body
 *       "[Reaction] [rainbow][rainbow], [Exhaust]: [Add] [2]. Spend this Energy only to play units or
 *        activated abilities of units."                                                              — P1
 *
 * Rules: 355.10.c.1 (a cost inside an instruction targets nothing — it is elected as the item resolves),
 * 429.3 / 429.3.a (activated [Add] abilities with the Reaction tag are legal while a payment is being made,
 * and each finalizes and resolves at once), 429.2.a (an [Add] ability can't be reacted to — no priority
 * pass, no opponent window), 357.1.a (Power of any Domain — [rainbow] — satisfies a coloured pip),
 * 135.2.e.6.c ([rainbow] is Power of any Domain), 429.4 (an "[Add] … spend only to play units or activated
 * abilities of units" earmark restricts what the added Energy may pay for), 382 (a triggered ability),
 * 417.5 (Might modifiers apply before combat damage is assigned).
 *
 * Position: P1's turn, Open. P2 controls bf1 with a 5-Might Defender; Draven sits in P1's base and moves in
 * to attack. P1's pool is empty unless stated; P1 controls a Gold token and Butcher of the Sands.
 *
 * Question / Expected:
 *  - The "pay [fury]" is a cost inside an instruction (355.10.c.1): it targets nothing and is elected as the
 *    trigger resolves, with a real {pay, decline} branch for Draven's controller. Declining resolves the
 *    trigger fully — Draven is still an attacker, simply without the buff — and combat proceeds; it must
 *    neither error nor be treated as fizzled, and an engine that auto-pays whenever it can afford it is the
 *    same bug in the opposite direction.
 *  - Because payment is required here, Reaction [Add] abilities are legal at this moment (429.3) and the
 *    payment prompt must stay OPEN across them rather than resolving as unpayable on first look. Gold
 *    qualifies (killing + exhausting it adds [rainbow], which satisfies a [fury] pip, and it resolves at
 *    once with no window for P2 — 429.2.a / 429.3.a). Butcher of the Sands must NOT be offered: it adds
 *    Energy, not Power, and that Energy is earmarked for playing units / activated abilities of units,
 *    while Draven's is a triggered ability. So the Add-source list must be exactly {Gold}.
 *  - Paying gives +2 [Might] for the turn, applied before combat damage: a 4-Might Draven trades as a 6.
 *  - With no legal Add source and an empty pool the pay option must be unpayable rather than silently
 *    granted, and the trigger must still resolve with no buff — never silently skipped.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-020-221";
const GOLD = "sfd-t03";
const BUTCHER = "ven-141-166";

function board(opts: { fury?: number; rainbow?: number; gold?: boolean; butcher?: boolean; defMight?: number } = {}) {
  let s = scenario()
    .resources(P1, { energy: 0, power: { fury: opts.fury ?? 0, rainbow: opts.rainbow ?? 0 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: opts.defMight ?? 5, name: "Defender" }, "defender")
    .unit(P1, "base", DRAVEN, "draven");
  if (opts.gold !== false) {
    s = s.gear(P1, GOLD, "gold");
  }
  if (opts.butcher !== false) {
    s = s.legend(P1, BUTCHER, "butcher");
  }
  return s;
}

/** The [Add]-style actions a Decision keeps open alongside its own answers (429.3 / 444.2.c). */
function addSources(d: Decision | null): string[] {
  const actions = (d as { actions?: readonly { verb: string; card?: string; key: string }[] } | null)?.actions ?? [];
  return actions.filter((a) => a.verb !== "other" && a.key !== "concede:-").map((a) => a.card ?? a.key).toSorted();
}

/** Move Draven into bf1 (the attack) and accept the finalization-time opt-in. */
async function attackAndOptIn(game: Game): Promise<void> {
  await game.p1.move("draven", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
}

/** Both players pass priority so Draven's trigger resolves and the Pay is demanded. */
async function resolveTrigger(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Draven's attack trigger — optional [fury] payment and its legal [Add] sources", () => {
  // ── the payment moment ──────────────────────────────────────────────────────────────────────

  // DESIGN (FIXER-PRIMER "optional-instruction timing", rules 383.3.a / 383.3.b / 402.1): "you may pay [C].
  // If you do, Y" is classified `may-at-finalization` — a FREE opt-in is asked when the trigger is finalized
  // (before anyone gets priority), and the Pay itself is a Game Action (205 / 444.2) elected at RESOLUTION.
  // The payment moment the rules care about (355.10.c.1) is the second prompt.
  test("the payment is elected as the trigger RESOLVES, not when it goes on the chain: a yes-no Decision for Draven's controller with a real {pay, decline} branch (355.10.c.1)", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
    expect(game.state("draven").might).toBe(4); // nothing granted yet
    await resolveTrigger(game);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "RES" });
    expect(d?.prompt).toContain("Pay");
  });

  test("the decline branch is offered even when the payment IS affordable — the engine must not auto-pay: [fury] is still in the pool afterwards and Draven is still a 4", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    expect((game.decision() as { canAccept?: boolean } | null)?.canAccept).toBe(true);
    await game.p1.no();
    expect(game.state("draven").might).toBe(4);
    expect(game.p1.power("fury")).toBe(1); // nothing spent
    expect(game.chain()).toEqual([]);
  });

  test("declining resolves the trigger fully — no error, nothing fizzles: Draven is still an attacker at bf1, the showdown is live and combat proceeds normally (Draven 4 loses to the 5-Might Defender)", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    await game.p1.no();
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("defender")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields?.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // DESIGN (383.3.a.2): declining the free FIN opt-in removes the item instead of resolving an empty
  // trigger. Observably the same for Draven — he stays an attacker with no buff and combat is unaffected.
  test("declining the finalization-time opt-in instead also leaves Draven attacking with no buff, no chain item and no error", async () => {
    const game = await board({ fury: 1 }).build();
    await game.p1.move("draven", "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("draven").might).toBe(4);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.violations()).toEqual([]);
  });

  // ── paying, and what the buff does ──────────────────────────────────────────────────────────

  test("paying spends the [fury] and gives +2 [Might] for the turn, applied before combat damage (417.5): the 4-Might Draven trades as a 6, kills the 5-Might Defender, survives and conquers bf1", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    await game.p1.yes();
    expect(game.state("draven").might).toBe(6);
    expect(game.p1.power("fury")).toBe(0);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.gameState.battlefields?.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the +2 lasts only this turn: after the turn passes Draven is a 4 again", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    await game.p1.yes();
    expect(game.state("draven").might).toBe(6);
    await game.settle();
    await game.advanceTurn();
    expect(game.state("draven").might).toBe(4);
  });

  // ── which [Add] sources may fund it ─────────────────────────────────────────────────────────

  // 429.3 / 429.3.a / 444.2.c: payment is required here, so Reaction [Add] activations stay legal while the
  // Pay is demanded and the prompt must remain OPEN across them. Engine: with an empty pool the payment
  // Decision is never surfaced at all — the trigger silently resolves with no buff, so a controller holding
  // a Gold token can never convert it into the [fury] this instruction is asking for.
  test("(429.3) with an empty pool and a Gold token on board the payment prompt must still be surfaced, listing exactly {Gold} as its [Add] source", async () => {
    const game = await board().build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "RES" });
    expect(addSources(d)).toEqual(["gold"]);
  });

  // Same clause from the other side: Butcher adds Energy (not Power) and that Energy is earmarked for
  // playing units / activated abilities of units, while Draven's is a triggered ability (429.4 / 382) —
  // two independent reasons it can never fund this pip. It must never appear as an Add source.
  test("Butcher of the Sands is NEVER an [Add] source for this payment — Energy is not Power, and its earmark excludes triggered abilities (429.4 / 382)", async () => {
    const game = await board({ fury: 1 }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    expect(addSources(game.decision())).not.toContain("butcher");
  });

  test("Butcher's Energy cannot buy the buff by any route: with [rainbow][rainbow] P1 activates it for [2] Energy, yet the pool holds no Power and Draven still ends the attack at 4 Might", async () => {
    const game = await board({ rainbow: 2 }).build();
    await attackAndOptIn(game);
    expect(game.p1.can("activate", "butcher")).toBe(true);
    await game.p1.activate("butcher");
    expect(game.p1.resources()).toMatchObject({ energy: 2, power: { fury: 0, rainbow: 0 } });
    await resolveTrigger(game);
    expect(game.state("draven").might).toBe(4);
    // 444.2: the Pay is still asked (canAccept false — Energy is not Power); decline it.
    await game.p1.no();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.energy()).toBe(2); // still unspent — nothing here could take it
    expect(game.violations()).toEqual([]);
  });

  test("Butcher is not even activatable on an empty pool — its [rainbow][rainbow] cost gates it before the earmark ever matters", async () => {
    const game = await board().build();
    await attackAndOptIn(game);
    expect(game.p1.can("activate", "butcher")).toBe(false);
    await expect(game.p1.activate("butcher")).rejects.toThrow();
  });

  // DESIGN (DESIGN.md "Known deviations" — manual rune payment: the engine reads the CURRENT pool rather
  // than reachable resources): the Gold conversion the rules would allow inside the payment prompt has to
  // be done in the priority window BEFORE the trigger resolves. Once the [rainbow] is in the pool the pay
  // branch opens and grants the same +2 — so it is only the timing of the offer that deviates.
  test("Gold DOES fund it when P1 pre-loads the pool: killing + exhausting the token adds [rainbow], which satisfies the [fury] pip (135.2.e.6.c / 357.1.a) and yields +2 Might", async () => {
    const game = await board().build();
    await attackAndOptIn(game);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("gone"); // token killed as the cost, 186.1
    expect(game.p1.resources()).toMatchObject({ power: { rainbow: 1 } });
    await resolveTrigger(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.state("draven").might).toBe(6);
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("Gold's [Add] can't be reacted to (429.2.a / 429.3.a): it finalizes and resolves immediately — no new chain item, and P2 never gets a window", async () => {
    const game = await board().build();
    await attackAndOptIn(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven"]);
    await game.p1.activate("gold");
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven"]); // nothing was added
    expect(game.decision()).toMatchObject({ seat: P1 }); // priority never left P1
    expect(game.p1.resources()).toMatchObject({ power: { rainbow: 1 } });
  });

  // ── nothing to pay with at all ──────────────────────────────────────────────────────────────

  test("no Add source and an empty pool: the trigger still resolves, no buff is silently granted, no [fury] is conjured, and combat runs on Draven's printed 4", async () => {
    const game = await board({ butcher: false, gold: false }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    expect(game.state("draven").might).toBe(4);
    expect(game.p1.resources()).toMatchObject({ energy: 0, power: { fury: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    // 444.2: the unpayable Pay is still asked (canAccept false); decline it.
    await game.p1.no();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("draven")).toBe("trash"); // 4 < the Defender's 5
    expect(game.violations()).toEqual([]);
  });

  // 444.2 / 355.10.c.1: the Pay is a Game Action that is still ASKED — it is simply not acceptable. The
  // Decision must be recorded (canAccept false) rather than the whole payment moment being skipped, which
  // is what makes the 429.3 window above unreachable.
  test("with nothing to pay with, the payment Decision is still recorded as unpayable (canAccept false) (444.2 / 355.10.c.1)", async () => {
    const game = await board({ butcher: false, gold: false }).build();
    await attackAndOptIn(game);
    await resolveTrigger(game);
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "RES" });
  });
});
