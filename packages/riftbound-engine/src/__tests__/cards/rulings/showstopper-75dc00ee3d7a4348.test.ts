/**
 * Ruling 75dc00ee3d7a4348 — Showstopper (OGN-270 → ogn-270-298) · Spell · [1][rainbow] · Action
 *     "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Gust (OGN-169 → ogn-169-298) · [1] · Reaction — the opponent's answer.
 *
 * Q: How much of the travel destination must be declared before the defending player may react?
 * A: All of it. The caster declares the destination as part of playing the spell, before anyone gets priority,
 *    so the opponent reacts with full knowledge of where the unit is going.
 * Rules: 355.4 (a move destination an effect lets its controller choose is chosen as the card is played),
 *        355.16/358 (the play is finalized — targets and destination fixed — before priority passes),
 *        340 (priority only after the play is complete).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const SMOKE_SCREEN = "ogn-093-298"; // [2][mind] Reaction — "Give a unit -4 [Might] this turn, to a minimum of 1"

/** P1's turn with exactly [1][rainbow]. Two battlefields (bf1 open, bf2 P2's) so the destination is a real choice.
 *  P1's 3-Might Ally sits in base; P2 has Smoke Screen + [2][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, SHOWSTOPPER, "ss")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

describe("Ruling 75dc00ee3d7a4348 — Showstopper's destination is declared before the opponent may react", () => {
  test("ruling: the moment Showstopper is played the DESTINATION is asked of the caster — P2 is not the acting seat and has had no chance to respond", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "ally" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((game.decision()?.options ?? []).map((o) => o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect(game.locationOf("ally")).toBe("base"); // nothing has moved yet
  });

  test("only once the destination is named does priority open — and the reaction window is the one where P2 already knows the unit is heading to bf1", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "ally" });
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ss", targets: ["ally"] })]);
  });

  test("acting on that knowledge: told the Ally is coming to bf2, P2 answers with Smoke Screen on it — the response sits ABOVE Showstopper and shrinks the traveller before it ever arrives", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "ally" });
    await game.p1.pick("battlefield-bf2");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ss", "smoke"]);
    await game.settle();
    // Shrunk to the minimum 1 (+1 from Showstopper's buff) it trades with the 2-Might defender instead of beating it.
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("undisturbed, the declared destination is exactly where the buffed unit lands", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "ally" });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 4 });
  });
});
