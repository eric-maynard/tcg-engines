/**
 * Fretful Feline — ven-071-166 · Unit · Body · 6 energy · 5 Might
 *
 *   When I become ready, give me +2 [Might] this turn.
 *
 * Head-judge notes (the tricky spots this file pins down):
 *   1. The everyday trigger is the Awaken step (315.1.b / 415.3.a): an EXHAUSTED Feline readies at the
 *      start of its controller's turn → +2 for that turn → it attacks at 7 but, once the turn ends,
 *      defends at 5.
 *   2. A unit that is already Ready cannot be readied (415.1.b/c): a Feline that never exhausted gets
 *      no Awaken trigger, and "Ready a unit" aimed at a ready Feline does nothing — no +2.
 *   3. Entering the board exhausted (359.2.c) is not "becoming ready": playing it triggers nothing.
 *   4. Each readying is a fresh trigger and the bonuses stack within the turn: Awaken (+2) → move
 *      (exhaust) → Upstage Comedy readies it (+2) → 9.
 *   5. "give ME" — the bonus is self-bound: no target prompt, no other unit can receive it. (The set
 *      data ships `target: {type:"unit"}`, so with any other unit around the engine asks whom to pump.)
 *   6. Partner — Pirate's Haven (ogn-143-298) "When you ready a friendly unit, give it +1": both fire
 *      off the same Awaken → 8.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-071-166";
const COMEDY = "unl-009-219"; // Upstage Comedy — 2 fury-domain energy spell: Ready a unit ([Repeat] [2])
const HAVEN = "ogn-143-298"; // Pirate's Haven — gear: when you ready a friendly unit, give it +1 Might this turn

/**
 * Settle, and if the engine (wrongly — see the BUG test) asks which unit the Feline's own trigger
 * should pump, answer "the Feline" so the clause under test can still be observed.
 */
async function settleCat(game: Game): Promise<void> {
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "cat") {
    await game.p1.pick("cat");
    await game.settle();
  }
}

/** P2 is about to end the turn; P1's Feline sits exhausted (or not) at `at`. */
function beforeMyTurn(opts: { exhausted?: boolean; at?: "base" | "bf1" } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, opts.at ?? "base", CARD, "cat", opts.exhausted === false ? undefined : { exhausted: true });
}

describe("Fretful Feline (ven-071-166)", () => {
  test("registry payload should bind the +2 to the Feline itself ('give me') — set data ships target {type:'unit'} instead of 'self'", async () => {
    // Expected (as the parser emits for every other "give me +N [Might] this turn", e.g. Ember Monk):
    // target "self". Actual: `{ type: "unit" }`, which makes the resolver prompt for any unit.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 6, might: 5 });
    expect(def?.abilities).toEqual([
      { effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" }, optional: false, trigger: { event: "ready", on: "self" }, type: "triggered" },
    ]);
  });

  test("costs 6 for a 5-Might unit that enters EXHAUSTED — entering is not 'becoming ready', so no trigger and no bonus; 5 energy can't play it", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "cat").build();
    await game.p1.play("cat");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("cat")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0, zone: "base" });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "cat").build()).p1.can("play", "cat")).toBe(false);
  });

  test("Awaken readies the exhausted Feline → its trigger goes on the chain at turn start → resolves to 7 Might for the turn", async () => {
    const game = await beforeMyTurn().build();
    expect(game.state("cat")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cat", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("cat")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("negative (415.1.b): a Feline that was already READY going into Awaken is not readied again — no trigger, stays 5", async () => {
    const game = await beforeMyTurn({ exhausted: false }).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("cat").might).toBe(5);
  });

  test("'this turn': the Awaken bonus is gone once my turn ends — 7 on my turn, 5 on the opponent's", async () => {
    const game = await beforeMyTurn().build();
    await game.advanceTurn();
    expect(game.state("cat").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("cat")).toMatchObject({ isReady: true, might: 5 });
  });

  test("readied by a spell mid-turn (Upstage Comedy) triggers it too; stacks with the Awaken bonus: 5 → 7 → (move exhausts, no trigger) → readied → 9", async () => {
    const game = await beforeMyTurn().hand(P1, COMEDY, "comedy").build();
    await game.advanceTurn();
    expect(game.state("cat").might).toBe(7);
    await game.p1.move("cat", "bf1"); // exhausts — exhausting is not a ready event
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("cat")).toMatchObject({ isExhausted: true, might: 7 });
    await game.p1.tapRunes(2);
    await game.p1.cast("comedy", { targets: "cat" });
    await game.p1.pass();
    await game.p2.pass(); // Comedy resolves → Feline readies → trigger
    expect(game.state("cat").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cat", triggered: true })]);
    await game.settle();
    expect(game.state("cat").might).toBe(9);
    await game.advanceTurn();
    expect(game.state("cat").might).toBe(5); // both +2s were "this turn"
  });

  test("negative (415.1.c): 'Ready a unit' on an already-ready Feline does nothing — no trigger, no +2", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "cat").hand(P1, COMEDY, "comedy").build();
    expect(game.state("cat").isReady).toBe(true);
    await game.p1.cast("comedy", { targets: "cat" });
    await game.p1.pass();
    await game.p2.pass();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("cat").might).toBe(5);
  });

  test("'give ME' — with other units on the board the trigger must resolve onto the Feline with no target prompt, and pump nothing else", async () => {
    // Expected: Awaken trigger resolves by itself; cat 7, ally 1, foe 3, and P1 is simply in the main
    // phase. Actual: settle() stalls on "Choose a target for Fretful Feline" offering cat/ally/foe.
    const game = await beforeMyTurn()
      .unit(P1, "base", { might: 1, name: "Ally" }, "ally", { exhausted: true })
      .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("cat").might).toBe(7);
    expect(game.state("ally").might).toBe(1);
    expect(game.state("foe").might).toBe(3);
  });

  test("combat on my turn: the awakened 7-Might Feline kills a 6-Might defender and survives (6 < 7); a Feline that started the turn ready (5) dies to the same wall", async () => {
    const game = await beforeMyTurn().unit(P2, "bf2", { might: 6, name: "Wall" }, "wall").build();
    await game.p2.endTurn();
    await settleCat(game);
    expect(game.state("cat").might).toBe(7);
    await game.p1.move("cat", "bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("cat")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);

    const control = await beforeMyTurn({ exhausted: false }).unit(P2, "bf2", { might: 6, name: "Wall" }, "wall").build();
    await control.p2.endTurn();
    await settleCat(control);
    expect(control.state("cat").might).toBe(5);
    await control.p1.move("cat", "bf2");
    await control.settle();
    expect(control.zoneOf("cat")).toBe("trash");
    expect(control.zoneOf("wall")).toBe("battlefield-bf2");
  });

  test("defending next turn it is a plain 5: after my 7-Might turn passes, a 5-Might attacker trades with it", async () => {
    const game = await beforeMyTurn({ at: "bf1" }).unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await game.p2.endTurn();
    await settleCat(game);
    expect(game.state("cat")).toMatchObject({ location: "bf1", might: 7 });
    await game.advanceTurn(); // → P2
    expect(game.state("cat").might).toBe(5);
    await game.p2.move("raider", "bf1");
    expect(game.state("cat")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("cat")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("partner — Pirate's Haven: the same Awaken readying fires both triggers → 5 + 2 + 1 = 8 this turn", async () => {
    const game = await beforeMyTurn().gear(P1, HAVEN, "haven").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.triggered).map((i) => i.cardId).sort()).toEqual(["cat", "haven"]);
    await settleCat(game);
    expect(game.state("cat").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("cat").might).toBe(5);
  });
});
