/**
 * Lillia, Fae Fawn — unl-082-219 · Champion Unit · Mind · 3 energy · 3 Might
 *
 *   [Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)
 *   When I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there.
 *   (Kill it at the start of its controller's Beginning Phase, before scoring.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - "from a LOCATION" (198.1): bases are locations too — base→battlefield, battlefield→base and
 *    battlefield→battlefield all trigger; "there" is the ORIGIN, snapshotted when she moves
 *    (359.3.f.3 uses Lillia as its example: bouncing her in response does not relocate the token).
 *  - The classic line: Lillia walks home from a battlefield she held alone and leaves a Sprite
 *    behind to keep control — but Temporary (816.1.b) kills it at the start of YOUR next
 *    Beginning Phase BEFORE scoring, so it never scores a hold; it does survive the opponent's turn.
 *  - Recalls are not moves (446.1): losing a combat and being sent home makes no Sprite.
 *  - Being moved by a spell (Emperor's Divide) is still a move → Sprite.
 *  - Playing her is not moving. Tokens that die cease to exist (186.1) — no Sprite in the trash.
 *  - Accelerate (805): optional [1]+[mind]; total 4 energy + 1 mind and she enters ready.
 * Engine status: the hand-authored trigger is `move-from-battlefield` + token `location: "here"`,
 * so base origins never fire and the Sprite lands where Lillia IS, not where she LEFT → BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-082-219";
const EMPERORS_DIVIDE = "sfd-043-221"; // Action — move any number of friendly units at a battlefield to base
const GUST = "ogn-169-298"; // Reaction — return a unit at a battlefield with 3 Might or less to its owner's hand

function sprites(game: Game, at?: string): string[] {
  return game.p1.units(at).filter((u) => game.state(u).name === "Sprite");
}

describe("Lillia, Fae Fawn (unl-082-219)", () => {
  test("cost: 3 energy, no power; without Accelerate she enters base exhausted at 3 Might; playing is not moving (no Sprite); 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lillia").build();
    await game.p1.play("lillia");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lillia")).toBe("base");
    expect(game.state("lillia")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(sprites(game)).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "lillia").build()).p1.can("play", "lillia")).toBe(false);
  });

  test("Accelerate: paying [1][mind] extra (4 energy + 1 mind total) makes her enter ready; without a mind power the accelerated play is rejected", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "lillia").build();
    await game.p1.play("lillia", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("lillia").isReady).toBe(true);

    const offDomain = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "lillia").build();
    const r = await offDomain.p1.try((p) => p.play("lillia", { accelerate: true }));
    expect(r.ok).toBe(false); // 805.1.a.1 — the power must match one of her domains
    expect(offDomain.zoneOf("lillia")).toBe("hand");
  });

  test("moving from a battlefield to base puts her trigger on the chain (opponent gets priority) and plays a 3-Might Sprite unit TOKEN with Temporary under P1's control", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "lillia").build();
    await game.p1.move("lillia", "base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(sprites(game)).toEqual([]); // nothing before resolution
    await game.settle();
    const [sprite] = sprites(game);
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ baseMight: 3, controller: P1, isToken: true, might: 3 });
    expect(game.state(sprite as string).keywords).toContain("Temporary");
    expect(game.state(sprite as string).domains).toEqual([]); // 187.2 — domainless
  });

  test("'there' = the ORIGIN — leaving bf1 for base plays the Sprite AT bf1, which keeps bf1 under P1's control", async () => {
    // Expected (359.3.f.3): token at battlefield-bf1; bf1 stays controlled by P1. Actual: token created in base ("here" = Lillia now); bf1 goes uncontrolled.
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "lillia").build();
    await game.p1.move("lillia", "base");
    await game.settle();
    expect(sprites(game, "bf1")).toHaveLength(1);
    expect(sprites(game, "base")).toHaveLength(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'from a LOCATION' includes her base (198.1) — base → bf1 leaves a Sprite in base", async () => {
    // Expected: trigger fires on a base origin; Sprite in base, Lillia at bf1. Actual: trigger narrowed to battlefield origins → no chain item, no token.
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "lillia").build();
    await game.p1.move("lillia", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", triggered: true })]);
    await game.settle();
    expect(game.locationOf("lillia")).toBe("bf1");
    expect(sprites(game, "base")).toHaveLength(1);
    expect(sprites(game, "bf1")).toHaveLength(0);
  });

  test("the hold trick does not work — the Sprite left at bf1 is killed at the start of P1's next Beginning Phase BEFORE scoring (816.1.b): no point, bf1 uncontrolled, token gone", async () => {
    // Expected: 0 points for P1 after the round trip. Actual: the Sprite is never at bf1 (see above), so the premise fails at the first assertion.
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "lillia").build();
    await game.p1.move("lillia", "base");
    await game.settle();
    const [sprite] = sprites(game, "bf1");
    expect(sprite).toBeDefined();
    await game.advanceTurn(); // → P2
    expect(game.has(sprite as string)).toBe(true); // survives the opponent's turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn(); // → P1: Temporary kills it before scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(sprite as string)).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("Temporary on the token: it survives the opponent's turn, then is killed at the start of its controller's Beginning Phase and ceases to exist (not in the trash)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lillia")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy") // keeps bf1 so the turn structure is unaffected
      .build();
    await game.p1.move("lillia", "base");
    await game.settle();
    const [sprite] = sprites(game);
    expect(sprite).toBeDefined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(sprite as string)).toBe(true);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(sprite as string)).toBe(false);
    expect(game.p1.trash().some((c) => c.startsWith("token-"))).toBe(false);
    expect(game.p1.points()).toBe(1); // Buddy still held bf1
  });

  test("a Recall is not a move (446.1): attacking a stunned 5-Might defender ends with Lillia recalled home and NO Sprite at the battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", CARD, "lillia")
      .build();
    await game.p1.move("lillia", "bf1");
    await game.settle(); // stunned Wall deals no damage (423.1.b), survives 3 → attackers recalled (466.1.a.2)
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(sprites(game, "bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("being moved by a spell counts: Emperor's Divide sends Lillia home from bf1 → her trigger follows on the chain and a Sprite is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lillia")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .hand(P1, EMPERORS_DIVIDE, "ed")
      .build();
    await game.p1.cast("ed", { targets: ["lillia"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // ED resolves → Lillia moves → trigger
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", triggered: true })]);
    await game.settle();
    expect(sprites(game)).toHaveLength(1);
    expect(game.locationOf("buddy")).toBe("bf1");
  });

  test("only HER moves: another friendly unit leaving the battlefield triggers nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lillia")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .build();
    await game.p1.move("buddy", "base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(sprites(game)).toEqual([]);
  });

  test("if Lillia is bounced to hand in response, the Sprite is still played at the location she moved FROM", async () => {
    // Expected: base → bf1 triggers; P2 Gusts her at bf1 in response; on resolution the Sprite still appears in P1's base.
    // Actual: a base origin never triggers (and the token location keys off Lillia's current position).
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P1, "base", CARD, "lillia")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("lillia", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "lillia" });
    await game.settle();
    expect(game.zoneOf("lillia")).toBe("hand");
    expect(sprites(game, "base")).toHaveLength(1);
  });

  test("registry payload: Accelerate keyword costing [1][mind] + a self move trigger that creates a 3-Might 'Sprite' unit token with Temporary", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, isChampion: true, might: 3, tags: ["Lillia"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { energy: 1, power: ["mind"] }, keyword: "Accelerate", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" }, type: "create-token" },
      trigger: { on: "self" },
      type: "triggered",
    });
    expect(String((def?.abilities?.[1] as { trigger: { event: string } }).trigger.event)).toMatch(/move/);
  });

  test("the trigger encodes 'from a battlefield' + token 'here', but the printed text is 'from a LOCATION' … 'THERE' (origin)", async () => {
    // Expected: an any-origin move event and a token location that references the origin. Actual: event "move-from-battlefield", location "here".
    const ab = (await loadDefaultCardPool()).get(CARD)?.abilities?.[1] as { trigger: { event: string }; effect: { location?: string } };
    expect(ab.trigger.event).not.toMatch(/battlefield/);
    expect(ab.effect.location).not.toBe("here");
  });
});
