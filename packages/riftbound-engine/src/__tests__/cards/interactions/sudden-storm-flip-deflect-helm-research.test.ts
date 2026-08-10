/**
 * Interaction: a facedown Sudden Storm flipped at a [Deflect] attacker during a showdown at Mystic Vortex, under an
 * enemy Helm of Suppression (cost increase) and a friendly Empowered Applied Researchers (total-cost discount).
 *   × Sudden Storm (sfd-017-221) · Spell · Fury · 3 · [Hidden] [Action]
 *     "Deal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead."                 — P1: facedown at the Vortex + a hand copy
 *   × Helm of Suppression (ven-045-166) · Gear · Calm — "Opponents' spells cost [1] more. If this is [Empowered],
 *     they cost [1][rainbow] more instead."                                                           — P2's gear
 *   × Applied Researchers (ven-055-166) · Unit · Mind · 4 Might — "[Empowered] Your spells cost [1][rainbow] less,
 *     to a minimum of [1]."                                                                            — P1, defending the Vortex, Empowered
 *   × Mystic Vortex (ven-160-166) · Battlefield — "During showdowns here, cards with [Reaction] cost [rainbow] more
 *     to play. (Hidden cards have [Reaction].)"                                                       — P1's battlefield
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 Might · [Deflect]                                     — P2's attacker
 *
 * Rules: 811.1.b + 356.1.b (played from facedown: base cost ignored → 0), 811.6 / 811.5.a (a Hidden card HAS
 * [Reaction] while facedown / played from facedown — a hand copy does not), 811.1.d.2 (flip targets: this battlefield
 * only), 356.2.a.2 + 809.1.c (Deflect = mandatory additional [A] for an opponent's choice), 356.1.b.3 + 356.3 (cost
 * INCREASES — Vortex [A], Helm [1] / [1][A] — are added after the zeroed base), 356.4.d (Researchers = total-cost
 * discount, applied after increases), 356.4.e (its "minimum of [1]" floors only its OWN energy reduction and never
 * raises anything), 356.4.f (its [A] half may remove any one pip — even the Deflect pip), 357.3 / DESIGN manual pay
 * (an unaffordable play is simply not offered).
 *
 * Question. P2's turn. P1 controls the Vortex, defended by an EMPOWERED Applied Researchers, with Sudden Storm FACEDOWN
 * there (and a second copy in hand). P2 controls a Helm of Suppression and attacks the Vortex with Pouty Poro; P2
 * passes Focus; P1 flips Sudden Storm at the Poro.
 *   (a) Helm EMPOWERED — exact payment; is the "[0]" flip free? Outcome for the Poro / the attack?
 *   (b) Helm NOT empowered — payment?   (c) no Helm — does the Researchers' floor lift the energy from 0 to 1?
 *   (d) the HAND copy at the Poro in the same open showdown (Helm empowered) — payment, Vortex surcharge, targets?
 *   (e) pool {0 energy, 3 power} in case (a): is the flip offered at all?
 *
 * Expected. (a) base 3 → 0; +[A] Deflect; +[A] Vortex (it has Reaction, 811.6); +[1][A] Helm → 1 + AAA; Researchers:
 * energy 1 stays 1 (own floor), −A → PAY 1 energy + 2 power (any domains). Not free. Poro is attacking → 4 → dies; the
 * combat ends with no attacker, P1 keeps the Vortex. (b) +[1] only → 1 + AA − A = 1 energy + 1 power. (c) 0 + AA − A =
 * 0 energy + 1 power (a floor never raises 0 to 1). (d) printed 3, NO Reaction from hand → no Vortex pip; +A Deflect
 * +[1][A] Helm −[1][A] → 3 energy + 1 power; any unit at any battlefield is a legal target. (e) No — Helm's +1 energy
 * survives every discount; with 0 energy the flip is absent from P1's legal actions.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUDDEN_STORM = "sfd-017-221";
const HELM = "ven-045-166";
const RESEARCHERS = "ven-055-166";
const MYSTIC_VORTEX = "ven-160-166";
const POUTY_PORO = "ogn-013-298";

interface Cfg {
  /** absent / present un-Empowered / present Empowered (P2's gear) */
  readonly helm: false | "plain" | "empowered";
  readonly energy: number;
  readonly power: Record<string, number>;
  /** make the Poro 5 Might (mightModifier +3) so "4, not 2" is directly observable */
  readonly bigPoro?: boolean;
}

/**
 * Turn 3, P2 active. mv = Mystic Vortex (LIVE text), owned + controlled by P1, defended by an EMPOWERED Applied
 * Researchers, with P1's Sudden Storm facedown there since an earlier turn; a second Sudden Storm in P1's hand.
 * bf2 = P2's, held by a 1-Might Bystander (a unit at ANOTHER battlefield — exposes the 811.1.d.2 restriction).
 * P2: Pouty Poro in base (walks into the Vortex), optionally Helm of Suppression (Empowered or not). P1's pool = cfg.
 */
function board(cfg: Cfg) {
  let s = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: cfg.energy, power: cfg.power })
    .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "mv", RESEARCHERS, "res", { empowered: true })
    .facedown(P1, "mv", SUDDEN_STORM, "stormDown")
    .hand(P1, SUDDEN_STORM, "stormHand")
    .unit(P2, "bf2", { might: 1, name: "Bystander" }, "by")
    .unit(P2, "base", POUTY_PORO, "poro", cfg.bigPoro ? { mightModifier: 3 } : undefined);
  if (cfg.helm) {
    s = s.gear(P2, HELM, "helm", cfg.helm === "empowered" ? { empowered: true } : undefined);
  }
  return s;
}

/** Build; the Poro attacks the Vortex (combat showdown, P2 has Focus); P2 passes Focus → P1 holds Focus, Showdown Open. */
async function p1HasFocus(cfg: Cfg): Promise<Game> {
  const game = await board(cfg).build();
  expect(game.state("res").isEmpowered).toBe(true);
  if (cfg.helm) {
    expect(game.state("helm").isEmpowered).toBe(cfg.helm === "empowered");
  }
  await game.p2.move("poro", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("poro").combatRole).toBe("attacker");
  expect(game.state("res").combatRole).toBe("defender");
  return game;
}

/** Card ids the current pick prompt offers (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
}

/** P1 flips the facedown Storm and names the Poro (chosen as it is played, 811.1.d.2). Storm is then P1's chain item. */
async function flipAtPoro(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "stormDown")).toBe(true);
  await game.p1.reveal("stormDown");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  expect(pickOffered(game)).toContain("poro");
  await game.p1.pick("poro");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stormDown", controller: P1, targets: ["poro"], triggered: false })]);
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].toSorted();
}

describe("(a) Helm EMPOWERED — the flip at the Deflect Poro costs 1 energy + 2 power; it is not free", () => {
  test("the flip is legal with Focus (Reaction via 811.6) and its target prompt lists ONLY the units at the Vortex — Poro and Researchers, never the bf2 Bystander (811.1.d.2)", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 4 } });
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:stormDown");
    await game.p1.reveal("stormDown");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickOffered(game)).toEqual(["poro", "res"]);
    await expect(game.p1.pick("by")).rejects.toThrow();
  });

  test("NOT free: exactly ONE energy is charged — Helm's +[1] is added after the zeroed base (356.1.b.3) and the Researchers' own 'minimum of [1]' stops her from removing it (356.4.e): 3 → 2", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 4 } });
    await flipAtPoro(game);
    expect(game.p1.energy()).toBe(2);
  });

  // Expected (356.3 → 356.4.d/f): 0 +[A] Deflect +[A] Vortex +[1][A] Helm = 1 + AAA, then Researchers −[1][A]: energy
  // floored at 1, ONE pip removed → 1 energy + 2 power, so {3, r4} → {2, r2}. Actual: the from-facedown cost path adds
  // the increases and the Deflect pip but never applies the Researchers' [rainbow] discount → 3 power taken ({2, r1}).
  test.failing("BUG: the flip should take exactly 1 energy + 2 power — Researchers' [A] discount removes one of the three pips (356.4.d, 356.4.f); engine charges 3 power", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 4 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
  });

  // Expected: {1 energy, 2 power} is the exact price, so the Poro IS offered and the pool empties. Actual: the engine
  // prices the Poro at 1 + 3 power, finds it unaffordable and binds the only "affordable" target (Researchers) instead.
  test.failing("BUG: with the exact pool {1, rainbow 2} the Poro is offered, chosen, and the pool empties to {0, 0}", async () => {
    const game = await p1HasFocus({ energy: 1, helm: "empowered", power: { rainbow: 2 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("outcome: the Poro IS attacking → Sudden Storm deals 4 → the 2-Might Poro dies; Storm → P1's trash; the showdown then closes with no attacker left — P1 keeps the Vortex, P2 scores nothing, Researchers untouched", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 4 } });
    await flipAtPoro(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Storm resolves
    expect(game.zoneOf("stormDown")).toBe("trash");
    expect(game.p1.trash()).toContain("stormDown");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // showdown still open until both pass
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("res")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-mv" });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("'4 instead of 2' is real: on a 5-Might Poro (2 +3) the flip marks exactly 4 damage and it survives", async () => {
    const game = await p1HasFocus({ bigPoro: true, energy: 3, helm: "empowered", power: { rainbow: 4 } });
    expect(game.state("poro").might).toBe(5);
    await flipAtPoro(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("stormDown")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 4, zone: "battlefield-mv" });
  });
});

describe("(b) Helm present but NOT empowered — 1 energy + 1 power", () => {
  test("Helm adds +[1] only: exactly one energy is charged (the Researchers' floor holds at 1): 3 → 2", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "plain", power: { rainbow: 4 } });
    await flipAtPoro(game);
    expect(game.p1.energy()).toBe(2);
  });

  // Expected: 0 +[A] Deflect +[A] Vortex +[1] Helm = 1 + AA; Researchers: energy stays 1, −A → 1 energy + 1 power:
  // {3, r4} → {2, r3}. Actual: no [rainbow] discount on the flip → 2 power taken ({2, r2}).
  test.failing("BUG: the flip should take exactly 1 energy + 1 power (Deflect + Vortex − Researchers' pip); engine charges 2 power", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "plain", power: { rainbow: 4 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 3 } });
  });

  // Expected: {1, r1} pays it exactly (Poro offered, pool empties). Actual: Poro priced at 1 + 2 power → not offered.
  test.failing("BUG: with the exact pool {1, rainbow 1} the Poro is offered and the pool empties", async () => {
    const game = await p1HasFocus({ energy: 1, helm: "plain", power: { rainbow: 1 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });
});

describe("(c) no Helm at all — 0 energy + 1 power: a discount's floor never RAISES the energy", () => {
  test("energy stays 0: the Researchers' 'minimum of [1]' floors only her own reduction (356.4.e) — with 3 energy in the pool none is taken, and with 0 energy the flip is still offered", async () => {
    const rich = await p1HasFocus({ energy: 3, helm: false, power: { rainbow: 4 } });
    await flipAtPoro(rich);
    expect(rich.p1.energy()).toBe(3);
    const broke = await p1HasFocus({ energy: 0, helm: false, power: { rainbow: 4 } });
    expect(broke.p1.can("reveal", "stormDown")).toBe(true);
    await flipAtPoro(broke);
    expect(broke.p1.energy()).toBe(0);
  });

  // Expected: 0 +[A] Deflect +[A] Vortex = AA; −A (Researchers) → 0 energy + 1 power: {3, r4} → {3, r3}.
  // Actual: 2 power taken ({3, r2}) — the [rainbow] discount is not applied to a from-facedown play.
  test.failing("BUG: the flip should take exactly 0 energy + 1 power (A + A − A); engine charges 2 power", async () => {
    const game = await p1HasFocus({ energy: 3, helm: false, power: { rainbow: 4 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 3 } });
  });

  // Expected: {0, r1} is the exact price at the Poro. Actual: not offered (engine wants 2 power).
  test.failing("BUG: with the exact pool {0 energy, rainbow 1} the Poro is offered and the pool empties", async () => {
    const game = await p1HasFocus({ energy: 0, helm: false, power: { rainbow: 1 } });
    await flipAtPoro(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });
});

describe("(d) the HAND copy at the Poro in the same open showdown (Helm empowered) — 3 energy + 1 power, no Vortex pip", () => {
  test("the hand copy is legal in the Open showdown via its printed [Action] and offers ANY unit at ANY battlefield — Poro, Researchers AND the bf2 Bystander (811.3: no 'here' restriction)", async () => {
    const game = await p1HasFocus({ energy: 5, helm: "empowered", power: { rainbow: 4 } });
    expect(game.p1.can("cast", "stormHand")).toBe(true);
    expect(targetsOffered(game, "stormHand")).toEqual(["by", "poro", "res"]);
  });

  test("payment: printed 3 +[A] Deflect +[1][A] Helm −[1][A] Researchers = exactly 3 energy + 1 power — it has NO Reaction in hand (811.6 / 811.5.a) so the Vortex adds nothing: {5, r4} → {2, r3}", async () => {
    const game = await p1HasFocus({ energy: 5, helm: "empowered", power: { rainbow: 4 } });
    await game.p1.cast("stormHand", { targets: "poro" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stormHand", controller: P1, targets: ["poro"] })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 3 } });
  });

  test("exactness: {3, r1} pays it to the pip (pool empties) and the attacking Poro dies to the 4; with {3, r0} the Poro is not a legal target (Deflect pip owed); with {2, r4} the hand copy is not castable at all (3 energy owed)", async () => {
    const exact = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 1 } });
    await exact.p1.cast("stormHand", { targets: "poro" });
    expect(exact.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await exact.p1.passPriority();
    await exact.p2.passPriority();
    expect(exact.zoneOf("poro")).toBe("trash");
    expect(exact.zoneOf("stormHand")).toBe("trash");

    const noPip = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 0 } });
    expect(targetsOffered(noPip, "stormHand")).not.toContain("poro");
    await expect(noPip.p1.cast("stormHand", { targets: "poro" })).rejects.toThrow();
    expect(noPip.zoneOf("stormHand")).toBe("hand");

    const short = await p1HasFocus({ energy: 2, helm: "empowered", power: { rainbow: 4 } });
    expect(short.p1.can("cast", "stormHand")).toBe(false);
  });

  // Expected (356.3 → 356.4.d): at an UNTAXED target the hand copy is 3 +[1][A] Helm −[1][A] Researchers = 3 energy
  // flat, so with {3 energy, no power} the Researchers and the Bystander are still offered (only the Deflect Poro is
  // not). Actual: nothing is offered — the engine's [rainbow] discount only ever cancels a printed pip or the Deflect
  // pip, never the Helm's added [A], so it demands 1 power for every target.
  test.failing("BUG: with {3, no power} the untaxed Researchers / Bystander are still legal targets for the hand copy (3 + [1][A] − [1][A] = 3 energy, 0 power); engine offers none", async () => {
    const game = await p1HasFocus({ energy: 3, helm: "empowered", power: { rainbow: 0 } });
    expect(game.p1.can("cast", "stormHand")).toBe(true);
    expect(targetsOffered(game, "stormHand")).toEqual(["by", "res"]);
  });
});

describe("(e) case (a) with {0 energy, 3 power} — the flip is not offered at all", () => {
  test("Helm's +[1] survives every discount's floor, so with 0 energy the facedown flip is ABSENT from P1's legal actions (not a mid-play failure, 357.3): can() false, a forced attempt is rejected, the card stays facedown, the pool is untouched", async () => {
    const game = await p1HasFocus({ energy: 0, helm: "empowered", power: { rainbow: 3 } });
    expect(game.p1.legal().map((o) => o.key)).not.toContain("revealHidden:stormDown");
    expect(game.p1.can("reveal", "stormDown")).toBe(false);
    expect(game.p1.can("cast", "stormHand")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("stormDown"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("stormDown")).toBe("facedown-mv");
    expect(game.state("stormDown").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("control — the same pool WITHOUT the Helm (case c pricing) does offer the flip: it is the Helm's energy, not the power, that locks it out", async () => {
    const game = await p1HasFocus({ energy: 0, helm: false, power: { rainbow: 3 } });
    expect(game.p1.can("reveal", "stormDown")).toBe(true);
  });
});
