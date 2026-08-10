/**
 * Core rules — MULTI-TARGET choices of triggered / activated abilities are made
 * when the item is FINALIZED, bound per slot (`abilities/target-slots.ts`).
 *
 * CARD-INDEPENDENT: every unit / spell below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids):
 *   355.14.a / .b / .d      each recipient of a split is a TARGET, chosen at finalization
 *   355.14.c                the set may not exceed the damage available (Bonus Damage included, 715.3)
 *   355.14.e                the AMOUNTS are decided only at resolution
 *   355.14.f / .g / 417.1.e each still-legal target receives ≥ 1
 *   355.14.h / .h.1         more legal targets than damage ⇒ exactly `damage` of them take 1 each
 *   355.14.i                a surcharge paid for a target that later drops out stays paid
 *   355.13                  "up to N" / "any number": zero is a legal choice; the item still goes on the chain
 *   355.15                  no newcomer is ever offered at resolution
 *   359.3.e.5 / 359.3.e.7   illegal bound targets are dropped, never re-aimed; all illegal ⇒ nothing happens
 *   402.2                   activated abilities finalize the same way
 *   809.1.c / 809.1.d       [Deflect] is charged per chosen object at bind time; unaffordable ⇒ not offered
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Unit · 6 Might · "When I attack, deal 3 damage split among any number of enemy units here." */
const SPLITTER = {
  abilities: [
    {
      effect: { amount: 3, split: true, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 6,
  name: "Filler Splitter",
};

/** Unit · 2 Might · "When you play me, give up to two other friendly units +2 Might this turn." */
const RALLIER = {
  abilities: [
    {
      effect: {
        amount: 2,
        duration: "turn",
        target: { controller: "friendly", excludeSelf: true, quantity: { upTo: 2 }, type: "unit" },
        type: "modify-might",
      },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "body",
  energyCost: 0,
  might: 2,
  name: "Filler Rallier",
};

/** Unit · 2 Might · "When you play me, deal 1 to up to two enemy units." */
const UP_TO_PINGER = {
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", quantity: { upTo: 2 }, type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Up-To Pinger",
};

/** Unit · 2 Might · "When you play me, deal 2 to an enemy unit." (legacy single target) */
const SINGLE_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Single Pinger",
};

/** Gear · "[Exhaust]: Deal 1 to up to two enemy units." (activated) */
const UP_TO_ZAPPER = {
  abilities: [
    {
      cost: { exhaust: true },
      effect: { amount: 1, target: { controller: "enemy", quantity: { upTo: 2 }, type: "unit" }, type: "damage" },
      type: "activated",
    },
  ],
  cardType: "gear",
  domain: "fury",
  energyCost: 0,
  name: "Filler Up-To Zapper",
};

/** [Reaction] Move a friendly unit at a battlefield to base. */
const REACTION_RETREAT = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: "base", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reaction Retreat",
  timing: "reaction",
};

/** [Reaction] Move a friendly unit in base to a battlefield you hold units at? — simpler: to a battlefield. */
const REACTION_ADVANCE = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "base", type: "unit" }, to: "any-battlefield", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reaction Advance",
  timing: "reaction",
};

/** Enemy unit with [Deflect] (value 1). */
const DEFLECTOR = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 1 }],
  cardType: "unit",
  domain: "calm",
  energyCost: 0,
  keywords: ["Deflect"],
  might: 2,
  name: "Filler Deflector",
};

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Raw chain items (the observation view omits finalization bookkeeping). */
function rawChain(game: G): readonly Record<string, unknown>[] {
  return (game.gameState.interaction?.chain?.items ?? []) as unknown as readonly Record<string, unknown>[];
}

/** Splitter attacks bf1 held by P2's `defenders`; returns the game on P1's finalize-time pick. */
async function splitterAttacks(defenders: readonly { alias: string; might: number }[], extra?: (s: ReturnType<typeof scenario>) => ReturnType<typeof scenario>): Promise<G> {
  let s = scenario().battlefield("bf1", { controller: P2 });
  for (const d of defenders) {
    s = s.unit(P2, "bf1", { might: d.might, name: d.alias.toUpperCase() }, d.alias);
  }
  s = s.unit(P1, "base", SPLITTER, "splitter");
  if (extra) {
    s = extra(s);
  }
  const game = await s.build();
  await game.p1.move("splitter", "bf1");
  return game;
}

// ===========================================================================
// A. Split damage (355.14)
// ===========================================================================

describe("355.14.b/c/e: a triggered SPLIT names its target SET at finalization — no amounts — capped by the damage", () => {
  test("the first decision after the attack is a FIN target-set pick over the enemy units here: min 0, max = damage (3 of 4 candidates), no amounts; the bound set rides on the chain item before anyone has Priority", async () => {
    const game = await splitterAttacks([
      { alias: "a", might: 1 },
      { alias: "b", might: 1 },
      { alias: "c", might: 1 },
      { alias: "d", might: 1 },
    ]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", targeting: "split-targets", timing: "FIN" });
    if (d?.kind !== "pick") {
      return;
    }
    expect(d.options.map((o) => o.card).sort()).toEqual(["a", "b", "c", "d"]);
    expect([d.min, d.max]).toEqual([0, 3]);
    expect(game.p2.can("passPriority")).toBe(false);
    expect((await game.p1.try((p) => p.pick("a", "b", "c", "d"))).ok).toBe(false); // 4 > 3 damage (355.14.c)
    await game.p1.pick("a", "b");
    expect(rawChain(game)).toEqual([
      expect.objectContaining({
        cardId: "splitter",
        status: "finalized",
        targetSlots: [expect.objectContaining({ ids: ["a", "b"], max: 3, min: 0, semantics: "split", slot: "" })],
        targets: ["a", "b"],
      }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    for (const u of ["a", "b", "c", "d"]) {
      expect(game.state(u).damage).toBe(0); // 355.14.e — nothing is dealt yet
    }
  });

  test("355.14.e/f/g: at resolution ONE distribute decision divides exactly the pool among the bound targets, each bucket min 1 (max = pool − others' 1); 3/0 and 2/0 are refused, 2/1 lands", async () => {
    const game = await splitterAttacks([
      { alias: "a", might: 5 },
      { alias: "b", might: 5 },
      { alias: "c", might: 5 },
    ]);
    await game.p1.pick("a", "b");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, timing: "RES", total: 3 });
    if (d?.kind !== "distribute") {
      return;
    }
    expect(d.buckets.map((b) => [b.card, b.min, b.max])).toEqual([
      ["a", 1, 2],
      ["b", 1, 2],
    ]);
    expect((await game.p1.try((p) => p.distribute({ a: 3, b: 0 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ a: 2 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ a: 2, b: 1, c: 0 }))).ok).toBe(true);
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(0); // never a target (355.15)
    expect(game.chain()).toEqual([]);
  });

  test("a single bound target takes the whole pool with no distribute prompt; zero chosen ⇒ the item still resolves and deals nothing (355.13)", async () => {
    const one = await splitterAttacks([
      { alias: "a", might: 5 },
      { alias: "b", might: 5 },
    ]);
    await one.p1.pick("a");
    await one.p1.passPriority();
    await one.p2.passPriority();
    expect(one.decision()?.kind).not.toBe("distribute");
    expect(one.state("a").damage).toBe(3);
    expect(one.state("b").damage).toBe(0);

    const none = await splitterAttacks([
      { alias: "a", might: 5 },
      { alias: "b", might: 5 },
    ]);
    await none.p1.decline(); // choose no target at all
    expect(rawChain(none)).toEqual([expect.objectContaining({ cardId: "splitter", status: "finalized", targets: [] })]);
    await none.p1.passPriority();
    await none.p2.passPriority();
    expect(none.chain()).toEqual([]);
    expect(none.state("a").damage + none.state("b").damage).toBe(0);
  });
});

describe("359.3.e.5 / 359.3.e.7 / 355.15: resolution acts on the bound set ∩ still-legal — nobody is added, nothing is re-aimed", () => {
  test("a bound target moved home in response is dropped (not 'here'): the remaining bound target takes everything; a NEWCOMER that arrived here meanwhile is never offered", async () => {
    const game = await splitterAttacks(
      [
        { alias: "a", might: 5 },
        { alias: "b", might: 5 },
      ],
      (s) => s.unit(P2, "base", { might: 5, name: "N" }, "newcomer").hand(P2, REACTION_RETREAT, "retreat").hand(P2, REACTION_ADVANCE, "advance"),
    );
    await game.p1.pick("a", "b");
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // retreat resolves: a → base
    expect(game.locationOf("a")).toBe("base");
    // P2 also brings a newcomer to bf1 before the trigger resolves.
    if (game.p2.can("cast", "advance")) {
      await game.p2.cast("advance", { targets: "newcomer" });
      const dest = game.decision();
      if (dest?.kind === "pick" && dest.semantics === "destination") {
        await game.p2.pick(dest.options.find((o) => String(o.key).includes("bf1"))?.key ?? dest.options[0]!.key);
      }
      while (game.decision()?.kind === "action" && game.decision()?.context === "chain" && game.chain().length > 1) {
        await game.acting().passPriority();
      }
    }
    // Resolve the splitter's trigger.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.decision()?.kind).not.toBe("distribute"); // one legal recipient left → no division to make
    expect(game.state("b").damage).toBe(3);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("newcomer").damage).toBe(0);
  });

  test("ALL bound targets gone ⇒ the instruction does nothing: no prompt, no damage to the units still here (359.3.e.7)", async () => {
    const game = await splitterAttacks(
      [
        { alias: "a", might: 5 },
        { alias: "b", might: 5 },
      ],
      (s) => s.hand(P2, REACTION_RETREAT, "retreat"),
    );
    await game.p1.pick("a"); // only A
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // retreat resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0); // never chosen, never hit
  });

  test("355.14.h: more legal targets than damage at resolution (the pool shrank) ⇒ exactly `damage` of them take 1 each, chosen by the controller; fewer is refused", async () => {
    // "When I attack, deal damage equal to my Might split among any number of enemy units here" — Might drops in response.
    const MIGHT_SPLITTER = {
      abilities: [
        {
          effect: { amount: { might: "self" }, split: true, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
          trigger: { event: "attack", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      domain: "fury",
      energyCost: 0,
      might: 3,
      name: "Filler Might Splitter",
    };
    const WEAKEN = {
      abilities: [
        {
          effect: { amount: -2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
          timing: "reaction",
          type: "spell",
        },
      ],
      cardType: "spell",
      domain: "calm",
      energyCost: 0,
      keywords: ["Reaction"],
      name: "Filler Weaken",
      timing: "reaction",
    };
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "A" }, "a")
      .unit(P2, "bf1", { might: 5, name: "B" }, "b")
      .unit(P2, "bf1", { might: 5, name: "C" }, "c")
      .unit(P1, "base", MIGHT_SPLITTER, "ms")
      .hand(P2, WEAKEN, "weaken")
      .build();
    await game.p1.move("ms", "bf1");
    const fin = game.decision();
    expect(fin).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(fin?.kind === "pick" ? fin.max : -1).toBe(3);
    await game.p1.pick("a", "b", "c");
    await game.p1.passPriority();
    await game.p2.cast("weaken", { targets: "ms" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // weaken resolves: Might 3 → 1
    expect(game.state("ms").might).toBe(1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves with 1 damage and 3 legal targets
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 1 });
    if (d?.kind !== "distribute") {
      return;
    }
    expect(d.buckets.map((b) => [b.card, b.min, b.max])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
      ["c", 0, 1],
    ]);
    expect((await game.p1.try((p) => p.distribute({}))).ok).toBe(false); // may not drop more than needed (355.14.h.1)
    await game.p1.distribute({ b: 1 });
    expect(game.state("b").damage).toBe(1);
    expect(game.state("a").damage + game.state("c").damage).toBe(0);
  });
});

describe("809.1.c/d + 355.14.i: [Deflect] is priced per chosen object at bind time, filtered by what the controller can pay, and never refunded", () => {
  test("each Deflect option shows its surcharge; a set costing more than the pool is refused; the accepted set is charged at once and stays paid after that target leaves", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEFLECTOR, "d1")
      .unit(P2, "bf1", DEFLECTOR, "d2")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .unit(P1, "base", SPLITTER, "splitter")
      .hand(P2, REACTION_RETREAT, "retreat")
      .build();
    await game.p1.move("splitter", "bf1");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    if (d?.kind !== "pick") {
      return;
    }
    expect(d.options.map((o) => [o.card, o.deflect ?? 0]).sort()).toEqual([
      ["d1", 1],
      ["d2", 1],
      ["plain", 0],
    ]);
    expect((await game.p1.try((p) => p.pick("d1", "d2"))).ok).toBe(false); // 2 > 1 pooled power
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.pick("d1", "plain");
    expect(game.p1.power("fury")).toBe(0);
    expect(rawChain(game)[0]?.targets).toEqual(["d1", "plain"]);
    // d1 leaves in response — the surcharge is not refunded (355.14.i) and plain takes the whole 3.
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "d1" });
    await game.settle();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("d1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("plain")).toBe("trash"); // 3 ≥ 2
    expect(game.state("d2").damage).toBe(0);
  });

  test("with NO spare power the Deflect units are simply not offered (809.1.d) — only the plain unit is", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEFLECTOR, "d1")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .unit(P1, "base", SPLITTER, "splitter")
      .build();
    await game.p1.move("splitter", "bf1");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["plain"]);
  });
});

// ===========================================================================
// B. "up to N" / "any number" (355.13)
// ===========================================================================

describe("355.13 / 402.2: an 'up to N' set of a TRIGGERED ability is one FIN pick (min 0, max N); resolution uses the bound objects only", () => {
  test("play trigger 'give up to two other friendly units +2': FIN pick over the other friendly units (min 0, max 2, targeting up-to); the picks ride on the item and are pumped on resolution — an unpicked unit is not", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 1, name: "X" }, "x")
      .unit(P1, "base", { might: 1, name: "Y" }, "y")
      .unit(P1, "base", { might: 1, name: "Z" }, "z")
      .hand(P1, RALLIER, "r")
      .build();
    await game.p1.play("r");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 2, min: 0, seat: P1, targeting: "up-to", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["x", "y", "z"]); // "other": not the Rallier
    expect((await game.p1.try((p) => p.pick("x", "y", "z"))).ok).toBe(false); // 3 > 2
    await game.p1.pick("x", "z");
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "r", status: "finalized", targets: ["x", "z"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("x").might).toBe(1); // nothing yet
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no re-prompt at resolution
    expect([game.state("x").might, game.state("y").might, game.state("z").might]).toEqual([3, 1, 3]);
  });

  test("choosing ZERO is legal: the item is still finalized and resolves (doing nothing to anyone); no candidate at all ⇒ bound empty without asking", async () => {
    const zero = await scenario()
      .unit(P1, "base", { might: 1, name: "X" }, "x")
      .hand(P1, RALLIER, "r")
      .build();
    await zero.p1.play("r");
    expect(zero.decision()).toMatchObject({ kind: "pick", min: 0, seat: P1, timing: "FIN" });
    await zero.p1.decline();
    expect(rawChain(zero)).toEqual([expect.objectContaining({ cardId: "r", status: "finalized", targets: [] })]);
    await zero.settle();
    expect(zero.state("x").might).toBe(1);
    expect(zero.chain()).toEqual([]);

    const empty = await scenario().hand(P1, RALLIER, "r").build();
    await empty.p1.play("r");
    expect(empty.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority
    expect(rawChain(empty)).toEqual([expect.objectContaining({ cardId: "r", status: "finalized", targets: [] })]);
    await empty.settle();
    expect(empty.chain()).toEqual([]);
  });

  test("bound-only at resolution: an 'up to two enemy units' pick whose first pick was moved out of reach? — retreat one bound unit to base: it is still 'an enemy unit' (no location clause) so both are hit; but a bound unit BOUNCED to hand is dropped and no bystander is substituted", async () => {
    const REACTION_BOUNCE = {
      abilities: [{ effect: { target: { location: "battlefield", type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "calm",
      energyCost: 0,
      keywords: ["Reaction"],
      name: "Filler Reaction Bounce",
      timing: "reaction",
    };
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "A" }, "a")
      .unit(P2, "bf1", { might: 3, name: "B" }, "b")
      .unit(P2, "bf1", { might: 3, name: "C" }, "c")
      .hand(P1, UP_TO_PINGER, "p")
      .hand(P2, REACTION_BOUNCE, "bounce")
      .build();
    await game.p1.play("p");
    await game.p1.pick("a", "b");
    await game.p1.passPriority();
    await game.p2.cast("bounce", { targets: "a" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(0); // never substituted (355.15)
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Deflect per pick on an up-to set: the taxed unit shows +1, picking it charges 1 at bind; with 0 power it is not offered at all", async () => {
    const rich = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .unit(P2, "base", DEFLECTOR, "d")
      .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
      .hand(P1, UP_TO_PINGER, "p")
      .build();
    await rich.p1.play("p");
    const d = rich.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => [o.card, o.deflect ?? 0]).sort() : []).toEqual([
      ["d", 1],
      ["plain", 0],
    ]);
    await rich.p1.pick("d", "plain");
    expect(rich.p1.power("fury")).toBe(0);
    await rich.settle();
    expect(rich.state("d").damage).toBe(1);
    expect(rich.state("plain").damage).toBe(1);

    const poor = await scenario()
      .unit(P2, "base", DEFLECTOR, "d")
      .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
      .hand(P1, UP_TO_PINGER, "p")
      .build();
    await poor.p1.play("p");
    const pd = poor.decision();
    expect(pd?.kind === "pick" ? pd.options.map((o) => o.card) : []).toEqual(["plain"]);
  });
});

describe("402.2: an ACTIVATED ability with an 'up to N' set finalizes the same way", () => {
  test("activating '[Exhaust]: deal 1 to up to two enemy units' asks the FIN set pick before anyone has Priority; the picks are bound on the item and hit on resolution", async () => {
    const game = await scenario()
      .unit(P2, "base", { might: 3, name: "A" }, "a")
      .unit(P2, "base", { might: 3, name: "B" }, "b")
      .unit(P2, "base", { might: 3, name: "C" }, "c")
      .gear(P1, UP_TO_ZAPPER, "zap")
      .build();
    await game.p1.activate("zap", 0);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 2, min: 0, seat: P1, targeting: "up-to", timing: "FIN" });
    expect(game.p2.can("passPriority")).toBe(false);
    await game.p1.pick("a", "c");
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "zap", status: "finalized", targets: ["a", "c"], type: "ability" })]);
    await game.settle();
    expect([game.state("a").damage, game.state("b").damage, game.state("c").damage]).toEqual([1, 0, 1]);
    expect(game.chain()).toEqual([]);
  });
});

// ===========================================================================
// C. Legacy single target unchanged
// ===========================================================================

describe("legacy: a SINGLE caster-chosen target still binds positionally with no target slots", () => {
  test("'deal 2 to an enemy unit' → FIN single pick, item.targets = [pick], no targetSlots entry, damage on resolution", async () => {
    const game = await scenario()
      .unit(P2, "base", { might: 3, name: "A" }, "a")
      .unit(P2, "base", { might: 3, name: "B" }, "b")
      .hand(P1, SINGLE_PINGER, "s")
      .build();
    await game.p1.play("s");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.targeting : "x").toBeUndefined();
    await game.p1.pick("b");
    const item = rawChain(game)[0];
    expect(item).toMatchObject({ cardId: "s", status: "finalized", targets: ["b"] });
    expect(item?.targetSlots).toBeUndefined();
    await game.settle();
    expect(game.state("b").damage).toBe(2);
    expect(game.state("a").damage).toBe(0);
  });
});
