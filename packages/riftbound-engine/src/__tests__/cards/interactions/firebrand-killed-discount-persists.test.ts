/**
 * Interaction: Raging Firebrand (ogn-031-298) · Unit · Fury · 6 + [fury] · 4 Might
 *     "When you play me, the next spell you play this turn costs [5] less."
 *   × Deathgrip (sfd-163-221) · Spell (Reaction) · Order · 2
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this
 *      turn. Draw 1."
 *   × Void Seeker (ogn-024-298) · Spell (Action) · Fury · 3 + [fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   + a second vanilla 3-cost spell ("Test Spark": Deal 1 to a unit).
 *
 * Question: P1's turn with plenty of resources; P1 plays Raging Firebrand to base holding Deathgrip, Void
 * Seeker and another 3-cost spell.
 *   Line A: the play trigger resolves; THEN P1 Deathgrips the Firebrand (it dies); THEN Void Seeker. Does
 *           anything still cost 5 less with the Firebrand in the trash — and which spell gets it?
 *   Line B: with the play trigger still on the chain P1 responds with Deathgrip killing the Firebrand.
 *           (i) does the trigger still resolve with its source dead? (ii) is Deathgrip "the next spell"
 *           (discounted / consuming)? (iii) what do Void Seeker and the spell after it cost?
 *   Line C: P1 plays no spell this turn — does the discount carry into P1's next turn?
 *
 * Rules: 390.4 / 391 (a "next spell you play this turn costs less" is a Delayed Passive Ability applying to
 * exactly one spell), 392 (delayed abilities are not tied to their source staying on the board), 356.4
 * (cost modification applies when the cost is determined at finalization), 419.4.a (a spell is "played"
 * when it finishes being played), 340.1 (LIFO resolution), 383.3 (removing a trigger's source does not
 * counter the pending trigger), 317.2 ("this turn" effects expire in the Expiration Step).
 *
 * Expected: Line A — the discount survives the Firebrand's death (392); Deathgrip is the first spell
 * played after it exists → Deathgrip costs max(2−5,0)=0 and consumes it; Void Seeker then costs its full
 * 3 + [fury]; the spell after that full 3. Line B — Deathgrip is finalized and paid (2, full) BEFORE the
 * trigger resolves, so it neither gets nor consumes the discount; Deathgrip resolves first (Firebrand →
 * trash, another friendly unit +4, draw 1), then the trigger resolves anyway (source gone is irrelevant)
 * and creates the delayed passive; Void Seeker is then the next spell: energy 3−5 → 0 (the [fury] is
 * still due), deals 4 / draws 1; the following 3-cost spell pays full 3. Line C — the effect is "this
 * turn": next turn P1's first spell costs full price.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAGING_FIREBRAND = "ogn-031-298";
const DEATHGRIP = "sfd-163-221";
const VOID_SEEKER = "ogn-024-298";
/** Vanilla second 3-cost spell: "Deal 1 to a unit." */
const TEST_SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  name: "Test Spark",
  rulesText: "Deal 1 to a unit.",
  timing: "action",
};

/**
 * P1's turn. P1: 20 energy + 3 fury in the pool (Firebrand 6+[fury], Deathgrip 2, Void Seeker 3+[fury],
 * Spark 3 — everything affordable at full price so only the AMOUNTS paid reveal the discount), a vanilla
 * 2-Might Ally in base (Deathgrip's "+Might to another friendly unit" recipient), 3 spare fury runes for
 * next turn. P2: a 7-Might Foe at bf1 (Void Seeker / Spark target; survives both).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 20, power: { fury: 3 } })
    .runes(P1, "fury", 3)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 7, name: "Foe" }, "foe")
    .hand(P1, RAGING_FIREBRAND, "firebrand")
    .hand(P1, DEATHGRIP, "deathgrip")
    .hand(P1, VOID_SEEKER, "voidSeeker")
    .hand(P1, TEST_SPARK, "spark");
}

/**
 * Play Raging Firebrand to base. Its play trigger goes on the chain; if the engine (wrongly — see the BUG
 * test) asks a "target" for that trigger, answer it so the line can proceed. Leaves the trigger UNRESOLVED
 * on the chain with P1 holding priority.
 */
async function playFirebrand(game: Game): Promise<void> {
  await game.p1.play("firebrand");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "firebrand") {
    await game.p1.pick(d.options.find((o) => o.card === "ally")?.key ?? d.options[0]!.key);
  }
}

/** Energy + fury P1 spends performing `fn`. */
async function paid(game: Game, fn: () => Promise<unknown>): Promise<{ energy: number; fury: number }> {
  const e = game.p1.energy();
  const f = game.p1.power("fury");
  await fn();
  return { energy: e - game.p1.energy(), fury: f - game.p1.power("fury") };
}

/** Deathgrip's resolution-time "another friendly unit" pick, if asked (Ally is the only candidate). */
async function settleDeathgrip(game: Game): Promise<void> {
  const r = await game.settle();
  if (r.reason === "unanswered" && r.decision?.kind === "pick" && r.decision.seat === P1) {
    await game.p1.pick("ally");
    await game.settle();
  }
}

describe("setup — Raging Firebrand's play trigger", () => {
  test("playing the Firebrand costs 6 + [fury]; it lands in base and its 'When you play me' trigger is put on the chain as P1's item", async () => {
    const game = await board().build();
    const cost = await paid(game, () => playFirebrand(game));
    expect(cost).toEqual({ energy: 6, fury: 1 });
    expect(game.zoneOf("firebrand")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "firebrand", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected: "the next spell you play this turn costs [5] less" names no Game Object — the trigger has no
  // target to choose (355.5), so playing the Firebrand puts the trigger on the chain and hands P1 priority
  // with NO prompt. Actual: the engine first asks P1 to "Choose a target for Raging Firebrand" among the
  // units in P1's base (Ally / the Firebrand itself) before the trigger is finalized.
  test("the play trigger asks for no target — it is a targetless delayed cost reduction, not a choice among units (355.5, 391)", async () => {
    const game = await board().build();
    await game.p1.play("firebrand");
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("Line A — trigger resolves, THEN Deathgrip kills the Firebrand, THEN Void Seeker", () => {
  test("after the trigger resolves, Deathgrip (the first spell played since) is 'the next spell': it costs 0 instead of 2 — even though it is a Reaction and even though it kills the Firebrand", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle(); // trigger resolves → delayed passive exists
    expect(game.chain()).toEqual([]);
    const cost = await paid(game, () => game.p1.cast("deathgrip", { targets: "firebrand" }));
    expect(cost).toEqual({ energy: 0, fury: 0 });
    await settleDeathgrip(game);
    expect(game.zoneOf("firebrand")).toBe("trash");
    expect(game.zoneOf("deathgrip")).toBe("trash");
  });

  test("Deathgrip resolves fully: Firebrand → trash, Ally gets +4 (its Might) this turn → 6, P1 draws 1", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    const hand = game.p1.hand().length; // deathgrip, voidSeeker, spark
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    expect(game.p1.trash().sort()).toEqual(["deathgrip", "firebrand"]);
    expect(game.state("ally")).toMatchObject({ might: 6, mightModifier: 4 });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("the discount was consumed by Deathgrip and does NOT key off the Firebrand being alive: Void Seeker afterwards costs its full 3 + [fury] (391 — exactly one spell)", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    const cost = await paid(game, () => game.p1.cast("voidSeeker", { targets: "foe" }));
    expect(cost).toEqual({ energy: 3, fury: 1 });
    await game.settle();
    expect(game.state("foe")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test("…and the spell after that (Spark, 3) also pays full price; running totals: 20/3 → 14/2 → 14/2 → 11/1 → 8/1", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 14, power: { fury: 2 } });
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    expect(game.p1.resources()).toEqual({ energy: 14, power: { fury: 2 } });
    await game.p1.cast("voidSeeker", { targets: "foe" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 11, power: { fury: 1 } });
    const cost = await paid(game, () => game.p1.cast("spark", { targets: "foe" }));
    expect(cost).toEqual({ energy: 3, fury: 0 });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 8, power: { fury: 1 } });
    expect(game.state("foe").damage).toBe(5);
  });

  test("variant without Deathgrip: trigger resolved, Firebrand alive — Void Seeker is the next spell and costs 0 + [fury]; Spark after it costs 3", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    expect(await paid(game, () => game.p1.cast("voidSeeker", { targets: "foe" }))).toEqual({ energy: 0, fury: 1 });
    await game.settle();
    expect(await paid(game, () => game.p1.cast("spark", { targets: "foe" }))).toEqual({ energy: 3, fury: 0 });
  });
});

describe("Line B — Deathgrip kills the Firebrand IN RESPONSE to its own play trigger", () => {
  test("(ii) Deathgrip is finalized while the trigger is still on the chain — before any discount exists — so it pays its FULL 2 (356.4); chain = [trigger, Deathgrip]", async () => {
    const game = await board().build();
    await playFirebrand(game);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "deathgrip")).toBe(true); // Reaction timing on an open chain
    const cost = await paid(game, () => game.p1.cast("deathgrip", { targets: "firebrand" }));
    expect(cost).toEqual({ energy: 2, fury: 0 });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "firebrand", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "deathgrip", controller: P1, targets: ["firebrand"], triggered: false }),
    ]);
  });

  test("(i) LIFO: Deathgrip resolves first (Firebrand → trash, Ally +4 → 6, draw 1), then the source-less trigger STILL resolves and leaves the chain (383.3, 392)", async () => {
    const game = await board().build();
    await playFirebrand(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("firebrand")).toBe("trash");
    expect(game.zoneOf("deathgrip")).toBe("trash");
    expect(game.state("ally").might).toBe(6);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(iii) the trigger's delayed passive was created with the Firebrand already dead and Deathgrip did not consume it: Void Seeker is 'the next spell' → energy 3 − 5 → 0, the [fury] still due", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    expect(game.p1.resources()).toEqual({ energy: 12, power: { fury: 2 } }); // 20 − 6 − 2, 3 − 1
    const cost = await paid(game, () => game.p1.cast("voidSeeker", { targets: "foe" }));
    expect(cost).toEqual({ energy: 0, fury: 1 });
  });

  test("(iii) Void Seeker still does its full effect at the reduced price — Foe takes 4, P1 draws 1 — and the spell AFTER it (Spark) pays full 3: the delayed passive applied to exactly one spell (391)", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.p1.cast("deathgrip", { targets: "firebrand" });
    await settleDeathgrip(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("voidSeeker", { targets: "foe" });
    await game.settle();
    expect(game.state("foe")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    const cost = await paid(game, () => game.p1.cast("spark", { targets: "foe" }));
    expect(cost).toEqual({ energy: 3, fury: 0 });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 1 } });
    expect(game.p1.trash().sort()).toEqual(["deathgrip", "firebrand", "spark", "voidSeeker"]);
  });
});

describe("Line C — no spell this turn: the discount is 'this turn' only (317.2)", () => {
  test("the trigger resolves, P1 plays no spell and the turn passes; on P1's NEXT turn a 3-cost spell is not free — with only the 2 energy from this turn's runes it cannot even be cast", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0); // pools emptied at end of turn
    // Tap exactly 2 runes: a live discount would make Spark (3 − 5 → 0) castable on 0–2 energy.
    const ready = game.p1.runes({ ready: true });
    expect(ready.length).toBeGreaterThanOrEqual(3);
    await game.p1.tapRune(ready[0]);
    await game.p1.tapRune(ready[1]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "spark")).toBe(false);
  });

  test("…and with a third rune tapped Spark is cast for its FULL 3 energy", async () => {
    const game = await board().build();
    await playFirebrand(game);
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(3);
    expect(game.p1.energy()).toBe(3);
    const cost = await paid(game, () => game.p1.cast("spark", { targets: "foe" }));
    expect(cost.energy).toBe(3);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("foe").damage).toBe(1);
    expect(game.zoneOf("firebrand")).toBe("base"); // still alive — irrelevant to the expired effect either way
  });
});
