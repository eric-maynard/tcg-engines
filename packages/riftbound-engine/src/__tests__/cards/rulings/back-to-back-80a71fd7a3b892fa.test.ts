/**
 * Ruling 80a71fd7a3b892fa — Back to Back (OGN-206 → ogn-206-298) · Reaction · [3]
 *   "Give two friendly units each +2 [Might] this turn."
 *
 * Q: During a showdown, what can be played, how does priority work, and is there a window after damage?
 * A: Only [Action] and [Reaction] cards — never a base-speed spell. The Focus holder may start a chain;
 *    the opponent may answer it with [Reaction]s; the chain resolves, Focus alternates, and once both
 *    players pass consecutively damage is dealt and the showdown ends with no further window.
 * Rules: 347 (Action/Reaction speed in showdowns), 340 (priority + LIFO), 348 (two consecutive Focus passes
 *        end the showdown), 465.2 (combat damage step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_TO_BACK = "ogn-206-298"; // [Reaction]
const RIDE_THE_WIND = "ogn-173-298"; // [Action]
const CHARM = "ogn-043-298"; // base speed

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).at(-1);

/** P1's turn. P1 attacks P2's bf1 with two units and holds one card of each speed; P2 holds the same. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 1, chaos: 1 } })
    .resources(P2, { energy: 6, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .unit(P1, "base", { might: 2, name: "Striker" }, "striker")
    .unit(P1, "base", { might: 2, name: "Partner" }, "partner")
    .hand(P1, BACK_TO_BACK, "btb")
    .hand(P1, RIDE_THE_WIND, "rtwP1")
    .hand(P1, CHARM, "charmP1")
    .hand(P2, BACK_TO_BACK, "btb2")
    .hand(P2, RIDE_THE_WIND, "rtwP2")
    .hand(P2, CHARM, "charmP2");
}

describe("Ruling 80a71fd7a3b892fa — what may be played in a showdown, and the window that does not exist after damage", () => {
  test("with Focus, the active player may play [Action] and [Reaction] cards but NOT a base-speed spell", async () => {
    const game = await board().build();
    await game.p1.move(["striker", "partner"], "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
    expect(game.p1.can("cast", "btb")).toBe(true); // [Reaction]
    expect(game.p1.can("cast", "rtwP1")).toBe(true); // [Action]
    expect(game.p1.can("cast", "charmP1")).toBe(false); // base speed
  });

  test("with a chain running the opponent may answer with a [Reaction] only — an [Action] needs an open state", async () => {
    const game = await board().build();
    await game.p1.move(["striker", "partner"], "bf1");
    await game.p1.cast("btb", { targets: ["striker", "partner"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "btb2")).toBe(true); // [Reaction] in response
    expect(game.p2.can("cast", "rtwP2")).toBe(false); // no [Action] into a closed state
    expect(game.p2.can("cast", "charmP2")).toBe(false);
  });

  test("once the chain has resolved Focus alternates and the opponent may then play the same kinds of card the active player just did", async () => {
    const game = await board().build();
    await game.p1.move(["striker", "partner"], "bf1");
    await game.p1.cast("btb", { targets: ["striker", "partner"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Back to Back resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("striker").might).toBe(4);
    expect(game.state("partner").might).toBe(4);

    // Resolving the chain hands the showdown back with Focus on the other side.
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtwP2")).toBe(true); // now an [Action] IS legal for the Focus holder
    expect(game.p2.can("cast", "charmP2")).toBe(false); // base speed never is
  });

  test("both pass consecutively → damage is dealt and the showdown ends: the next decision is the open main phase, not another window", async () => {
    const game = await board().build();
    await game.p1.move(["striker", "partner"], "bf1");
    await game.p1.cast("btb", { targets: ["striker", "partner"] });
    await game.settle();

    // 4 + 4 = 8 into a 6-Might Guard; the Guard's 6 is assigned across the attackers.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
