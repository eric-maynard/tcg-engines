/**
 * Interaction: Blast Cone (unl-133-219) · Gear · Chaos · 4 + [chaos]
 *     "When you play this, you may move an enemy unit.
 *      When you move an enemy unit, you may exhaust this to [Stun] it."                       — P1's, READY in base
 *   × Charm (ogn-043-298) · Spell · Calm · 1 + [calm] · Action · "Move an enemy unit."          — P1's hand
 *   × Call to Battle (unl-101-219) · Spell · Body · 3 · Action
 *     "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a unit they
 *      control to the same battlefield."                                                         — P1's hand
 *   with P1's Vanguard Sergeant (4, vanilla) holding bfA, P1's 1-Might Recruit in base, P2's Shipyard Skulker
 *   (ogn-175-298, 3) at P2-held bfB and P2's ready 4-Might "K" in P2's base.
 *
 * Question (P1's turn, Neutral Open):
 *   (a) P1 Charms Skulker → bfA. Who is the MOVER of a spell-driven move — the caster P1 or Skulker's controller P2?
 *       Does Blast Cone trigger, when relative to the post-move Cleanup / staged combat, and with the Stun how does
 *       the combat at bfA go?
 *   (b) P1 casts Call to Battle instead (Recruit → bfA, P2 must bring a unit). Who picks P2's unit and when? Any
 *       destination decision for it? Does Blast Cone trigger? Who attacks?
 *   (c) P2 Standard-Moves K into bfA on P2's own turn — Blast Cone?
 *   (d) Blast Cone's own play trigger: when are opt-in / target / destination chosen, and does performing that
 *       move trigger Blast Cone's second ability on itself?
 *
 * Rules: 420.2 / 420.2.a (Moving is a Limited Action a PLAYER performs when an effect instructs them — the spell's
 * controller is the mover), 420.3.a (only the Standard Move exhausts), 449 / 450 (effect moves; Contested is applied
 * for the moved UNIT's controller, whoever moved it), 453 + 323.9 / 323.13 (Cleanup after the move stages the
 * Showdown/Combat, which BEGINS once the chain is empty in Neutral Open), 190.3.a, 464.2.c.1 / 464.2.c.1.a / 345
 * (the player who applied Contested attacks and takes Focus — on the caster's turn too), 423.1 / 423.1.b (a stunned
 * unit deals no combat damage), 355.4 / 355.4.a (move destinations are chosen with the targets: any location other
 * than the current one where the unit may be), 383.3.d, 383.3.b / 402 (a triggered ability's leading "you may
 * [exhaust this] to …" is its cost, settled when the trigger is FINALIZED — engine model `cost-at-finalization`).
 *
 * Expected: (a) P1 is the mover → Blast Cone triggers. Charm resolves: Skulker bfB → bfA ready; P2 applied Contested
 * at bfA; combat is staged; Blast Cone's trigger is the next chain item and P1 is asked "exhaust to Stun?" as it is
 * finalized (before priority); yes → Cone exhausted, and on resolution Skulker is Stunned. Chain empty → Combat begins
 * on P1's turn with P2 = Attacker + Focus. Pass/pass: Skulker deals 0, Sergeant deals 4 → Skulker dies, Sergeant
 * undamaged, bfA stays P1's. Declined: 3 into 4 — Skulker still dies, Sergeant survives (healed at 3c). (b) Recruit's
 * only controlled destination is bfA (fixed at finalization, no prompt); P2 — the instructed player — picks WHICH of
 * its units at RESOLUTION, no destination decision (dictated: "the same battlefield"); P2 moved it, so P1's Blast Cone
 * is silent; K at bfA → P2 Attacker with Focus on P1's turn, K 4 vs Sergeant 4 + Recruit 1. (c) P2 moving its own unit:
 * silent. (d) opt-in → enemy target → destination (K: bfA | bfB — never either base it isn't already in / P1's base)
 * all at finalization, before P2's priority; on resolution P1 performs the move → the second ability triggers and P1
 * may exhaust the just-played (ready) Cone to Stun K.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLAST_CONE = "unl-133-219";
const CHARM = "ogn-043-298";
const CALL_TO_BATTLE = "unl-101-219";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn 2, Neutral Open. bfA: P1's Vanguard Sergeant (4). bfB: P2's Shipyard Skulker (3). P1 base: Recruit (1) and
 * a READY Blast Cone (played on an earlier turn) — or, with `coneInHand`, the Cone still in hand for (d). P2 base: K (4).
 * P1 floats 8 energy + [calm] + [chaos] (Charm 1+[calm] / Call to Battle 3 / Blast Cone 4+[chaos]).
 */
function board(opts: { coneInHand?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 8, power: { calm: 1, chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 4, name: "Vanguard Sergeant" }, "sarge")
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
    .unit(P2, "base", { might: 4, name: "K" }, "k")
    .hand(P1, CHARM, "charm")
    .hand(P1, CALL_TO_BATTLE, "ctb");
  return opts.coneInHand ? b.hand(P1, BLAST_CONE, "cone") : b.gear(P1, BLAST_CONE, "cone");
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Is the Blast Cone "exhaust this to Stun it" opt-in being asked of P1 right now? */
function coneStunOptIn(game: Game): Decision | undefined {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "cone" && /exhaust/i.test(d.prompt) ? d : undefined;
}

/** Both players pass priority once each (whoever holds it first). */
async function passAround(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  await game.acting().passPriority();
}

/** (a) P1 casts Charm on Skulker choosing bfA, and both pass → Charm resolves. Stops at whatever comes next. */
async function charmSkulkerToA(game: Game): Promise<void> {
  await game.p1.cast("charm", { targets: "skulker", answers: ["bfA"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["skulker"] })]);
  await passAround(game);
}

/** (b) P1 casts Call to Battle on Recruit; both pass; P2 answers its "which unit" with K. Stops at the showdown. */
async function callKToA(game: Game): Promise<{ p2WasAsked: boolean; p1DestinationAsked: boolean }> {
  let p2WasAsked = false;
  let p1DestinationAsked = false;
  await game.p1.cast("ctb", { targets: "recruit" });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    if (d.kind === "pick" && d.semantics === "destination") {
      p1DestinationAsked = true;
      break;
    }
    if (d.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "k")) {
      p2WasAsked = true;
      await game.p2.pick("k");
      continue;
    }
    break;
  }
  return { p1DestinationAsked, p2WasAsked };
}

describe("(a) Charm: the CASTER is the mover (420.2/.2.a) → Blast Cone triggers; stunned Skulker attacks for 0", () => {
  test("Charm offers exactly the enemy units (Skulker, K); its destination for Skulker is asked at finalization: P2's base or bfA — never bfB (current) nor P1's base (355.4.a)", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "charm")).toEqual(["k", "skulker"]);
    await game.p1.cast("charm", { targets: "skulker" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(pickKeys(d).map((k) => k.replace(/^battlefield-/, "")).sort()).toEqual(["base", "bfA"]);
    await game.p1.pick("bfA");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // only now priority
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 0, chaos: 1 } });
  });

  test("Charm resolves: Skulker bfB → bfA NOT exhausted (420.3.a: only the Standard Move exhausts); Contested at bfA is applied by P2 — the UNIT's controller (450) — while `stagedBy` records P1's action; Charm in trash", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("skulker")).toBe("bfA");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isReady: true, owner: P2 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("Blast Cone TRIGGERS off P1's spell-driven move of an enemy unit: right after Charm resolves its ability is the (only) chain item, controlled by P1, and P1 is asked the 'exhaust this to Stun it' opt-in as the trigger is finalized — before anyone gets priority and before any showdown has begun (453 → staged only)", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    // DESIGN / adjudicated (383.3.b, 402; FIXER-PRIMER 'cost-at-finalization'): "you may exhaust this TO stun it" is the
    // trigger's base cost, asked and paid at FINALIZATION (timing FIN), not at resolution.
    const optIn = coneStunOptIn(game);
    expect(optIn).toBeDefined();
    expect(optIn).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cone", controller: P1, triggered: true, type: "ability" })]);
    // The combat is merely STAGED: no showdown is running yet, nobody has a combat role.
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active ?? false).toBe(false);
    expect(game.state("skulker").combatRole ?? null).toBeNull();
    expect(game.state("skulker").isStunned).toBe(false);
    expect(game.state("cone").isExhausted).toBe(false);
  });

  test("P1 says yes: the Cone is exhausted AT ONCE (cost paid on finalization), P1 then P2 get priority on the trigger, and on resolution Skulker is Stunned (423.1)", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    await game.p1.yes();
    expect(game.state("cone").isExhausted).toBe(true);
    expect(game.state("skulker").isStunned).toBe(false); // not yet — the Stun is the effect, resolved later
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await passAround(game);
    expect(game.state("skulker").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("chain empty in Neutral Open → the staged Combat at bfA BEGINS on P1's turn: P2 (whose unit applied Contested) is the Attacker and holds Focus, P1 defends (464.2.c.1/.1.a, 345)", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    await game.p1.yes();
    await passAround(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("defender");
    expect(game.state("recruit").combatRole ?? null).toBeNull();
    expect(game.turnPlayer()).toBe(P1);
  });

  test("pass/pass with the Stun: Skulker contributes NO combat damage (423.1.b) → Sergeant takes 0; Sergeant's 4 kills Skulker (3); P1 keeps bfA uncontested, no points change, back to P1's open main phase", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    await game.p1.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toContain("skulker");
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.state("cone")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P1 declines the opt-in: the trigger is removed (nothing to respond to), Cone stays READY, Skulker unstunned; combat 3 into 4: Skulker still dies, Sergeant survives (damage healed at combat cleanup), bfA stays P1's", async () => {
    const game = await board().build();
    await charmSkulkerToA(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("cone").isExhausted).toBe(false);
    expect(game.state("skulker").isStunned).toBe(false);
    // straight into the begun combat showdown, P2 attacking with Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA");
    expect(game.state("sarge").damage).toBe(0); // 3 < 4, healed after combat
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("cone").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Call to Battle: the OPPONENT moves its own unit → P1's Blast Cone does not trigger", () => {
  test("only 'a unit you control' with a controlled destination elsewhere is offered: Recruit (base → bfA) — not the Sergeant already AT the only controlled battlefield (355.4.a), never an enemy unit", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "ctb")).toEqual(["recruit"]);
    await expect(game.p1.cast("ctb", { targets: "sarge" })).rejects.toThrow();
    await expect(game.p1.cast("ctb", { targets: "k" })).rejects.toThrow();
  });

  test("cast on Recruit: its destination is fixed at finalization with NO prompt (bfA is the only battlefield P1 controls); P1 then P2 get priority; P2 is NOT asked anything before resolution", async () => {
    const game = await board().build();
    await game.p1.cast("ctb", { targets: "recruit" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctb", controller: P1, targets: ["recruit"] })]);
    expect(game.p1.energy()).toBe(5);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // priority, not a pick
  });

  test("on RESOLUTION Recruit lands at bfA, then P2 — the instructed player — chooses WHICH of its units moves (K | Skulker), with no destination decision for it ('the same battlefield' is dictated)", async () => {
    const game = await board().build();
    await game.p1.cast("ctb", { targets: "recruit" });
    await passAround(game);
    expect(game.locationOf("recruit")).toBe("bfA");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, timing: "RES" });
    expect(pickKeys(d).sort()).toEqual(["k", "skulker"]);
    await game.p2.pick("k");
    // no destination prompt for anyone — K is simply at bfA and the spell is done
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("k")).toBe("bfA");
    expect(game.zoneOf("ctb")).toBe("trash");
  });

  test("Blast Cone is SILENT: P2 (not P1) moved K, so 'When YOU move an enemy unit' is not met for P1 — no Cone chain item, no opt-in, Cone still ready, K not stunned", async () => {
    const game = await board().build();
    const seen = await callKToA(game);
    expect(seen).toEqual({ p1DestinationAsked: false, p2WasAsked: true });
    expect(coneStunOptIn(game)).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.state("cone").isExhausted).toBe(false);
    expect(game.state("k")).toMatchObject({ isReady: true, isStunned: false, location: "bfA" });
  });

  test("K (P2's) arriving at P1-controlled bfA applied Contested → after the spell's Cleanup a Combat begins on P1's turn with P2 = Attacker + Focus; K (4) attacks Sergeant (4) + Recruit (1)", async () => {
    const game = await board().build();
    await callKToA(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("k").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("defender");
    expect(game.state("recruit").combatRole).toBe("defender");
    expect(game.state("skulker").combatRole ?? null).toBeNull();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P2's own Standard Move into bfA — Blast Cone silent", () => {
  test("on P2's turn K Standard-Moves base → bfA: K exhausted (144.2), combat showdown opens with P2 attacking; P1's Cone never triggers (P2 moved its own unit), stays ready, K unstunned", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("k", "bfA");
    expect(game.chain()).toEqual([]);
    expect(coneStunOptIn(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("k")).toMatchObject({ combatRole: "attacker", isExhausted: true, isStunned: false, location: "bfA" });
    expect(game.state("cone").isExhausted).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("cone").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) playing Blast Cone: opt-in → target → destination all at finalization; its own move re-triggers it", () => {
  test("P1 plays the Cone (4): it enters base ready and its play trigger is finalized at once — first the leading 'you may' opt-in (FIN), then the enemy target (K | Skulker, FIN), then K's destination (bfA | bfB — not P2's base where it is, never P1's base; 355.4.a) — and only THEN P1 holds priority", async () => {
    const game = await board({ coneInHand: true }).build();
    await game.p1.play("cone");
    expect(game.zoneOf("cone")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1, chaos: 0 } });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cone" }, timing: "FIN" });
    await game.p1.yes();
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(pickKeys(d).sort()).toEqual(["k", "skulker"]);
    await game.p1.pick("k");
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(pickKeys(d).map((k) => k.replace(/^battlefield-/, "")).sort()).toEqual(["bfA", "bfB"]);
    await game.p1.pick("bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cone", controller: P1, targets: ["k"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.locationOf("k")).toBe("base"); // nothing has moved yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's first say comes after all choices
  });

  test("Skulker as the target instead: its destinations are P2's base or bfA (never bfB where it stands)", async () => {
    const game = await board({ coneInHand: true }).build();
    await game.p1.play("cone");
    await game.p1.yes();
    await game.p1.pick("skulker");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(pickKeys(d).map((k) => k.replace(/^battlefield-/, "")).sort()).toEqual(["base", "bfA"]);
  });

  test("on resolution P1 performs the move (K → bfA, ready) — that IS 'you move an enemy unit': the Cone's SECOND ability triggers as a new chain item and P1 is asked to exhaust the just-played, ready Cone", async () => {
    const game = await board({ coneInHand: true }).build();
    await game.p1.play("cone");
    await game.p1.yes();
    await game.p1.pick("k");
    await game.p1.pick("bfA");
    await passAround(game);
    expect(game.locationOf("k")).toBe("bfA");
    expect(game.state("k").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    const optIn = coneStunOptIn(game);
    expect(optIn).toBeDefined();
    expect(optIn).toMatchObject({ canAccept: true, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cone", controller: P1, triggered: true })]);
    expect(game.state("cone").isExhausted).toBe(false);
  });

  test("yes → Cone exhausted, K Stunned on resolution; then the staged combat begins (P2 attacks with a stunned K): K deals 0, Sergeant's 4 kills K (4); bfA stays P1's, Sergeant undamaged", async () => {
    const game = await board({ coneInHand: true }).build();
    await game.p1.play("cone");
    await game.p1.yes();
    await game.p1.pick("k");
    await game.p1.pick("bfA");
    await passAround(game);
    await game.p1.yes();
    expect(game.state("cone").isExhausted).toBe(true);
    await passAround(game);
    expect(game.state("k")).toMatchObject({ isStunned: true, location: "bfA" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("k").combatRole).toBe("attacker");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("k")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("declining the play trigger's opt-in removes it outright: no target/destination asked, nothing moves, the second ability never triggers, Cone ready in base", async () => {
    const game = await board({ coneInHand: true }).build();
    await game.p1.play("cone");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("k")).toBe("base");
    expect(game.locationOf("skulker")).toBe("bfB");
    expect(game.state("cone")).toMatchObject({ isExhausted: false, zone: "base" });
    expect(coneStunOptIn(game)).toBeUndefined();
  });
});
