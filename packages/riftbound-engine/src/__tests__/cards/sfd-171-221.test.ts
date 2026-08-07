/**
 * Renata Glasc, Industrialist — sfd-171-221 · Unit · Order · Champion · 4 energy + [order] · 4 Might
 *
 *   Your tokens enter ready.
 *
 * Rules: 143.4 / 185.2.d (units — token units included — enter exhausted by default), 184.1 (an
 * effect may state a token's entering state), 365.1 (a permanent's passive ability is active only
 * while it is on the board), 359.2.a (passives switch on as the permanent enters), 182/183 (a
 * token's controller = controller of the effect that made it → "your"), 187.3 / 187.5 (Sand Soldier
 * unit token, Gold gear token), 805.6.a analogue: entering ready is not "being readied".
 *
 * Head-judge corner cases considered:
 *   - the passive is a property of Renata ON THE BOARD: from hand or the champion zone it does
 *     nothing; once she is bounced, later tokens enter exhausted again;
 *   - "your": an opponent's tokens still enter exhausted while your Renata is out;
 *   - "tokens", not "units": Renata herself and other real units you play still enter exhausted;
 *   - "enter": tokens that were already on the board exhausted when Renata arrives stay exhausted;
 *   - several tokens from one effect all enter ready; a token played "here" at a battlefield too;
 *   - marquee partner line — Gold gear tokens are always printed as "play … exhausted"; Renata's
 *     text covers ALL your tokens, so Trove Golem's four Gold tokens should enter ready.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-171-221";
const DESERTS_CALL = "sfd-031-221"; // 2 energy: play a 2-Might Sand Soldier unit token
const ROYAL_GUARD = "sfd-157-221"; // 4 energy: when you play me, play a Sand Soldier here
const VANGUARD_CAPTAIN = "ogn-218-298"; // 3+[order] Legion: play two Recruit tokens here
const TROVE_GOLEM = "sfd-174-221"; // 8+[order][order]: when you play me, play four Gold gear tokens exhausted
const GUST = "ogn-169-298"; // [Reaction] 1: return a ≤3-Might unit at a battlefield to hand
const REBUKE = "ogn-172-298"; // [Action] 2+[chaos][chaos]: return a unit at a battlefield to hand

const tokensOf = (game: Game, owner: string, name = "Sand Soldier") =>
  game.findAll({ name, owner }).filter((id) => game.locationOf(id) !== undefined);

describe("Renata Glasc, Industrialist (sfd-171-221)", () => {
  test("costs 4 energy + 1 [order]; Renata is a unit, not a token — she enters EXHAUSTED as a 4-Might champion unit", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "renata").build();
    await game.p1.play("renata", { to: "base" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("renata")).toMatchObject({ isExhausted: true, isToken: false, might: 4 });
  });

  test("unaffordable with 4 energy but no [order] (a [fury] power does not substitute), or with 3 energy + [order]", async () => {
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("with Renata in your base, a Sand Soldier from Desert's Call enters READY (baseline without her: exhausted)", async () => {
    const without = await scenario().resources(P1, { energy: 2 }).hand(P1, DESERTS_CALL, "call").build();
    await without.p1.cast("call");
    await without.settle();
    expect(without.state(tokensOf(without, P1)[0] as string).isExhausted).toBe(true);

    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "renata").hand(P1, DESERTS_CALL, "call").build();
    await game.p1.cast("call");
    await game.settle();
    const [tok] = tokensOf(game, P1);
    expect(game.state(tok as string)).toMatchObject({ isReady: true, isToken: true, might: 2, zone: "base" });
  });

  test("Renata AT A BATTLEFIELD still covers a token played 'here' at another battlefield (Royal Guard) — location is irrelevant", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", CARD, "renata")
      .hand(P1, ROYAL_GUARD, "rg")
      .build();
    await game.p1.play("rg", { to: "bf1" });
    await game.settle();
    const [tok] = tokensOf(game, P1);
    expect(game.zoneOf(tok as string)).toBe("battlefield-bf1");
    expect(game.state(tok as string).isReady).toBe(true);
    expect(game.state("rg").isExhausted).toBe(true); // "tokens", not "units"
  });

  test("several tokens from one effect all enter ready (Vanguard Captain's two Recruits, Legion satisfied by the earlier play)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .unit(P1, "base", CARD, "renata")
      .hand(P1, DESERTS_CALL, "call")
      .hand(P1, VANGUARD_CAPTAIN, "vc")
      .build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.play("vc", { to: "base" });
    await game.settle();
    const recruits = tokensOf(game, P1, "Recruit");
    expect(recruits).toHaveLength(2);
    for (const r of recruits) {
      expect(game.state(r).isReady).toBe(true);
    }
    expect(game.state("vc").isExhausted).toBe(true);
  });

  test("'YOUR tokens': the opponent's Sand Soldier still enters exhausted while your Renata is on the board", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P1, "base", CARD, "renata")
      .hand(P2, DESERTS_CALL, "call")
      .build();
    await game.p2.cast("call");
    await game.settle();
    const [theirs] = tokensOf(game, P2);
    expect(theirs).toBeDefined();
    expect(game.state(theirs as string)).toMatchObject({ controller: P2, isExhausted: true });
    expect(tokensOf(game, P1)).toHaveLength(0);
  });

  test("365.1 — Renata in HAND does nothing: the token enters exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "renata").hand(P1, DESERTS_CALL, "call").build();
    await game.p1.cast("call");
    await game.settle();
    expect(game.state(tokensOf(game, P1)[0] as string).isExhausted).toBe(true);
  });

  test("365.1 — an unplayed Renata in the CHAMPION ZONE is not on the board, so tokens must still enter exhausted", async () => {
    // Expected: the chosen-champion zone is not the board; her passive is inactive → token exhausted.
    // Actual: create-token scans the champion zone for the EntersReady grant and readies the token.
    const game = await scenario().resources(P1, { energy: 2 }).champion(P1, CARD, "renata").hand(P1, DESERTS_CALL, "call").build();
    expect(game.zoneOf("renata")).toBe("championZone");
    await game.p1.cast("call");
    await game.settle();
    expect(game.state(tokensOf(game, P1)[0] as string).isExhausted).toBe(true);
  });

  test("'enter' is not retroactive: a token already on the board exhausted stays exhausted when Renata is played afterwards", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .hand(P1, DESERTS_CALL, "call")
      .hand(P1, CARD, "renata")
      .build();
    await game.p1.cast("call");
    await game.settle();
    const [old] = tokensOf(game, P1);
    expect(game.state(old as string).isExhausted).toBe(true);
    await game.p1.play("renata", { to: "base" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("base");
    expect(game.state(old as string).isExhausted).toBe(true);
  });

  test("once Renata leaves the board (Rebuked back to hand) the passive is gone: the next token enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "renata")
      .hand(P1, DESERTS_CALL, "call1")
      .hand(P1, DESERTS_CALL, "call2")
      .hand(P1, REBUKE, "rebuke")
      .script(P1, ["base", "base"]) // token destination prompts (bf1 is controlled)
      .build();
    await game.p1.cast("call1");
    await game.settle();
    const [first] = tokensOf(game, P1);
    expect(game.state(first as string).isReady).toBe(true);
    await game.p1.cast("rebuke", { targets: "renata" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("hand");
    await game.p1.cast("call2");
    await game.settle();
    const second = tokensOf(game, P1).find((t) => t !== first);
    expect(second).toBeDefined();
    expect(game.state(second as string).isExhausted).toBe(true);
  });

  test("response timing: Gust removes Renata while Royal Guard's trigger waits on the chain → the state is read at resolution → token enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "renata", { mightModifier: -1 }) // 3 Might so Gust can bounce her
      .hand(P1, ROYAL_GUARD, "rg")
      .hand(P2, GUST, "gust")
      .build();
    expect(game.state("renata").might).toBe(3);
    await game.p1.play("rg", { to: "base" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "renata" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("hand");
    const [tok] = tokensOf(game, P1);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isExhausted).toBe(true);
  });

  test("'Your TOKENS' covers gear tokens too — Trove Golem's four Gold tokens ('play … exhausted') should enter READY with Renata out", async () => {
    // Expected: all four Gold gear tokens ready (Renata's passive overrides the entering state of
    // every token you play; Gold is the archetype's whole point). Actual: the hand-authored ability
    // targets only `type: "unit"` tokens and create-token skips the grant for gear → all exhausted.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .unit(P1, "base", CARD, "renata")
      .hand(P1, TROVE_GOLEM, "golem")
      .build();
    await game.p1.play("golem", { to: "base" });
    await game.settle();
    const gold = tokensOf(game, P1, "Gold");
    expect(gold).toHaveLength(4);
    expect(gold.every((g) => game.state(g).isReady)).toBe(true);
  });

  test("baseline for the above: without Renata, Trove Golem's Gold tokens do enter exhausted (184.1)", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { order: 2 } }).hand(P1, TROVE_GOLEM, "golem").build();
    await game.p1.play("golem", { to: "base" });
    await game.settle();
    const gold = tokensOf(game, P1, "Gold");
    expect(gold).toHaveLength(4);
    expect(gold.every((g) => game.state(g).isExhausted)).toBe(true);
  });

  test("registry payload: a single unconditional static granting the enter-ready property to YOUR TOKENS; 4+[order] Order champion, 4 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, isChampion: true, might: 4, tags: ["Renata Glasc"] });
    expect(def?.powerCost).toEqual(["order"]);
    expect(def?.abilities).toHaveLength(1);
    const a = def?.abilities?.[0] as { type: string; condition?: unknown; effect: { type: string; keyword: string; target: Record<string, unknown> } };
    expect(a.type).toBe("static");
    expect(a.condition).toBeUndefined();
    expect(a.effect).toMatchObject({ keyword: "EntersReady", type: "grant-keyword" });
    expect(a.effect.target).toMatchObject({ controller: "friendly", filter: "token" });
  });
});
