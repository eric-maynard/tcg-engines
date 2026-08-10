/**
 * Ruling 304e729d4c6a1f41 — Sprite Mother (OGN-106 → ogn-106-298) "When you play me, play a ready 3 [Might] Sprite
 *   unit token with [Temporary] here."
 *   × Sprite token (OGN-274 → ogn-274-298) "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Sprite Call (OGN-094 → ogn-094-298) [Hidden][Action] "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   (+ Zhonya's Hourglass ogn-077-298 for the "saved unit is retried next turn" nuance; Discipline ogn-058-298 as
 *    the opponent's Reaction.)
 *
 * Q: Can you play a reaction when a Temporary unit (e.g. Sprite Mother's token) dies to Temporary?
 * A: Yes — Temporary is a trigger at the start of the Beginning Phase; both players may react to it on the
 *    chain. A new Temporary unit played in response (Sprite Call) does NOT die now — the phase trigger already
 *    happened; it is checked next turn. A unit saved by Hourglass is killed by Temporary again next turn.
 * Rules: 816 (Temporary), 383 / 330–337 (trigger → chain → priority for all players), 811 (Hidden react for 0),
 *        372 (Zhonya's replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const SPRITE = "ogn-274-298";
const SPRITE_CALL = "ogn-094-298";
const ZHONYAS = "ogn-077-298";
const DISCIPLINE = "ogn-058-298";

/**
 * End of P2's turn 3. P1: Sprite Mother + her Sprite token in base, a vanilla Holder on P1's bf1 with Sprite Call
 * hidden there. P2 holds Discipline with two ready runes (a Reaction it could play in the window).
 */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", SPRITE_MOTHER, "mother")
    .unit(P1, "base", SPRITE, "sprite")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .runes(P2, "calm", 2)
    .hand(P2, DISCIPLINE, "disc");
  return opts.zhonyas ? s.gear(P1, ZHONYAS, "zhonyas") : s;
}

async function atTemporaryTrigger(opts: { zhonyas?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

function sprites(game: Game): string[] {
  return game.findAll({ name: "Sprite" }).filter((id) => game.state(id).defId !== SPRITE_MOTHER && game.zoneOf(id) !== "gone");
}

describe("Ruling 304e729d4c6a1f41 — the Temporary kill is a chain trigger both players can react to", () => {
  test("at the start of P1's Beginning Phase the Sprite's Temporary trigger is on the chain; P1 gets priority first, and after P1 passes P2 gets a window too (and could play its Reaction)", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("base"); // still alive while the trigger waits
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    await game.p2.tapRunes(2);
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "holder" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "disc"]);
  });

  test("P1 reacts by revealing the hidden Sprite Call: a NEW Sprite token is played; the original Sprite then dies to its trigger, but the new one survives into P1's main phase (the phase trigger already passed)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "call"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite")); // the original died
    const fresh = sprites(game);
    expect(fresh).toHaveLength(1);
    const [neo] = fresh as [string];
    expect(game.state(neo)).toMatchObject({ controller: P1, isToken: true, might: 3 });
    expect(game.state(neo).keywords).toContain("Temporary");
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf(neo));
    expect(game.violations()).toEqual([]);
  });

  test("…and that new Sprite is only checked at P1's NEXT Beginning Phase, where Temporary kills it", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    await game.settle();
    const [neo] = sprites(game) as [string];
    expect(game.has(neo)).toBe(true);
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf(neo)); // still alive through P2's turn
    await game.advanceTurn(); // → P1: Temporary trigger resolves
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(sprites(game)).toEqual([]);
  });

  test("Hourglass nuance: a face-up Zhonya's saves the Sprite from this turn's Temporary kill (Zhonya's dies instead; the Sprite stays in base, healed)…", async () => {
    const game = await atTemporaryTrigger({ zhonyas: true });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("sprite").damage).toBe(0);
  });

  test("…but Temporary tries again at P1's next Beginning Phase and, with the Hourglass gone, the Sprite dies then", async () => {
    const game = await atTemporaryTrigger({ zhonyas: true });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite"));
    expect(game.violations()).toEqual([]);
  });
});
