/**
 * Ruling 921afe5ec4eacf8b — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · [6] · 5 Might
 *   "When you play me, opponents can't play cards this turn."
 *   × Gust (OGN-169 → ogn-169-298) · [1][chaos] [Reaction] "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand" — the card the opponent wants to flip.
 *
 * Q: Can the opponent react with cards from hand while Brynhir's ability is resolving, and does it chain?
 * A: Yes — Brynhir's ability is a TRIGGER, so it sits on the chain and the opponent gets a normal window to
 *    respond before it takes effect. Once it has resolved, the lock is on: no more cards from their hand
 *    this turn, not even in a showdown. Whatever they already put on the chain still resolves.
 * Rules: 383.3 (triggered abilities use the chain and can be responded to), 340.1 (LIFO), 337.4 (priority
 *        while the chain is live), 806.1.b / 813 (Action and Reaction permissions do not beat a restriction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const GUST = "ogn-169-298";

/** P1's turn: [7][fury] for Brynhir; P2 has a 2-Might Pawn at their bf1 and Gust with [1][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BRYNHIR, "bryn")
    .hand(P2, GUST, "gust");
}

/** Play Brynhir and stop with the trigger still on the chain, priority with P2. */
async function triggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("bryn");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bryn", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 921afe5ec4eacf8b — Brynhir's lock is a trigger: the opponent gets one window, and only one", () => {
  test("while the trigger is on the chain the opponent may still play from hand — the lock has not taken effect yet", async () => {
    const game = await triggerOnChain();
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("the opponent's Reaction lands ON TOP of the trigger and resolves first; the trigger then resolves under it", async () => {
    const game = await triggerOnChain();
    await game.p2.cast("gust", { targets: "pawn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bryn", "gust"]);
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("hand"); // the Gust did its work
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bryn")).toBe("base");
  });

  test("once the trigger has resolved the opponent can play nothing from hand — the Gust they saved is dead in their hand", async () => {
    const game = await triggerOnChain();
    await game.p2.passPriority(); // decline the window
    await game.settle();
    expect(game.p2.energy()).toBe(1); // they could pay for it …
    expect(game.p2.can("cast", "gust")).toBe(false); // … but they may not play cards this turn
    expect((await game.p2.try((p) => p.cast("gust", { targets: "pawn" }))).ok).toBe(false);
  });

  test("and a showdown does not reopen the door: with Focus in the showdown the opponent still cannot play an Action or a Reaction from hand", async () => {
    const game = await triggerOnChain();
    await game.p2.passPriority();
    await game.settle();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).filter((v) => v === "cast" || v === "play")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
