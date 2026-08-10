/**
 * Ruling 110b3bb111e4aee0 — Sprite (OGN-274 → ogn-274-298) · 3-Might Fae unit token
 *     "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Teemo, Scout (ogn-197-298) · 1 Might · [Hidden] "When you play me, give me +3 [Might] this turn."
 *
 * Q: Can you react to a Sprite dying to Temporary — e.g. reveal a Teemo hidden at the Sprite's battlefield?
 * A: Yes. Temporary is a triggered ability that goes on the chain in your Beginning Phase, so it can be reacted to
 *    before it resolves — hide Teemo where the Sprite conquered, flip him in response next turn. (You can't hide
 *    and reveal a card in the same turn.)
 * Rules: 816 (Temporary — a trigger at start of Beginning Phase), 329–331 (priority on a chain), 811.1.b (hidden
 *        cards gain [Reaction] "beginning on the next turn"), 315.2 (Beginning Phase → then Hold scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const TEEMO_SCOUT = "ogn-197-298";

/** End of P2's turn 2. P1 controls bf1 with a lone Sprite token and has Teemo hidden there since an earlier turn. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs");
}

/** P2 ends the turn → P1's Beginning Phase opens with the Temporary trigger on the chain. */
async function toTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sprite")).toMatchObject({ isToken: true, keywords: expect.arrayContaining(["Temporary"]) });
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 110b3bb111e4aee0 — Temporary is a chain trigger, so a Teemo hidden at the Sprite's battlefield can be flipped in response", () => {
  test("at the start of P1's Beginning Phase the Sprite's Temporary kill is a triggered item ON THE CHAIN (Sprite still alive) and P1 holds priority", async () => {
    const game = await toTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("in response P1 may reveal the hidden Teemo at bf1: he is played there for [0] on top of the Temporary item (his own play trigger above it)", async () => {
    const game = await toTemporaryTrigger();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.state("teemo")).toMatchObject({ isHidden: false, zone: "battlefield-bf1" });
    expect(game.chain()[0]).toMatchObject({ cardId: "sprite", triggered: true }); // Temporary still waiting underneath
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
  });

  test("everything resolves: Teemo gets his +3 (4 Might), THEN Temporary kills the Sprite — Teemo keeps bf1 for P1, so P1 still HOLDS it at scoring (1 point) and reaches the main phase", async () => {
    const game = await toTemporaryTrigger();
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has("sprite")).toBe(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.state("teemo")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — not reacting: the Sprite dies, bf1 empties, P1 loses control and the still-hidden Teemo is trashed; no hold point", async () => {
    const game = await toTemporaryTrigger();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has("sprite")).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("nuance: a card hidden THIS turn cannot be revealed the same turn (it only gains [Reaction] from the next turn)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .hand(P1, TEEMO_SCOUT, "teemo")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .build();
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("teemo"));
    expect(r.ok).toBe(false);
  });
});
