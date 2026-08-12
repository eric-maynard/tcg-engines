/**
 * Ruling 4e9e695fde247c54 — Hidden Blade (OGN-213 → ogn-213-298) · [Action] · [2][order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · [1]
 *
 * Q: I attack, my opponent plays Hidden Blade. After I pass priority, can they play another card?
 * A: Yes — nothing moves on until BOTH players pass in a row. A player may also add several reactions to a
 *    chain back to back before passing. What they cannot do is respond to their own card after passing it to
 *    you and receiving your pass back: two consecutive passes resolve the topmost item.
 * Rules: 330–340 (priority alternates; a chain item resolves only after consecutive passes), 340.1 (LIFO),
 *        340.4 (priority is reseated after a resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const STUPEFY = "ogn-095-298";

/** P1's turn. P1 attacks bf1 with two Raiders; P2 holds it with two Guards and has Blade + two Stupefies. */
function board() {
  return scenario()
    .resources(P2, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard A" }, "guardA")
    .unit(P2, "bf1", { might: 3, name: "Guard B" }, "guardB")
    .unit(P1, "base", { might: 4, name: "Raider 1" }, "r1")
    .unit(P1, "base", { might: 4, name: "Raider 2" }, "r2")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P2, STUPEFY, "stupefy1")
    .hand(P2, STUPEFY, "stupefy2");
}

/** P1 attacks and passes Focus; P2 answers with Hidden Blade on Raider 1. */
async function bladePlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["r1", "r2"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("cast", "blade")).toBe(true);
  await game.p2.cast("blade", { targets: "r1" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  return game;
}

describe("Ruling 4e9e695fde247c54 — a chain only moves on after two consecutive passes", () => {
  test("a player may add several cards to a chain back to back before passing", async () => {
    const game = await bladePlayed();
    expect(game.actingSeat()).toBe(P2); // the caster keeps priority
    await game.p2.cast("stupefy1", { targets: "r2" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "stupefy1"]);
    expect(game.actingSeat()).toBe(P2);
  });

  test("once P2 passes, P1 holds priority and nothing has resolved yet", async () => {
    const game = await bladePlayed();
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.zoneOf("r1")).toBe("battlefield-bf1");
  });

  test("nuance: P1 passing back is the SECOND consecutive pass, so Hidden Blade resolves — P2 does not get to answer their own card first", async () => {
    const game = await bladePlayed();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // "Its controller draws 2"
  });

  test("ruling: once the chain has emptied the other player acts first, and P2 may play another card as soon as they pass", async () => {
    const game = await bladePlayed();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade resolves
    expect(game.actingSeat()).toBe(P1); // priority/Focus goes back to the other player
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "stupefy1")).toBe(true);
    await game.p2.cast("stupefy1", { targets: "r2" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy1"]);
    // …and once that one resolves the same dance can start again.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("r2").mightModifier).toBe(-1);
    await game.p1.passFocus();
    expect(game.p2.can("cast", "stupefy2")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the showdown only closes once BOTH players pass Focus with an empty chain", async () => {
    const game = await bladePlayed();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
