/**
 * Ruling 94daffd67dbd7805 — (general [Temporary] × [Hidden]; no specific card)
 *   Stand-ins: a Sprite unit token (unl-t07 · 3 Might · [Temporary] "Kill it at the start of its controller's
 *   Beginning Phase, before scoring") alone at my battlefield × Hidden Blade (OGN-213 → ogn-213-298 ·
 *   "[Hidden] … [Action] Kill a unit at a battlefield.") hidden there on an earlier turn.
 *
 * Q: My battlefield is held by a [Temporary] permanent and carries a hidden card. Can I react before it leaves
 *    at the start of my Beginning Phase?
 * A: Yes. [Temporary] is a TRIGGERED ability, so at the start of the Beginning Phase it goes on the chain and
 *    priority is granted — that is a window to play reactions, hidden cards included. Only after the chain
 *    resolves does the permanent leave.
 * Rules: 816 ([Temporary] = start-of-Beginning-Phase kill trigger), 383.3 (triggered abilities use the chain),
 *        332 / 336 (priority when an item is put on the chain), 811.6 (facedown ⇒ Reaction speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_TOKEN = "unl-t07";
const HIDDEN_BLADE = "ogn-213-298";

/** End of P2's turn 2. P1's bf1 is held by a lone [Temporary] Sprite with a Blade hidden there. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE_TOKEN, "sprite")
    .unit(P2, "bf1", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade");
}

/** P2 ends the turn → P1's Beginning Phase opens with the [Temporary] trigger on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sprite").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 94daffd67dbd7805 — the [Temporary] departure is a trigger, so there is a reaction window before it", () => {
  test("the trigger is a CHAIN ITEM and P1 holds priority; the Sprite is still on the board and bf1 still P1's", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the hidden card at that battlefield is playable in that window — it lands ABOVE the [Temporary] trigger", async () => {
    const game = await atTemporaryTrigger();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    await game.p1.pick("raider"); // its "here" target, asked at finalization
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "blade"]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // nothing has left yet
  });

  test("LIFO: the reaction resolves first (the Raider dies), and only then does the [Temporary] permanent leave", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("blade");
    await game.p1.pick("raider");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // its trigger has not resolved yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite"]);
    await game.settle();
    expect(game.has("sprite") && game.zoneOf("sprite")).not.toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("declining the window: the trigger resolves, the Sprite dies and the facedown card goes with the battlefield", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.has("sprite") && game.zoneOf("sprite")).not.toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
