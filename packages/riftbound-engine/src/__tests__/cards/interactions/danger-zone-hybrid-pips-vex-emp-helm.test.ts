/**
 * Interaction: Danger Zone (sfd-182-221) × Vex, Cheerless (sfd-146-221) × Helm of Suppression (ven-045-166)
 *
 *   Danger Zone — Fury/Mind spell, 1 + [C] (hybrid: fury|mind), [Reaction], [Repeat] [1][C]:
 *     "Give your Mechs +1 [Might] this turn."
 *   Vex, Cheerless — "While I'm in combat, friendly spells cost [1][A] less to a minimum of [1], and enemy
 *     spells cost [1][A] more."
 *   Helm of Suppression — "Opponents' spells cost [1] more. If this is [Empowered], they cost [1][A] more instead."
 *
 * Question: per-domain pip substitution under two simultaneous [A] surcharges. On P2's turn Vex attacks
 * P1's bf1 (defended by a 3-Might Mech token) while P2 holds an Empowered Helm; P1 reacts with Danger
 * Zone. Which of the power pips are hybrid-locked (fury|mind only) and which accept any domain, with and
 * without Repeat, and under each surcharge combination? Which pools make which variants legal, what is
 * left after paying, and what is the Mech's Might afterwards?
 *
 * Rules: 135.2.e.5.a ([A] surcharge = any domain), 135.2.e.6.c ([C] on a two-domain card = either of its
 * domains — also the Repeat pip), 356.2.b.1 (Repeat is an optional additional cost), 356.3 (increases),
 * 356.1.b.3, 820.1.d / 820.3 (Repeat executes twice), 357.1 / 357.3 / 358.2 (all costs paid or the play
 * is not offered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DANGER_ZONE = "sfd-182-221";
const VEX = "sfd-146-221";
const HELM = "ven-045-166";
const MECH = { isToken: true, might: 3, name: "Mech", tags: ["Mech"] };

type Pool = { energy: number; power: Record<string, number> };
interface Opts {
  readonly helm?: "empowered" | "plain" | "none";
  /** "combat": Vex is the attacker at bf1; "base": Vex sits in P2's base and a vanilla grunt attacks instead. */
  readonly vex?: "combat" | "base";
}

/**
 * P2's turn. P1 controls bf1 with a 3-Might Mech token and holds Danger Zone with `pool`.
 * P2: Vex (attacker-to-be) in base, Helm of Suppression (empowered by default).
 */
function board(pool: Pool, opts: Opts = {}) {
  const s = scenario()
    .active(P2)
    .resources(P1, pool)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MECH, "token-mech")
    .hand(P1, DANGER_ZONE, "dz")
    .unit(P2, "base", VEX, "vex");
  const helm = opts.helm ?? "empowered";
  if (helm === "empowered") {
    s.gear(P2, HELM, "helm", { empowered: true });
  } else if (helm === "plain") {
    s.gear(P2, HELM, "helm");
  }
  if (opts.vex === "base") {
    s.unit(P2, "base", { might: 1, name: "Grunt" }, "grunt");
  }
  return s;
}

/** P2 attacks bf1 (with Vex, or with the grunt when Vex stays home) and passes Focus → P1 holds Focus in the combat showdown. */
async function attackAndGiveP1Focus(game: Game, opts: Opts = {}): Promise<void> {
  await game.p2.move(opts.vex === "base" ? "grunt" : "vex", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** The Repeat counts Danger Zone is offered with right now ([] = not castable, [0] = plain only, [0,1] = both). */
function repeatVariants(game: Game): number[] {
  const opt = game.p1.option("cast", "dz");
  if (!opt) {
    return [];
  }
  return opt.variants.map((v) => Number(v.params.repeatCount ?? 0)).sort();
}

/** Pass priority around until Danger Zone has resolved (the showdown itself stays open). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.chain()).toEqual([]);
}

describe("Danger Zone hybrid pips under Vex-in-combat + Empowered Helm surcharges", () => {
  test("setup sanity: Helm is Empowered, Vex becomes the attacker at bf1, P1 gets Focus and may react with Danger Zone", async () => {
    const game = await board({ energy: 4, power: { calm: 2, fury: 1, mind: 1 } }).build();
    expect(game.state("helm").isEmpowered).toBe(true);
    await attackAndGiveP1Focus(game);
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.p1.can("cast", "dz")).toBe(true);
  });

  test("(a) Repeat elected under both surcharges = 4 energy + {H,H,A,A}: pool {4, fury1, mind1, calm2} pays it exactly (fury+mind → hybrids, calm+calm → [A]s) and Mechs get +2", async () => {
    const game = await board({ energy: 4, power: { calm: 2, fury: 1, mind: 1 } }).build();
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([0, 1]);
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dz", controller: P1 })]);
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(5); // two executions (820.3)
    expect(game.zoneOf("dz")).toBe("trash");
  });

  test("(b) Repeat declined = 3 energy + {H,A,A}: the same pool leaves exactly {1 energy, 1 power}; Mechs +1", async () => {
    const game = await board({ energy: 4, power: { calm: 2, fury: 1, mind: 1 } }).build();
    await attackAndGiveP1Focus(game);
    await game.p1.cast("dz", { repeat: 0 });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(1);
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(4);
  });

  test("(f) {4, calm:4}: NEITHER variant is offered — calm fills the [A] surcharge pips but never a fury|mind hybrid pip (135.2.e.6.c)", async () => {
    const game = await board({ energy: 4, power: { calm: 4 } }).build();
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([]);
    expect(game.p1.can("cast", "dz")).toBe(false);
    await expect(game.p1.cast("dz")).rejects.toThrow();
    await expect(game.p1.cast("dz", { repeat: 1 })).rejects.toThrow();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 4 } });
  });

  test("(f) {4, fury:2, calm:1}: Repeat ABSENT (needs 4 power, has 3); plain offered and drains fury→H, fury/calm→A,A leaving {1, 0 power}", async () => {
    const game = await board({ energy: 4, power: { calm: 1, fury: 2 } }).build();
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([0]);
    await expect(game.p1.cast("dz", { repeat: 1 })).rejects.toThrow();
    await game.p1.cast("dz");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 0 } });
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(4);
  });

  test("(f) {3, mind:1, order:2}: plain offered EXACTLY (mind→H, order,order→A,A) → pool empty; Repeat absent", async () => {
    const game = await board({ energy: 3, power: { mind: 1, order: 2 } }).build();
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([0]);
    await game.p1.cast("dz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(4);
  });

  test("(a/f) payer-optimal routing: {4, fury:2, chaos:2} pays Repeat (fury,fury → hybrids; chaos,chaos → [A]s) — in-domain power must not be wasted on [A] pips", async () => {
    const game = await board({ energy: 4, power: { chaos: 2, fury: 2 } }).build();
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([0, 1]);
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    // Plain on the same pool: H from fury, the two [A] should leave one fury or take both chaos — either way 1 energy + 1 power remain.
    const g2 = await board({ energy: 4, power: { chaos: 2, fury: 2 } }).build();
    await attackAndGiveP1Focus(g2);
    await g2.p1.cast("dz");
    expect(g2.p1.energy()).toBe(1);
    expect(g2.p1.power()).toBe(1);
  });

  test("(c) Helm NOT empowered (+[1] only) with Vex in combat: Repeat = 4 + {H,H,A}, plain = 3 + {H,A} — {4, fury:2, calm:1} now covers Repeat exactly", async () => {
    const game = await board({ energy: 4, power: { calm: 1, fury: 2 } }, { helm: "plain" }).build();
    expect(game.state("helm").isEmpowered).toBe(false);
    await attackAndGiveP1Focus(game);
    expect(repeatVariants(game)).toEqual([0, 1]); // contrast (f): same pool, empowered Helm → Repeat absent
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(5);

    const plain = await board({ energy: 4, power: { calm: 1, fury: 2 } }, { helm: "plain" }).build();
    await attackAndGiveP1Focus(plain);
    await plain.p1.cast("dz");
    expect(plain.p1.energy()).toBe(1); // 3 paid
    expect(plain.p1.power()).toBe(1); // H + A paid
    // {3, mind:1, calm:1}: plain exactly; Repeat (4 energy) absent.
    const exact = await board({ energy: 3, power: { calm: 1, mind: 1 } }, { helm: "plain" }).build();
    await attackAndGiveP1Focus(exact);
    expect(repeatVariants(exact)).toEqual([0]);
    await exact.p1.cast("dz");
    expect(exact.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  });

  test("(d) Vex in P2's BASE (not in combat) + Empowered Helm: only Helm's +[1][A] — Repeat = 3 + {H,H,A}, plain = 2 + {H,A}", async () => {
    const game = await board({ energy: 3, power: { calm: 1, fury: 1, mind: 1 } }, { vex: "base" }).build();
    await attackAndGiveP1Focus(game, { vex: "base" });
    expect(game.locationOf("vex")).toBe("base");
    expect(repeatVariants(game)).toEqual([0, 1]);
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0, mind: 0 } });
    await resolveChain(game);
    expect(game.state("token-mech").might).toBe(5);

    const plain = await board({ energy: 3, power: { calm: 1, fury: 1, mind: 1 } }, { vex: "base" }).build();
    await attackAndGiveP1Focus(plain, { vex: "base" });
    await plain.p1.cast("dz");
    expect(plain.p1.energy()).toBe(1); // 2 paid
    expect(plain.p1.power()).toBe(1); // H + A paid
    // {2, calm:2}: plain NOT castable — the hybrid pip still needs fury|mind.
    const calmOnly = await board({ energy: 2, power: { calm: 2 } }, { vex: "base" }).build();
    await attackAndGiveP1Focus(calmOnly, { vex: "base" });
    expect(repeatVariants(calmOnly)).toEqual([]);
  });

  test("(e) no surcharges at all (P1's own turn, no Vex/Helm): plain 1 + [H]; Repeat 2 + [H][H] — {2, fury1, mind1} pays Repeat exactly, {2, calm:2} casts nothing", async () => {
    const own = () => scenario().unit(P1, "base", MECH, "token-mech").hand(P1, DANGER_ZONE, "dz");
    const game = await own().resources(P1, { energy: 2, power: { fury: 1, mind: 1 } }).build();
    expect(repeatVariants(game)).toEqual([0, 1]);
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await game.settle();
    expect(game.state("token-mech").might).toBe(5);

    const plain = await own().resources(P1, { energy: 1, power: { mind: 1 } }).build();
    expect(repeatVariants(plain)).toEqual([0]);
    await plain.p1.cast("dz");
    expect(plain.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await plain.settle();
    expect(plain.state("token-mech").might).toBe(4);

    const calm = await own().resources(P1, { energy: 2, power: { calm: 2 } }).build();
    expect(repeatVariants(calm)).toEqual([]);
    expect(calm.p1.can("cast", "dz")).toBe(false);
  });

  test("'this turn': the +1 lapses at end of turn (Mech back to 3 on the next turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", MECH, "token-mech")
      .hand(P1, DANGER_ZONE, "dz")
      .build();
    await game.p1.cast("dz");
    await game.settle();
    expect(game.state("token-mech").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("token-mech").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
