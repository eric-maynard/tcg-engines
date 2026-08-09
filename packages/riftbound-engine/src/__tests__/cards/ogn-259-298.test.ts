/**
 * Unforgiven — ogn-259-298 · Legend (Yasuo) · Calm/Chaos
 *
 *   [2], [Exhaust]: Move a friendly unit to or from its base.
 *
 * Rules: 174.8 / 377 (legend activated ability, uses the chain), 381 + 316.5.b (only on your turn,
 * only in an Open state — no showdown, no pending chain), 402.2 (target + destination are choices
 * made while activating), 402.3 (no friendly unit ⇒ not legal to activate), 414 (Exhaust cost —
 * an exhausted legend cannot pay it; it readies in your next Awaken step), 420 / 446 (a move by an
 * effect is still a Move: it is not a Standard Move, so the unit is NOT exhausted and MAY already
 * be exhausted; arriving at an enemy battlefield contests it and combat follows at the cleanup),
 * errata "to or from ITS BASE": base → any battlefield, battlefield → base only.
 *
 * Head-judge corner cases covered here:
 *   1. battlefield → ANOTHER battlefield must never be offered (the errata'd "its base" wording).
 *   2. an EXHAUSTED unit is a legal mover both ways (the exhaust is the legend's, not the unit's),
 *      and the moved unit's ready/exhausted state is untouched.
 *   3. base → enemy-occupied battlefield: the unit becomes the attacker and a real combat resolves;
 *      base → empty enemy-controlled battlefield: conquers for a point.
 *   4. timing negatives: opponent's turn, open chain (Closed state), showdown, 1 energy, exhausted
 *      legend, no friendly unit, enemy unit as target.
 *   5. the Exhaust makes it once-per-turn in practice, and the legend readies next turn.
 *   6. Yasuo, Windrider synergy: the legend's move is his 2nd move of the turn (counts as a move).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "ogn-259-298";
const WINDRIDER = "ogn-205-298"; // Yasuo, Windrider · 4 might · [Ganking] · the third time I move in a turn, you score 1
const PERFECT_EXECUTION = "ven-012-166"; // 3 + [fury]: Ready a unit and give it [Assault 3] this turn
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1: Unforgiven + 3 energy; Ally (2) ready in base; Out (3) EXHAUSTED at bf1 (P1's); Foe (1) alone at bf2 (P2's). */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .legend(P1, CARD, "lg")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "bf1", { might: 3, name: "Out" }, "out", { exhausted: true })
    .unit(P2, "bf2", { might: 1, name: "Foe" }, "foe");
}

describe("Unforgiven (ogn-259-298)", () => {
  test("parsed ability: ONE activated ability, cost {2 energy + exhaust}, effect = move a FRIENDLY unit with a chosen destination", async () => {
    await board().build();
    const abilities = getGlobalCardRegistry().getAbilities("lg") ?? [];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      cost: { energy: 2, exhaust: true },
      effect: { target: { controller: "friendly", type: "unit" }, type: "move" },
      type: "activated",
    });
  });

  test("cost: pays 2 energy and exhausts the legend; the ability goes on the chain naming its target; only FRIENDLY units are offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("activate", "lg")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["out"]]));
    expect(targets).toHaveLength(2); // foe is not a legal target
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("lg").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lg", controller: P1, targets: ["ally"], triggered: false })]);
    expect(game.zoneOf("ally")).toBe("base"); // nothing moves before resolution
  });

  test("base → your own battlefield: the unit moves on resolution, is NOT exhausted by it, and no combat/point follows", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("base → enemy-occupied battlefield: Ally (2) attacks Foe (1), wins the combat and conquers bf2 for a point", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf2"], targets: "ally" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("base → EMPTY enemy-controlled battlefield conquers it without a fight", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "lg")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { exhausted: true }) // exhausted movers are fine
      .build();
    await game.p1.activate("lg", 0, { targets: "ally" }); // single destination ⇒ nothing to ask
    await game.settle(); // resolves the move; the cleanup opens the (non-combat) showdown and hands it back once
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").isExhausted).toBe(true); // state untouched by the move
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    await game.settle(); // both pass focus → conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("battlefield → base: an exhausted unit at bf1 is returned to base (still exhausted); bf1 control is lost once empty", async () => {
    const game = await board().build();
    await game.p1.activate("lg", 0, { answers: ["base"], targets: "out" });
    await game.settle();
    expect(game.zoneOf("out")).toBe("base");
    expect(game.state("out").isExhausted).toBe(true);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("'to or from ITS BASE' — a unit at a battlefield may only be sent to base, never to another battlefield (errata; 144.4-style legality does not apply to bf→bf here)", async () => {
    // Expected: choosing Out (at bf1) offers exactly one destination — base — so either no prompt at all
    // or a prompt without battlefield-bf2. Actual: the destination prompt lists base AND battlefield-bf2.
    const game = await board().build();
    await game.p1.activate("lg", 0, { targets: "out" });
    const d = game.decision();
    if (d?.kind === "pick" && (d as PickDecision).semantics === "destination") {
      expect((d as PickDecision).options.map((o) => o.key)).toEqual(["base"]);
      await game.p1.pick("base");
    }
    await game.settle();
    expect(game.zoneOf("out")).toBe("base");
  });

  test("not legal: on the opponent's turn, with 1 energy, with the legend already exhausted, or with no friendly unit (402.3)", async () => {
    expect((await board().active(P2).build()).p1.can("activate", "lg")).toBe(false);
    expect((await board().resources(P1, { energy: 1 }).build()).p1.can("activate", "lg")).toBe(false);
    const tired = await scenario()
      .resources(P1, { energy: 3 })
      .card("lg", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .build();
    expect(tired.p1.can("activate", "lg")).toBe(false);
    const lonely = await scenario().resources(P1, { energy: 3 }).legend(P1, CARD, "lg").battlefield("bf1", { controller: P1 }).unit(P2, "base", { might: 2 }, "foe").build();
    expect(lonely.p1.can("activate", "lg")).toBe(false);
    const r = await (await board().build()).p1.try((p) => p.activate("lg", 0, { targets: "foe" }));
    expect(r.ok).toBe(false);
  });

  test("Open state only (381): not while a chain is pending, not during a showdown — legal again once back in Neutral Open", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, CARD, "lg")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "wall" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activate", "lg")).toBe(false); // Closed state
    await game.settle();
    expect(game.p1.can("activate", "lg")).toBe(true); // Neutral Open again (2 energy left)
    await game.p1.move("ally", "bf1"); // showdown opens, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("activate", "lg")).toBe(false);
  });

  test("[Exhaust] makes it once per turn: after resolving, 2 more energy does not re-enable it; next turn the legend readies and it is legal again", async () => {
    const game = await board().resources(P1, { energy: 4 }).build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "ally" });
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("activate", "lg")).toBe(false);
    await game.advanceToTurnOf(P2);
    expect(game.state("lg").isExhausted).toBe(true); // still exhausted through the opponent's turn
    await game.advanceToTurnOf(P1);
    expect(game.state("lg").isExhausted).toBe(false);
    await game.p1.tapRunes(2);
    expect(game.p1.can("activate", "lg")).toBe(true);
  });

  test("Yasuo, Windrider synergy: the legend's move COUNTS as a move — base→bf1 (Unforgiven, 1st), bf1→bf2 (Ganking, 2nd), readied by Perfect Execution, bf2→base (3rd) ⇒ score exactly 1 (both battlefields already P1's: no conquer points)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .legend(P1, CARD, "lg")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", WINDRIDER, "yas")
      .hand(P1, PERFECT_EXECUTION, "pe")
      .build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "yas" });
    await game.settle();
    expect(game.zoneOf("yas")).toBe("battlefield-bf1");
    expect(game.state("yas").isExhausted).toBe(false); // an effect move never exhausts the mover
    expect(game.p1.points()).toBe(0);
    await game.p1.move("yas", "bf2"); // 2nd move — Ganking bf → bf, the Standard Move exhausts him
    await game.settle();
    expect(game.state("yas").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(0);
    await game.p1.cast("pe", { targets: "yas" });
    await game.settle();
    expect(game.state("yas").isExhausted).toBe(false);
    await game.p1.move("yas", "base"); // 3rd move
    await game.settle();
    expect(game.zoneOf("yas")).toBe("base");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
  // rule 402.2 — the destination is a choice made per ACTIVATION. It is recorded on the chain
  // item, never on the shared card definition, so a second activation is neither blocked nor
  // stuck with the first one's destination.
  test("activating it again on a later turn works and picks a fresh destination (no state left on the card definition)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "lg")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "First" }, "u1")
      .unit(P1, "base", { might: 2, name: "Second" }, "u2")
      .build();
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf1"], targets: "u1" });
    await game.settle();
    expect(game.zoneOf("u1")).toBe("battlefield-bf1");

    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.activate("lg", 0, { answers: ["battlefield-bf2"], targets: "u2" });
    await game.settle();
    expect(game.zoneOf("u2")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });
});
