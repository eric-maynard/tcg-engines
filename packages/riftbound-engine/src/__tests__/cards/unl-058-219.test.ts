/**
 * Lillia, Protector of Dreams — unl-058-219 · Champion Unit · Calm · 5 energy · 4 might · Lillia
 *
 *   When you play a token unit, give me +1 [Might] this turn.
 *   Your token units have [Tank]. (They must be assigned combat damage first.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Tokens are PLAYED (185.2.a / 350.2) even when an effect makes them — Frisky Hunter's Bird,
 *      Sprite Burst's two Sprites, Trevor's hold Sprite all count; each token is its own play, so two
 *      tokens = two triggers = +2. Playing a non-token unit (or Lillia herself) is not a trigger.
 *   2. "YOU play": the opponent minting tokens on their turn does nothing for your Lillia, and their
 *      tokens get no Tank from her ("YOUR token units").
 *   3. The Tank grant is a static (continuous) ability: it is on while Lillia is on the board and off
 *      the moment she leaves (or while she is still in hand); it applies to tokens that existed before
 *      her and to non-token units never.
 *   4. Tank in a real fight (815.1.b): a 4-Might attacker into Lillia (4) + Bird token (1) MUST put
 *      lethal on the Bird first, so only 3 reaches Lillia and she survives — where the same attacker
 *      into a plain 4 + Bird kills the 4.
 *   5. "this turn": the +1 expires at end of turn; a token played during your Beginning Phase (Trevor's
 *      hold Sprite) pumps her for the turn that is just starting.
 *   6. Cost: 5 energy, no power; 4 might; enters exhausted like any unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-058-219";
const BIRD = "unl-t02"; // 1-Might Bird token with Deflect (alias must start with "token-" to be a token instance)
const FRISKY_HUNTER = "unl-033-219"; // 4 energy, 3 might: When you play me, play a 1 [Might] Bird unit token with [Deflect] here.
const SPRITE_BURST = "unl-069-219"; // 5 energy spell: Play two ready 3 [Might] Sprite unit tokens with [Temporary].
const TREVOR = "unl-048-219"; // 3 might, Shield: When I hold, play a ready 3 [Might] Sprite unit token with [Temporary] here.
const BOLT4 = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

describe("Lillia, Protector of Dreams (unl-058-219)", () => {
  test("registry payload: a play-token-unit trigger giving self +1 might/turn, plus a static Tank grant to friendly token units", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, isChampion: true, might: 4, tags: ["Lillia"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "play-token-unit", on: "controller" },
      type: "triggered",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { keyword: "Tank", target: { controller: "friendly", filter: "token", type: "unit" }, type: "grant-keyword" },
      type: "static",
    });
  });

  test("cost: 5 energy for a 4-Might unit that enters the base exhausted; 4 energy is not enough; playing HER is not a token play (stays 4)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "lillia").build();
    await game.p1.play("lillia");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("lillia")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.chain()).toEqual([]);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "lillia").build();
    expect(poor.p1.can("play", "lillia")).toBe(false);
  });

  test("Frisky Hunter's Bird is a token unit YOU play: Lillia's trigger goes on the chain and gives her +1 this turn (4 → 5), gone next turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lillia")
      .hand(P1, FRISKY_HUNTER, "frisky")
      .build();
    await game.p1.play("frisky", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Frisky resolves → Bird is played → Lillia triggers
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("lillia").might).toBe(5);
    expect(game.state("lillia").baseMight).toBe(4);
    expect(game.state("frisky").might).toBe(3); // only "me"
    await game.advanceTurn();
    expect(game.state("lillia").might).toBe(4);
  });

  test("each token is its own play: Sprite Burst's two Sprites give +2 (4 → 6)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", CARD, "lillia").hand(P1, SPRITE_BURST, "burst").build();
    await game.p1.cast("burst");
    await game.settle();
    expect(game.p1.units().filter((id) => game.state(id).name === "Sprite")).toHaveLength(2);
    expect(game.state("lillia").might).toBe(6);
  });

  test("negative space: playing a NON-token unit does not trigger her", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "lillia").hand(P1, { might: 2, energyCost: 2, name: "Card Unit" }, "cardUnit").build();
    await game.p1.play("cardUnit");
    await game.settle();
    expect(game.zoneOf("cardUnit")).toBe("base");
    expect(game.state("lillia").might).toBe(4);
  });

  test("'when YOU play': the opponent minting a Bird on their turn neither pumps your Lillia nor gets Tank on their token", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4 })
      .unit(P1, "base", CARD, "lillia")
      .hand(P2, FRISKY_HUNTER, "theirFrisky")
      .build();
    await game.p2.play("theirFrisky");
    await game.settle();
    expect(game.state("lillia").might).toBe(4);
    const theirBird = game.p2.units().find((id) => game.state(id).name === "Bird") as string;
    expect(theirBird).toBeDefined();
    expect(game.state(theirBird).keywords).not.toContain("Tank");
  });

  test("static: YOUR token units have Tank (granted, static duration) — pre-existing tokens included; your non-token units and enemy tokens do not", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "lillia")
      .unit(P1, "base", BIRD, "token-mine")
      .unit(P1, "base", { might: 1, name: "Plain" }, "plain")
      .unit(P2, "base", BIRD, "token-theirs")
      .build();
    expect(game.state("token-mine").keywords).toEqual(expect.arrayContaining(["Deflect", "Tank"]));
    expect(game.state("token-mine").grantedKeywords).toEqual([{ duration: "static", keyword: "Tank" }]);
    expect(game.state("plain").keywords).not.toContain("Tank");
    expect(game.state("token-theirs").keywords).toEqual(["Deflect"]);
    expect(game.state("lillia").keywords).not.toContain("Tank");
  });

  test("static needs Lillia ON THE BOARD: in hand she grants nothing; once she dies to a 4-damage bolt the Bird loses Tank again", async () => {
    const inHand = await scenario().hand(P1, CARD, "lillia").unit(P1, "base", BIRD, "token-mine").build();
    expect(inHand.state("token-mine").keywords).not.toContain("Tank");

    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "lillia")
      .unit(P1, "base", BIRD, "token-mine")
      .hand(P2, BOLT4, "bolt")
      .build();
    expect(game.state("token-mine").keywords).toContain("Tank");
    await game.p2.cast("bolt", { targets: "lillia" });
    await game.settle();
    expect(game.zoneOf("lillia")).toBe("trash");
    expect(game.state("token-mine").keywords).not.toContain("Tank");
  });

  test("Tank in combat (815.1.b): a 4-Might raider into Lillia (4) + Bird token (1) must kill the Bird first — Lillia survives, raider dies, bf1 held", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lillia")
      .unit(P1, "bf1", BIRD, "token-bird")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    expect(game.state("token-bird").keywords).toContain("Tank");
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 4 + 1
    expect(game.has("token-bird") && game.locationOf("token-bird") === "bf1").toBe(false); // lethal went here first
    expect(game.zoneOf("lillia")).toBe("battlefield-bf1"); // only 3 left for her
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("control: the same raider into a PLAIN 4-Might unit + Bird (no Lillia, no Tank) is free to kill the 4-Might unit instead", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Big" }, "big")
      .unit(P1, "bf1", BIRD, "token-bird")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    expect(game.state("token-bird").keywords).not.toContain("Tank");
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.locationOf("token-bird")).toBe("bf1");
  });

  test("a token played during your Beginning Phase (Trevor's hold Sprite) pumps Lillia for the turn that is starting: 5 in your main phase, 4 again after it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TREVOR, "trevor")
      .unit(P1, "base", CARD, "lillia")
      .build();
    await game.advanceTurn({ policy: "first" });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // Trevor held
    const sprite = game.p1.units("bf1").find((id) => game.state(id).name === "Sprite") as string;
    expect(sprite).toBeDefined();
    expect(game.state(sprite).keywords).toEqual(expect.arrayContaining(["Temporary", "Tank"]));
    expect(game.state("lillia").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("lillia").might).toBe(4);
  });
});
