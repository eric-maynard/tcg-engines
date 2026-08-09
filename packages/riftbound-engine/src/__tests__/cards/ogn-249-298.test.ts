/**
 * Relentless Storm — ogn-249-298 · Legend (Volibear) · Fury/Body
 *
 *   When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted.
 *   (A unit is Mighty while it has 5+ [Might].)
 *
 * Rules: 419.4.a (a "when you play" trigger fires once the unit's play has completed), 708/710 (a unit
 * on the board is Mighty by its CURRENT Might, statics included), 383.3.a/383.3.b ("you may" first +
 * "exhaust me to …" = opt-in decided at finalization, the exhaust is the trigger's base cost and is
 * paid right there), 430.2/430.3 (channel = top rune of your rune deck onto the board, here EXHAUSTED;
 * with no runes left channel as many as possible = 0), 515.1 (Awaken readies the legend next turn).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Threshold: printed 5 triggers, printed 4 does not — but a printed 4 entering next to Garen,
 *     Commander ("Other friendly units have +1 [Might] here") IS a Mighty unit as it is played (710).
 *  2. Cost gate: the legend exhausts at finalization (before anyone can respond); an already-exhausted
 *     legend cannot pay, so a second Mighty unit the same turn channels nothing; it readies in Awaken.
 *  3. The trigger is a chain item: the opponent gets priority BEFORE the rune arrives; the rune enters
 *     exhausted (no energy this turn) and comes off the top of the rune deck.
 *  4. "You": the opponent playing a Mighty unit never wakes my legend.
 *  5. Empty rune deck: paying is still allowed, the legend exhausts, nothing is channeled (430.3).
 *  6. Partner: Blazing Scorcher played with [Accelerate] is still "playing a Mighty unit".
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-249-298";
const PHANTOM = "ogn-049-298"; // Playful Phantom · calm · 5 energy · 5 Might · vanilla
const SCORCHER = "ogn-001-298"; // Blazing Scorcher · fury · 5 energy · 5 Might · [Accelerate]
const GAREN_COMMANDER = "ogs-013-024"; // "Other friendly units have +1 [Might] here."
const FOUR = { cardType: "unit", energyCost: 1, might: 4, name: "Four Drop" };

function board(energy = 10) {
  return scenario().resources(P1, { energy }).legend(P1, CARD, "rs").hand(P1, PHANTOM, "pp");
}

describe("Relentless Storm (ogn-249-298)", () => {
  test("registry payload: ONE optional triggered ability — play-card (friendly Mighty unit), cost exhaust-self, effect channel 1 exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Volibear", domain: ["fury", "body"], name: "Relentless Storm" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { amount: 1, exhausted: true, type: "channel" },
        optional: true,
        trigger: { event: "play-card", on: { cardType: "unit", controller: "friendly", filter: "mighty" } },
        type: "triggered",
      },
    ]);
  });

  test("playing a 5-Might unit: trigger on the chain, opt-in asked at finalization; 'yes' exhausts the legend at once and, on resolution, channels the top rune EXHAUSTED", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toEqual([]);
    const deckBefore = game.p1.runeDeck();
    await game.p1.play("pp");
    expect(game.p1.energy()).toBe(5);
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rs", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.state("rs").isExhausted).toBe(true); // 383.3.b — paid at finalization
    expect(game.p1.runes()).toEqual([]); // …but nothing channeled before resolution
    await game.settle();
    const runes = game.p1.runes();
    expect(runes).toEqual([deckBefore[0] as string]); // top rune of the rune deck
    expect(game.state(runes[0] as string).isExhausted).toBe(true);
    expect(game.p1.runeDeck()).toHaveLength(deckBefore.length - 1);
    expect(game.p1.can("tapRune", runes[0])).toBe(false); // exhausted → no energy from it this turn
    expect(game.violations()).toEqual([]);
  });

  test("the channel waits on the chain: after 'yes' the opponent holds priority with no rune on the board yet", async () => {
    const game = await board().build();
    await game.p1.play("pp");
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.runes()).toEqual([]);
    await game.p2.passPriority();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("optional: 'no' leaves the legend ready and channels nothing", async () => {
    const game = await board().build();
    await game.p1.play("pp");
    await game.p1.no();
    await game.settle();
    expect(game.state("rs").isReady).toBe(true);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toHaveLength(12);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a 4-Might unit is not Mighty (708) — playing it must create no chain item and no prompt", async () => {
    // Expected: the trigger's `filter: "mighty"` gates on 5+ Might → nothing happens for a 4.
    // Actual: the filter is ignored — every friendly unit play (even a 3-Might Skulker) asks to exhaust.
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, CARD, "rs").hand(P1, FOUR, "four").build();
    await game.p1.play("four");
    expect(game.zoneOf("four")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("rs").isReady).toBe(true);
  });

  test("710 — Mighty is read on the board: a printed-4 unit played next to Garen, Commander (+1 here) enters as a 5 and DOES trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "rs")
      .unit(P1, "base", GAREN_COMMANDER, "garen")
      .hand(P1, FOUR, "four")
      .build();
    await game.p1.play("four");
    expect(game.state("four").might).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rs", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
  });

  test("'you play': the OPPONENT playing a Mighty unit does not trigger my legend (and they have none)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 5 }).legend(P1, CARD, "rs").hand(P2, PHANTOM, "theirs").build();
    await game.p2.play("theirs");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("rs").isReady).toBe(true);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p2.runes()).toEqual([]);
  });

  test("cost gate: with the legend already exhausted the ability cannot be used — no rune is channeled (a prompt, if any, cannot be accepted)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .card("rs", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .hand(P1, PHANTOM, "pp")
      .build();
    await game.p1.play("pp");
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.runes()).toEqual([]);
    expect(game.state("rs").isExhausted).toBe(true);
  });

  test("two Mighty units in one turn: the first channels a rune, the second finds the legend exhausted and channels nothing", async () => {
    const game = await board(10).hand(P1, PHANTOM, "pp2").build();
    await game.p1.play("pp");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    await game.p1.play("pp2");
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ canAccept: false });
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("pp2")).toBe("base");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(11);
  });

  test("Awaken readies the legend: on my next turn (1 trigger rune + 2 channelled = 3, all ready) a new Mighty unit triggers again → 4 runes", async () => {
    const game = await board(10).hand(P1, PHANTOM, "pp2").build();
    await game.p1.play("pp");
    await game.p1.yes();
    await game.settle();
    await game.advanceTurn();
    expect(game.state("rs").isExhausted).toBe(true); // still exhausted during the opponent's turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("rs").isReady).toBe(true);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    await game.p1.do("addResources", { energy: 5 }); // pools emptied at end of turn; refill for the 5-drop
    await game.p1.play("pp2");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("430.3 — empty rune deck: 'yes' still exhausts the legend but channels nothing", async () => {
    const game = await board().fillDecks({ main: 10, runes: 0 }).build();
    expect(game.p1.runeDeck()).toEqual([]);
    await game.p1.play("pp");
    await game.p1.yes();
    await game.settle();
    expect(game.state("rs").isExhausted).toBe(true);
    expect(game.p1.runes()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("partner — Blazing Scorcher played with [Accelerate] (5 + [1][fury]) is still a Mighty unit being played: enters ready AND triggers the legend", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).legend(P1, CARD, "rs").hand(P1, SCORCHER, "bs").build();
    await game.p1.play("bs", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("bs").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
  });
});
