/**
 * Soul Shepherd — unl-077-219 · Unit · Mind · 5 energy (no power) · 3 Might
 *
 *   Your token units have +1 [Might].
 *
 * Rules: 364 (passive ability — continuous while the source is on the board, no chain), 185/186
 * (tokens are card-like objects created by effects; a token in a non-board zone ceases to exist),
 * 187.2 (Sprite = 3 [Might] unit token), 187.1 (Recruit = 1 [Might] unit token), 108.2 ("your" =
 * the units you CONTROL), 143.2.a (lethal = damage ≥ Might, so +1 changes combat trades).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Scope: only TOKEN + UNIT + YOURS. Non-token friendly units (Shepherd included) get nothing;
 *      enemy tokens get nothing; a Gold GEAR token is not a unit.
 *   2. Continuous, not a snapshot: tokens created after Shepherd arrived are 4; tokens that existed
 *      before Shepherd was played become 4 the moment it lands (even though it enters exhausted);
 *      the bonus vanishes the moment Shepherd leaves the board; a Shepherd in hand does nothing.
 *   3. Two Shepherds stack (+2). The bonus is not "this turn" — it survives turn changes.
 *   4. Combat relevance: a Sprite at 3+1 trades with a 4-Might defender it would otherwise bounce off.
 *   5. controller ≠ owner: a token you control but do not own is still "your" token unit (108.2).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-077-219";
const SPRITE_BURST = "unl-069-219"; // Spell, 5 energy: play two ready 3-Might Sprite unit tokens with Temporary
const SPRITE_TOKEN = "unl-t07"; // 3-Might Sprite unit token (Temporary)
const RECRUIT_TOKEN = "ogn-273-298"; // 1-Might Recruit unit token (no abilities)
const GOLD_TOKEN = "unl-t05"; // Gold gear token

const sprites = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].units().filter((id) => game.state(id).name === "Sprite");

describe("Soul Shepherd (unl-077-219)", () => {
  test("parsed abilities match the printed text: one static +1 Might over friendly token units; 5 energy, no power, 3 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 5, might: 3, name: "Soul Shepherd" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, target: { controller: "friendly", filter: "token", type: "unit" }, type: "modify-might" }, type: "static" },
    ]);
  });

  test("cost: 5 energy for a 3-Might unit that enters exhausted; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "shep").build();
    await game.p1.play("shep");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("shep")).toBe("base");
    expect(game.state("shep")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]); // a passive: nothing was put on the chain
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "shep").build()).p1.can("play", "shep")).toBe(false);
  });

  test("tokens made while Shepherd is on the board: Sprite Burst's two 3-Might Sprites are 4 each; Shepherd itself and a plain ally stay put", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", CARD, "shep")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .hand(P1, SPRITE_BURST, "burst")
      .build();
    await game.p1.cast("burst");
    await game.settle({ policy: "first" }); // any destination prompt: take the first
    const toks = sprites(game);
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 3, isToken: true, might: 4 });
    }
    expect(game.state("shep").might).toBe(3);
    expect(game.state("plain").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("continuous: tokens that were already there go 3 → 4 the moment Shepherd is played (exhausted or not), and drop back to 3 when Shepherd dies", async () => {
    const KILL = { abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, type: "spell" }], cardType: "spell", energyCost: 0, name: "Test Kill" };
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", SPRITE_TOKEN, "token-s1")
      .hand(P1, CARD, "shep")
      .hand(P1, KILL, "kill")
      .build();
    expect(game.state("token-s1").might).toBe(3);
    await game.p1.play("shep");
    await game.settle();
    expect(game.state("shep").isExhausted).toBe(true);
    expect(game.state("token-s1").might).toBe(4);
    await game.p1.cast("kill", { targets: "shep" });
    await game.settle();
    expect(game.zoneOf("shep")).toBe("trash");
    expect(game.state("token-s1").might).toBe(3);
  });

  test("negative space: enemy tokens are not 'your' tokens; a Shepherd in HAND grants nothing; a Gold gear token is not a unit", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "shep")
      .unit(P2, "base", SPRITE_TOKEN, "token-enemy")
      .unit(P1, "base", RECRUIT_TOKEN, "token-mine")
      .gear(P1, GOLD_TOKEN, "token-gold")
      .build();
    expect(game.state("token-enemy").might).toBe(3);
    expect(game.state("token-mine").might).toBe(2); // 1 + 1
    expect(game.state("token-gold").might).toBe(0);

    const inHand = await scenario().hand(P1, CARD, "shep").unit(P1, "base", SPRITE_TOKEN, "token-s1").build();
    expect(inHand.state("token-s1").might).toBe(3);
  });

  test("two Shepherds stack: a 1-Might Recruit token is 3; and the bonus persists across turns (not a this-turn effect)", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "shep1")
      .unit(P1, "base", CARD, "shep2")
      .unit(P1, "base", RECRUIT_TOKEN, "token-r1")
      .build();
    expect(game.state("token-r1").might).toBe(3);
    expect(game.state("shep1").might).toBe(3); // Shepherds are not tokens: they never pump each other
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("token-r1").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("token-r1").might).toBe(3);
  });

  test("combat: with Shepherd at home a 3+1 Sprite attacking a 4-Might defender trades (both die); without Shepherd the defender survives", async () => {
    const withShep = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "shep")
      .unit(P1, "base", SPRITE_TOKEN, "token-s1")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .build();
    expect(withShep.state("token-s1").might).toBe(4);
    await withShep.p1.move("token-s1", "bf1");
    await withShep.settle();
    expect(withShep.zoneOf("wall")).toBe("trash");
    expect(withShep.has("token-s1") ? withShep.zoneOf("token-s1") : "gone").not.toBe("battlefield-bf1");

    const without = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", SPRITE_TOKEN, "token-s1")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .build();
    await without.p1.move("token-s1", "bf1");
    await without.settle();
    expect(without.zoneOf("wall")).toBe("battlefield-bf1");
    expect(without.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the aura follows the token onto a battlefield (Shepherd stays home): a boosted Sprite that conquers is still 4 out there", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "shep")
      .unit(P1, "base", SPRITE_TOKEN, "token-s1")
      .unit(P2, "bf1", { might: 2, name: "Speedbump" }, "bump")
      .build();
    await game.p1.move("token-s1", "bf1");
    await game.settle();
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.zoneOf("token-s1")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("token-s1")).toMatchObject({ damage: 0, might: 4 }); // 2 damage healed at end of combat
  });

  // rule 364: the continuous +1 applies the instant the token enters the board, so a token minted
  // by the sandbox `addToken` move must already read 2 Might — not stay at its printed 1 until some
  // later, unrelated move happens to run the static recalc.
  test("a Recruit token minted by the sandbox addToken move is 2 Might immediately, before any other move runs", async () => {
    const game = await scenario().unit(P1, "base", CARD, "shep").build();
    await game.p1.do("addToken", { playerId: P1, tokenName: "Recruit", zoneId: "base" });
    const token = game.p1.units().find((id) => game.state(id).name === "Recruit");
    expect(token).toBeDefined();
    expect(game.state(token as string).might).toBe(2);
  });

  // Expected (108.2): "your token units" are the ones you CONTROL — a P2-owned Sprite under P1's control
  // (the shape Possession leaves behind) is 4 with P1's Shepherd out and 3 with only P2's. Actual: the
  // static's "friendly" test compares OWNER, so P1's Shepherd skips it (3) and P2's pumps it (4).
  test("'your token units' should follow control, not ownership — a stolen token gets only the thief's Shepherd bonus (108.2)", async () => {
    const mine = await scenario()
      .unit(P1, "base", CARD, "shep")
      .card("token-stolen", { controller: P1, def: SPRITE_TOKEN, owner: P2, zone: "base" })
      .build();
    expect(mine.state("token-stolen")).toMatchObject({ controller: P1, owner: P2 });
    expect(mine.state("token-stolen").might).toBe(4);

    const theirs = await scenario()
      .unit(P2, "base", CARD, "theirShep")
      .card("token-stolen", { controller: P1, def: SPRITE_TOKEN, owner: P2, zone: "base" })
      .build();
    expect(theirs.state("token-stolen").might).toBe(3);
  });
});
