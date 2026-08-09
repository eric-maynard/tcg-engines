/**
 * Core rules — ONE damage choke point (`operations/deal-damage.ts dealDamage / dealDamageBatch /
 * previewDamage`): every path that marks damage — spell, ability, self-damage, unit "fights", combat
 * (single target and distributed among several defenders), Bonus Damage riders — honours the same
 * damage replacement / modification effects, in rules order.
 *
 * Rules covered
 *   417.1.e / 417.1.e.1  only valid (≥1) damage is dealt; fully prevented damage is not dealt (437.4)
 *                        → no `take-damage` event, no `dealtDamageThisTurn`
 *   432.1 / 437.2        "double all damage that would be dealt to it" — spell, ability AND combat
 *   437.1.b.1 / 437.3    Prevent N: reduced, tracked value spent (437.3.a: gone at 0); "All" (437.1.b.1.b)
 *   437.5.a / 437.5.b    combat: assignment lethal thresholds INCLUDE the Prevent Value; "All" ⇒ never lethal
 *   465.2.c.4.a          a doubled unit needs only HALF the assignment to be lethal — assigning more is illegal
 *   465.2.c.5            replacements apply to the assignment (the distribute prompt's `lethal` reflects them)
 *   372                  Double + Prevent N on one unit: ITS CONTROLLER orders them — both orders, both results
 *   715.1 / 715.4.a      "+1 Bonus Damage" on the source: spells/abilities only (never combat), added BEFORE
 *                        any Prevent sees the total
 *   465.2.c.10           "I don't take damage" — nothing is dealt, in or out of combat
 *   370.1.b              "…is dealt to Z instead" — the redirected unit takes it (its own shields then apply)
 *   417.6.b.3            a "they deal damage equal to their Mights to each other" fight is dealt by the UNITS
 *
 * Every modifier is installed as unit META / an inline ability so this stays mechanism-level:
 *   Double      grantedKeywords [{ keyword: "DoubleIncomingDamage", duration: "turn" }]   (Lotus Trap)
 *   Prevent N   damagePreventionShield: N                                            (Ki Barrier)
 *   Prevent All damagePreventionShield: "all"  /  preventNextDamageInstance: true      (Counter Strike)
 *   +1 Bonus    static { grant-keyword BonusDamage target:"controller" value:1 }         (Annie, Fiery)
 *   Redirect    replacement { replaces:"take-damage", replacement:{ type:"redirect-damage", to:"self" } }
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Policy } from "../../harness";
import { P1, P2, passivePolicy, scenario } from "../../harness";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

// ---------------------------------------------------------------------------
// Inline cards
// ---------------------------------------------------------------------------

/** Spell: "Deal N to a unit." */
const BOLT = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: `Bolt ${n} (inline spell: Deal ${n} to a unit)`,
  timing: "action",
});

/** Unit with "[Exhaust]: Deal 3 to a unit." */
const PINGER = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 3, target: { type: "unit" }, type: "damage" }, type: "activated" }],
  might: 2,
  name: "Pinger (inline: Exhaust — Deal 3 to a unit)",
};

/** Unit with "[Exhaust]: Deal 3 to me." (self-damage) */
const FLAGELLANT = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 3, target: "self", type: "damage" }, type: "activated" }],
  might: 6,
  name: "Flagellant (inline: Exhaust — Deal 3 to me)",
};

/** Spell: "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other." */
const DUEL = {
  abilities: [
    {
      effect: { attacker: { controller: "friendly", type: "unit" }, defender: { controller: "enemy", type: "unit" }, type: "fight" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Duel (inline spell: a friendly and an enemy unit deal damage equal to their Mights to each other)",
  timing: "action",
};

/** Unit: "Your spells and abilities deal 1 Bonus Damage." */
const FIRESTARTER = {
  abilities: [{ effect: { keyword: "BonusDamage", target: "controller", type: "grant-keyword", value: 1 }, type: "static" }],
  might: 1,
  name: "Firestarter (inline: Your spells and abilities deal 1 Bonus Damage)",
};

/** Unit: "If another friendly unit here would be dealt damage, it is dealt to me instead." */
const BODYGUARD = (might: number) => ({
  abilities: [
    {
      replacement: { to: "self", type: "redirect-damage" },
      replaces: "take-damage",
      target: { controller: "friendly", excludeSelf: true, location: "here", type: "unit" },
      type: "replacement",
    },
  ],
  might,
  name: "Bodyguard (inline: damage that would be dealt to another friendly unit here is dealt to me instead)",
});

/** Unit: "I don't take damage." */
const UNTOUCHABLE = (might: number) => ({
  abilities: [{ effect: { restriction: "no-damage", type: "restriction" }, type: "static" }],
  might,
  name: "Untouchable (inline: I don't take damage)",
});

const DOUBLE = { grantedKeywords: [{ duration: "turn", keyword: "DoubleIncomingDamage" }] };
const PREVENT = (n: number | "all") => ({ damagePreventionShield: n });
const PREVENT_NEXT = { preventNextDamageInstance: true };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noDistribute: Policy = (d, g) => (d.kind === "distribute" ? undefined : passivePolicy(d, g));

function damageEvents(game: Game, target: string) {
  return (game.gameState.damageLog ?? []).filter((r) => r.target === target);
}

function takeDamageCount(game: Game, target: string): number {
  return (game.gameState as { turnEventCounts?: Record<string, number> }).turnEventCounts?.[`take-damage|c:${target}`] ?? 0;
}

function isRpl(d: Decision | null): d is Extract<Decision, { kind: "pick" }> {
  return !!d && d.kind === "pick" && d.timing === "RPL";
}

/** P1 to act with a Bolt N in hand aimed at P2's `foe` (might, meta) standing at bf1. */
function boltAt(n: number, might: number, meta?: Record<string, unknown>) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might, name: "Foe" }, "foe", meta)
    .hand(P1, BOLT(n), "bolt");
}

async function castBolt(game: Game, target = "foe"): Promise<void> {
  await game.p1.cast("bolt", { targets: target });
  await game.settle();
}

/** P1's `atk` (might) attacks P2's `foe` (might, meta) at bf1; returns after combat resolved. */
async function fight(atkMight: number, foeMight: number, foeMeta?: Record<string, unknown>, atkMeta?: Record<string, unknown>): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe", foeMeta)
    .unit(P1, "base", { might: atkMight, name: "Attacker" }, "atk", atkMeta)
    .build();
  await game.p1.move("atk", "bf1");
  await game.settle();
  return game;
}

// ===========================================================================
// Spell damage × modifiers
// ===========================================================================

describe("spell damage goes through the choke point", () => {
  test("no modifier: Deal 3 marks 3, one take-damage event {amount 3, original 3}", async () => {
    const game = await boltAt(3, 6).build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(3);
    expect(takeDamageCount(game, "foe")).toBe(1);
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 3, combat: false, original: 3, source: expect.objectContaining({ cardId: "bolt", kind: "spell", player: P1 }) })]);
    expect(game.state("foe").meta.lastDamage).toMatchObject({ amount: 3, combat: false });
  });

  test("432.1 double on the target: Deal 3 marks 6 (original 3), and 6-Might Foe dies", async () => {
    const game = await boltAt(3, 6, DOUBLE).build();
    await castBolt(game);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 6, original: 3 })]);
    expect(damageEvents(game, "foe")[0]?.modifiedBy.map((m) => m.kind)).toEqual(["double"]);
  });

  test("437.3 prevent-next-2: Deal 3 marks 1 and the shield is spent (437.3.a); a second Deal 3 marks 3 more", async () => {
    const game = await boltAt(3, 9, PREVENT(2)).hand(P1, BOLT(3), "bolt2").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(1);
    expect(game.state("foe").meta.damagePreventionShield).toBeUndefined();
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 1, original: 3 })]);
    await game.p1.cast("bolt2", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
  });

  test("437.1.b.1.b / 437.4 prevent ALL this turn: nothing is dealt — no event, not 'dealt damage this turn', shield stays", async () => {
    const game = await boltAt(3, 2, PREVENT("all")).build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(takeDamageCount(game, "foe")).toBe(0);
    expect(damageEvents(game, "foe")).toEqual([]);
    expect(game.state("foe").meta.dealtDamageThisTurn).not.toBe(true);
    expect(game.state("foe").meta.damagePreventionShield).toBe("all");
  });

  test("437.5.b-style single-instance shield (Counter Strike): the whole packet is prevented once, the next lands", async () => {
    const game = await boltAt(3, 9, PREVENT_NEXT).hand(P1, BOLT(3), "bolt2").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("foe").meta.preventNextDamageInstance).toBe(false);
    await game.p1.cast("bolt2", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
  });

  test("715.1 +1 Bonus Damage on the caster's side: Deal 3 marks 4 (modifiedBy bonus 3→4)", async () => {
    const game = await boltAt(3, 9).unit(P1, "base", FIRESTARTER, "annie").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(4);
    expect(damageEvents(game, "foe")[0]?.modifiedBy).toEqual([expect.objectContaining({ after: 4, before: 3, kind: "bonus" })]);
  });

  test("715.4.a bonus is included BEFORE prevention: Deal 3 +1 bonus into prevent 2 marks 2", async () => {
    const game = await boltAt(3, 9, PREVENT(2)).unit(P1, "base", FIRESTARTER, "annie").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(2);
    expect(damageEvents(game, "foe")[0]?.modifiedBy.map((m) => m.kind)).toEqual(["bonus", "prevent"]);
  });

  test("370.1.b redirect: 'is dealt to me instead' — the Bodyguard takes the 3, the chosen unit takes nothing", async () => {
    const game = await boltAt(3, 2).unit(P2, "bf1", BODYGUARD(7), "guard").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(3);
    expect(damageEvents(game, "guard")).toEqual([expect.objectContaining({ amount: 3, target: "guard" })]);
    expect(damageEvents(game, "guard")[0]?.modifiedBy[0]).toMatchObject({ kind: "redirect", sourceCardId: "guard" });
    expect(damageEvents(game, "foe")).toEqual([]);
  });

  test("370.2 the redirected damage meets the NEW target's own shield (Bodyguard with prevent 2 takes 1)", async () => {
    const game = await boltAt(3, 2).unit(P2, "bf1", BODYGUARD(7), "guard", PREVENT(2)).build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("guard").damage).toBe(1);
  });

  test("465.2.c.10 'I don't take damage': Deal 3 marks nothing, no event", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", UNTOUCHABLE(2), "foe").hand(P1, BOLT(3), "bolt").build();
    await castBolt(game);
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(game, "foe")).toEqual([]);
  });
});

// ===========================================================================
// Ability damage / self-damage / unit fights × modifiers
// ===========================================================================

describe("ability damage, self-damage and unit fights go through the same choke point", () => {
  test("activated 'Deal 3 to a unit' into a doubled unit marks 6 (kind ability)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Foe" }, "foe", DOUBLE)
      .unit(P1, "base", PINGER, "pinger")
      .build();
    await game.p1.activate("pinger", 0, { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(6);
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 6, original: 3, source: expect.objectContaining({ cardId: "pinger", kind: "ability" }) })]);
  });

  test("activated damage into prevent 2 marks 1; +1 bonus rider applies to abilities too (3+1−2 = 2)", async () => {
    const plain = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9 }, "foe", PREVENT(2)).unit(P1, "base", PINGER, "pinger").build();
    await plain.p1.activate("pinger", 0, { targets: "foe" });
    await plain.settle();
    expect(plain.state("foe").damage).toBe(1);
    const bonus = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 9 }, "foe", PREVENT(2)).unit(P1, "base", PINGER, "pinger").unit(P1, "base", FIRESTARTER, "annie").build();
    await bonus.p1.activate("pinger", 0, { targets: "foe" });
    await bonus.settle();
    expect(bonus.state("foe").damage).toBe(2);
  });

  test("self-damage 'Deal 3 to me': plain 3; doubled 6 (kills the 6-Might unit); prevent 2 → 1; prevent all → 0", async () => {
    const run = async (meta?: Record<string, unknown>) => {
      const game = await scenario().unit(P1, "base", FLAGELLANT, "monk", meta).build();
      await game.p1.activate("monk", 0);
      await game.settle();
      return game;
    };
    const plain = await run();
    expect(plain.state("monk").damage).toBe(3);
    expect(damageEvents(plain, "monk")).toEqual([expect.objectContaining({ amount: 3, source: expect.objectContaining({ cardId: "monk", kind: "ability", player: P1 }) })]);
    const doubled = await run(DOUBLE);
    expect(doubled.zoneOf("monk")).toBe("trash");
    const shielded = await run(PREVENT(2));
    expect(shielded.state("monk").damage).toBe(1);
    const immune = await run(PREVENT("all"));
    expect(immune.state("monk").damage).toBe(0);
    expect(damageEvents(immune, "monk")).toEqual([]);
  });

  test("417.6.b.3 fight ('deal damage equal to their Mights to each other'): the doubled enemy takes double, the shielded friend 2 less; the UNITS are the sources; no Bonus Damage (not spell damage)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe", DOUBLE)
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", PREVENT(2))
      .unit(P1, "base", FIRESTARTER, "annie")
      .hand(P1, DUEL, "duel")
      .build();
    await game.p1.cast("duel", { targets: ["ally", "foe"] });
    await game.settle();
    // Ally (2) → Foe doubled = 4 ≥ 3: dies. Foe (3) → Ally prevent 2 = 1 < 2: lives with 1.
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(1);
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 4, original: 2, source: expect.objectContaining({ cardId: "ally", kind: "unit", player: P1 }) })]);
    expect(damageEvents(game, "ally")).toEqual([expect.objectContaining({ amount: 1, original: 3, source: expect.objectContaining({ cardId: "foe", kind: "unit", player: P2 }) })]);
  });
});

// ===========================================================================
// Combat damage × modifiers
// ===========================================================================

describe("combat damage (attacker → defender, defender → attacker) goes through the same choke point", () => {
  test("no modifier: 3 into a 5-Might defender — defender survives (healed), 3-Might attacker dies to 5; one combat event each", async () => {
    const game = await fight(3, 5);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 3, combat: true, original: 3, source: expect.objectContaining({ kind: "combat", player: P1 }) })]);
    expect(damageEvents(game, "atk")).toEqual([expect.objectContaining({ amount: 5, combat: true, source: expect.objectContaining({ kind: "combat", player: P2 }) })]);
  });

  test("432.1 doubled DEFENDER: a 3-Might attacker kills a (stunned) 6-Might defender (3 assigned → 6 dealt) and conquers", async () => {
    const game = await fight(3, 6, { ...DOUBLE, stunned: true });
    expect(game.zoneOf("foe")).toBe("trash");
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 6, combat: true, original: 3 })]);
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("432.1 doubled ATTACKER: a 2-Might defender kills a 4-Might attacker (defender → attacker direction)", async () => {
    const game = await fight(4, 2, undefined, DOUBLE);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(damageEvents(game, "atk")).toEqual([expect.objectContaining({ amount: 4, original: 2 })]);
    // the 2-Might defender still took the attacker's 4 and died too
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("437.5.a prevent 2 on the defender: 5 into a 4-Might defender deals 3 — it survives and the shield is spent; a 6-Might attacker kills it", async () => {
    const weak = await fight(5, 4, PREVENT(2));
    expect(weak.zoneOf("foe")).toBe("battlefield-bf1");
    expect(weak.state("foe").meta.damagePreventionShield).toBeUndefined();
    expect(damageEvents(weak, "foe")).toEqual([expect.objectContaining({ amount: 3, original: 5 })]);
    const strong = await fight(6, 4, PREVENT(2));
    expect(strong.zoneOf("foe")).toBe("trash");
  });

  test("437.5.b prevent ALL on the defender: no attacker can kill it, nothing is dealt, no event; the attacker still takes damage", async () => {
    const game = await fight(9, 2, PREVENT("all"));
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(0);
    expect(damageEvents(game, "foe")).toEqual([]);
    expect(game.zoneOf("atk")).toBe("base"); // recalled: 2 < 9
  });

  test("715 Bonus Damage never applies to combat damage: Firestarter's side still deals exactly its Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .unit(P1, "base", FIRESTARTER, "annie")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 3, original: 3 })]);
    expect(damageEvents(game, "foe")[0]?.modifiedBy).toEqual([]);
  });

  test("370.1.b redirect in combat: damage assigned to the guarded defender is dealt to the Bodyguard instead", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P2, "bf1", BODYGUARD(9), "guard")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle({ policy: (d, g) => (d.kind === "distribute" ? { allocation: { foe: 2 }, kind: "distribute" } : passivePolicy(d, g)) });
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(game, "foe")).toEqual([]);
    expect(damageEvents(game, "guard")).toEqual([expect.objectContaining({ amount: 2, combat: true, target: "guard" })]);
  });

  test("465.2.c.10 an 'I don't take damage' defender is dealt nothing and cannot be killed; it still deals its damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", UNTOUCHABLE(2), "foe")
      .unit(P1, "base", { might: 9, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(game, "foe")).toEqual([]);
    expect(damageEvents(game, "atk")).toEqual([expect.objectContaining({ amount: 2 })]);
  });
});

// ===========================================================================
// Distributed combat damage: the prompt's lethal thresholds are replacement-aware
// ===========================================================================

describe("465.2.c.4.a / 465.2.c.5 — the combat assignment prompt computes lethal through each unit's modifiers", () => {
  async function twoDefenders(d1Meta?: Record<string, unknown>) {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "D1" }, "D1", d1Meta)
      .unit(P2, "bf1", { might: 3, name: "D2" }, "D2")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    const r = await game.settle({ policy: noDistribute });
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("distribute");
    expect(d?.seat).toBe(P1);
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    const lethal = Object.fromEntries(buckets.map((b) => [b.key, b.lethal]));
    return { game, lethal };
  }

  test("no modifier: lethal {D1:2, D2:3}; 3 damage cannot kill both", async () => {
    const { game, lethal } = await twoDefenders();
    expect(lethal).toEqual({ D1: 2, D2: 3 });
    await game.p1.distribute({ D1: 2, D2: 1 });
    await game.settle();
    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("battlefield-bf1");
  });

  test("465.2.c.4.a doubled D1 (2 Might) is lethal at ONE assigned: {D1:1, D2:2} legal and kills D1 (1→2); assigning it 2 is overkill and illegal", async () => {
    const { game, lethal } = await twoDefenders(DOUBLE);
    expect(lethal).toEqual({ D1: 1, D2: 3 });
    expect((await game.p1.try((p) => p.distribute({ D1: 2, D2: 1 }))).ok).toBe(false);
    await game.p1.distribute({ D1: 1, D2: 2 });
    await game.settle();
    expect(game.zoneOf("D1")).toBe("trash");
    expect(damageEvents(game, "D1")).toEqual([expect.objectContaining({ amount: 2, combat: true, original: 1 })]);
    expect(game.zoneOf("D2")).toBe("battlefield-bf1");
  });

  test("437.5.a D1 with prevent 2 needs Might+2 = 4 assigned: {D1:3} is legal (all on one, non-lethal) and deals it 1", async () => {
    const { game, lethal } = await twoDefenders(PREVENT(2));
    expect(lethal).toEqual({ D1: 4, D2: 3 });
    await game.p1.distribute({ D1: 3 });
    await game.settle();
    expect(game.zoneOf("D1")).toBe("battlefield-bf1");
    expect(damageEvents(game, "D1")).toEqual([expect.objectContaining({ amount: 1, original: 3 })]);
  });

  test("437.5.b D1 with prevent ALL can never be made lethal (need = ∞) yet stays assignable; {D2:3} kills D2", async () => {
    const { game, lethal } = await twoDefenders(PREVENT("all"));
    expect(lethal.D2).toBe(3);
    expect(lethal.D1).toBeGreaterThan(1000);
    await game.p1.distribute({ D2: 3 });
    await game.settle();
    expect(game.zoneOf("D2")).toBe("trash");
    expect(game.zoneOf("D1")).toBe("battlefield-bf1");
  });
});

// ===========================================================================
// 372 — Double + Prevent N on the same unit: its controller orders them
// ===========================================================================

describe("372 — Double and Prevent 2 both apply: the damaged unit's CONTROLLER orders them; each order gives its own rules-correct result", () => {
  const BOTH = { ...DOUBLE, ...PREVENT(2) };

  test("spell Deal 3: P2 (Foe's controller, not the caster) gets an RPL 'which applies first' pick naming both effects", async () => {
    const game = await boltAt(3, 9, BOTH).build();
    await game.p1.cast("bolt", { targets: "foe" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(isRpl(d)).toBe(true);
    expect(d?.seat).toBe(P2);
    expect(isRpl(d) ? d.options.map((o) => o.key).sort() : []).toEqual(["double", "prevent-shield"]);
    // nothing has been dealt while the question is open
    expect(game.state("foe").damage).toBe(0);
  });

  test("prevent first: (3 − 2) × 2 = 2", async () => {
    const game = await boltAt(3, 9, BOTH).build();
    await game.p1.cast("bolt", { targets: "foe" });
    await game.settle();
    await game.p2.pick("prevent-shield");
    await game.settle();
    expect(game.state("foe").damage).toBe(2);
    expect(damageEvents(game, "foe")).toEqual([expect.objectContaining({ amount: 2, original: 3 })]);
    expect(damageEvents(game, "foe")[0]?.modifiedBy.map((m) => m.kind)).toEqual(["prevent", "double"]);
    expect(game.gameState.damageReplacementOrder).toBeUndefined();
    expect(game.zoneOf("bolt")).toBe("trash");
  });

  test("double first: 3 × 2 − 2 = 4", async () => {
    const game = await boltAt(3, 9, BOTH).build();
    await game.p1.cast("bolt", { targets: "foe" });
    await game.settle();
    await game.p2.pick("double");
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
    expect(damageEvents(game, "foe")[0]?.modifiedBy.map((m) => m.kind)).toEqual(["double", "prevent"]);
  });

  test("465.2.c.5 combat: the order is asked BEFORE assignment; prevent-first → 3 into a 4-Might defender deals 2 (lives), double-first → deals 4 (dies)", async () => {
    const run = async (first: "prevent-shield" | "double") => {
      const game = await scenario()
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe", BOTH)
        .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
        .build();
      await game.p1.move("atk", "bf1");
      const r = await game.settle();
      expect(r.reason).toBe("unanswered");
      const d = game.decision();
      expect(isRpl(d)).toBe(true);
      expect(d?.seat).toBe(P2);
      expect(game.state("foe").damage).toBe(0);
      await game.p2.pick(first);
      await game.settle();
      return game;
    };
    const preventFirst = await run("prevent-shield");
    expect(preventFirst.zoneOf("foe")).toBe("battlefield-bf1");
    expect(damageEvents(preventFirst, "foe")).toEqual([expect.objectContaining({ amount: 2, combat: true, original: 3 })]);
    const doubleFirst = await run("double");
    expect(doubleFirst.zoneOf("foe")).toBe("trash");
    expect(damageEvents(doubleFirst, "foe")).toEqual([expect.objectContaining({ amount: 4, combat: true, original: 3 })]);
  });

  test("Double + Prevent ALL never asks (the result is 0 either way)", async () => {
    const game = await boltAt(3, 9, { ...DOUBLE, ...PREVENT("all") }).build();
    await castBolt(game);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("foe").damage).toBe(0);
  });
});
