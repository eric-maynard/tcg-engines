/**
 * Prepared Neophyte — unl-004-219 · Unit · Fury · 3 energy (no power) · 1 Might
 *
 *   If you've spent [4] or more to play a spell this turn, I have +4 [Might].
 *
 * Rules: this is a conditional PASSIVE (static) self-modifier, re-evaluated continuously (476): it is
 * on as soon as the condition becomes true this turn and off again next turn. "[4]" is the ENERGY
 * symbol (135.2) — Power paid does not count toward it. "Spent … to play a spell" is what was actually
 * PAID in the Pay Costs step (357), i.e. after increases/discounts and INCLUDING additional costs such
 * as a paid Repeat (820.1.d) — unlike rule 206, which is about a card's printed cost. Costs are paid
 * as the spell is played (before it resolves, 349–357), so the bonus is live while that spell is still
 * on the chain. "You" = Neophyte's controller only.
 *
 * Head-judge corner cases covered below:
 *   1. Baseline: no spell this turn → exactly 1 Might (the +4 must be OFF).
 *   2. A 4-energy spell → 5 Might, already while the spell sits on the chain; a 3-energy spell → 1;
 *      Void Seeker (3 energy + 1 fury POWER = "4 resources") → still 1 — power is not [4].
 *   3. Additional costs count: Bonds of Strength (2) with its Repeat [2] paid = 4 spent → on.
 *   4. Printed 4 but PAID 0: Consult the Past played from facedown for [0] → off (spent ≠ cost).
 *   5. "this turn": on during your turn, off after the turn passes; the OPPONENT spending 4 on their
 *      turn does nothing for your Neophyte.
 *   6. History, not presence: a Neophyte played AFTER the 4-spend this turn still enters at 5.
 *   7. Real partner Square Up (4, Fury): casting it on Neophyte both switches him on (5) and gives
 *      [Assault 4] → he attacks as 9 and flattens an 8-Might defender.
 *   8. Cost: 3 energy, enters exhausted; 2 energy → not playable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-004-219";
const SQUARE_UP = "unl-017-219"; // 4 energy (Fury): [Repeat] — Discard 1. Give a unit [Assault 4] this turn.
const VOID_SEEKER = "ogn-024-298"; // Action, 3 energy + [fury]: Deal 4 to a unit at a battlefield. Draw 1.
const BONDS = "sfd-151-221"; // Reaction, 2 energy, Repeat [2]: Give two friendly units each +1 Might this turn.
const CONSULT = "ogn-083-298"; // 4 energy, [Hidden] Reaction: Draw 2.

/** Inline "Draw 1." spell at a given energy cost — no targets, nothing else going on. */
const study = (energyCost: number, name = `Study ${energyCost}`) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost,
  name,
  timing: "action",
});

function board(energy = 4) {
  return scenario().resources(P1, { energy, power: { fury: 1 } }).unit(P1, "base", CARD, "neo");
}

describe("Prepared Neophyte (unl-004-219)", () => {
  test("plays for exactly 3 energy, to base, exhausted; 2 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "neo").build();
    await game.p1.play("neo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("neo")).toBe("base");
    expect(game.state("neo")).toMatchObject({ baseMight: 1, isExhausted: true });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "neo").build()).p1.can("play", "neo")).toBe(false);
  });

  // BUG — expected: with no spell played this turn the condition is false and Neophyte is a 1/1.
  // Actual: the parsed condition is `{ type: "custom" }`, which the static evaluator treats as
  // always-true, so he permanently reads 5.
  test("no spell played this turn → exactly 1 Might; engine applies +4 unconditionally (custom condition defaults to true)", async () => {
    const game = await board().build();
    expect(game.state("neo")).toMatchObject({ baseMight: 1, might: 1, staticMightBonus: 0 });
  });

  test("a 4-energy spell switches it on: 5 Might already while the spell is on the chain (costs are paid on play), and still 5 after it resolves", async () => {
    const game = await board(4).hand(P1, study(4), "s4").build();
    await game.p1.cast("s4");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("s4")).toBe("chain");
    expect(game.state("neo").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.state("neo")).toMatchObject({ baseMight: 1, isBuffed: false, might: 5 });
  });

  // BUG — expected: 3 energy is one short → stays 1. Actual: always 5 (see above).
  test("a 3-energy spell is one short → stays 1 Might; engine shows 5", async () => {
    const game = await board(4).hand(P1, study(3), "s3").build();
    await game.p1.cast("s3");
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("neo").might).toBe(1);
  });

  // BUG — expected: Void Seeker costs 3 ENERGY + 1 fury POWER; only energy counts toward "[4]" → 1.
  test("Void Seeker (3 energy + 1 power) does not meet '[4]' — power is not energy; engine shows 5", async () => {
    const game = await board(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Target" }, "target")
      .hand(P1, VOID_SEEKER, "vs")
      .build();
    await game.p1.cast("vs", { targets: "target" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("target").damage).toBe(4);
    expect(game.state("neo").might).toBe(1);
  });

  test("additional costs count as 'spent': Bonds of Strength (2) with Repeat [2] paid = 4 energy → on (5), plus Bonds' own +1×2 on him = 7", async () => {
    const game = await board(4).unit(P1, "base", { might: 2, name: "Pal" }, "pal").hand(P1, BONDS, "bonds").build();
    await game.p1.cast("bonds", { repeat: 1, targets: ["neo", "pal"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("neo").might).toBe(5); // on the chain: condition met, Bonds not resolved yet
    await game.settle();
    expect(game.state("neo").might).toBe(7);
    expect(game.state("pal").might).toBe(4);
  });

  // BUG — expected: without Repeat the same Bonds of Strength is only 2 spent → Neophyte 1 (+1 from
  // Bonds = 2). Actual: 5 + 1 = 6.
  test("Bonds of Strength WITHOUT repeat is only 2 spent → Neophyte reads 1+1 = 2; engine shows 6", async () => {
    const game = await board(4).unit(P1, "base", { might: 2, name: "Pal" }, "pal").hand(P1, BONDS, "bonds").build();
    await game.p1.cast("bonds", { targets: ["neo", "pal"] });
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("neo").might).toBe(2);
  });

  // BUG — expected: "spent", not "cost" (contrast rule 206): Consult the Past has printed cost 4 but is
  // played from facedown for [0], so nothing was spent → 1 Might (and P1 drew 2). Actual: 5.
  test("a printed-4 spell played from facedown for [0] spends nothing → stays 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "neo")
      .facedown(P1, "bf1", CONSULT, "ctp")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.reveal("ctp");
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("neo").might).toBe(1);
  });

  // BUG — expected: the condition is scoped to THIS turn — after the turn passes to P2 the bonus is
  // gone (1), and P2 paying 4 for THEIR spell does nothing for my Neophyte. Actual: 5 throughout.
  test.failing("BUG: 'this turn' + 'you' — off on the next turn and unaffected by the OPPONENT's 4-energy spell; engine shows 5", async () => {
    const game = await board(4).resources(P2, { energy: 4 }).hand(P1, study(4), "mine").hand(P2, study(4, "Their Study"), "theirs").build();
    await game.p1.cast("mine");
    await game.settle();
    expect(game.state("neo").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("neo").might).toBe(1);
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.p2.energy()).toBe(0);
    expect(game.state("neo").might).toBe(1);
  });

  test("turn history, not board presence: a Neophyte PLAYED after the 4-energy spell this turn enters as a 5", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, study(4), "s4").hand(P1, CARD, "lateNeo").build();
    await game.p1.cast("s4");
    await game.settle();
    await game.p1.play("lateNeo");
    await game.settle();
    expect(game.zoneOf("lateNeo")).toBe("base");
    expect(game.state("lateNeo").might).toBe(5);
    expect(game.p1.energy()).toBe(0);
  });

  test("partner — Square Up (4, Fury) on Neophyte: switches him on (5) AND grants [Assault 4]; he attacks as 9, kills an 8-Might defender, survives (8 < 9) and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "neo")
      .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
      .hand(P1, SQUARE_UP, "sq")
      .build();
    await game.p1.cast("sq", { targets: "neo" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("neo").might).toBe(5); // at rest: +4 static, Assault dormant
    expect(game.state("neo").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    await game.p1.move("neo", "bf1");
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash"); // 1 + 4 + 4 = 9 ≥ 8
    expect(game.locationOf("neo")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // BUG — expected: the parser should emit a machine-checkable condition (the engine already keeps a
  // per-turn spell-energy ledger for Jhin's identical clause: `spell-energy-spent-this-turn`, amount 4).
  // Actual: `{ type: "custom", text: "If you've spent :rb_energy_4: or more to play a spell this turn" }`.
  test("parsed static should carry a typed 'spent ≥4 energy on a spell this turn' condition, not an opaque custom-text one", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, might: 1, name: "Prepared Neophyte" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; effect: unknown; condition?: { type?: string; amount?: number } };
    expect(ability).toMatchObject({ effect: { amount: 4, target: "self", type: "modify-might" }, type: "static" });
    expect(ability.condition?.type).not.toBe("custom");
    expect(ability.condition).toMatchObject({ amount: 4 });
  });

  test("parsed abilities (the parts that are right today): exactly one static self +4 modify-might with SOME condition attached", async () => {
    const pool = await loadDefaultCardPool();
    const abilities = (pool.get(CARD)?.abilities ?? []) as { type: string; effect: unknown; condition?: unknown }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { amount: 4, target: "self", type: "modify-might" }, type: "static" });
    expect(abilities[0]?.condition).toBeDefined();
  });
});
