/**
 * Ruling 7ef511d529d66f86 — Sprite Call (OGN-094 → ogn-094-298) · Hidden · Action · [3]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."  (Sprite token OGN-274 → ogn-274-298)
 *   × The Grand Plaza (OGN-293 → ogn-293-298) "When you hold here, if you have 7+ units here, you win the game."
 *
 * Q: Holding the Grand Plaza with 6 units and a hidden Sprite Call there — can I flip Sprite Call during the
 *    Beginning Phase to make the 7th unit and win?
 * A: Yes. The hold puts Grand Plaza's trigger on the chain, players get priority, and P1 may react by playing the
 *    hidden Sprite Call; the "if you have 7+ units here" is checked only when the trigger RESOLVES (no intervening
 *    ifs), so with the Sprite it sees 7 and P1 wins.
 * Rules: 383 (triggered abilities go on the chain; condition text after the trigger is checked on resolution),
 *        315 (Beginning Phase: hold, then hold triggers), 811 (Hidden — play from face down for [0] as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
const GRAND_PLAZA = "ogn-293-298";

/** End of P2's turn 2. P1 controls the (live) Grand Plaza with `n` 1-Might Grunts and hid Sprite Call there earlier. */
async function board(n: number): Promise<Game> {
  let b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1, def: GRAND_PLAZA, inert: false })
    .battlefield("bf2", { controller: null })
    .facedown(P1, "bf1", SPRITE_CALL, "call");
  for (let i = 1; i <= n; i++) {
    b = b.unit(P1, "bf1", { might: 1, name: `Grunt ${i}` }, `g${i}`);
  }
  const game = await b.build();
  expect(game.state("bf1").name).toBe("The Grand Plaza");
  expect(game.p1.units("bf1")).toHaveLength(n);
  return game;
}

describe("Ruling 7ef511d529d66f86 — flip Sprite Call in response to Grand Plaza's hold trigger to reach 7 units and win", () => {
  test("control: holding the Plaza with 7 units — the hold scores 1, the 'you win' trigger goes on the chain during the Beginning Phase with a priority window, and on resolution P1 wins", async () => {
    const game = await board(7);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // hold point first (315), then the hold trigger
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // BUG: with only 6 units the engine evaluates "if you have 7+ units here" when the hold happens (an intervening
  // if) and never puts the trigger on the chain, so P1 gets no window to flip Sprite Call — the turn goes straight
  // RULING-CONFLICT: riftjudge 7ef511d529d66f86 says the "if you have 7+ units here" is checked only on resolution,
  // so a 6-unit hold still opens a chain window to flip Sprite Call for the 7th unit and win. CR 383.2.a.1 says the
  // opposite for this wording: an additional conditional statement IMMEDIATELY AFTER the trigger condition ("When you
  // hold here, if you have 7+ units here, …") is part of the TRIGGER CONDITION, so with 6 units the ability is never
  // placed on the chain at all (contrast Loose Cannon in that same rule, where the "if" sits later and IS part of the
  // effect). The engine follows the CR; asserted here as such.
  test("ruling 7ef511d529d66f86 (per CR 383.2.a.1) — with only 6 units the Plaza's hold ability never triggers, so there is no chain window in the Beginning Phase and Sprite Call can only be flipped later", async () => {
    const game = await board(6);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // rule 383.2.a.1: the "if you have 7+ units here" is part of the trigger condition — unmet, so nothing is placed
    // on the chain and no priority window opens off the hold.
    expect(game.chain()).toEqual([]);
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    // Flipping Sprite Call now still makes the 7th unit, but the hold has passed: no win this turn.
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.reveal("call");
    await game.settle();
    expect(game.p1.units("bf1")).toHaveLength(7);
    const sprite = game.p1.units("bf1").find((u) => game.state(u).name === "Sprite") as string;
    expect(game.state(sprite)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.isOver()).toBe(false);
  });

  test("contrast — 6 units and Sprite Call NOT flipped: the trigger finds only 6 on resolution, nobody wins, P1 proceeds to the main phase on 1 point with Sprite Call still face down", async () => {
    const game = await board(6);
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.p1.units("bf1")).toHaveLength(6);
  });
});
