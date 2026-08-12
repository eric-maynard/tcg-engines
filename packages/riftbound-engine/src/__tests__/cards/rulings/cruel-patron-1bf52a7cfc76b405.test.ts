/**
 * Ruling 1bf52a7cfc76b405 — Cruel Patron (OGN-208 → ogn-208-298) · 6 Might · [4]
 *     "As an additional cost to play me, kill a friendly unit."
 *   × Baited Hook (OGN-242 → ogn-242-298) · Gear
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish
 *      a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its
 *      cost. Then recycle the rest."
 *
 * Q: Can Cruel Patron be played off a Baited Hook reveal when you have no unit left to sacrifice?
 * A: No — the additional cost still has to be paid, and there is nothing to kill (the Hook's own cost ate
 *    your last unit). You may still choose to BANISH it; it then simply stays banished, unplayed.
 * Rules: 357.1 (additional costs are part of the cost), 419.2.a ("play it" needs a payable play),
 *        601.3.e ("ignoring its cost" waives the printed cost, not an additional cost).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

type PickD = Extract<Decision, { kind: "pick" }>;

const CRUEL_PATRON = "ogn-208-298";
const BAITED_HOOK = "ogn-242-298";
const FILLER = "ogn-046-298"; // En Garde — a spell, so never a Hook candidate

/** P1's main phase with the Hook ready, exactly ONE friendly unit (5 Might) and Cruel Patron on top of the deck. */
function hookBoard() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 5, name: "Fodder" }, "fodder")
    .deck(P1, [CRUEL_PATRON, FILLER, FILLER, FILLER, FILLER], ["patron", "f1", "f2", "f3", "f4"]);
}

/** Fire the Hook: its cost kills the only friendly unit, then the look offers Cruel Patron. */
async function hookFired(): Promise<Game> {
  const game = await hookBoard().build();
  await game.p1.activate("hook");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("fodder")).toBe("trash");
  expect(game.p1.units()).toEqual([]); // nothing left to pay Cruel Patron's additional cost with
  return game;
}

describe("Ruling 1bf52a7cfc76b405 — Cruel Patron's additional cost must still be paid off a Baited Hook", () => {
  test("baseline: with no friendly unit, Cruel Patron cannot be played from hand at all", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CRUEL_PATRON, "patron").build();
    expect(game.p1.can("play", "patron")).toBe(false);
    const res = await game.p1.try((p) => p.play("patron"));
    expect(res.ok).toBe(false);
    expect(game.zoneOf("patron")).toBe("hand");
  });

  test("baseline: with a friendly unit the play is legal and the additional cost kills it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(game.p1.can("play", "patron")).toBe(true);
    await game.p1.play("patron", { sacrifice: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
  });

  test("ruling nuance: the Hook still lets you CHOOSE to banish Cruel Patron", async () => {
    const game = await hookFired();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
    expect((d as PickD).options.map((o) => o.card ?? o.key)).toEqual(["patron"]);
  });

  test("ruling: choosing it banishes it but it is NOT played — the unpayable additional cost stops the play", async () => {
    const game = await hookFired();
    await game.p1.pick("patron");
    await game.settle();
    expect(game.zoneOf("patron")).toBe("banishment"); // banished and left there
    expect(game.p1.units()).toEqual([]); // it never entered the board
    expect(game.violations()).toEqual([]);
  });

  test("declining instead recycles it with the rest — it goes back into the deck", async () => {
    const game = await hookFired();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("patron")).toBe("mainDeck");
  });
});
