/**
 * Ruling 4c822d20d4ddbe08 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ Rebuke ogn-172-298 · ACTION · "Return a unit at a battlefield to its owner's hand." as the action-speed probe.)
 *
 * Q: When can Reaver's Row's "When defending" effect be used, and how does it interact with showdown timing / reactions?
 * A: It is a defend trigger placed on the INITIAL chain of the combat showdown. Players may respond with Reactions (not
 *    Actions) and those resolve before the Row's effect; e.g. the attacker may Gust their own unit back to hand before
 *    the defender's unit is moved. Only after the initial chain resolves (empty chain) can the attacker play Actions.
 * Rules: 383.4.f (defend triggers), 336–343 (closed state: Reactions only; LIFO), 347.1 (Focus once the chain empties).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const GUST = "ogn-169-298";
const REBUKE = "ogn-172-298";

/**
 * P2's turn. P1 holds Reaver's Row (live) with Big (4) and Small (2). P2's Scout (3 — Gust-able) attacks from base;
 * P2 holds Gust + Rebuke with exactly [3] + chaos×2.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 4, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P2, GUST, "gust")
    .hand(P2, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout attacks the Row; P1 opts in and names Small; P1 passes → P2 holds priority with the Row item pending. */
async function rowPendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1 });
  // The trigger "activates" right here, on the initial chain: opt-in, then its object, both P1's decisions.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["big", "small"]);
  await game.p1.pick("small");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 4c822d20d4ddbe08 — Reaver's Row lives on the showdown's initial chain: reactions yes, actions only afterwards", () => {
  test("with the Row item pending, the attacker may play a REACTION (Gust) but not an ACTION (Rebuke)", async () => {
    const game = await rowPendingP2Priority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "rebuke")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rebuke", { targets: "big" }));
    expect(r.ok).toBe(false);
    expect(game.locationOf("small")).toBe("row"); // nothing has moved yet
  });

  test("the attacker Gusts their OWN Scout in response: Gust resolves first (Scout → P2's hand) and only then does the Row resolve, moving Small to base", async () => {
    const game = await rowPendingP2Priority();
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust (top) resolves
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.locationOf("small")).toBe("row"); // Row not yet resolved
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    // Now the Row resolves.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    await game.settle();
    expect(game.gameState.battlefields.row?.controller).toBe(P1); // no attacker left — P1 keeps the Row
    expect(game.violations()).toEqual([]);
  });

  test("no responses: both pass → the Row resolves (Small to base); the initial chain is now empty, the ATTACKER gets Focus and an Action (Rebuke) becomes playable", async () => {
    const game = await rowPendingP2Priority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    await game.p2.cast("rebuke", { targets: "big" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", targets: ["big"] })]);
  });
});
