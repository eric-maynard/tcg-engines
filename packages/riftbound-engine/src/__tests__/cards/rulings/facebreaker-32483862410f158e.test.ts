/**
 * Ruling 32483862410f158e — Facebreaker (OGN-220 → ogn-220-298) · [2] [Hidden] [Action]
 *   "Stun a friendly unit and an enemy unit at the same battlefield."
 *
 * Q: When I move into a battlefield and the showdown starts, can the designated attacker play an action
 *    card (like Facebreaker) before the opponent gets priority?
 * A: Yes. The player who opened the showdown holds Focus first, so the attacker acts first; the opponent
 *    may then respond, and the chain resolves last-in-first-out.
 *    Nuances the answer calls out: hidden cards CAN be flipped at action speed into the chain, while a
 *    plain (non-hidden) [Action] in hand cannot be played in response to another action.
 * Rules: 345 (Focus starts with the player who applied Contested), 340 (LIFO chain, priority after each
 *        resolution), 811 ([Hidden] cards are played as reactions), 151.2 ([Action] timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";

/**
 * P1's turn: Scout (3) charges P2's bf1 (2-Might Sentry). P1 holds Facebreaker + [2];
 * P2 has one Facebreaker HIDDEN at bf1 and an identical copy in hand (+[2]).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, FACEBREAKER, "fbP1")
    .hand(P2, FACEBREAKER, "fbHand")
    .facedown(P2, "bf1", FACEBREAKER, "fbHidden");
}

describe("Ruling 32483862410f158e — the attacker holds Focus first and may play an [Action] before the opponent", () => {
  test("right after the move the pending decision belongs to P1, the attacker", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fbP1")).toBe(true);
    expect(game.p2.can("cast", "fbHand")).toBe(false); // P2 does not have the window yet
  });

  test("ruling: P1 plays Facebreaker first; P2 gets priority only afterwards", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("fbP1", { targets: ["scout", "sentry"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fbP1", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("nuance: a plain [Action] in hand cannot answer another action, but P2's HIDDEN copy can be flipped into the chain", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("fbP1", { targets: ["scout", "sentry"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "fbHand")).toBe(false); // not hidden ⇒ not playable in response
    expect(game.p2.can("reveal", "fbHidden")).toBe(true);
    await game.p2.reveal("fbHidden");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fbP1", "fbHidden"]);
  });

  test("the chain resolves LIFO and both Facebreakers land: everything at bf1 ends up stunned", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("fbP1", { targets: ["scout", "sentry"] });
    await game.p1.passPriority();
    await game.p2.reveal("fbHidden");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").isStunned).toBe(true);
    expect(game.state("sentry").isStunned).toBe(true);
  });

  test("both sides stunned ⇒ no combat damage; the Sentry survives, P2 keeps bf1 and the failed attacker goes home", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("fbP1", { targets: ["scout", "sentry"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").damage).toBe(0);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
