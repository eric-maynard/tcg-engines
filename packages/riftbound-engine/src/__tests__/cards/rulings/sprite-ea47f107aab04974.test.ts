/**
 * Ruling ea47f107aab04974 — Sprite (OGN-274 → ogn-274-298, the 3-Might [Temporary] unit token)
 *   × Viktor, Innovator (OGN-117 → ogn-117-298) · 3 Might · "When you play a card on an opponent's turn, play a 1 [Might] Recruit
 *     unit token in your base."
 *   × Sprite Call (ogn-094-298) · [Hidden] [Action] · "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   (the scrape also lists Gemcraft Seer OGN-100 for the "tokens are still units" nuance — not needed here)
 *
 * Q: Does unhiding Sprite's Call as a defender trigger Viktor, Innovator?
 * A: Playing Sprite Call from hidden IS playing a card on the opponent's turn → Viktor makes one Recruit. The Sprite TOKEN it
 *    creates is not a card, so it does NOT trigger Viktor a second time.
 * Rules: 811 (a hidden card is played), 186 (tokens are not cards for "play a card" purposes), 383 (one trigger per event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_INNOVATOR = "ogn-117-298";
const SPRITE_CALL = "ogn-094-298";

/** Turn 3, P2 active. P1 holds bf1 (Holder 2) with Sprite Call hidden there and has Viktor in base. P2's Raider (4) attacks. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", VIKTOR_INNOVATOR, "viktor")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

const live = (game: Game, name: string) => game.findAll({ name, owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

/** Raider attacks bf1; P2 passes Focus; P1 (defending) flips Sprite Call; both pass → it resolves. */
async function flipSpriteCallAsDefender(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("holder").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "call")).toBe(true);
  await game.p1.reveal("call");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling ea47f107aab04974 — the hidden Sprite Call is a played CARD (Viktor triggers once); the Sprite token is not", () => {
  test("Sprite Call resolves on P2's turn: the ready 3-Might Sprite token is played AND exactly ONE Viktor trigger goes on the chain (for the spell)", async () => {
    const game = await flipSpriteCallAsDefender();
    expect(game.zoneOf("call")).toBe("trash");
    const sprites = live(game, "Sprite");
    expect(sprites).toHaveLength(1);
    expect(game.state(sprites[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", controller: P1, triggered: true })]);
    expect(live(game, "Recruit")).toHaveLength(0);
  });

  test("that single trigger resolves into ONE Recruit in P1's base; the token's own play added no second trigger — the chain is empty and the showdown continues", async () => {
    const game = await flipSpriteCallAsDefender();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    const recruits = live(game, "Recruit");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // Let the whole thing play out: still exactly one Recruit at the end.
    await game.settle();
    expect(live(game, "Recruit")).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
