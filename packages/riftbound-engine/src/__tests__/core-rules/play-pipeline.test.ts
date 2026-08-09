/**
 * Core rules — the ONE play pipeline (`moves/play/play-pipeline.ts`).
 *
 * Every play — from hand, by an effect (from the trash / hand / banishment),
 * a replay by the owner, a play another player is made to perform, a play by
 * permission — runs the same steps (rules 354–359, 419): the card becomes a
 * Pending Item (354.2), the PERFORMER chooses the location (355.2) and whether
 * to pay OPTIONAL additional costs (355.1.a — offered even when the base cost
 * is ignored, 356.1.b.3), MANDATORY additional costs stay required (356.2.a.1),
 * the remaining cost is paid (357), and the permanent enters as a NEW object
 * (124.1) exhausted unless Accelerate / an enter-ready effect applies (143.4),
 * controlled by the performer (191.1); its play triggers fire once (419.4.a) and
 * the play counts for Legion (724). Two pending plays finalize in the order they
 * were appended, before either one's play trigger is finalized (337.1.b).
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline definitions
// ---------------------------------------------------------------------------

const OPTIONAL_DRAW = [
  { effect: { amount: 1, type: "draw" }, optional: true, trigger: { event: "play-self" }, type: "triggered" },
];

/** 2-cost Fury unit with [Accelerate] (1 + [fury]) and "When you play me, you may draw 1". */
const ACCEL = {
  abilities: [{ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" }, ...OPTIONAL_DRAW],
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  keywords: ["Accelerate"],
  might: 2,
  name: "Rearguard-alike (test)",
  powerCost: [],
};

/** 3-cost unit: "As an additional cost to play me, kill a friendly unit." (mandatory — Cruel Patron shape). */
const PATRON = {
  abilities: [
    {
      effect: { additionalCost: { kill: { controller: "friendly", type: "unit" } }, optional: false, type: "additional-cost-option" },
      type: "static",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  keywords: [],
  might: 5,
  name: "Patron-alike (test)",
  powerCost: [],
};

/** Action spell: "Play a unit from your trash, <mode>." */
const raise = (mode: Record<string, unknown>, name: string) => ({
  abilities: [{ effect: { from: "trash", target: { type: "unit" }, type: "play", ...mode }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name,
  powerCost: [],
  timing: "action",
});
const RAISE_FREE = raise({ ignoreCost: true }, "Raise, free (test)");
const RAISE_NO_ENERGY = raise({ ignoreCost: "energy" }, "Raise, no energy (test)");
const RAISE_FULL = raise({}, "Raise, full price (test)");

/** Action spell: "Play a unit from your hand, ignoring its cost." */
const CALL = {
  abilities: [{ effect: { from: "hand", ignoreCost: true, target: { type: "unit" }, type: "play" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Call (test)",
  powerCost: [],
  timing: "action",
};

/** Action spell: "Banish up to two friendly units, then their owner plays them, ignoring their cost." */
const DOUBLE_SHIFT = {
  abilities: [
    {
      effect: {
        effects: [
          { target: { controller: "friendly", quantity: 2, type: "unit" }, type: "banish" },
          { ignoreCost: true, target: { type: "pending-value" }, type: "play" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Double Shift (test)",
  powerCost: [],
  timing: "action",
};

const ARCANE_SHIFT = "sfd-200-221"; // Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 …
const BONE_SKEWER = "unl-139-219"; // opponent reveals hand; you choose a unit; THEY play it to the chosen battlefield, stunned
const FLAME_CHOMPERS = "ogn-006-298"; // When you discard me, you may pay [fury] to play me.

type Pick = Extract<Decision, { kind: "pick" }>;
const keysOf = (d: Decision | null | undefined) => (d?.kind === "pick" ? (d as Pick).options.map((o) => o.key).sort() : []);

// ---------------------------------------------------------------------------
// via: hand — the reference behaviour every other row is compared to
// ---------------------------------------------------------------------------

describe("via hand (reference)", () => {
  test("full cost + elected Accelerate: 2 + 1[fury] paid, enters READY at the chosen battlefield, play trigger asked once, Legion count 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, ACCEL, "u")
      .build();
    await game.p1.play("u", { accelerate: true, to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
    expect(game.state("u").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // its own "you may draw 1", asked once
    await game.p1.no();
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// via: effect, from the trash — cost modes
// ---------------------------------------------------------------------------

describe("via effect from the trash", () => {
  const board = (spell: object, pool: { energy: number; power?: Record<string, number> }) =>
    scenario()
      .resources(P1, { energy: pool.energy, power: pool.power ?? {} })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .trash(P1, ACCEL, "u")
      .hand(P1, spell, "spell");

  test("ignore-all: the CONTROLLER picks the unit, then the location among base / their battlefield (355.2.a); nothing is charged; enters exhausted as a fresh object; trigger fires once; Legion counts spell + unit", async () => {
    const game = await board(RAISE_FREE, { energy: 0 }).build();
    await game.p1.cast("spell");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("u");
    // location prompt to the performer, never the opponent's battlefield
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(keysOf(game.decision())).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may draw 1" — once
    await game.p1.no();
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
  });

  test("ignore-all still OFFERS the optional Accelerate (355.1.a / 356.1.b.3): accepting charges exactly 1 + [fury] and the unit enters READY", async () => {
    const game = await board(RAISE_FREE, { energy: 1, power: { fury: 1 } }).build();
    await game.p1.cast("spell");
    await game.settle();
    await game.p1.pick("u");
    await game.p1.pick("base");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toContain("[1][fury]");
    await game.p1.yes();
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("declining the offered Accelerate: enters exhausted, pool untouched", async () => {
    const game = await board(RAISE_FREE, { energy: 1, power: { fury: 1 } }).build();
    await game.p1.cast("spell");
    await game.settle();
    await game.p1.pick("u");
    await game.p1.pick("base");
    await game.p1.no();
    expect(game.state("u").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("Accelerate is only offered when the performer could pay it on top of what the mode leaves (no fury → no question)", async () => {
    const game = await board(RAISE_FREE, { energy: 5 }).build();
    await game.p1.cast("spell");
    await game.settle();
    await game.p1.pick("u");
    await game.p1.pick("base");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.decision()?.prompt ?? "").not.toContain("[fury]");
  });

  test("ignore-energy: the base 2 Energy is waived, Power would still be owed (356.1.b.2) — a 2-cost no-pip unit is free; full mode charges 2", async () => {
    const noEnergy = await board(RAISE_NO_ENERGY, { energy: 0 }).build();
    await noEnergy.p1.cast("spell");
    await noEnergy.settle();
    await noEnergy.p1.pick("u");
    await noEnergy.p1.pick("base");
    expect(noEnergy.zoneOf("u")).toBe("base");
    expect(noEnergy.p1.energy()).toBe(0);

    const full = await board(RAISE_FULL, { energy: 2 }).build();
    await full.p1.cast("spell");
    await full.settle();
    await full.p1.pick("u");
    await full.p1.pick("base");
    expect(full.zoneOf("u")).toBe("base");
    expect(full.p1.energy()).toBe(0);
  });

  test("full mode with an unaffordable unit: it is not an eligible pick at all (419.2.a / 419.3.c) — the spell resolves doing nothing", async () => {
    const game = await board(RAISE_FULL, { energy: 1 }).build();
    await game.p1.cast("spell");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("u")).toBe("trash");
  });

  test("a MANDATORY additional cost stays required under ignore-all (356.2.a.1): the performer must kill a friendly unit — with none the card is not eligible; with one it dies as the cost", async () => {
    const none = await scenario().resources(P1, { energy: 0 }).trash(P1, PATRON, "p").hand(P1, RAISE_FREE, "spell").build();
    await none.p1.cast("spell");
    await none.settle();
    expect(none.zoneOf("p")).toBe("trash"); // no friendly unit to kill → not playable
    expect(none.decision()?.kind).toBe("action");

    const one = await scenario()
      .resources(P1, { energy: 0 })
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .trash(P1, PATRON, "p")
      .hand(P1, RAISE_FREE, "spell")
      .build();
    await one.p1.cast("spell");
    await one.settle();
    // rule 359.3.e.6 — the trash is public: the pick is compulsory, but the
    // performer still names the card.
    expect(one.decision()).toMatchObject({ allowDecline: false, kind: "pick", min: 1 });
    await one.p1.pick("p");
    await one.settle();
    expect(one.zoneOf("p")).toBe("base");
    expect(one.zoneOf("fodder")).toBe("trash"); // paid as the cost, base cost still ignored
    expect(one.p1.energy()).toBe(0);
  });

  test("two friendly units → the performer CHOOSES which one pays the mandatory cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .unit(P1, "base", { might: 1, name: "Fodder A" }, "a")
      .unit(P1, "base", { might: 1, name: "Fodder B" }, "b")
      .trash(P1, PATRON, "p")
      .hand(P1, RAISE_FREE, "spell")
      .build();
    await game.p1.cast("spell");
    await game.settle();
    await game.p1.pick("p");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(keysOf(game.decision())).toEqual(["a", "b"]);
    await game.p1.pick("b");
    expect(game.zoneOf("p")).toBe("base");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// via: effect, from the hand (private zone)
// ---------------------------------------------------------------------------

describe("via effect from the hand", () => {
  test("private-zone play naming a card type is DECLINABLE (128.6): declining leaves the unit in hand", async () => {
    const game = await scenario().hand(P1, ACCEL, "u").hand(P1, CALL, "call").build();
    await game.p1.cast("call");
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    expect(game.zoneOf("u")).toBe("hand");
    expect(game.decision()?.kind).toBe("action");
  });

  test("accepting: while its dialog runs the card is on the Chain (354.1), then it enters exhausted for free; Accelerate still offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, ACCEL, "u")
      .hand(P1, CALL, "call")
      .build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.pick("u");
    expect(game.zoneOf("u")).toBe("chain"); // pending item, no longer in hand
    expect(game.chain().map((c) => c.cardId)).toEqual(["u"]);
    await game.p1.pick("base");
    await game.p1.yes(); // Accelerate
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});

// ---------------------------------------------------------------------------
// via: replay from banishment (owner-performed, same rules)
// ---------------------------------------------------------------------------

describe("via replay from banishment (Arcane Shift family)", () => {
  test("the OWNER performs the play: a P2-owned unit P1 controls is banished by P1's spell → P2 picks the location, gets it back under P2's control, exhausted, fresh (124.1, 191.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Stolen" }, owner: P2, zone: "base" })
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["stolen", "victim"] });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    expect(keysOf(r.decision)).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p2.pick("base");
    expect(game.state("stolen")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, owner: P2 });
    expect(game.p2.units("base")).toContain("stolen");
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  test("the replay still offers the replayed unit's Accelerate to the performer (owner) although the cost is ignored", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
      .unit(P1, "base", ACCEL, "u", { damage: 1 })
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["u", "victim"] });
    const r = await game.settle();
    // base is P1's only location → straight to the Accelerate question
    expect(r.decision).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isReady: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
  });
});

// ---------------------------------------------------------------------------
// opponent-performed play (Bone Skewer)
// ---------------------------------------------------------------------------

describe("a play another player is made to perform (Bone Skewer)", () => {
  test("P1 chooses the unit, P2 (its owner) PLAYS it: it lands at the chosen battlefield under P2, stunned, exhausted; P2's optional cost question goes to P2; P2's Legion count rises, not P1's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P2, ACCEL, "theirs")
      .hand(P1, BONE_SKEWER, "skewer")
      .build();
    await game.p1.cast("skewer", { targets: "bf1" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("theirs");
    // "ignoring any and all costs" (356.5.a) — the Accelerate DECISION is still P2's (356.4.f.1), free.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1");
    expect(game.state("theirs")).toMatchObject({ controller: P2, isReady: true, isStunned: true, owner: P2 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true); // arrived where P2 controls nothing (190.3.a)
  });
});

// ---------------------------------------------------------------------------
// permission / trigger self-play (Flame Chompers)
// ---------------------------------------------------------------------------

describe("'…pay [fury] to play me' — the trigger's cost is the price, the play itself is free", () => {
  test("discarded Chompers: yes pays exactly [fury] at finalization; the play (from the trash) charges nothing more and lands in base exhausted", async () => {
    const DISCARD_ONE = {
      abilities: [{ effect: { amount: 1, type: "discard" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Pitch (test)",
      powerCost: [],
      timing: "action",
    };
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .hand(P1, FLAME_CHOMPERS, "fc")
      .hand(P1, DISCARD_ONE, "pitch")
      .build();
    await game.p1.cast("pitch");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fc");
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.state("fc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});

// ---------------------------------------------------------------------------
// 337.1.b — two pending plays
// ---------------------------------------------------------------------------

describe("two pending plays finalize in append order, before either play trigger is finalized (337.1.b)", () => {
  test("both units are banished, then: location of A → location of B → only then A's and B's 'you may draw' questions", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", ACCEL, "a")
      .unit(P1, "base", ACCEL, "b")
      .hand(P1, DOUBLE_SHIFT, "ds")
      .build();
    await game.p1.cast("ds", { targets: ["a", "b"] });
    let d = (await game.settle()).decision;
    // first pending play: A's location (P1's base or bf1)
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const first = (d as Pick).source?.cardId as string;
    expect(["a", "b"]).toContain(first);
    const second = first === "a" ? "b" : "a";
    expect(game.zoneOf(second)).toBe("banishment"); // still waiting as a pending item
    await game.p1.pick("base");
    expect(game.zoneOf(first)).toBe("base");
    // second pending play is finalized BEFORE the first unit's play trigger asks anything
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((d as Pick).source?.cardId).toBe(second);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf(second)).toBe("battlefield-bf1");
    // now the two "you may draw 1" play triggers, oldest first
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3); // the spell + two units
  });
});
