/**
 * Frigid Jewel — unl-074-219 · Gear · Mind · 2 energy
 *
 *   When you draw your second card each turn, give a friendly unit +2 [Might] this turn.
 *
 * Rules: 383 (triggered ability; the target — "a friendly unit" — is chosen when it resolves), 745-ish
 * draw = moving the top card of YOUR Main Deck to hand one at a time ("Draw 3" is three draws), 317
 * (the Draw Phase card is a draw like any other), "each turn" = every turn, yours AND the opponent's,
 * counted per player per turn and reset at the turn boundary; "this turn" bonuses expire in Ending.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. On your own turn the Draw-Phase card is draw #1, so the FIRST extra draw in your main phase is
 *     already "your second card" → trigger. A third draw that turn does nothing more (once per turn).
 *  2. "Draw 1" repeated / "Draw 2" from a single spell = two separate draws → exactly one trigger, on
 *     the second; the bonus is +2, never +4.
 *  3. Opponent's turn counts ("each turn"): reacting to an enemy 4-damage Bolt with a double draw puts
 *     the Jewel trigger above the Bolt (LIFO) → +2 lands first → a 3-Might ally survives as a 5.
 *  4. The count is the PLAYER's draws this turn, not draws the Jewel witnessed: played after the Draw
 *     Phase, the very next draw is still your second (same reading as Darius' "second card in a turn").
 *  5. "a friendly unit": enemy units are never offered; with no friendly unit the trigger simply does
 *     nothing (draws still happen). Two Jewels = two triggers = +4 total (or split).
 *  6. Engine status: the engine never emits a `draw` game event, so every trigger clause below is a
 *     BUG test today; cost / payload / negative-space clauses pass.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-074-219";
const DRAMATICS = "unl-061-219"; // Mind 2 · Reaction · Repeat [2] · Draw 1.
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 4 to a unit.",
  timing: "action",
} as const;

/** P1's main phase (no draws yet this turn as far as the engine knows), Jewel in base, Ally (2) in base, Dramatics in hand. */
function board(energy = 4) {
  return scenario().resources(P1, { energy }).gear(P1, CARD, "jewel").unit(P1, "base", { might: 2, name: "Ally" }, "ally").hand(P1, DRAMATICS, "dd");
}

describe("Frigid Jewel (unl-074-219)", () => {
  test("registry payload: 2-energy mind gear with ONE triggered ability — on the controller's draw, 2nd time each turn → +2 Might this turn to a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 2, name: "Frigid Jewel" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" },
        trigger: { event: "draw", on: "controller", restrictions: [{ count: 2, type: "nth-time-each-turn" }] },
        type: "triggered",
      },
    ]);
  });

  test("cost: 2 energy, lands in base ready with nothing on the chain; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "jewel").build();
    await game.p1.play("jewel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("jewel")).toBe("base");
    expect(game.state("jewel").isReady).toBe(true);
    expect(game.p1.gear()).toEqual(["jewel"]);
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "j").build()).p1.can("play", "j")).toBe(false);
  });

  test("negative space: the Draw-Phase card alone (your FIRST draw of the turn) triggers nothing — no prompt, Ally still 2", async () => {
    const game = await scenario().turn(2).active(P2).gear(P1, CARD, "jewel").unit(P1, "base", { might: 2, name: "Ally" }, "ally").build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(before + 1);
    expect(game.state("ally").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space: a single 'Draw 1' as the first draw of a turn triggers nothing", async () => {
    const game = await board(2).build();
    await game.p1.cast("dd");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("ally").might).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  test("Draw-Phase card = draw #1, so the first extra draw in your main phase (Downstage Dramatics) is your SECOND → trigger → Ally +2 this turn; gone next turn", async () => {
    // Expected: after the spell resolves a triggered Jewel item resolves and Ally reads 4 until end of turn.
    // Actual: the engine never emits a `draw` event, so the Jewel never triggers (Ally stays 2).
    const game = await scenario().turn(2).active(P2).gear(P1, CARD, "jewel").unit(P1, "base", { might: 2, name: "Ally" }, "ally").hand(P1, DRAMATICS, "dd").build();
    await game.advanceTurn(); // P1: awaken, beginning, channel 2, draw 1
    await game.p1.tapRunes(2);
    await game.p1.cast("dd");
    await game.settle(); // spell resolves → draw #2 → trigger → single friendly unit is auto-picked
    expect(game.state("ally").might).toBe(4);
    expect(game.state("ally").baseMight).toBe(2);
    expect(game.zoneOf("dd")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("'Draw 1' repeated once (4 energy) = two draws → exactly ONE trigger on the second → Ally is 4, not 6; a later third draw adds nothing", async () => {
    // Expected: +2 once. Actual: no trigger at all (no draw event).
    const game = await board(6).hand(P1, DRAMATICS, "dd2").build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3); // dd2 + 2 drawn
    expect(game.state("ally").might).toBe(4);
    await game.p1.cast("dd2"); // third draw this turn
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("the trigger CHOOSES 'a friendly unit' on resolution — with two allies P1 is prompted with exactly those two (never the enemy unit) and only the picked one gets +2", async () => {
    // Expected: pick prompt {ally, pal}; picking pal → pal 5, ally 2, foe 3. Actual: no trigger, no prompt.
    const game = await board(4).unit(P1, "base", { might: 3, name: "Pal" }, "pal").unit(P2, "base", { might: 3, name: "Foe" }, "foe").build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["ally", "pal"]);
    await game.p1.pick("pal");
    await game.settle();
    expect(game.state("pal").might).toBe(5);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("foe").might).toBe(3);
  });

  test("'each turn' includes the OPPONENT's — in response to an enemy 4-damage Bolt on the 3-Might Guard, a double draw triggers the Jewel above the Bolt (LIFO): Guard → 5, survives on 4 damage", async () => {
    // Expected chain: [bolt, dd] → dd resolves (2 draws) → [bolt, jewel-trigger] → +2 → bolt's 4 < 5.
    // Actual: no trigger; the Guard dies.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 4 })
      .gear(P1, CARD, "jewel")
      .unit(P1, "base", { might: 3, name: "Guard" }, "guard")
      .hand(P2, BOLT, "bolt")
      .hand(P1, DRAMATICS, "dd")
      .build();
    await game.p2.cast("bolt", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "dd"]);
    await game.settle();
    expect(game.state("guard")).toMatchObject({ damage: 4, might: 5, zone: "base" });
    await game.advanceTurn(); // P2 ends: damage healed, bonus expired
    expect(game.state("guard")).toMatchObject({ damage: 0, might: 3, zone: "base" });
  });

  test("control for the response test: without the Jewel the same double draw does not save the Guard", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 3, name: "Guard" }, "guard")
      .hand(P2, BOLT, "bolt")
      .hand(P1, DRAMATICS, "dd")
      .build();
    await game.p2.cast("bolt", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("the count is the PLAYER's draws this turn — a Jewel played AFTER the Draw Phase still fires on the very next draw (it is your second card)", async () => {
    // Expected: draw phase (1st) → play Jewel → Dramatics draw (2nd) → trigger → Ally 4. Actual: no trigger.
    const game = await scenario().turn(2).active(P2).unit(P1, "base", { might: 2, name: "Ally" }, "ally").hand(P1, CARD, "jewel").hand(P1, DRAMATICS, "dd").build();
    await game.advanceTurn();
    await game.p1.tapRunes(2);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.play("jewel");
    await game.settle();
    expect(game.zoneOf("jewel")).toBe("base");
    await game.p1.cast("dd");
    await game.settle();
    expect(game.state("ally").might).toBe(4);
  });

  test("two Jewels are two triggers — one double draw with a single friendly unit makes it +4 (2 → 6)", async () => {
    // Expected: both triggers resolve onto the only friendly unit. Actual: neither triggers.
    const game = await board(4).gear(P1, CARD, "jewel2").build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.state("ally").might).toBe(6);
  });

  test("no friendly unit on the board: the second draw still happens and nothing else does (no prompt, no error, enemy untouched)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, CARD, "jewel").unit(P2, "base", { might: 3, name: "Foe" }, "foe").hand(P1, DRAMATICS, "dd").build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("foe").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
