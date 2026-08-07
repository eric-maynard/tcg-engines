/**
 * Hwei, Brooding Painter — unl-080-219 · Champion Unit (Hwei) · Mind · 5 energy + [mind] · 5 Might
 *
 *   When I move, draw 1, then discard 1. Then, do the following based on the discarded
 *   card's type: Spell — Draw 1. Gear — Ready up to 2 runes. Unit — Give me +3 [Might] this turn.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. Order matters: DRAW first, THEN discard — with an empty hand the freshly drawn card is the
 *     only (forced) discard, and its type still drives the branch.
 *  2. The branch is dictated by the discarded card's TYPE — it is not a mode the player picks
 *     (discarding a unit can never draw a card; discarding a spell never pumps Hwei).
 *  3. Gear branch is "up to 2": with 3 exhausted runes exactly 2 ready; with none exhausted it
 *     does nothing and must not error. Partner: discarding Scrapheap (gear, "when discarded,
 *     draw 1") gives BOTH the rune ready and Scrapheap's own draw.
 *  4. Unit branch "+3 this turn" expires at end of turn (advanceTurn) — Hwei back to 5.
 *  5. "When I move" = any move of Hwei (to a battlefield, battlefield → base), on the chain as a
 *     triggered item; another unit moving, or Hwei being PLAYED, does not trigger it.
 *  6. Cost: 5 energy AND 1 mind power — energy alone is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-080-219";
const UNIT_CARD = "ogn-175-298"; // Shipyard Skulker — vanilla unit
const SPELL_CARD = "ogn-058-298"; // Discipline — spell
const GEAR_CARD = "ogn-017-298"; // Iron Ballista — gear with no discard trigger
const SCRAPHEAP = "ogn-182-298"; // gear: When this is played, discarded, or killed, draw 1.

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "hwei")
    .deck(P1, [UNIT_CARD, UNIT_CARD, UNIT_CARD], ["top", "second", "third"]);
}

/** Move Hwei, let the trigger resolve, discard `toDiscard` when asked. */
async function moveAndDiscard(game: Game, toDiscard: string): Promise<void> {
  await game.p1.move("hwei", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hwei", controller: P1, triggered: true })]);
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === toDiscard)) {
    await game.p1.pick(toDiscard);
    await game.settle();
  }
}

describe("Hwei, Brooding Painter (unl-080-219)", () => {
  test("parsed ability: a self-move trigger whose sequence starts draw 1 → discard 1; card costs 5 + [mind], 5 Might champion", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, isChampion: true, might: 5, powerCost: ["mind"], tags: ["Hwei"] });
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; trigger: unknown; effect: { type: string; effects: { type: string; amount?: number }[] } };
    expect(ab).toMatchObject({ trigger: { event: "move", on: "self" }, type: "triggered" });
    expect(ab.effect.type).toBe("sequence");
    expect(ab.effect.effects.slice(0, 2)).toEqual([
      { amount: 1, type: "draw" },
      { amount: 1, type: "discard" },
    ]);
    expect(ab.effect.effects).toHaveLength(3);
  });

  test("the third step should branch on the discarded card's type (conditional), not be a free player `choice` of Spell/Gear/Unit", async () => {
    // Expected: an effect keyed on the discarded card's type (e.g. conditional / switch on card type).
    // Actual: { type: "choice", options: [Spell, Gear, Unit] } — the player may pick any branch.
    const pool = await loadDefaultCardPool();
    const third = (pool.get(CARD)?.abilities?.[0] as { effect: { effects: { type: string }[] } }).effect.effects[2];
    expect(third?.type).not.toBe("choice");
  });

  test("cost: 5 energy + 1 mind power; enters the base without triggering (playing is not moving); energy alone is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).deckTop(P1, UNIT_CARD, "top").hand(P1, CARD, "hwei").build();
    await game.p1.play("hwei");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("hwei")).toBe("base");
    expect(game.state("hwei").might).toBe(5);
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("top")).toBe("mainDeck");
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "hwei").build();
    expect(noPower.p1.can("play", "hwei")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "hwei").build();
    expect(noEnergy.p1.can("play", "hwei")).toBe(false);
  });

  test("moving triggers: draw 1 FIRST, then discard 1 — with an empty hand the drawn card is the forced discard", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toEqual([]);
    await moveAndDiscard(game, "top");
    expect(game.locationOf("hwei")).toBe("bf1");
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.zoneOf("second")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual([]);
  });

  test("with cards in hand YOU choose the discard from hand ∪ drawn card; the rest stay", async () => {
    const game = await board().hand(P1, SPELL_CARD, "keep").hand(P1, UNIT_CARD, "junk").build();
    await game.p1.move("hwei", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key);
    expect(offered.sort()).toEqual(["junk", "keep", "top"]);
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.zoneOf("top")).toBe("hand");
  });

  test("Unit branch — discarding a unit gives Hwei +3 Might this turn automatically (8), and it wears off next turn", async () => {
    // Expected: discard Skulker (unit) → Hwei 8 Might with no further prompt; after advanceTurn → 5.
    // Actual: the engine asks the player to choose Spell/Gear/Unit instead of reading the discarded type.
    const game = await board().build();
    await moveAndDiscard(game, "top");
    expect(game.decision()?.kind).toBe("action"); // nothing left to answer
    expect(game.state("hwei").might).toBe(8);
    expect(game.p1.hand()).toEqual([]); // a unit discard never draws
    await game.advanceTurn();
    expect(game.state("hwei").might).toBe(5);
  });

  test("Spell branch — discarding a spell draws 1 more automatically (net hand: kept the drawn card + 1)", async () => {
    // Expected: hand [disc] → draw top → discard disc (spell) → draw second ⇒ hand = [top, second], Hwei stays 5.
    // Actual: a Spell/Gear/Unit mode prompt is raised instead.
    const game = await board().hand(P1, SPELL_CARD, "disc").build();
    await moveAndDiscard(game, "disc");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["second", "top"]);
    expect(game.state("hwei").might).toBe(5);
  });

  test("Gear branch — discarding a gear readies up to 2 of 3 exhausted runes automatically (no draw, no Might)", async () => {
    // Expected: exactly 2 runes become ready (up to 2), hand = [top], Hwei 5.
    // Actual: a Spell/Gear/Unit mode prompt is raised instead.
    const game = await board()
      .hand(P1, GEAR_CARD, "ballista")
      .rune(P1, "mind", { alias: "r1", exhausted: true })
      .rune(P1, "mind", { alias: "r2", exhausted: true })
      .rune(P1, "mind", { alias: "r3", exhausted: true })
      .build();
    await moveAndDiscard(game, "ballista");
    // "up to 2" may legitimately ask WHICH runes — answer with two of them if so.
    const d = game.decision();
    if (d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "r1")) {
      await game.p1.pick("r1", "r2");
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.state("hwei").might).toBe(5);
  });

  test("partner — discarding Scrapheap (gear) fires BOTH Scrapheap's 'when discarded, draw 1' and the Gear rune-ready branch", async () => {
    // Expected: hand [scrap] → draw top → discard scrap → Scrapheap trigger draws second AND 2 runes ready.
    // Actual: blocked on the Spell/Gear/Unit mode prompt.
    const game = await board()
      .hand(P1, SCRAPHEAP, "scrap")
      .rune(P1, "mind", { alias: "r1", exhausted: true })
      .rune(P1, "mind", { alias: "r2", exhausted: true })
      .build();
    await moveAndDiscard(game, "scrap");
    const d = game.decision();
    if (d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "r1")) {
      await game.p1.pick("r1", "r2");
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("scrap")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["second", "top"]);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("'When I move' also fires on a move from a battlefield back to base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "hwei")
      .deck(P1, [UNIT_CARD, UNIT_CARD], ["top", "second"])
      .build();
    await game.p1.move("hwei", "base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hwei", triggered: true })]);
    await game.settle(); // empty hand: the drawn "top" is the forced discard (settle takes forced picks)
    expect(game.locationOf("hwei")).toBe("base");
    expect(game.zoneOf("top")).toBe("trash");
  });

  test("only Hwei's own moves: another friendly unit moving (Hwei stays home) triggers nothing", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Runner" }, "runner").build();
    await game.p1.move("runner", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("hwei").might).toBe(5);
  });

  test("moving Hwei together with another unit triggers exactly once", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p1.move(["hwei", "buddy"], "bf1");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "hwei", triggered: true });
  });
});
