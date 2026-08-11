/**
 * Interaction: Immortal Phoenix (ogn-037-298) replayed from the trash under Vaults of Helia (unl-219-219)
 *              with Rek'Sai, Breacher (sfd-029-221) granting it [Accelerate].
 *
 *   Immortal Phoenix — Unit · Fury · 3 + [fury] · 3 Might
 *     "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   Vaults of Helia — Battlefield
 *     "When you hold here, your non-token units cost [1] more to play this turn."
 *   Rek'Sai, Breacher — Unit · Fury · 3 · 3 Might · Champion
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   (kill source: Hextech Ray ogn-009-298, 1 + [fury], "Deal 3 to a unit at a battlefield.")
 *
 * Board. P2 is about to end turn 2. P1 controls the Vaults (a 2-Might Holder stands there) so P1 HOLDS it at
 * the start of turn 3 and the surcharge is armed for the turn; Rek'Sai in P1's base; Phoenix in P1's trash;
 * Hextech Ray in hand. P2's bf2 has a 2-Might Victim (dies to Ray) and a 6-Might Wall. P1 floats the pool
 * under test PLUS Ray's own 1 + [fury], Rays the Victim → "you killed a unit with a spell" → Phoenix triggers.
 *
 * Question: one payment or several, what totals, ready or exhausted, and what happens when the tail is
 * unaffordable?
 *
 * Expected (rules as the engine models them):
 *  (a) "you may pay [1][fury] TO play me" is a cost within instructions leading the effect → it is the
 *      trigger's BASE COST, decided and paid when the trigger is FINALIZED (383.3.a/.b, 383.3.b.1, 404.2);
 *      the play from trash is the effect at resolution and replaces Phoenix's printed 3+[fury] (riftjudge:
 *      Phoenix/Chompers pay an alternate cost, not printed + extra). Vaults' +[1] applies to any non-token unit
 *      P1 plays this turn, trash included, on top of the zeroed base (356.3, 356.1.b.3) → grand total with
 *      Accelerate declined = 2 energy + [fury]; enters EXHAUSTED (143.4) to P1's base or a battlefield P1
 *      controls (355.2.a; riftjudge #4527) — never the enemy bf2.
 *  (b) A trash play is "from anywhere other than a hand" → Rek'Sai grants [Accelerate]; electing it adds
 *      [1][fury] (805.1.a, 356.2.b.1) → 3 energy + [fury][fury] in all, enters READY (805.6). Both pips are
 *      FURY-locked (805.1.a.1: Accelerate's pip is the unit's domain; the trigger's pip is printed [fury]) —
 *      calm never substitutes.
 *  (c) No Vaults hold: 1 + [fury] exhausted / 2 + [fury][fury] ready.
 *  (d) Rek'Sai absent: Phoenix has no printed Accelerate → no Accelerate election at all.
 *  (e) Parity: {2, fury:1} → exactly the exhausted line (pool drained); {3, fury:2} → both lines, the
 *      Accelerate line drains the pool and Phoenix is ready. {1, fury:1} under Vaults: see the
 *      RULING-CONFLICT facet — the engine follows CR 383.3.b (cost at finalization, play at resolution), so
 *      the [1][fury] is paid and the resolution-time play, finding no affordable option, does nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PHOENIX = "ogn-037-298";
const VAULTS_OF_HELIA = "unl-219-219";
const REKSAI = "sfd-029-221";
const HEXTECH_RAY = "ogn-009-298";

interface BoardOpts {
  /** Vaults text live (default true); false = same battlefield, inert — no surcharge. */
  readonly vaults?: boolean;
  /** Rek'Sai, Breacher in P1's base (default true). */
  readonly reksai?: boolean;
}

function board(opts: BoardOpts = {}) {
  const { reksai = true, vaults = true } = opts;
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: !vaults })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "vaults", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Victim" }, "victim")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .hand(P1, HEXTECH_RAY, "ray")
    .trash(P1, PHOENIX, "phoenix")
    .fillDecks({ main: 10, runes: 0 });
  if (reksai) {
    b.unit(P1, "base", REKSAI, "reksai");
  }
  return b;
}

/**
 * P2 ends → P1's turn 3 (the Hold on the Vaults happens in P1's Beginning Phase) → P1 floats `pool` PLUS
 * Ray's own 1 + [fury] → Rays the Victim → both pass → Ray resolves, Victim dies, Phoenix's trigger pends
 * and its finalization opt-in is the open decision.
 */
async function killWithRay(opts: BoardOpts, pool: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.endTurn();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p1.do("addResources", { energy: pool.energy + 1, power: { ...pool.power, fury: (pool.power.fury ?? 0) + 1 } });
  await game.p1.cast("ray", { targets: "victim" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("victim")).toBe("trash");
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.p1.resources().energy).toBe(pool.energy);
  return game;
}

/** Accept the [1][fury] opt-in, let both players pass on the trigger → the play's destination prompt. */
async function payAndResolve(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Keys of the open destination pick. */
function destinations(game: Game): string[] {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.prompt).toContain("destination");
  return (d as { options: readonly { key: string }[] }).options.map((o) => o.key).sort();
}

/** Is the open decision the [Accelerate] opt-in for Phoenix? */
function accelerateAsked(game: Game): boolean {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && /accelerate/i.test(d.prompt);
}

describe("Immortal Phoenix from trash × Vaults of Helia surcharge × Rek'Sai-granted Accelerate", () => {
  // ── (a) Vaults + Rek'Sai, Accelerate declined ───────────────────────────────────────────────

  test("(a) Ray kills the Victim → Phoenix's trigger asks 'Pay [1][fury]' at FINALIZATION (timing FIN), acceptable with {3, fury:2} (383.3.b, 404.2)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.prompt).toContain("[1][fury]");
    expect(d?.source?.cardId).toBe("phoenix");
    expect(game.zoneOf("phoenix")).toBe("trash");
  });

  test("(a) accepting debits exactly [1][fury] at finalization ({3,f2} → {2,f1}) and puts ONE Phoenix trigger on the chain; Phoenix itself is still in the trash", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true })]);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) on resolution Phoenix may go to P1's base or the battlefield P1 CONTROLS (the Vaults) — the enemy bf2 is not offered (355.2.a, riftjudge #4527)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    expect(destinations(game)).toEqual(["base", "battlefield-vaults"]);
  });

  test("(a) Accelerate DECLINED under Vaults: the play charges Vaults' +[1] on the replaced base ({2,f1} → {1,f1}) — grand total 2 energy + [fury]; Phoenix enters the base EXHAUSTED (356.3, 356.1.b.3, 143.4)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("base");
    expect(accelerateAsked(game)).toBe(true);
    await game.p1.no();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix")).toMatchObject({ controller: P1, isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) the same line played TO the Vaults: Phoenix lands at the battlefield P1 controls, exhausted, same 2 + [fury] total", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("battlefield-vaults");
    await game.p1.no();
    expect(game.zoneOf("phoenix")).toBe("battlefield-vaults");
    expect(game.state("phoenix").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  // ── (b) Vaults + Rek'Sai, Accelerate elected ────────────────────────────────────────────────

  test("(b) a trash play is a non-hand play → Rek'Sai's [Accelerate] is offered as its own opt-in after the destination (805.1.a, 356.2.b.1)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("base");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(d?.prompt).toMatch(/accelerate/i);
    expect(d?.source?.cardId).toBe("phoenix");
  });

  test("(b) Accelerate ELECTED under Vaults: +[1][fury] on top → {3,f2} drains to {0,0} — 3 energy + [fury][fury] in all — and Phoenix enters READY (805.6)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("base");
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix")).toMatchObject({ isReady: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the Accelerate pip is FURY-locked (805.1.a.1): with {3, fury:1, calm:1} the trigger's [fury] is paid, but Accelerate ([1][fury]) is not offered — calm cannot stand in; Phoenix exhausted, calm untouched", async () => {
    const game = await killWithRay({}, { energy: 3, power: { calm: 1, fury: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await payAndResolve(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 0 } });
    await game.p1.pick("base");
    expect(accelerateAsked(game)).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, fury: 0 } });
  });

  // DESIGN (DESIGN.md §Paying costs — manual rune payment): an unpayable optional trigger cost is still SHOWN,
  // with canAccept:false, instead of being removed silently (404.2); "yes" is not a legal answer.
  test("(b) the trigger's own pip is printed [fury]: with {3, calm:2} and NO fury the opt-in is shown but not acceptable, yes() is rejected, nothing is debited and Phoenix stays in the trash", async () => {
    const game = await killWithRay({}, { energy: 3, power: { calm: 2 } });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.source?.cardId).toBe("phoenix");
    const r = await game.p1.try((p) => p.yes());
    expect(r.ok).toBe(false);
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2, fury: 0 } });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) no Vaults hold ──────────────────────────────────────────────────────────────────────

  test("(c) WITHOUT the Vaults surcharge, Accelerate declined: 1 energy + [fury] in all ({1,f1} → {0,0} at finalization, the play itself is free) — exhausted", async () => {
    const game = await killWithRay({ vaults: false }, { energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await payAndResolve(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.pick("base");
    // Accelerate would cost [1][fury] the empty pool cannot cover → not offered.
    expect(accelerateAsked(game)).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(c) WITHOUT the Vaults surcharge, Accelerate elected: 2 energy + [fury][fury] in all ({2,f2} → {0,0}) — READY", async () => {
    const game = await killWithRay({ vaults: false }, { energy: 2, power: { fury: 2 } });
    await payAndResolve(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.p1.pick("base");
    expect(accelerateAsked(game)).toBe(true);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("phoenix")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Rek'Sai absent ──────────────────────────────────────────────────────────────────────

  test("(d) Rek'Sai absent: no Accelerate is ever asked — Phoenix has none printed; under Vaults it costs 2 + [fury] and enters exhausted even with fury to spare", async () => {
    const game = await killWithRay({ reksai: false }, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("base");
    expect(accelerateAsked(game)).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (e) parity / the unaffordable tail ──────────────────────────────────────────────────────

  test("(e) {2, fury:1} under Vaults: exactly the exhausted line — trigger [1][fury] then Vaults +[1] drain the pool to {0,0}; no Accelerate offered", async () => {
    const game = await killWithRay({}, { energy: 2, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await payAndResolve(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    expect(destinations(game)).toEqual(["base", "battlefield-vaults"]);
    await game.p1.pick("base");
    expect(accelerateAsked(game)).toBe(false);
    expect(game.state("phoenix")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(e) {3, fury:2} under Vaults: BOTH lines exist — the Accelerate opt-in is acceptable, and taking it drains {3,f2} to {0,0} with Phoenix ready", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await payAndResolve(game);
    await game.p1.pick("battlefield-vaults");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(accelerateAsked(game)).toBe(true);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("phoenix")).toMatchObject({ isReady: true, zone: "battlefield-vaults" });
  });

  // RULING-CONFLICT: the riftjudge Phoenix/Flame Chompers "alternate cost" reading (and the atomic 358.2/358.5
  // undo it implies) says that with {1, fury:1} under Vaults NOTHING may be debited — the whole 2 + [fury] is one
  // payment that either happens or does not. CR 383.3.b / 383.3.b.1 / 404.2 say "you may pay [1][fury] TO play me"
  // is the trigger's BASE COST, paid to FINALIZE the trigger; the play is the effect performed on RESOLUTION
  // (419.3), by which time the pool may legitimately have changed (P1 holds priority in between). The engine
  // follows the CR (FIXER-PRIMER §2 optional-instruction timing, `cost-at-finalization`): the [1][fury] is
  // payable and paid at finalization; at resolution the play under Vaults needs +[1] the pool no longer has, no
  // play option exists, and nothing happens (419.3.c) — like a countered ability, the finalization cost is not
  // refunded (425.1.c).
  test("(e) {1, fury:1} under Vaults — engine follows CR 383.3.b: the opt-in IS acceptable, [1][fury] is paid at finalization, and the resolution-time play (needing Vaults' +[1]) does nothing: Phoenix stays in the trash, pool {0,0}, no prompt dangles", async () => {
    const game = await killWithRay({}, { energy: 1, power: { fury: 1 } });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // No destination / Accelerate prompt: the play never found a payable option.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.units()).toEqual(expect.not.arrayContaining(["phoenix"]));
    expect(game.violations()).toEqual([]);
  });

  test("(e) declining the trigger is always free: 'no' removes the pending item, nothing is paid, Phoenix stays in the trash (404.2)", async () => {
    const game = await killWithRay({}, { energy: 3, power: { fury: 2 } });
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
