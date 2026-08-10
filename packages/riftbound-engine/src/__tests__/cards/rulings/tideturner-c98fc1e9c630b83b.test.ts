/**
 * Ruling c98fc1e9c630b83b — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · [Hidden]
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *      original location."
 *   × Sprite token (OGN-274 → ogn-274-298) · 3 Might · "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *
 * Q: Can a hidden Tideturner be flipped during my Beginning Step, in reaction to my Sprite's Temporary trigger, so that I
 *    still hold the battlefield and score?
 * A: Yes. Temporary is a triggered ability, so it opens a chain you can react to; playing the hidden Tideturner then puts a
 *    unit at the battlefield before the Sprite is removed, and you score the hold point. (Hiding ≠ playing.)
 * Rules: 383 / 336–343 (a trigger creates a Closed State with Reaction windows), 811 (play from Hidden as a Reaction, from
 *        the turn after it was hidden), 315–316 (Beginning Phase: Temporary kill, then Hold scoring), 469/471 (Hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const SPRITE = "ogn-274-298";

/**
 * End of P2's turn 2. P1 holds bf1 with ONLY a Sprite token, and has Tideturner facedown there (hidden on an earlier turn);
 * a 2-Might Homebody sits in P1's base (a would-be swap partner). P2 keeps a Sentry at bf2.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .unit(P2, "bf2", { might: 3, name: "Sentry" }, "sentry");
}

/** P2 ends the turn → P1's Beginning Phase opens with the Sprite's Temporary trigger on the chain and P1 holding priority. */
async function intoBeginning(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sprite")).toMatchObject({ isToken: true });
  expect(game.state("sprite").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling c98fc1e9c630b83b — flip a hidden Tideturner in response to your Sprite's Temporary trigger to keep the hold", () => {
  test("Temporary is a TRIGGER: at the start of P1's Beginning Phase it sits on the chain and P1 may react — revealing the hidden Tideturner is a legal option right there", async () => {
    const game = await intoBeginning();
    expect(game.p1.can("reveal", "tide")).toBe(true);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // not dead yet
    expect(game.p1.points()).toBe(0);
  });

  test("P1 flips Tideturner (for [0]) onto bf1 on top of the Temporary trigger; its optional swap is declined; then the Sprite dies — but Tideturner is at bf1, so P1 still HOLDS and scores 1", async () => {
    const game = await intoBeginning();
    await game.p1.reveal("tide");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "tide"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tide" } }); // "you MAY choose a unit …"
    await game.p1.no();
    await game.settle(); // Temporary resolves, Beginning Phase continues into scoring, then main
    expect(game.zoneOf("sprite")).toBe("gone"); // a killed token ceases to exist
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.zoneOf("homebody")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: if P1 just lets the trigger resolve, the Sprite dies with nothing left at bf1 — no hold point and bf1 is no longer P1's (the still-hidden Tideturner is binned with it)", async () => {
    const game = await intoBeginning();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("tide")).not.toBe("battlefield-bf1");
    expect(game.phase()).toBe("main");
  });
});
