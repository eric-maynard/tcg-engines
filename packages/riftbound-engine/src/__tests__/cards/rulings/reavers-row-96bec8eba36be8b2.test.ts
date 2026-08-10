/**
 * Ruling 96bec8eba36be8b2 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Gust (ogn-169-298, Reaction) / Rebuke (ogn-172-298, Action) as the opponent's responses.
 *
 * Q: Does Reaver's Row trigger at the start of a showdown or at the end?
 * A: At the START: it is a "when I defend" trigger placed on the initial chain when the showdown begins; its target is
 *    declared as it goes on that chain; players may respond with Reactions but not Actions until the initial chain has
 *    resolved; the chain resolves LIFO. [It also puts the move-or-not decision at resolution — RULING-CONFLICT below.]
 * Rules: 383.4.f (defend triggers), 383.3.a–b / 402.2 (finalization choices), 336/343 (closed state: Reactions only),
 *        346.1/347 (Focus after the initial chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const GUST = "ogn-169-298"; // Reaction [1]: return a unit at a battlefield with 3 Might or less to hand
const REBUKE = "ogn-172-298"; // Action [2][chaos][chaos]: return a unit at a battlefield to hand

/** P2's turn with [3] + 2 chaos, Gust and Rebuke in hand. P1 holds the live Row with Big (3) and Small (2). P2's Raider (5) attacks. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .hand(P2, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Attack; P1 opts in targeting Small; P1 passes → P2 holds priority on the initial chain. */
async function initialChainP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  await game.p1.yes();
  await game.p1.pick("small");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 96bec8eba36be8b2 — Reaver's Row triggers at the START of the showdown, on the initial chain", () => {
  test("the moment the showdown begins (before any Focus action, damage or 'end'), the defend trigger is pending for P1: opt-in then target, and the item lands on the initial chain naming Small", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").damage).toBe(0); // nowhere near the end of the showdown
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true })]);
  });

  test("while it is on the initial chain the opponent may add a REACTION (Gust) but not an ACTION (Rebuke)", async () => {
    const game = await initialChainP2Priority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "rebuke")).toBe(false);
    await game.p2.cast("gust", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
  });

  test("LIFO: Gust (added last) resolves first and bounces Big; then the Row resolves and moves Small home; only then does the attacker get Focus and Action-speed Rebuke becomes playable", async () => {
    const game = await initialChainP2Priority();
    await game.p2.cast("gust", { targets: "big" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("small")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.p2.can("cast", "rebuke")).toBe(true); // Action timing is open now (the Raider itself is "a unit at a battlefield")
    expect(game.p2.legal().map((o) => o.verb)).toContain("passFocus");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 96bec8eba36be8b2 says "when the Reaver's Row ability resolves, you choose whether to move
  // the targeted unit" (the may at RESOLUTION). CR 383.3.a / 383.3.a.1 say the leading "you may" is the opt-in made at
  // FINALIZATION and is solely whether to perform the ability; 383.3.a.2 declining removes the item — engine follows CR.
  test("CR 383.3.a (contra the ruling's step 3/5): no move-or-not question at resolution — unopposed, both pass and Small is simply moved", async () => {
    const game = await initialChainP2Priority();
    await game.p2.passPriority(); // both passed → resolves
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // straight to Focus, no yes/no
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(game.p2.can("cast", "rebuke")).toBe(true); // Action timing now open (Big is a legal Rebuke target)
  });
});
