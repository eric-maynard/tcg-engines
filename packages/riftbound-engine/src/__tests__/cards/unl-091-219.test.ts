/**
 * Concentrate — unl-091-219 · Spell · Body · 5 energy (no power) · no [Action]/[Reaction]
 *
 *   Draw 2.
 *   [Level 6][>] This costs [2] less. (While you have 6+ XP, get the effect.)
 *   [Level 11][>] This costs [4] less instead.
 *
 * Rules: 824 (Level N — the dependent ability is active while the CONTROLLER has ≥ N XP; 824.1.b.1 it is
 * a characteristic the card "gains", so it applies in hand at pay time), "instead" (the Level 11 line
 * REPLACES the Level 6 discount: 5→1, never 5−2−4 → free), 813/310 (no timing keyword → own turn,
 * Neutral Open only: not in a showdown even with Focus, not onto a chain, not on the opponent's
 * turn), 431 (Draw 2 with one card left → draw it, Burn Out — recycle trash into deck, an opponent
 * gains 1 point — then draw the second; the resolving spell itself is on the chain, not in the trash,
 * so it is NOT shuffled back).
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Cost ladder must be exact: 0–5 XP → 5; 6–10 XP → 3; 11+ XP → 1 (not 0). One-short cases (5 XP,
 *     10 XP) must not get the next tier.
 *  2. Only YOUR XP counts — an opponent at 11 XP leaves your Concentrate at 5.
 *  3. Draw exactly 2 (third card stays on top), spell → trash after resolving.
 *  4. Burn Out mid-resolution (deck of 1, trash of 3): end with 2 cards drawn, P2 +1 point, deck 2,
 *     Concentrate in trash afterwards.
 *  5. Timing negatives (plain spell).
 *  6. Registry: the two Level cost lines must exist as parsed abilities, else the discount silently
 *     never applies.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-091-219";
const FILLER = "ogn-175-298";
const CLEAVE = "ogn-004-298"; // 1-energy [Action] spell used to open a chain

function withDeck(xp: number, energy: number) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy })
    .deckTop(P1, FILLER, "first")
    .deckTop(P1, FILLER, "second")
    .deckTop(P1, FILLER, "third")
    .hand(P1, CARD, "conc");
}

describe("Concentrate (unl-091-219)", () => {
  test("0 XP: costs exactly 5 energy (no power); one non-triggered spell item on the chain; resolves → draw exactly 2 (top two), third stays on top, spell → trash", async () => {
    const game = await withDeck(0, 5).build();
    await game.p1.cast("conc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "conc", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn before resolution
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["first", "second"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.zoneOf("conc")).toBe("trash");
    expect(game.p1.xp()).toBe(0); // drawing is not XP
    expect(game.violations()).toEqual([]);
  });

  test("below Level 6 there is no discount: 4 energy at 0 XP and at 5 XP (one short) → not castable", async () => {
    expect((await withDeck(0, 4).build()).p1.can("cast", "conc")).toBe(false);
    expect((await withDeck(5, 4).build()).p1.can("cast", "conc")).toBe(false);
    const t = await (await withDeck(5, 4).build()).p1.try((p) => p.cast("conc"));
    expect(t.ok).toBe(false);
  });

  test("only YOUR XP counts (824.1.c): the opponent at 11 XP leaves P1's Concentrate at full price — 4 energy is still not enough, 5 is and all 5 are spent", async () => {
    const short = await withDeck(0, 4).xp(P2, 11).build();
    expect(short.p1.can("cast", "conc")).toBe(false);
    const full = await withDeck(0, 5).xp(P2, 11).build();
    await full.p1.cast("conc");
    expect(full.p1.energy()).toBe(0);
  });

  // BUG — expected (824 / printed text): at 6+ XP "This costs [2] less" → 3 energy. Actual: the registry
  // payload carries only the `draw 2` spell ability (the two [Level] cost lines are not parsed), so the
  // engine always charges 5: with 3 energy the cast is refused, with 5 it takes all 5.
  test("[Level 6] 'This costs [2] less' is not applied — at exactly 6 XP Concentrate should cost 3 (castable on 3 energy; from 5 energy exactly 2 remain)", async () => {
    const exact = await withDeck(6, 3).build();
    expect(exact.p1.can("cast", "conc")).toBe(true);
    await exact.p1.cast("conc");
    expect(exact.p1.energy()).toBe(0);
    const rich = await withDeck(6, 5).build();
    await rich.p1.cast("conc");
    expect(rich.p1.energy()).toBe(2);
    await rich.settle();
    expect(rich.p1.hand()).toHaveLength(2);
  });

  // BUG — same root cause: 10 XP is still the Level-6 tier (cost 3), one short of Level 11.
  test("[Level 6] tier holds through 10 XP — at 10 XP it costs 3 (castable on 3, NOT on 2)", async () => {
    expect((await withDeck(10, 2).build()).p1.can("cast", "conc")).toBe(false);
    const game = await withDeck(10, 3).build();
    expect(game.p1.can("cast", "conc")).toBe(true);
    await game.p1.cast("conc");
    expect(game.p1.energy()).toBe(0);
  });

  // BUG — expected: at 11+ XP "This costs [4] less INSTEAD" → 5 − 4 = 1 (the Level-6 discount is
  // replaced, not stacked: not free). Actual: always 5.
  test("[Level 11] 'costs [4] less instead' is not applied — at 11 XP it should cost exactly 1 (castable on 1 energy; NOT on 0; from 5 energy exactly 4 remain)", async () => {
    expect((await withDeck(11, 0).build()).p1.can("cast", "conc")).toBe(false); // "instead": 1, not 0
    const exact = await withDeck(11, 1).build();
    expect(exact.p1.can("cast", "conc")).toBe(true);
    await exact.p1.cast("conc");
    expect(exact.p1.energy()).toBe(0);
    const rich = await withDeck(15, 5).build();
    await rich.p1.cast("conc");
    expect(rich.p1.energy()).toBe(4);
  });

  test("Burn Out mid-resolution (431): one card in deck, three in trash → draws it, recycles the trash into the deck, P2 gains 1 point, draws the second; Concentrate itself ends in the trash and was not shuffled in", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 5 })
      .deck(P1, [FILLER], ["last"])
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .trash(P1, FILLER, "t3")
      .deck(P2, [FILLER, FILLER, FILLER])
      .hand(P1, CARD, "conc")
      .build();
    await game.p1.cast("conc");
    await game.settle();
    const hand = game.p1.hand();
    expect(hand).toHaveLength(2);
    expect(hand).toContain("last");
    expect(["t1", "t2", "t3"]).toContain(hand.find((c) => c !== "last"));
    expect(game.p1.deck()).toHaveLength(2);
    expect(game.p1.trash()).toEqual(["conc"]);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("timing (no [Action]/[Reaction]): not on the opponent's turn, not in a showdown while holding Focus, not onto an open chain — legal again once the chain is empty", async () => {
    const opp = await withDeck(0, 5).active(P2).build();
    expect(opp.p1.can("cast", "conc")).toBe(false);
    expect((await opp.p1.try((p) => p.cast("conc"))).ok).toBe(false);

    const sd = await withDeck(0, 5).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "foe").unit(P1, "base", { might: 2 }, "me").build();
    await sd.p1.move("me", "bf1");
    expect((sd.decision() as ActionDecision)).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("cast", "conc")).toBe(false);

    const chain = await withDeck(0, 6).unit(P1, "base", { might: 2 }, "me").hand(P1, CLEAVE, "cleave").build();
    await chain.p1.cast("cleave", { targets: "me" });
    expect((chain.decision() as ActionDecision).context).toBe("chain");
    expect(chain.p1.can("cast", "conc")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("cast", "conc")).toBe(true); // Neutral Open again with 5 energy left
  });

  // BUG — expected: besides the `draw 2` spell effect the payload must carry the two Level-gated
  // self cost reductions (Level 6: −2; Level 11: −4 replacing it). Actual: abilities = [draw 2] only.
  test("registry payload drops both [Level] cost lines — expected draw-2 spell ability + Level 6 (−2) and Level 11 (−4, instead) self cost-reductions; 5 energy, no power, not action/reaction", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 5, name: "Concentrate" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(["action", "reaction"]).not.toContain(def?.timing as string);
    type Ab = { type: string; effect?: { type?: string; amount?: unknown; reduction?: unknown }; condition?: { type?: string; threshold?: number } };
    const abilities = (def?.abilities ?? []) as Ab[];
    expect(abilities.filter((a) => a.type === "spell")).toEqual([expect.objectContaining({ effect: { amount: 2, type: "draw" } })]);
    const levels = abilities.filter((a) => a.condition?.type === "while-level").map((a) => a.condition?.threshold).sort();
    expect(levels).toEqual([6, 11].sort());
    for (const a of abilities.filter((x) => x.condition?.type === "while-level")) {
      expect(a.effect?.type).toBe("cost-reduction");
    }
  });

  test("registry payload (what IS parsed today): a single plain spell ability 'draw 2', no timing keyword, 5 energy, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 5 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(["action", "reaction"]).not.toContain(def?.timing as string);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 2, type: "draw" }, type: "spell" });
  });
});
