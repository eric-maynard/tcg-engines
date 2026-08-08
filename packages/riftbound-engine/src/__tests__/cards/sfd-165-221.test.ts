/**
 * Glasc Mixologist — sfd-165-221 · Unit · Order · 5 energy + [order] · 5 Might
 *
 *   [Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow]
 *   from your trash, ignoring its cost. (When I die, get the effect.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - Eligibility uses PRINTED cost (206): Energy ≤ 3 AND at most one Power pip; only UNIT cards
 *    in YOUR trash; Glasc himself (5) is never eligible even though he is in the trash by then.
 *  - riftboundfaq "same-event-target": targets are chosen after every unit that died in the same
 *    event is already in the trash (808.1.d.2, 323.4/323.5) — an ally that died beside him in
 *    combat can be replayed immediately.
 *  - riftboundfaq "play-to-same-battlefield": killed outside a showdown, the chain keeps the turn
 *    Closed so the now-empty battlefield is still yours (309.1, 323.6) → a legal destination.
 *  - riftboundfaq "deathknell-combat-result": lone defender dies, unit replayed there → attackers
 *    were already healed (466.1.a.1), original combat is "No Result", a fresh combat follows.
 *  - "ignoring its cost" waives base Energy AND Power (356.1.b) but an optional Accelerate cost may
 *    still be paid on top (356.1.b.3 — Legion Rearguard is the CR's own example) → enters ready.
 *  - The replayed unit is PLAYED: its own play effects fire (Cemetery Attendant can fetch Glasc back).
 *  - Bounce is not death (808.1.d): no trigger. Kill effects and combat deaths both count.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-165-221";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.
const VENGEANCE = "ogn-229-298"; // 4 energy + [order][order]: Kill a unit.
const RETREAT = "ogn-104-298"; // 1 energy [Reaction]: Return a friendly unit to its owner's hand. …
const SKULKER = "ogn-175-298"; // 3 energy, no power, 3 Might — eligible
const FAE = "ogn-097-298"; // 2 energy + 1 mind — eligible (exactly one pip)
const SERGEANT = "ogn-219-298"; // 4 energy — too expensive
const KRAKEN = "ogn-150-298"; // 3 energy + 2 body — too many pips
const CLEAVE = "ogn-004-298"; // a spell — not a unit
const REARGUARD = "ogn-010-298"; // 2 energy Fury unit with [Accelerate]
const ATTENDANT = "ogn-165-298"; // 3 energy + [chaos]: When you play me, return a unit from your trash to your hand.

/** P2's turn; Glasc sits at P1's battlefield; P2 holds Final Spark; P1's trash has a spread of candidates. */
function sparkBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "gm")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, FAE, "fae")
    .trash(P1, SERGEANT, "sarge")
    .trash(P1, KRAKEN, "kraken")
    .trash(P1, CLEAVE, "cleave")
    .trash(P2, SKULKER, "theirSkulker")
    .hand(P2, FINAL_SPARK, "spark");
}

/**
 * Cast Final Spark at Glasc and let it resolve (both pass); stops at the Deathknell's
 * FINALIZATION prompt — rule 402.1: the leading "You may" is answered before Priority.
 */
async function sparkGlasc(game: Game): Promise<void> {
  await game.p2.cast("spark", { targets: "gm" });
  await game.settle();
}

describe("Glasc Mixologist (sfd-165-221)", () => {
  test("cost & body: 5 energy + [order] deducted; a 5-Might unit with the Deathknell keyword; 4 energy or no order power is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "gm").build();
    await game.p1.play("gm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("gm")).toBe("base");
    expect(game.state("gm")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("gm").keywords).toContain("Deathknell");
    expect(game.chain()).toHaveLength(0); // no play effect
    expect((await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "gm").build()).p1.can("play", "gm")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "gm").build()).p1.can("play", "gm")).toBe(false);
  });

  test("dies to spell damage → exactly ONE Deathknell item (P1's) goes on the chain after he reaches the trash; the offer lists only YOUR trash units with Energy ≤ 3 and ≤ 1 Power pip", async () => {
    const game = await sparkBoard().build();
    await game.p2.cast("spark", { targets: "gm" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Final Spark resolves: 8 damage kills Glasc
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gm", controller: P1, triggered: true })]);
    // rule 402.1 — the "You may" is answered while the item is Pending, before anyone gets Priority.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["fae", "skulker"]); // not sarge (4), kraken (2 pips), cleave (spell), theirSkulker, nor gm himself (5)
  });

  test("choosing a unit PLAYS it for free: it enters the chosen location exhausted, nothing is paid, Glasc stays in the trash", async () => {
    const game = await sparkBoard().resources(P1, { energy: 3, power: { mind: 1 } }).build();
    await sparkGlasc(game);
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("fae");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // destination
    await game.p1.answer("base");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } }); // "ignoring its cost": energy AND power kept
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("ruling (play-to-same-battlefield): killed outside a showdown, the empty battlefield is still yours while the chain is closed — it is offered and the unit lands there", async () => {
    const game = await sparkBoard().build();
    await sparkGlasc(game);
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("skulker");
    const dest = game.decision();
    expect(dest?.kind === "pick" && dest.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.answer("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'You may': declining the offer leaves every card in the trash and hands the turn back to P2", async () => {
    const game = await sparkBoard().build();
    await sparkGlasc(game);
    // rule 402.1 / 383.3.a.2 — declining at FINALIZATION removes the item; it never resolves.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    for (const c of ["gm", "skulker", "fae", "sarge", "kraken", "cleave"]) {
      expect(game.zoneOf(c)).toBe("trash");
    }
    expect(game.p1.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("no eligible unit in your trash (only a 4-cost, a 2-pip unit and a spell) → the opt-in is still offered (419.3.c) and accepting changes nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gm")
      .trash(P1, SERGEANT, "sarge")
      .trash(P1, KRAKEN, "kraken")
      .trash(P1, CLEAVE, "cleave")
      .trash(P2, SKULKER, "theirSkulker")
      .hand(P2, FINAL_SPARK, "spark")
      .build();
    await sparkGlasc(game);
    // rule 419.3.c — the candidates sit in a private zone, so the "You may" is asked at
    // finalization regardless; accepting simply finds nothing to play.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.zoneOf("theirSkulker")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
  });

  test("a KILL effect (Vengeance) is a death too: Deathknell offers the replay", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", CARD, "gm")
      .trash(P1, SKULKER, "skulker")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.cast("veng", { targets: "gm" });
    await game.settle();
    expect(game.zoneOf("gm")).toBe("trash");
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("skulker");
    if (game.decision()?.kind === "pick") {
      await game.p1.answer("base");
    }
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
  });

  test("bounce is not death (808.1.d): returning Glasc to hand with Retreat triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "gm")
      .trash(P1, SKULKER, "skulker")
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p1.cast("retreat", { targets: "gm" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("gm")).toBe("hand");
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling (same-event-target): Glasc and a 3-cost ally die together in combat → that ally is already in the trash and can be replayed to base, exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gm")
      .unit(P1, "bf1", SKULKER, "skulker")
      .unit(P2, "base", { might: 9, name: "Giant" }, "giant")
      .build();
    await game.p2.move("giant", "bf1"); // 9 vs 5+3: both defenders die, Giant survives
    await game.settle();
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.card ?? o.key)).toEqual(["skulker"]);
    await game.p1.pick("skulker");
    await game.p1.answer("base");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.state("skulker").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the Giant conquered
    expect(game.p2.points()).toBe(1);
  });

  test("ruling (deathknell-combat-result): lone defender Glasc dies to a 6-Might attacker, Skulker is replayed THERE → the healed attacker wins the follow-up combat, Skulker dies, P2 conquers exactly once", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gm")
      .trash(P1, SKULKER, "skulker")
      .unit(P2, "base", { might: 6, name: "Giant" }, "giant")
      .build();
    await game.p2.move("giant", "bf1"); // 6 vs 5: Glasc dies, Giant takes 5
    await game.settle();
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.state("giant").damage).toBe(0); // 466.1.a.1: healed before the trigger resolves
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("skulker");
    const dest = game.decision();
    expect(dest?.kind === "pick" && dest.options.map((o) => o.key)).toContain("battlefield-bf1");
    await game.p1.answer("battlefield-bf1");
    await game.settle(); // fresh combat: Giant 6 vs Skulker 3
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.locationOf("giant")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    // Had the Giant NOT been healed first (5 marked + 3) it would have died instead.
  });

  test("356.1.b.3: replaying Legion Rearguard 'ignoring its cost' still lets you pay its optional Accelerate [1][fury] → it enters READY and only that is spent", async () => {
    const game = await sparkBoard().resources(P1, { energy: 1, power: { fury: 1 } }).trash(P1, REARGUARD, "rg").build();
    await sparkGlasc(game);
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("rg");
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (!d || d.seat !== P1 || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes(); // pay Accelerate
      } else if (d.kind === "pick") {
        await game.p1.answer("base");
      }
    }
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("rg").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("the replayed unit is PLAYED: Cemetery Attendant's own play effect fires and can return Glasc from the trash to hand", async () => {
    const game = await sparkBoard().trash(P1, ATTENDANT, "ca").build();
    await sparkGlasc(game);
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("ca");
    await game.p1.answer("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ca", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("gm");
      await game.settle();
    }
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // Attendant's [3][chaos] was ignored
    expect(game.zoneOf("gm")).toBe("hand");
    expect(game.p1.hand()).toEqual(["gm"]);
  });

  test("323.6 — if the replayed unit goes to base instead, the empty battlefield where Glasc died becomes uncontrolled once the turn is Open again", async () => {
    const game = await sparkBoard().build();
    await sparkGlasc(game);
    await game.p1.yes();
    await game.settle(); // rule 337.4 — the finalized item still waits for the Priority window
    await game.p1.pick("skulker");
    await game.p1.answer("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("'You may …' as the first words makes the perform/decline choice part of FINALIZING the trigger (383.3.a, 402.1) — P1 should be asked before anyone gets priority; the engine opens the priority window first and asks only at resolution", async () => {
    // Expected: right after Glasc hits the trash the first decision is P1's opt-in (yes/no or a
    // declinable pick), and only then does the chain open for responses. Actual: the first decision
    // is P1's chain priority ("respond … or pass"); the offer appears after both players pass.
    const game = await sparkBoard().build();
    await game.p2.cast("spark", { targets: "gm" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Spark resolves, Deathknell pending
    expect(game.zoneOf("gm")).toBe("trash");
    const first = game.decision();
    expect(first?.seat).toBe(P1);
    expect(first?.kind === "yes-no" || first?.kind === "pick").toBe(true);
  });

  test("registry payload matches the printed text: a Deathknell (die/self) trigger that plays a unit from YOUR trash with Energy ≤ 3 and ≤ 1 pip, ignoring cost", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, might: 5, powerCost: ["order"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    const playFromTrash = {
      from: "trash",
      ignoreCost: true,
      target: { controller: "friendly", filter: [{ energyCost: { lte: 3 } }, { powerCost: { lte: 1 } }], type: "unit" },
      type: "play",
    };
    expect(abilities).toContainEqual(expect.objectContaining({ keyword: "Deathknell", type: "keyword" }));
    expect(abilities).toContainEqual(expect.objectContaining({ effect: playFromTrash, trigger: { event: "die", on: "self" }, type: "triggered" }));
    // Exactly one TRIGGERED ability — the keyword entry must not become a second trigger (808.2 counts printed instances).
    expect(abilities.filter((a) => a.type === "triggered")).toHaveLength(1);
  });
});
