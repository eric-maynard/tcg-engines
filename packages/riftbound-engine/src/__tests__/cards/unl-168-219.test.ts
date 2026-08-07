/**
 * Undying Loyalty — unl-168-219 · Spell · Order · 2 energy + [order]
 *
 *   This costs [2] less if you choose a Bird, Cat, Dog, or Poro.
 *   Play a unit with cost no more than [2] and no more than [rainbow] from your trash, ignoring
 *   its cost.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. The trash is PUBLIC, so "a unit … from your trash" is a TARGET chosen as the spell is put on
 *     the chain (355.9.a / 355.10.a) — that is what lets "if you choose a Poro" discount the spell at
 *     cost time (0 energy + [order]); with no eligible unit in your trash it cannot be played (355.8).
 *  2. Eligibility is two independent printed-cost bounds: Energy ≤ 2 AND Power ≤ 1. A 3-cost Poro is
 *     out even though Poros are named; a 1-energy/2-power unit is out; opponents' trash is out.
 *  3. "Ignoring its cost" (356.1.b.1) zeroes the unit's base energy AND power — but optional
 *     additional costs like Accelerate may still be paid for real (356.1.b.3, whose rules example is
 *     literally Legion Rearguard) and then it enters ready.
 *  4. It is a genuine play: normal destinations only (base / a battlefield you control, 813.3.a-style
 *     restriction), enters exhausted (143.4), "When you play me" triggers fire, unit leaves the trash.
 *  5. No [Action]/[Reaction]: own turn, open state only.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game, PickDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-168-219";
const DARING_PORO = "ogn-210-298"; // 2 energy, Poro, [Assault]
const SINISTER_PORO = "unl-137-219"; // 2 energy + 1 power, Poro
const LOYAL_PORO = "unl-156-219"; // 3 energy Poro — over the [2] bound
const SKULKER = "ogn-175-298"; // 3 energy vanilla
const DIPLOMAT = "unl-092-219"; // 2 energy: When you play me, gain 1 XP.
const REARGUARD = "ogn-010-298"; // 2 energy, [Accelerate] ([1][fury] → enter ready)
const PLAIN2 = { cardType: "unit", energyCost: 2, might: 2, name: "Plain Two" } as const;
const ONE_POWER = { cardType: "unit", energyCost: 2, might: 2, name: "One Power", powerCost: ["order"] } as const;
const TWO_POWER = { cardType: "unit", energyCost: 1, might: 2, name: "Two Power", powerCost: ["order", "order"] } as const;

function base(energy = 2, power: Record<string, number> = { order: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, CARD, "ul");
}

/** Does the engine ask for the trash unit as the spell is played (a `targets` field on the cast option)? */
const choosesAtPlay = (game: Game): boolean => game.p1.option("cast", "ul")?.fields.some((f) => f.arg === "targets") ?? false;

/**
 * Cast Undying Loyalty choosing `unit`, resolve it, and put the unit at `dest`.
 * Works whether the unit is chosen at play time (rules) or at resolution (engine today).
 * Returns P1's pool right after costs were paid.
 */
async function loyalty(game: Game, unit: string, dest: "base" | "bf1" = "base") {
  if (choosesAtPlay(game)) {
    await game.p1.cast("ul", { targets: unit });
  } else {
    await game.p1.cast("ul");
  }
  const paid = game.p1.resources();
  await game.settle();
  for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
    const d = game.decision() as PickDecision;
    if (d.semantics === "destination") {
      const key = d.options.find((o) => (dest === "base" ? o.key === "base" : o.key.endsWith("bf1")))?.key as string;
      await game.p1.pick(key);
    } else {
      await game.p1.pick(unit);
    }
    await game.settle();
  }
  return paid;
}

/** The trash units the spell lets P1 choose from (from the play-time targets, else the resolution prompt). */
async function candidates(game: Game): Promise<string[]> {
  const field = game.p1.option("cast", "ul")?.fields.find((f) => f.arg === "targets");
  if (field) {
    return (field.options ?? []).flat().map(String).sort();
  }
  await game.p1.cast("ul");
  await game.settle();
  const d = game.decision() as PickDecision;
  expect(d.kind).toBe("pick");
  return d.options.map((o) => o.card ?? o.key).sort();
}

describe("Undying Loyalty (unl-168-219)", () => {
  test("registry payload — 2 energy + [order]; a play-from-trash effect bounded by Energy ≤ 2 AND Power ≤ 1, ignoring cost, plus the conditional −[2] for Bird/Cat/Dog/Poro", async () => {
    // Expected: both cost bounds and some encoding of the tag-conditional self-discount.
    // Actual: only { energyCost: { lte: 2 } } — the [rainbow] bound and the whole first sentence are dropped.
    await base().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, powerCost: ["order"] });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: { type: string; from?: string; ignoreCost?: boolean } }[];
    const play = abilities.find((a) => a.effect?.type === "play");
    expect(play?.effect).toMatchObject({ from: "trash", ignoreCost: true, type: "play" });
    const json = JSON.stringify(def?.abilities);
    expect(json).toContain('"energyCost":{"lte":2}');
    expect(json).toMatch(/powerCost[^}]*lte[^}]*1/); // "no more than [rainbow]"
    expect(json).toMatch(/Poro/); // "costs [2] less if you choose a Bird, Cat, Dog, or Poro"
  });

  test("plain clause + cost: choosing a non-Poro 2-cost unit pays 2 energy + 1 order; the unit is played from trash to base for free, exhausted; spell → trash", async () => {
    const game = await base().trash(P1, PLAIN2, "plain").build();
    const paid = await loyalty(game, "plain");
    expect(paid).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("plain")).toBe("base");
    expect(game.state("plain")).toMatchObject({ controller: P1, isExhausted: true, might: 2 });
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ul"]);
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable (non-Poro choice) with 1 energy or without the order power", async () => {
    expect((await base(1).trash(P1, PLAIN2, "plain").build()).p1.can("cast", "ul")).toBe(false);
    expect((await base(2, {}).trash(P1, PLAIN2, "plain").build()).p1.can("cast", "ul")).toBe(false);
    expect((await base(2).trash(P1, PLAIN2, "plain").build()).p1.can("cast", "ul")).toBe(true);
  });

  test("'costs [2] less if you choose a … Poro' — choosing Daring Poro (a play-time target, 355.10.a) charges only [order]: energy stays 2, and it is castable even at 0 energy", async () => {
    // Expected: pool after paying = 2 energy / 0 order; a 0-energy hand can still cast it on the Poro.
    // Actual: the choice is deferred to resolution, so the full 2 energy is always charged.
    const game = await base().trash(P1, DARING_PORO, "poro").trash(P1, PLAIN2, "plain").build();
    const paid = await loyalty(game, "poro");
    expect(game.zoneOf("poro")).toBe("base");
    expect(paid).toEqual({ energy: 2, power: { order: 0 } });
    const broke = await base(0).trash(P1, DARING_PORO, "poro").build();
    expect(broke.p1.can("cast", "ul")).toBe(true);
  });

  test("negative side of the discount: with 0 energy and only a NON-Poro unit in the trash it cannot be cast", async () => {
    const game = await base(0).trash(P1, PLAIN2, "plain").build();
    expect(game.p1.can("cast", "ul")).toBe(false);
  });

  test("eligibility: 2-cost units (Poro or not) and a 2-energy/1-power unit are choices; a 3-cost Poro, a 3-cost vanilla, a spell and the OPPONENT's trash Poro are not", async () => {
    const game = await base()
      .trash(P1, DARING_PORO, "poro")
      .trash(P1, PLAIN2, "plain")
      .trash(P1, ONE_POWER, "onepower")
      .trash(P1, SINISTER_PORO, "sinister")
      .trash(P1, LOYAL_PORO, "loyal3")
      .trash(P1, SKULKER, "skulker3")
      .trash(P1, "ogn-004-298", "cleave")
      .trash(P2, DARING_PORO, "theirporo")
      .build();
    expect(await candidates(game)).toEqual(["onepower", "plain", "poro", "sinister"]);
  });

  test("'no more than [rainbow]' — a 1-energy unit with TWO power pips is not an eligible choice", async () => {
    // Expected: only "plain" is offered. Actual: the power bound is not parsed, so "twopower" is offered too.
    const game = await base().trash(P1, PLAIN2, "plain").trash(P1, TWO_POWER, "twopower").build();
    expect(await candidates(game)).toEqual(["plain"]);
  });

  test("with no eligible unit in your trash the spell has no valid target and cannot be played (355.8)", async () => {
    // Expected: not castable (only a 3-cost unit / nothing in trash). Actual: castable, resolves doing nothing.
    const onlyBig = await base().trash(P1, SKULKER, "skulker3").build();
    expect(onlyBig.p1.can("cast", "ul")).toBe(false);
    const empty = await base().build();
    expect(empty.p1.can("cast", "ul")).toBe(false);
  });

  test("'ignoring its cost': a 2-energy + 1-power unit is played with P1 at exactly the spell's cost — nothing beyond 2 + [order] is spent", async () => {
    const game = await base().trash(P1, ONE_POWER, "onepower").build();
    const paid = await loyalty(game, "onepower");
    expect(paid).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("onepower")).toBe("base");
  });

  test("destination: it may be played to a battlefield you CONTROL (bf1) — the enemy bf2 is never offered — and arrives exhausted", async () => {
    const game = await base().trash(P1, PLAIN2, "plain").build();
    if (choosesAtPlay(game)) {
      await game.p1.cast("ul", { targets: "plain" });
    } else {
      await game.p1.cast("ul");
    }
    await game.settle();
    if ((game.decision() as PickDecision).semantics !== "destination") {
      await game.p1.pick("plain");
      await game.settle();
    }
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("plain")).toBe("battlefield-bf1");
    expect(game.state("plain").isExhausted).toBe(true);
    expect(game.p1.units("bf1").sort()).toEqual(["guard", "plain"]);
  });

  test("it is a real play: Demacian Diplomat's 'When you play me, gain 1 XP' fires for P1", async () => {
    const game = await base().trash(P1, DIPLOMAT, "diplo").build();
    expect(game.p1.xp()).toBe(0);
    await loyalty(game, "diplo");
    await game.settle();
    expect(game.zoneOf("diplo")).toBe("base");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("Accelerate may still be paid on a cost-ignored play (356.1.b.3): P1 opts in, really pays [1][fury], and Legion Rearguard enters READY", async () => {
    const game = await base(3, { fury: 1, order: 1 }).trash(P1, REARGUARD, "rear").build();
    game.script(P1, [(d) => (d.kind === "yes-no" ? "yes" : undefined)]); // answer only the Accelerate opt-in
    await loyalty(game, "rear");
    await game.settle();
    expect(game.zoneOf("rear")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.state("rear").isReady).toBe(true);
    // Declining: nothing extra is paid and it enters exhausted like any unit.
    const meek = await base(3, { fury: 1, order: 1 }).trash(P1, REARGUARD, "rear").build();
    meek.script(P1, [(d) => (d.kind === "yes-no" ? "no" : undefined)]);
    await loyalty(meek, "rear");
    await meek.settle();
    expect(meek.zoneOf("rear")).toBe("base");
    expect(meek.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    expect(meek.state("rear").isExhausted).toBe(true);
  });

  test("timing: no [Action]/[Reaction] — not castable with Focus in a showdown nor on the opponent's turn", async () => {
    const game = await base().trash(P1, PLAIN2, "plain").unit(P1, "base", { might: 1, name: "Runner" }, "runner").build();
    await game.p1.move("runner", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ul")).toBe(false);
    const opp = await base().active(P2).trash(P1, PLAIN2, "plain").build();
    expect(opp.p1.can("cast", "ul")).toBe(false);
  });
});
