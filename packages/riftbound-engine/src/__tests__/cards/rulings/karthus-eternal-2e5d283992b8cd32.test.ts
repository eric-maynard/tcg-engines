/**
 * Ruling 2e5d283992b8cd32 — Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might ·
 *     "Your [Deathknell] effects trigger an additional time."
 *   × Sprite (unl-t07) · 3 Might token with [Temporary] — "Kill me at the start of your Beginning Phase."
 *   × Gust (ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *   × Watchful Sentry (ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Hextech Ray (ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: Can I respond to the [Temporary] trigger and return Karthus to hand before it is applied?
 * A: Yes — [Temporary] is a triggered ability that goes on the chain, so the state is closed and Reaction
 *    cards may be played in response. Gust resolves first (LIFO) and Karthus goes back to hand; the Temporary
 *    trigger then kills the token. With Karthus off the board his passive is gone, so Deathknells that fire
 *    afterwards trigger only once.
 * Rules: 383.1/336 (a trigger creates a chain; the state is Closed), 340.1 (LIFO), 365 (a passive applies
 *        only while its source is on the board), 808.1 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const SPRITE = "unl-t07";
const GUST = "ogn-169-298";
const SENTRY = "ogn-096-298";
const HEXTECH_RAY = "ogn-009-298";

/** Turn 2, P2 active — ending their turn hands P1 a Beginning Phase with the Sprite's [Temporary] trigger. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KARTHUS, "karthus")
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P1, "bf1", SENTRY, "sentry")
    .hand(P1, GUST, "gust")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** End P2's turn and stop on P1's Beginning Phase with the Temporary trigger on the chain, P1 funded. */
async function beginningWithTemporary(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  // Pools empty between turns; hand P1 exactly Gust's [1] plus Hextech Ray's [1][fury].
  await game.p1.do("addResources", { energy: 2, power: { fury: 1 } });
  return game;
}

describe("Ruling 2e5d283992b8cd32 — the [Temporary] trigger is answerable: Gust can pull Karthus out before it resolves", () => {
  test("the trigger is on the chain and Gust is a legal Reaction there; it resolves first and returns Karthus to hand, then the Sprite is killed", async () => {
    const game = await beginningWithTemporary();
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "karthus" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "gust"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("karthus")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite"]);
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone"); // Temporary still killed it (a token that leaves the board ceases to exist)
    expect(game.violations()).toEqual([]);
  });

  test("with Karthus back in hand his passive is gone: a Deathknell that fires afterwards triggers ONCE (P1 draws 1)", async () => {
    const game = await beginningWithTemporary();
    await game.p1.cast("gust", { targets: "karthus" });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("hand");
    expect(game.phase()).toBe("main");
    const hand = game.p1.hand().length; // includes Karthus and Hextech Ray
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } }); // pools empty at the phase change
    await game.p1.cast("ray", { targets: "sentry" }); // 3 to the 1-Might Sentry
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Ray left the hand, one Deathknell draw
  });

  test("control: leave Karthus on the board and the same Deathknell triggers twice (P1 draws 2)", async () => {
    const game = await beginningWithTemporary();
    await game.settle(); // let the Temporary trigger resolve untouched
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.zoneOf("karthus")).toBe("battlefield-bf1");
    expect(game.phase()).toBe("main");
    const hand = game.p1.hand().length;
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    await game.p1.cast("ray", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
  });
});
