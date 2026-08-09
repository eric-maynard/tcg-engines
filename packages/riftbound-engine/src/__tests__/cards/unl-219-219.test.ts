/**
 * Vaults of Helia — unl-219-219 · Battlefield
 *
 *   When you hold here, your non-token units cost [1] more to play this turn.
 *
 * Rules: 469.2 / 315.2.b (Hold: keep control through your Beginning Phase's Scoring Step → 1 point),
 * 471.2.b (hold abilities trigger only at the held battlefield), 356 / 357 (a card's cost is what
 * must be paid to finalize it; increases are added on top of the base Energy cost), 185 (tokens are
 * "played" by effects and have no cost of their own — hence the "non-token" carve-out), 317.2.c
 * ("this turn" effects expire in the Expiration Step), 469.1 (conquer ≠ hold), 740.1.a ("your").
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. This is a DRAWBACK on the holder: after holding, my 2-cost unit needs 3 Energy this turn —
 *     exact-energy checks (2 → not playable, 3 → playable and drained to 0).
 *  2. Scope: UNITS only — my spells and gear keep their printed cost; TOKENS are exempt (a Sprite
 *     Call still puts its Sprite into play for the spell's own 3); a unit played from the Champion
 *     Zone is still "a unit you play" and is taxed.
 *  3. Trigger scope: only holding HERE (not another battlefield), only HOLDING (conquering the Vaults
 *     mid-turn taxes nothing), and "you" = the holder (P2 holding taxes P2, on P2's turn).
 *  4. "this turn": once I no longer hold the Vaults (walked home, control lapsed) my next turn's
 *     plays are back to printed cost.
 *  Engine note: the card is registered as a triggered grant of a virtual "CostIncrease" keyword to
 *  the PLAYER with no unit / non-token qualifier ("engine support pending").
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-219-219";
const SPRITE_CALL = "ogn-094-298"; // Mind Action spell, 3 energy: Play a ready 3-Might Sprite unit token with [Temporary].
const FIORA = "sfd-180-221"; // Champion unit · Order · 3 energy, no power · 3 Might
const TWO_DROP = { cardType: "unit", energyCost: 2, might: 2, name: "Two-drop" };
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" };
const PLOY = { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", energyCost: 1, name: "Ploy" };

/** P2 is about to end turn 2; P1 controls the Vaults with a unit standing on it and holds the test cards. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: CARD, inert: false })
    .battlefield("other", { controller: null })
    .unit(P1, "vaults", { might: 2, name: "Holder" }, "holder")
    .champion(P1, FIORA, "fiora")
    .hand(P1, TWO_DROP, "two")
    .hand(P1, TRINKET, "trinket")
    .hand(P1, PLOY, "ploy")
    .hand(P1, SPRITE_CALL, "call")
    .fillDecks({ main: 10, runes: 0 }); // no channel noise; Energy is injected explicitly below
}

/** P2 ends the turn; P1 holds the Vaults (trigger passes through) and reaches the Main Phase with exactly `energy`. */
async function holdThenMain(game: Game, energy: number): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1);
  if (energy > 0) {
    await game.p1.do("addResources", { energy });
  }
  expect(game.p1.energy()).toBe(energy);
}

describe("Vaults of Helia (unl-219-219)", () => {
  // BUG — expected: a "hold here" trigger whose turn-long effect raises the Energy cost of the holder's NON-TOKEN UNIT
  // plays by 1. Actual: a `grant-keyword` of a virtual "CostIncrease" keyword to the player, value 1, duration turn —
  // with no unit / non-token qualifier at all (and nothing in the engine reads it).
  test("registry payload should be hold-here → +[1] this turn on the controller's non-token UNIT plays (parsed as an unqualified player keyword grant)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Vaults of Helia" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; trigger: unknown; effect: Record<string, unknown> };
    expect(ability.type).toBe("triggered");
    expect(ability.trigger).toMatchObject({ event: "hold" });
    expect(ability.effect).toMatchObject({ duration: "turn" });
    const effect = JSON.stringify(ability.effect);
    expect(effect).toContain('"unit"'); // scoped to unit plays …
    expect(effect).toMatch(/non-?token|excludeTokens?|isToken/i); // … that are not tokens
    expect(effect).toMatch(/"(amount|value)":1/);
  });

  test("holding the Vaults scores the point and puts its trigger on the chain (P1's, triggered); it resolves into an ordinary Main Phase", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vaults", controller: P1, triggered: true, type: "ability" })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
  });

  // BUG (shared by the unit-cost tests below) — expected: after the hold my 2-cost unit costs 3 this turn.
  // Actual: the play is offered and charged at the printed 2; the CostIncrease grant is never applied.
  test("core line — after holding, my 2-cost unit is NOT playable on exactly 2 Energy; on 3 it is, and all 3 are spent", async () => {
    const short = await aboutToHold().build();
    await holdThenMain(short, 2);
    expect(short.p1.can("play", "two")).toBe(false);
    expect((await short.p1.try((p) => p.play("two", { to: "base" }))).ok).toBe(false);
    expect(short.zoneOf("two")).toBe("hand");

    const enough = await aboutToHold().build();
    await holdThenMain(enough, 3);
    expect(enough.p1.can("play", "two")).toBe(true);
    await enough.p1.play("two", { to: "base" });
    await enough.settle();
    expect(enough.zoneOf("two")).toBe("base");
    expect(enough.p1.energy()).toBe(0);
    expect(enough.violations()).toEqual([]);
  });

  test("a unit played from the Champion Zone is still 'a unit you play' — 3-cost Fiora needs 4 after the hold (3 → not offered; 4 → played, pool drained)", async () => {
    const short = await aboutToHold().build();
    await holdThenMain(short, 3);
    expect(short.p1.can("playChampion")).toBe(false);

    const enough = await aboutToHold().build();
    await holdThenMain(enough, 4);
    await enough.p1.playChampion("base");
    await enough.settle();
    expect(enough.zoneOf("fiora")).toBe("base");
    expect(enough.p1.energy()).toBe(0);
  });

  test("UNITS only: after the hold my 1-cost gear and my 1-cost spell are still played for exactly 1 each", async () => {
    const game = await aboutToHold().build();
    await holdThenMain(game, 2);
    expect(game.p1.can("play", "trinket")).toBe(true);
    await game.p1.play("trinket");
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("ploy");
    await game.settle();
    expect(game.zoneOf("ploy")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("NON-TOKEN: a Sprite token put into play by Sprite Call after the hold costs nothing extra — the spell's own 3 Energy is all that is paid and the Sprite arrives ready", async () => {
    const game = await aboutToHold().build();
    await holdThenMain(game, 3);
    const before = game.p1.units().length;
    await game.p1.cast("call");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      await game.p1.pick(d.options[0]?.key as string); // token destination, if asked
      await game.settle();
    }
    expect(game.zoneOf("call")).toBe("trash");
    const sprites = game.p1.units().filter((u) => game.state(u).name === "Sprite");
    expect(sprites).toHaveLength(1);
    expect(game.p1.units()).toHaveLength(before + 1);
    expect(game.state(sprites[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.p1.energy()).toBe(0);
  });

  test("HOLD only (469.1 ≠ 469.2): conquering the Vaults mid-turn triggers nothing — the 2-drop is then played for its printed 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("vaults", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, TWO_DROP, "two")
      .build();
    await game.p1.move("raider", "vaults");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.can("play", "two")).toBe(true);
    await game.p1.play("two", { to: "base" });
    expect(game.p1.energy()).toBe(0);
  });

  test("'here' only: holding a DIFFERENT battlefield while the Vaults lie uncontrolled puts nothing on the chain and the 2-drop costs 2", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("vaults", { controller: null, def: CARD, inert: false })
      .battlefield("other", { controller: P1 })
      .unit(P1, "other", { might: 2, name: "Holder" }, "holder")
      .hand(P1, TWO_DROP, "two")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p2.endTurn();
    expect(game.chain().some((i) => i.cardId === "vaults")).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.play("two", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("two")).toBe("base");
  });

  test("'you' = the holder — P2 holding the Vaults gets P2's trigger and P2's 2-drop needs 3 on P2's turn; P1 is untouched", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("vaults", { controller: P2, def: CARD, inert: false })
      .unit(P2, "vaults", { might: 2, name: "Their Holder" }, "theirs")
      .hand(P2, TWO_DROP, "theirTwo")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vaults", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    await game.p2.do("addResources", { energy: 2 });
    expect(game.p2.can("play", "theirTwo")).toBe(false);
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.play("theirTwo", { to: "base" });
    expect(game.p2.energy()).toBe(0);
  });

  test("'this turn' — taxed on the hold turn (2 Energy won't do), then the holder walks home, control lapses, and on my NEXT turn (no hold) the same 2-drop is played for its printed 2", async () => {
    const game = await aboutToHold().build();
    await holdThenMain(game, 2);
    expect(game.p1.can("play", "two")).toBe(false); // hold turn: costs 3
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.vaults?.controller).toBe(null);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // nothing held this time
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.can("play", "two")).toBe(true);
    await game.p1.play("two", { to: "base" });
    expect(game.p1.energy()).toBe(0);
  });
});
