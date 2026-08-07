/**
 * Illaoi, Prophet of the Great Kraken — ven-182-166 · Champion Unit (Illaoi) · Chaos · 6 energy · 4 Might
 *
 *   When you play me or when I score, play a [1] [Might] Tentacle unit token from Bilgewater.
 *   I have +1 [Might] for each token unit you control.
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Two trigger conditions, one effect: the PLAY effect (383.4.a) and "when I score" = Illaoi herself
 *     conquering (383.4.c) OR holding (383.4.d). Another unit scoring while she sits in base is not
 *     "I score"; the opponent's Beginning Phase is nobody's hold for her.
 *  2. The Tentacle (187.10): a 1-Might domainless unit TOKEN with the Bilgewater tag, PLAYED (enters
 *     exhausted, 185.2.d) under her controller — and it immediately feeds her own static (+1).
 *  3. The static counts token UNITS you CONTROL, anywhere on your board: a token at another
 *     battlefield counts, an enemy token does not, a gear token (Gold) does not, a non-token unit
 *     does not. It is continuous (layer): kill a token and she shrinks on the spot.
 *  4. The bonus is real Might for lethal math: 4 + two tokens = 6 survives a 5-Might attacker that a
 *     bare 4 would die to.
 *  5. Cost/body: 6 energy, no power, enters exhausted; also playable from the Champion Zone for 6.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-182-166";
const TENTACLE = { cardType: "unit", might: 1, name: "Tentacle", tags: ["Bilgewater"] } as const;
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Zap",
  timing: "action",
} as const;

const tentacles = (game: Game) =>
  game.findAll({ name: "Tentacle", owner: P1 }).filter((id) => game.state(id).isToken && game.locationOf(id) !== undefined);

describe("Illaoi, Prophet of the Great Kraken (ven-182-166)", () => {
  test("registry payload (static half): 6-cost 4-Might Chaos champion tagged Illaoi whose static is +1×(count of FRIENDLY TOKEN units) on self", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 6, isChampion: true, might: 4, tags: ["Illaoi"] });
    expect(def?.powerCost).toBeUndefined();
    const statics = (def?.abilities ?? []).filter((a) => (a as { type: string }).type === "static");
    expect(statics).toEqual([
      {
        effect: { amount: { count: { controller: "friendly", filter: "token", type: "unit" }, multiplier: 1 }, target: "self", type: "modify-might" },
        type: "static",
      },
    ]);
  });

  test("registry payload (trigger half) — a triggered ability on play-self OR self-score creating one 1-Might Bilgewater 'Tentacle' unit token is missing entirely", async () => {
    // Expected: abilities = [triggered{play-self|score(self) → create-token Tentacle 1}, static{…}].
    // Actual: only the static survived parsing; the first printed sentence produced nothing.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities).toHaveLength(2);
    const trig = (def?.abilities ?? []).find((a) => (a as { type: string }).type === "triggered");
    expect(trig).toBeDefined();
    expect(JSON.stringify(trig)).toMatch(/Tentacle/);
    expect(JSON.stringify(trig)).toMatch(/play-self/);
    expect(JSON.stringify(trig)).toMatch(/score|conquer/);
  });

  test("cost + body: 6 energy (no power) from hand, lands in base exhausted at 4 Might with no tokens around; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "illaoi").build();
    await game.p1.play("illaoi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("illaoi")).toBe("base");
    expect(game.state("illaoi")).toMatchObject({ baseMight: 4, isExhausted: true });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "illaoi").build()).p1.can("play", "illaoi")).toBe(false);
  });

  test("also playable from the Champion Zone for the same 6 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).champion(P1, CARD, "illaoi").build();
    expect(game.p1.champion()).toBe("illaoi");
    await game.p1.playChampion("base");
    expect(game.p1.energy()).toBe(0);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("illaoi")).toBe("base");
  });

  test("static: +1 per token UNIT you CONTROL anywhere on your board (base + battlefield = 6); an enemy token, a friendly Gold gear token and a friendly non-token unit add nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "illaoi")
      .card("token-a", { def: TENTACLE, owner: P1, zone: "base" })
      .card("token-b", { def: { cardType: "unit", might: 1, name: "Recruit" }, owner: P1, zone: "bf1" })
      .card("token-enemy", { def: TENTACLE, owner: P2, zone: "base" })
      .card("token-gold", { def: { cardType: "gear", name: "Gold" }, owner: P1, zone: "base" })
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .build();
    expect(game.state("illaoi")).toMatchObject({ baseMight: 4, might: 6 });
    expect(game.state("token-a").might).toBe(1); // the static is on Illaoi only
    const bare = await scenario().unit(P1, "base", CARD, "illaoi").card("token-enemy", { def: TENTACLE, owner: P2, zone: "base" }).build();
    expect(bare.state("illaoi").might).toBe(4);
  });

  test("continuous: when one of two friendly tokens is killed (enemy Zap for 2) she drops from 6 to 5 at once", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "illaoi")
      .card("token-a", { def: TENTACLE, owner: P1, zone: "base" })
      .card("token-b", { def: TENTACLE, owner: P1, zone: "base" })
      .hand(P2, ZAP, "zap")
      .build();
    expect(game.state("illaoi").might).toBe(6);
    await game.p2.cast("zap", { targets: "token-a" });
    await game.settle();
    expect(game.has("token-a") && game.locationOf("token-a") !== undefined).toBe(false);
    expect(game.state("illaoi").might).toBe(5);
  });

  test("the bonus is real Might in combat: defending at 4+2=6 she kills a 5-Might attacker and survives; the same attacker kills a token-less Illaoi", async () => {
    const withTokens = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "illaoi")
      .card("token-a", { def: TENTACLE, owner: P1, zone: "base" })
      .card("token-b", { def: TENTACLE, owner: P1, zone: "base" })
      .unit(P2, "base", { might: 5, name: "Reaver" }, "reaver")
      .build();
    await withTokens.p2.move("reaver", "bf1");
    await withTokens.settle();
    expect(withTokens.zoneOf("reaver")).toBe("trash");
    expect(withTokens.zoneOf("illaoi")).toBe("battlefield-bf1");
    expect(withTokens.gameState.battlefields.bf1?.controller).toBe(P1);
    const bare = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "illaoi").unit(P2, "base", { might: 5, name: "Reaver" }, "reaver").build();
    await bare.p2.move("reaver", "bf1");
    await bare.settle();
    expect(bare.zoneOf("illaoi")).toBe("trash");
    expect(bare.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'When you play me' — playing Illaoi puts her play effect on the chain and yields ONE exhausted 1-Might Bilgewater Tentacle unit token under P1, lifting her to 5", async () => {
    // Expected: a triggered chain item from illaoi, then exactly one Tentacle token (unit, token, P1, exhausted, 1 Might, tag Bilgewater) and Illaoi at 5.
    // Actual: no play trigger exists — the chain stays empty and no token appears.
    const game = await scenario().resources(P1, { energy: 6 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "illaoi").build();
    await game.p1.play("illaoi", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "illaoi", controller: P1, triggered: true })]);
    await game.settle({ policy: "first" });
    const t = tentacles(game);
    expect(t).toHaveLength(1);
    expect(game.state(t[0] as string)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, name: "Tentacle", owner: P1 });
    expect(game.state("illaoi").might).toBe(5);
  });

  test("'when I score' (hold, 383.4.d) — Illaoi holding bf1 in P1's Beginning Phase scores 1 AND plays a Tentacle", async () => {
    // Expected: P1 → 1 point, an illaoi trigger on the chain during the beginning phase, then one Tentacle token.
    // Actual: the point is scored but no trigger/token — the score half of the ability is unimplemented.
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "illaoi").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "illaoi", controller: P1, triggered: true })]);
    await game.settle({ policy: "first" });
    expect(game.phase()).toBe("main");
    expect(tentacles(game)).toHaveLength(1);
    expect(game.state("illaoi").might).toBe(5);
  });

  test("'when I score' (conquer, 383.4.c) — Illaoi walking onto an open battlefield conquers it for 1 AND plays a Tentacle", async () => {
    // Expected: after the showdown P1 controls bf1, has 1 point, and one Tentacle token exists (Illaoi 5).
    // Actual: conquer + point happen, but no token.
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "illaoi").build();
    await game.p1.move("illaoi", "bf1");
    await game.settle({ policy: "first" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(tentacles(game)).toHaveLength(1);
    expect(game.state("illaoi").might).toBe(5);
  });

  test("negative space — 'I score', not 'you score': another friendly unit conquering while Illaoi stays in base scores the point but plays no Tentacle", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "illaoi").unit(P1, "base", { might: 2, name: "Runner" }, "runner").build();
    await game.p1.move("runner", "bf1");
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toHaveLength(0);
    expect(tentacles(game)).toHaveLength(0);
    expect(game.state("illaoi").might).toBe(4);
  });

  test("negative space — the OPPONENT's Beginning Phase is not her hold: Illaoi parked on P1's bf1 while P1 passes to P2 yields no point for anyone from bf1 and no Tentacle", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "illaoi").build();
    await game.advanceTurn({ policy: "first" });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(tentacles(game)).toHaveLength(0);
  });
});
