/**
 * Ruling d35ffed5637e625c — Stacked Deck (OGN-183 → ogn-183-298) · Action · Chaos · 1
 *     "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Consult the Past (OGN-083 → ogn-083-298) · Reaction · Mind · 4 · "[Hidden] [Reaction] Draw 2."
 *
 * Q: Playing Stacked Deck in response to a chain — do you get to draw and use the drawn card in that same chain?
 * A: Stacked Deck is an [Action]; it cannot be played onto an existing chain at all. With a REACTION draw spell (Consult the
 *    Past) you can: it resolves first (LIFO, one item at a time, priority passing again after each resolution), and a
 *    Reaction you drew can then be played onto the same chain before the original item resolves.
 * Rules: 806 (Action timing), 807 (Reaction timing), 336–340 (chain: LIFO, one item resolves, then priority again).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const CONSULT_THE_PAST = "ogn-083-298";
const DISCIPLINE = "ogn-058-298"; // Reaction [2]: "Give a unit +2 [Might] this turn. Draw 1." — the Reaction P1 will draw
const FILLER = "ogn-175-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
} as const;

/**
 * P2's turn; P2 Bolts (3) P1's 2-Might Squire. P1 holds Stacked Deck AND Consult the Past with [7] (enough for everything);
 * P1's deck, top first: Discipline, then fillers.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 7 })
    .resources(P2, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, STACKED_DECK, "stacked")
    .hand(P1, CONSULT_THE_PAST, "consult")
    .deck(P1, [DISCIPLINE, FILLER, FILLER, FILLER], ["disc", "f1", "f2", "f3"])
    .hand(P2, BOLT, "bolt");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** P2 casts Bolt at the Squire and passes; P1 holds priority with [bolt] on the chain. */
async function boltPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "squire" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(chainIds(game)).toEqual(["bolt"]);
  return game;
}

describe("Ruling d35ffed5637e625c — Stacked Deck (Action) can't answer a chain; a Reaction draw can, and the drawn Reaction is usable in the same chain", () => {
  test("Stacked Deck is NOT legal in response to Bolt (Action timing), even though P1 can afford it; Consult the Past (Reaction) is", async () => {
    const game = await boltPending();
    expect(game.p1.can("cast", "stacked")).toBe(false);
    const r = await game.p1.try((p) => p.cast("stacked"));
    expect(r.ok).toBe(false);
    expect(chainIds(game)).toEqual(["bolt"]);
    expect(game.p1.can("cast", "consult")).toBe(true);
  });

  test("Consult the Past goes on top and resolves FIRST when both pass — P1 draws Discipline + f1 while Bolt is still waiting", async () => {
    const game = await boltPending();
    await game.p1.cast("consult");
    expect(game.p1.energy()).toBe(3);
    expect(chainIds(game)).toEqual(["bolt", "consult"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // only the TOP item resolves
    expect(game.zoneOf("consult")).toBe("trash");
    expect(new Set(game.p1.hand())).toEqual(new Set(["stacked", "disc", "f1"]));
    expect(chainIds(game)).toEqual(["bolt"]); // not the whole chain
    expect(game.state("squire").damage).toBe(0);
  });

  test("priority comes round again before Bolt resolves, and the freshly drawn Discipline (a Reaction) can be played onto the SAME chain: Squire 2→4 survives the 3", async () => {
    const game = await boltPending();
    await game.p1.cast("consult");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves
    // Whoever holds priority now, P1 gets a window before Bolt can resolve.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.can("cast", "stacked")).toBe(false); // still an Action, still no
    await game.p1.cast("disc", { targets: "squire" });
    expect(chainIds(game)).toEqual(["bolt", "disc"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    expect(game.p1.hand()).toContain("f2"); // Discipline's own draw
    expect(game.p1.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: on P1's own turn in an open state Stacked Deck is perfectly legal (it is only the chain that forbids it)", async () => {
    const game = await board().active(P1).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "stacked")).toBe(true);
  });
});
