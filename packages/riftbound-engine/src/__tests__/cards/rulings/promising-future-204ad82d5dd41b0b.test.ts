/**
 * Ruling 204ad82d5dd41b0b — Promising Future (OGN-115 → ogn-115-298) · [5][mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Stupefy (ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *
 * Q: In what order do the chosen cards resolve, and can the earlier one see the later one?
 * A: The banished cards are played FIFO starting with the player after the turn player, so on P1's turn P2's
 *    card is finalized first and P1's second. A unit finalizes and ENTERS the board straight away, while a
 *    spell finalizes (choosing its targets at that moment) and then resolves through the chain — so a spell
 *    that finalizes first cannot choose a unit that only arrives afterwards.
 * Rules: 337.1.b (banishing is a public first pass; each card is finalized when it is played),
 *        355.5/355.8 (targets are chosen at finalization from what exists then), 339 (permanents enter at once),
 *        340.1 (LIFO resolution of what is left on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const STUPEFY = "ogn-095-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Filler ${n}` });

/**
 * P1's turn with exactly [5][mind]. P1's top 5 hold a 7-Might Champion-to-be; P2's top 5 hold Stupefy. P2's
 * 9-Might Wall at bf1 is the only unit on the board when the play pass starts.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .deck(P1, [{ cardType: "unit", energyCost: 3, might: 7, name: "Newcomer" }, U(2), U(3), U(4), U(5), U(6)], ["newcomer", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [STUPEFY, U(2), U(3), U(4), U(5), U(6)], ["stupefy", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const keysOf = (d: Decision | null) => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Cast Promising Future; P1 banishes the Newcomer (a unit), P2 banishes Stupefy (a spell). */
async function bothBanish(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf", { answers: [] });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  expect(keysOf(game.decision())).toContain("newcomer");
  await game.p1.pick("newcomer");
  expect(game.zoneOf("newcomer")).toBe("banishment"); // the first pass is public and finished before P2 chooses
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("stupefy");
  return game;
}

describe("Ruling 204ad82d5dd41b0b — Promising Future plays the banished cards FIFO, starting with the player after the turn player", () => {
  test("the banish pass is symmetric and public — P1's pick is banished before P2 is asked (asserted inside the helper) — and the other four of each are recycled", async () => {
    const game = await bothBanish();
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.p1.deck().slice(-4).toSorted()).toEqual(["a2", "a3", "a4", "a5"]);
  });

  test("P2's Stupefy is played FIRST (it can only choose from what exists then: the Wall) and P1's unit enters the board during the same pass", async () => {
    const game = await bothBanish();
    await game.settle();
    expect(game.chain()).toEqual([]);
    // The spell resolved on its only possible choice — the Wall, the sole unit at the time it finalized.
    expect(game.state("wall").might).toBe(8); // 9 - 1
    expect(game.zoneOf("stupefy")).toBe("trash");
    // The unit was played free of Energy and is on the board, untouched by the earlier spell.
    expect(game.zoneOf("newcomer")).toBe("base");
    expect(game.state("newcomer").might).toBe(7);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Energy costs are ignored on both sides: P1 spent only Promising Future's own [5][mind] and P2 spent nothing", async () => {
    const game = await bothBanish();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p2.energy()).toBe(0);
  });
});
