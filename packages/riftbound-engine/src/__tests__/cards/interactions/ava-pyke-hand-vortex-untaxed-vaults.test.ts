/**
 * Interaction: Ava Achiever (ogn-107-298) plays Pyke, Dockside Butcher (unl-028-219) from HAND into her attack
 *              on Mystic Vortex (ven-160-166), on a turn P1 held Vaults of Helia (unl-219-219); ± Ezreal, Prodigy.
 *
 *   Ava Achiever — Unit · Mind · 5 · 4 Might
 *     "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its cost.
 *      If it's a unit, play it here."
 *   Pyke, Dockside Butcher — Unit · Fury · 3 · 2 Might · [Hidden] [Ganking]
 *     "You may pay [fury] as an additional cost to play me. When you play me, if you paid the additional cost,
 *      ready me and give me +2 [Might] this turn."
 *   Mystic Vortex — Battlefield: "During showdowns here, cards with [Reaction] cost [rainbow] more to play.
 *      (Hidden cards have [Reaction].)"
 *   Vaults of Helia — Battlefield: "When you hold here, your non-token units cost [1] more to play this turn."
 *   Ezreal, Prodigy — "… Optional additional costs you pay cost [1] or [rainbow] less."
 *
 * Question. P1's turn; P1 held Vaults this turn (+[1] on P1's non-token units). Ava attacks P2's Mystic Vortex;
 * her trigger resolves inside the combat showdown; P1 pays [mind] and plays Pyke from HAND.
 *  (a) Exact payment for Pyke with the [fury] option elected — does the Vortex [rainbow] apply to a Hidden card
 *      played from hand during a showdown here? Does Vaults apply although Ava says "ignoring its cost"? State?
 *  (b) Option declined: payment / state?
 *  (c) With Ezreal for P1: payment in (a)? Does Ezreal also discount Ava's [mind]?
 *  (d) Pool after paying [mind] = {0 energy, fury:1}: which Pyke variants are offered under the Vaults surcharge?
 *
 * Rules: 419.3.b (a play by a resolving effect runs the cost pipeline under the effect's terms), 356.1.b.1
 * ("ignoring its cost" → base energy AND power → 0), 356.2.b.1 (optional +[fury]), 356.3 + 356.1.b.3 (increases
 * survive the ignore: Vaults +[1] applies), 811.6 / 811.5.a / 813.5 (a Hidden card has [Reaction] only while
 * facedown or played FROM facedown — from hand it is not "a card with [Reaction]", so the Vortex adds nothing
 * despite its reminder text), 356.4.c / 356.4.f.1 (Ezreal zeroes the optional pip, which still counts as paid),
 * 357.3 / 419.2.a / 419.3.c (an unaffordable card is not an eligible play; if none is eligible nothing is played),
 * 323.2.a (a unit arriving mid-combat on the attacker's side is an attacker). Riftjudge 29339d78: Ezreal reduces
 * only optional ADDITIONAL costs — never a payment made to use an ability (Ava's [mind]).
 *
 * Expected. (a) 1 energy (Vaults) + [fury]; no [rainbow]; Pyke enters AT the Vortex as an attacker; trigger sees
 * the cost paid → readied, 4 Might. (b) 1 energy, 0 power; exhausted, 2 Might, no bonus. (c) 1 energy + 0 power,
 * still "paid" → ready, 4 Might; Ava's [mind] is NOT discounted (with no mind in the pool her option can't be
 * accepted). (d) {0, fury:1} under Vaults: both Pyke variants need ≥1 energy → no eligible play → nothing is
 * offered or played, Pyke stays in hand, the fury is untouched; without the Vaults hold the +pay variant
 * (0 + [fury]) is offered and resolves ready +2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AVA = "ogn-107-298";
const PYKE = "unl-028-219";
const MYSTIC_VORTEX = "ven-160-166";
const VAULTS_OF_HELIA = "unl-219-219";
const EZREAL = "sfd-149-221";

interface BoardOpts {
  readonly ezreal?: boolean;
  /** false = Vaults of Helia is rules-inert (no hold surcharge) — the control board. */
  readonly vaults?: boolean;
}

/**
 * Turn 2, P2 active (so that advancing puts us at the START of P1's turn 3, where P1 holds the Vaults).
 * vaults = Vaults of Helia (live) held by P1's Keeper (2); mv = Mystic Vortex (live) held by P2's D (2).
 * P1: Ava (ready) in base, Pyke in hand [, Ezreal in base]. Pools are empty — each test adds P1's resources
 * after the turn start (pools empty at end of turn).
 */
function board(opts: BoardOpts = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: opts.vaults === false, owner: P1 })
    .battlefield("mv", { controller: P2, def: MYSTIC_VORTEX, inert: false, owner: P2 })
    .unit(P1, "vaults", { might: 2, name: "Vault Keeper" }, "keeper")
    .unit(P2, "mv", { might: 2, name: "Defender D" }, "D")
    .unit(P1, "base", AVA, "ava")
    .hand(P1, PYKE, "pyke");
  if (opts.ezreal) {
    b.unit(P1, "base", EZREAL, "ezreal");
  }
  return b;
}

/** P1's turn 3 begins (Vaults hold trigger fires), P1 gets `pool`, Ava attacks the Vortex → Ava's FIN opt-in is pending. */
async function avaAttacks(opts: BoardOpts, pool: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await board(opts).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", pool);
  await game.p1.move("ava", "mv");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ava" } });
  return game;
}

/** Pass priority until the chain is empty or a non-action prompt appears. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
}

/** …P1 accepts Ava's [mind], her ability resolves and offers the Hidden cards in hand → P1 picks Pyke → the [fury] question is pending. */
async function pykePicked(opts: BoardOpts, pool: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await avaAttacks(opts, pool);
  await game.p1.yes();
  await resolveChain(game);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ava" } });
  await game.p1.pick("pyke");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pyke" } });
  return game;
}

describe("Ava Achiever plays Pyke from hand into a Mystic Vortex attack under the Vaults of Helia surcharge", () => {
  // ── Ava's own [mind] ─────────────────────────────────────────────────────────────────────────

  // DESIGN (FIXER-PRIMER §2 optional-kind model / DESIGN.md §Paying costs, CR 383.3.a–b, 204.3.a): "you may pay
  // [mind] TO play …" is a cost-at-finalization opt-in — asked and PAID as Ava's attack trigger is finalized,
  // before anyone receives priority; the play itself happens at resolution. (The pairing doc phrased the [mind]
  // as "paid at resolution"; either way it is outside Pyke's cost pipeline, which is what matters here.)
  test("Ava's [mind] is a FIN opt-in on her attack trigger: accepting deducts exactly the mind before priority opens; Pyke's play comes at resolution", async () => {
    const game = await avaAttacks({}, { energy: 3, power: { fury: 1, mind: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ava", controller: P1, triggered: true })]);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1, mind: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("pyke")).toBe("hand");
    await resolveChain(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["pyke"]);
  });

  // ── (a) [fury] elected ───────────────────────────────────────────────────────────────────────

  test("(a) electing [fury]: Pyke costs exactly 1 energy (Vaults +[1] survives 'ignoring its cost', 356.1.b.3) + the fury; the calm is NOT touched — no Vortex [rainbow] for a Hidden card played from HAND (811.6, 813.5)", async () => {
    const game = await pykePicked({}, { energy: 3, power: { calm: 1, fury: 1, mind: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, prompt: expect.stringContaining("[fury]") });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 0, mind: 0 } });
  });

  test("(a) Pyke is played 'here' — AT the Vortex, on Ava's side, designated an attacker (323.2.a) — and his paid-cost trigger goes on the chain", async () => {
    const game = await pykePicked({}, { energy: 3, power: { fury: 1, mind: 1 } });
    await game.p1.yes();
    expect(game.zoneOf("pyke")).toBe("battlefield-mv");
    expect(game.state("pyke")).toMatchObject({ combatRole: "attacker", controller: P1, location: "mv" });
    expect(game.state("ava")).toMatchObject({ combatRole: "attacker", location: "mv" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pyke", controller: P1, triggered: true })]);
  });

  test("(a) the trigger resolves: Pyke is READIED and gets +2 → 4 Might for this combat", async () => {
    const game = await pykePicked({}, { energy: 3, power: { fury: 1, mind: 1 } });
    await game.p1.yes();
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("pyke")).toMatchObject({ combatRole: "attacker", isReady: true, might: 4, mightModifier: 2 });
  });

  test("(a) control — with Vaults inert (no hold surcharge) the same play costs 0 energy + [fury]: the 1 energy in (a) is exactly the Vaults rider", async () => {
    const game = await pykePicked({ vaults: false }, { energy: 3, power: { fury: 1, mind: 1 } });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0, mind: 0 } });
  });

  test("(a) control — played from hand NORMALLY this turn Pyke costs 3 + 1 (Vaults) = 4 energy, confirming the hold surcharge is live", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 4, power: { fury: 1 } });
    await game.p1.play("pyke", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });

  // ── (b) [fury] declined ──────────────────────────────────────────────────────────────────────

  test("(b) declining [fury]: 1 energy, no power; Pyke enters at the Vortex EXHAUSTED at 2 Might as an attacker and no ready/+2 item is created", async () => {
    const game = await pykePicked({}, { energy: 3, power: { fury: 1, mind: 1 } });
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1, mind: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.state("pyke")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "mv", might: 2, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // ── (c) with Ezreal ──────────────────────────────────────────────────────────────────────────

  test("(c) with Ezreal the [fury] option is still ASKED (it must be elected to count as paid) and is acceptable with no fury in the pool (356.4.c, 356.4.f)", async () => {
    const game = await pykePicked({ ezreal: true }, { energy: 3, power: { calm: 1, mind: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "pyke" } });
  });

  test("(c) with Ezreal electing it costs 1 energy + 0 power (calm untouched) and — 'paid' per 356.4.f.1 — Pyke is readied at 4 Might", async () => {
    const game = await pykePicked({ ezreal: true }, { energy: 3, power: { calm: 1, mind: 1 } });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, mind: 0 } });
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ combatRole: "attacker", isReady: true, location: "mv", might: 4 });
  });

  test("(c) Ezreal does NOT discount Ava's [mind]: with mind in the pool it is deducted in full (1 → 0)", async () => {
    const game = await avaAttacks({ ezreal: true }, { energy: 3, power: { fury: 1, mind: 1 } });
    await game.p1.yes();
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.energy()).toBe(3);
  });

  // DESIGN (DESIGN.md §Paying costs — unpayable optional trigger cost): the opt-in is still SHOWN with
  // canAccept:false (the player could tap/recycle first) instead of being removed silently per 404.2.
  test("(c) …and with NO mind in the pool Ava's option cannot be accepted even though Ezreal is on the board (riftjudge 29339d78: not an 'additional cost')", async () => {
    const game = await avaAttacks({ ezreal: true }, { energy: 3, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "FIN" });
    await expect(game.p1.yes()).rejects.toThrow();
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.zoneOf("pyke")).toBe("hand");
  });

  // ── (d) {0 energy, fury:1} after the [mind] ─────────────────────────────────────────────────

  test("(d) under the Vaults surcharge with {0 energy, fury:1} left, NO Pyke variant is affordable (both need ≥1 energy) → Ava's ability resolves offering nothing and plays nothing; Pyke stays in hand, the fury untouched (357.3, 419.2.a, 419.3.c)", async () => {
    const game = await avaAttacks({}, { energy: 0, power: { fury: 1, mind: 1 } });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 0 } });
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).not.toContain("pyke");
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.zoneOf("pyke")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 0 } });
    expect(game.state("ava")).toMatchObject({ combatRole: "attacker", location: "mv" });
  });

  test("(d) control — WITHOUT the Vaults hold the same {0, fury:1} affords the +pay variant (0 + [fury]): Pyke is offered, played here for the fury, readied at 4 Might", async () => {
    const game = await pykePicked({ vaults: false }, { energy: 0, power: { fury: 1, mind: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await resolveChain(game);
    expect(game.state("pyke")).toMatchObject({ combatRole: "attacker", isReady: true, location: "mv", might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
