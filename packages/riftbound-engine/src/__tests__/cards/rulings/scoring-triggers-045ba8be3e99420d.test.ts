/**
 * Ruling 045ba8be3e99420d — (general / tournament policy) illustrated with Ahri, Alluring (ogn-066-298) "When I hold, you score 1 point." and
 *   The Arena's Greatest (ogn-290-298, battlefield) "At the start of each player's first Beginning Phase, that player gains 1 point."
 *
 * Q: If a player forgets a triggered ability that awards points, are the points given back later?
 * A: No — they are ordinary TRIGGERED ABILITIES (missable), not "scoring". Only Conquering and Holding are scoring in the rules sense (a game
 *    procedure with its own error category); every other point gain is a trigger that goes on the chain and resolves like any other.
 *    The remedial policy itself is a tournament matter the engine cannot model (it never forgets a trigger); what IS engine-visible — and asserted
 *    here — is the structural distinction the ruling rests on: the Hold point is applied directly by the scoring step with no chain item, whereas
 *    Ahri's / the Arena's point is a chain item that awards nothing until it resolves (and can be responded to).
 * Rules: 468–470 (Hold / Conquer scoring), 383 (triggered abilities use the chain), 702.3.a (tournament: scoring errors ≠ missed triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI_ALLURING = "ogn-066-298";
const THE_ARENAS_GREATEST = "ogn-290-298";

describe("Ruling 045ba8be3e99420d — Hold/Conquer are 'scoring'; other point gains are triggered abilities on the chain", () => {
  test("Holding with Ahri: the HOLD point is scored at once by the scoring step (P1: 0 → 1, no chain item for it), while Ahri's 'you score 1 point' sits on the chain as a TRIGGERED item that has not paid out yet", async () => {
    const game = await scenario().turn(3).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", AHRI_ALLURING, "ahri").build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the Hold — scoring proper
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true, type: "ability" })]);
    // It is a real chain item: both players get priority over it (a window a human could 'miss'; the engine cannot).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(1); // still nothing from Ahri
    await game.p2.passPriority(); // resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(2);
    expect(game.phase()).toBe("main");
  });

  test("The Arena's Greatest: at the start of a player's first Beginning Phase its point is likewise a TRIGGERED chain item (here P2's) — 0 points until it resolves, then 1", async () => {
    const game = await scenario().turn(1).active(P1).battlefield("arena", { controller: null, def: THE_ARENAS_GREATEST, inert: false }).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P2, triggered: true })]);
    expect(game.p2.points()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Conquering is scoring proper too: the conquer point lands the moment control is established, with no triggered item involved", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle(); // non-combat showdown closes → conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });
});
