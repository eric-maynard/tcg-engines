/**
 * Interaction: Called Shot (sfd-122-221) · Spell · Chaos · [0]+[chaos] · Action
 *     "[Repeat] [chaos]. Look at the top 2 cards of your Main Deck. Draw one and recycle the other."
 *   × Ezreal, Prodigy (sfd-149-221) · Champion Unit · 3+[chaos] · 3 Might
 *     "… Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Vex, Cheerless (sfd-146-221) · Champion Unit · 5+[chaos] · 5 Might
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy
 *      spells cost [1][rainbow] more."
 *   × Helm of Suppression (ven-045-166) · Gear — un-Empowered: "Opponents' spells cost [1] more."
 *
 * Question: Called Shot cast by P1 during a COMBAT showdown, with the Repeat elected.
 *   (a) P1's own Vex is the attacker, Ezreal in P1's base: exact payment? Does Vex's "minimum of
 *       [1]" RAISE a 0-energy spell to 1?
 *   (b) as (a) + P2's un-Empowered Helm (+[1]): can Vex's −[1] undo the Helm's +[1]?
 *   (c) no Ezreal, own Vex in combat, Repeat elected: payment?
 *   (d) roles flipped — P2's Vex DEFENDS (enemy to P1), P1 has Ezreal, Repeat elected: payment?
 *   (e) with an EMPTY pool: which variants are offered in (a) vs (b)?
 *
 * Rules / order of operations:
 *   356.1  base cost 0+[chaos].   356.2.b  Repeat adds an optional +[chaos].
 *   356.4.c  Ezreal's discount is a COMPONENT discount — applied to the Repeat pip the moment it is
 *            added → the Repeat costs 0 but still counts as PAID (356.4.f.1) → two executions (820.3),
 *            one spell played (820.3.a).
 *   356.3  increases: Helm +[1] / enemy Vex +[1][rainbow].
 *   356.4.d  own Vex's total-cost discount −[1][rainbow] is applied last; 356.4.e its "minimum of
 *            [1]" limits ONLY her own energy reduction (it is not a cost increase); 356.4.f her
 *            [rainbow] half may eat any remaining pip, including the base [chaos].   356.6 floor 0.
 *   357.3  an unaffordable variant is simply not offered (absent, not rejected).
 *
 * Expected:
 *   (a) 0 energy / 0 power (base pip eaten by Vex, Repeat pip by Ezreal); effect runs twice.
 *   (b) Helm → energy 1; Vex may not take that 1 below her floor → 1 energy, 0 power.
 *   (c) [chaos]+[chaos] − Vex's [rainbow] → 0 energy + 1 chaos.
 *   (d) 0+[chaos] + Repeat 0 (Ezreal) + enemy Vex [1][rainbow] → 1 energy + [chaos] + 1 any power.
 *   (e) (a): both the plain and the Repeat variant offered at 0/0; (b): with 0 energy NEITHER.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALLED_SHOT = "sfd-122-221";
const EZREAL = "sfd-149-221";
const VEX = "sfd-146-221";
const HELM = "ven-045-166";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";
const BLOCK = "ogn-057-298";

interface BoardOpts {
  ezreal?: boolean;
  helm?: boolean;
  /** P2's Vex defends bf1 (P1 attacks with a vanilla 9-Might bruiser) instead of P1's Vex attacking. */
  enemyVex?: boolean;
  energy?: number;
  power?: Record<string, number>;
}

/**
 * P1's turn. P2 holds bf1 with a 2-Might defender. P1 has Called Shot in hand and a known deck top
 * d1..d4. Own-Vex boards put Vex in P1's base (she attacks bf1); the enemy-Vex board puts P2's Vex
 * at bf1 and gives P1 a vanilla bruiser to attack with.
 */
function board(opts: BoardOpts = {}) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: opts.energy ?? 0, power: opts.power ?? {} })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .deck(P1, [SKULKER, CLEAVE, BLOCK, SKULKER], ["d1", "d2", "d3", "d4"])
    .hand(P1, CALLED_SHOT, "cs");
  if (opts.enemyVex) {
    b.unit(P2, "bf1", VEX, "theirVex").unit(P1, "base", { might: 9, name: "Bruiser" }, "bruiser");
  } else {
    b.unit(P1, "base", VEX, "vex");
  }
  if (opts.ezreal) {
    b.unit(P1, "base", EZREAL, "ez");
  }
  if (opts.helm) {
    b.gear(P2, HELM, "helm");
  }
  return b;
}

/** Open the combat showdown at bf1 (P1 attacks and holds Focus). */
async function attack(opts: BoardOpts): Promise<Game> {
  const game = await board(opts).build();
  if (opts.enemyVex) {
    await game.p1.move("bruiser", "bf1");
    expect(game.state("theirVex").combatRole).toBe("defender");
  } else {
    await game.p1.move("vex", "bf1");
    expect(game.state("vex").combatRole).toBe("attacker");
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** The repeatCount values the cast option's variants carry (undefined = plain cast). */
function repeatVariants(game: Game): (number | undefined)[] {
  return (game.p1.option("cast", "cs")?.variants ?? []).map((v) => v.params.repeatCount as number | undefined);
}

describe("Called Shot × Ezreal, Prodigy × Vex, Cheerless (× Helm of Suppression) — cost order 356.1→356.6", () => {
  // ── (a) own Vex attacking + Ezreal ───────────────────────────────────────────────────

  test("(a) own Vex in combat + Ezreal, Repeat elected: pays 0 energy and 0 power — Vex's 'minimum of [1]' does NOT raise a 0-cost spell (356.4.e), Ezreal zeroes the Repeat pip (356.4.c), Vex's [rainbow] eats the base [chaos] (356.4.f)", async () => {
    const game = await attack({ energy: 2, ezreal: true, power: { calm: 1, chaos: 2 } });
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, chaos: 2 } }); // nothing spent
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1, triggered: false })]);
  });

  test("(a) the Repeat reduced to 0 still counts as PAID (356.4.f.1): the look/draw/recycle runs twice (820.3) and only ONE spell was played (820.3.a)", async () => {
    const game = await attack({ energy: 0, ezreal: true, power: {} });
    const playedBefore = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.chain()).toHaveLength(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(playedBefore + 1);
    await game.settle();
    const first = game.decision() as PickDecision;
    expect(first).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(first.options.map((o) => o.card)).toEqual(["d1", "d2"]);
    await game.p1.pick("d1");
    await game.settle();
    const second = game.decision() as PickDecision;
    expect(second.kind).toBe("pick");
    expect(second.options.map((o) => o.card)).toEqual(["d3", "d4"]); // second execution: two fresh cards
    await game.p1.pick("d3");
    expect(game.p1.hand().sort()).toEqual(["d1", "d3"]);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(playedBefore + 1); // still one play
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // back in the showdown
    expect(game.violations()).toEqual([]);
  });

  test("(e/a) with an EMPTY pool both the plain cast and the Repeat variant are offered (total 0/0 either way)", async () => {
    const game = await attack({ energy: 0, ezreal: true, power: {} });
    expect(game.p1.can("cast", "cs")).toBe(true);
    expect(repeatVariants(game)).toEqual([undefined, 1]);
  });

  // ── (b) + P2's un-Empowered Helm of Suppression ──────────────────────────────────────

  test("(b) + enemy Helm (+[1], 356.3): Vex cannot discount the taxed 1 below her own floor of [1] → pays exactly 1 energy and 0 power", async () => {
    const game = await attack({ energy: 2, ezreal: true, helm: true, power: { calm: 1, chaos: 2 } });
    expect(game.state("helm").isEmpowered).toBe(false);
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 2 } });
  });

  test("(b) exactly 1 energy and no power is enough for the Repeat cast under the Helm; it drains to 0/0", async () => {
    const game = await attack({ energy: 1, ezreal: true, helm: true, power: {} });
    expect(repeatVariants(game)).toEqual([undefined, 1]);
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toHaveLength(1);
  });

  test("(e/b) with 0 energy under the Helm NEITHER variant is offered — absent from the legal menu, not rejected on attempt (357.3 / 355.8)", async () => {
    const game = await attack({ energy: 0, ezreal: true, helm: true, power: { chaos: 2 } });
    expect(game.p1.can("cast", "cs")).toBe(false);
    expect(game.p1.option("cast", "cs")).toBeUndefined();
    await expect(game.p1.cast("cs", { repeat: 1 })).rejects.toThrow();
    expect(game.zoneOf("cs")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2 } });
  });

  // ── (c) own Vex, NO Ezreal ───────────────────────────────────────────────────────────

  test("(c) no Ezreal, own Vex in combat, Repeat elected: [chaos]+[chaos] − Vex's one [rainbow] → 0 energy + exactly 1 chaos", async () => {
    const game = await attack({ energy: 2, power: { calm: 1, chaos: 2 } });
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, chaos: 1 } });
  });

  test("(c) 'free without repeat, chaos with repeat': with an empty pool only the PLAIN cast is offered; with exactly 1 chaos both are, and the Repeat cast spends it", async () => {
    const broke = await attack({ energy: 0, power: {} });
    expect(repeatVariants(broke)).toEqual([undefined]);
    await broke.p1.cast("cs");
    expect(broke.p1.resources()).toEqual({ energy: 0, power: {} });

    const one = await attack({ energy: 0, power: { chaos: 1 } });
    expect(repeatVariants(one)).toEqual([undefined, 1]);
    await one.p1.cast("cs", { repeat: 1 });
    expect(one.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // ── (d) ENEMY Vex in this combat, P1 has Ezreal ──────────────────────────────────────

  test("(d) enemy Vex defending + own Ezreal, Repeat elected: 0+[chaos] + Repeat 0 + [1][rainbow] surcharge → exactly 1 energy + 1 chaos + 1 power of any domain", async () => {
    const game = await attack({ energy: 1, enemyVex: true, ezreal: true, power: { calm: 1, chaos: 1 } });
    expect(repeatVariants(game)).toEqual([undefined, 1]);
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1 })]);
  });

  test("(d) negative space: one pip short ({1, chaos:1}) or one energy short ({0, chaos:1, calm:1}) → not castable at all under the enemy Vex", async () => {
    const noPip = await attack({ energy: 1, enemyVex: true, ezreal: true, power: { chaos: 1 } });
    expect(noPip.p1.can("cast", "cs")).toBe(false);
    const noEnergy = await attack({ energy: 0, enemyVex: true, ezreal: true, power: { calm: 1, chaos: 1 } });
    expect(noEnergy.p1.can("cast", "cs")).toBe(false);
    await expect(noEnergy.p1.cast("cs", { repeat: 1 })).rejects.toThrow();
    expect(noEnergy.zoneOf("cs")).toBe("hand");
  });

  test("(d) control: the surcharge's extra pip is ANY domain — {1, chaos:2} also pays (second chaos covers the [rainbow])", async () => {
    const game = await attack({ energy: 1, enemyVex: true, ezreal: true, power: { chaos: 2 } });
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });
});
