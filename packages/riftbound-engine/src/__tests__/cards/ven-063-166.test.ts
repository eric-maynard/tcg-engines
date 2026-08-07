/**
 * Nasus, Guardian of Knowledge — ven-063-166 · Champion Unit (Nasus) · Mind · 5 energy + [mind] · 6 Might
 *
 *   Once each turn, when an enemy unit here dies, channel 1 rune exhausted.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. "HERE" = Nasus's own location as the enemy dies (428.1.a.1.b last-known information). An enemy
 *     dying at another battlefield, or anywhere while Nasus sits in base, gives nothing.
 *  2. "Once each turn" (383.3.e.1): two enemies dying in the same combat damage step, or a spell kill
 *     followed by a combat kill in the same turn, channel exactly ONE rune. "Each turn" includes the
 *     opponent's turns — it re-arms every turn, not only on yours.
 *  3. ENEMY only: a friendly unit dying beside Nasus is not a trigger.
 *  4. "Channel 1 rune exhausted" (430.2): top rune of the rune deck enters the pool EXHAUSTED — no
 *     energy from it this turn; it readies in your next Awaken. Empty rune deck → nothing (430.3).
 *  5. Works while defending on the opponent's turn (an attacker that dies to Nasus's 6 is an enemy
 *     unit dying here) and while attacking (Action-speed removal in the combat showdown counts too).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-063-166";
/** Inline [Action] removal: 1 energy, "Deal 3 to a unit." */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's turn. Nasus (ready) in base; P2 holds bf2 with two 2-Might units; a lone P2 unit holds bf3. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "base", CARD, "nasus")
    .unit(P2, "bf2", { might: 2, name: "Victim A" }, "va")
    .unit(P2, "bf2", { might: 2, name: "Victim B" }, "vb")
    .unit(P2, "bf3", { might: 2, name: "Faraway" }, "far")
    .hand(P1, BOLT, "bolt1")
    .hand(P1, BOLT, "bolt2");
}

describe("Nasus, Guardian of Knowledge (ven-063-166)", () => {
  test("parsed trigger is scoped to enemy units dying at Nasus's location, once each turn, channeling 1 exhausted rune", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 5, isChampion: true, might: 6, powerCost: ["mind"], tags: ["Nasus"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, exhausted: true, type: "channel" },
      trigger: {
        event: "die",
        on: { controller: "enemy", location: "here", type: "unit" },
        restrictions: [{ type: "once-each-turn" }],
      },
      type: "triggered",
    });
  });

  test("cost: 5 energy + 1 mind for a 6-Might unit; without the mind power (or with 4 energy) it is not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "nasus").build();
    await game.p1.play("nasus");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("nasus")).toBe("base");
    expect(game.state("nasus")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6 });
    const noMind = await scenario().resources(P1, { energy: 9, power: { fury: 2 } }).hand(P1, CARD, "nasus").build();
    expect(noMind.p1.can("play", "nasus")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "nasus").build();
    expect(lowEnergy.p1.can("play", "nasus")).toBe(false);
  });

  test("defending on the opponent's turn: a 3-Might attacker dies to Nasus here → P1 channels 1 rune, and it enters EXHAUSTED", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "nasus")
      .unit(P2, "base", { might: 3, name: "Charger" }, "charger")
      .build();
    expect(game.p1.runes()).toHaveLength(0);
    const deckBefore = game.p1.runeDeck().length;
    await game.p2.move("charger", "bf1");
    await game.settle();
    expect(game.zoneOf("charger")).toBe("trash");
    expect(game.zoneOf("nasus")).toBe("battlefield-bf1");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
    expect(game.p1.runeDeck()).toHaveLength(deckBefore - 1);
    expect(game.p2.runes()).toHaveLength(0); // the opponent gets nothing
    expect(game.turnPlayer()).toBe(P2);
  });

  test("attacking: an Action kill in the combat showdown at Nasus's battlefield channels 1; the second enemy dying to combat damage the SAME turn channels nothing more (once each turn)", async () => {
    const game = await board().build();
    await game.p1.move("nasus", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("bolt1", { targets: "va" });
    await game.settle(); // bolt resolves (va dies here) → trigger → combat: 6 vs 2 kills vb
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.locationOf("nasus")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("two enemies dying simultaneously in one combat damage step still channel exactly ONE rune", async () => {
    const game = await board().build();
    await game.p1.move("nasus", "bf2");
    await game.settle(); // 6 damage split 2/2 (+2 excess): both victims die at once
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(1);
  });

  test("re-arms every turn: a kill on your turn AND an attacker dying on the opponent's following turn each channel one", async () => {
    const game = await board().unit(P2, "base", { might: 3, name: "Avenger" }, "avenger").build();
    await game.p1.move("nasus", "bf2");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    await game.advanceTurn(); // → P2 (P2 channels; P1's pool unchanged)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes()).toHaveLength(1);
    await game.p2.move("avenger", "bf2");
    await game.settle();
    expect(game.zoneOf("avenger")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2); // the first one has not seen P1's Awaken yet
  });

  test("the exhausted rune gives no energy now but readies in your next Awaken (then 1 + 2 channeled = 3 ready)", async () => {
    const game = await board().build();
    await game.p1.move("nasus", "bf2");
    await game.settle();
    const rune = game.p1.runes()[0] as string;
    expect(game.p1.can("tapRune", rune)).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(rune).isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
  });

  test("negative space: a FRIENDLY unit dying beside Nasus channels nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "nasus")
      .unit(P1, "bf1", { might: 1, name: "Pal" }, "pal")
      .hand(P1, BOLT, "bolt1")
      .build();
    await game.p1.cast("bolt1", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("an enemy unit dying at ANOTHER battlefield (not 'here') channels nothing", async () => {
    const game = await board().build();
    await game.p1.move("nasus", "bf1"); // park Nasus at his own empty battlefield
    expect(game.locationOf("nasus")).toBe("bf1");
    await game.p1.cast("bolt1", { targets: "far" });
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("with Nasus in BASE, an enemy unit dying at a battlefield is not 'here' and channels nothing", async () => {
    const game = await board().build();
    expect(game.locationOf("nasus")).toBe("base");
    await game.p1.cast("bolt1", { targets: "far" });
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("empty rune deck (430.3): the trigger resolves harmlessly — nothing channeled, no violation", async () => {
    const game = await scenario()
      .fillDecks({ main: 10, runes: 0 })
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "nasus")
      .unit(P2, "base", { might: 3, name: "Charger" }, "charger")
      .build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    await game.p2.move("charger", "bf1");
    await game.settle();
    expect(game.zoneOf("charger")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("negative space: a 7-Might attacker kills Nasus and survives — no enemy died, so nothing is channeled and bf1 falls", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "nasus")
      .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("nasus")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.runes()).toHaveLength(0);
  });
});
