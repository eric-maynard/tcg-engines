/**
 * Ruling 8eb3336792a60f85 — (setup error: the Chosen Champion left in the Main Deck; no card interaction)
 *   Exercised with Ahri, Alluring (OGN-066 → ogn-066-298 · Champion Unit · [5] · 4 Might).
 *
 * Q: What happens if you play with your Chosen Champion shuffled into your deck instead of the Champion Zone?
 * A: It is a setup/deck-legality error handled by the Tournament Rules (restore the game state if caught early,
 *    otherwise a Warning or a Game Loss depending on when and by whom it is found). The GAME rule underneath is
 *    the testable part: a champion must be IN the Champion Zone to be played from there. A copy that is in the
 *    deck or the hand is an ordinary card played for its printed cost, and an empty Champion Zone simply offers
 *    no champion play at all.
 * Rules: 419.1.a (playing from the Champion Zone), 703.4.b / 703.4.b.3-4 (Tournament Rules — restoration and
 *        penalties; not modelled by the engine), 103.2 (the Chosen Champion is registered with the deck).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-066-298";

const resources = { energy: 8, power: { calm: 3, rainbow: 3 } };

describe("Ruling 8eb3336792a60f85 — a champion is playable from the Champion Zone and nowhere else", () => {
  test("correct setup: Ahri in the Champion Zone is playable from there and enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, resources)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .champion(P1, AHRI, "ahri")
      .build();
    expect(game.zoneOf("ahri")).toBe("championZone");
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.state("ahri").isExhausted).toBe(true);
  });

  test("champion left in the DECK: the Champion Zone is empty and no champion play is offered", async () => {
    const game = await scenario()
      .resources(P1, resources)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .deckTop(P1, AHRI, "ahri")
      .build();
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("ahri")).toBe("mainDeck");
    expect(game.p1.can("playChampion")).toBe(false);
    const refused = await game.p1.try((p) => p.playChampion("base"));
    expect(refused.ok).toBe(false);
  });

  test("drawn from the deck it is just a card in hand — private, and played like any other unit for its printed cost", async () => {
    const game = await scenario()
      .resources(P1, resources)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .deckTop(P1, AHRI, "ahri")
      .build();
    await game.p1.do("drawCard", { count: 1 });
    expect(game.zoneOf("ahri")).toBe("hand");
    expect(game.p1.can("playChampion")).toBe(false); // still nothing in the Champion Zone
    const energyBefore = game.p1.energy();
    await game.p1.play("ahri");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.p1.energy()).toBeLessThan(energyBefore); // paid its printed cost
  });

  test("a SECOND copy in hand alongside the champion in the zone: the zone copy is the one 'played as champion', the hand copy is a normal play", async () => {
    const game = await scenario()
      .resources(P1, resources)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .champion(P1, AHRI, "ahri")
      .hand(P1, AHRI, "ahri2")
      .build();
    expect(game.p1.champion()).toBe("ahri");
    expect(game.zoneOf("ahri2")).toBe("hand");
    await game.p1.play("ahri2");
    await game.settle();
    expect(game.zoneOf("ahri2")).toBe("base");
    expect(game.zoneOf("ahri")).toBe("championZone"); // untouched by the hand copy's play
    expect(game.p1.champion()).toBe("ahri");
    expect(game.violations()).toEqual([]);
  });
});
