/**
 * Interaction: Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Vayne, Hunter (ogn-035-298) · Champion Unit · Fury · 4+[fury] · 2 Might
 *     "[Assault 3] If an opponent controls a battlefield, I enter ready. When I conquer, you may pay [1]…"
 *   × Sai Scout (ogn-174-298) · Unit · Chaos · 6 · 5 Might
 *     "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *      You may play me to an open battlefield."
 *   (+ P2's vanilla 2-Might "Stalwart Poro", P1's vanilla 3-Might "Scout Rider" for the combat contrast)
 *
 * Question: P1's turn, Neutral Open. P2 controls exactly one battlefield, A, with a lone 2-Might Poro; B is
 * uncontrolled and empty. P1 holds Gust, Vayne and Sai Scout.
 *   (a) Before Gust: is A "open"? Where may Sai Scout be played; does Vayne enter ready?
 *   (b) P1 Gusts the Poro. After the Cleanup who controls A, and is A occupied / uncontrolled / open?
 *   (c) Now does Vayne enter ready? May Sai Scout be played straight to A, and what does that start?
 *   (d) Contrast: had the Poro left A during a showdown/combat AT A, would A have become open then?
 *
 * Rules: 170.11.a/.b/.c (occupied / uncontrolled / open = unoccupied AND uncontrolled), 190.2.a/.b (control
 * is per player, binary), 323.6 + 190.4.c (Open State, no showdown there, no units → controller LOSES it —
 * nobody gains it), 190.4.b (control cannot change while a showdown/combat is ongoing there), 190.5 (Vayne's
 * condition is read as she enters), 355.2.a (units are played to base or a battlefield you control; Sai
 * Scout adds "an open battlefield"), 190.3.a.1 (a unit played to a battlefield you don't control applies
 * Contested), 323.8 / 323.12 / 345 (Cleanup STAGES the showdown; it begins once the chain is empty in
 * Neutral Open, contesting player has Focus), 348.2.a (showdown closes with only P1's unit → control →
 * Conquer).
 *
 * Expected: (a) A occupied + P2's → not open: Sai Scout → base or B only; Vayne enters READY. (b) Poro to
 * P2's hand; A controller = nobody, not contested, nothing staged; A is open. (c) Vayne now enters
 * EXHAUSTED; Sai Scout may be played to A → Contested, Vision on the chain, showdown only staged; chain
 * empties → non-combat showdown at A, P1 Focus; pass/pass → P1 conquers A (+1). (d) No — mid-combat A stays
 * "P2's but unoccupied", Sai Scout is not playable there; the combat's own resolution hands A to P1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VAYNE_HUNTER = "ogn-035-298";
const SAI_SCOUT = "ogn-174-298";

/**
 * P1's turn with exactly Gust (1) + Vayne (4+[fury]) + Sai Scout (6) = 11 energy, 1 fury. P2 controls A
 * with a lone 2-Might Poro; B is uncontrolled and empty. P1 also has a 3-Might vanilla Rider in base for (d).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { fury: 1 } })
    .battlefield("A", { controller: P2 })
    .battlefield("B", { controller: null })
    .unit(P2, "A", { might: 2, name: "Stalwart Poro" }, "poro")
    .unit(P1, "base", { might: 3, name: "Scout Rider" }, "rider")
    .hand(P1, GUST, "gust")
    .hand(P1, VAYNE_HUNTER, "vayne")
    .hand(P1, SAI_SCOUT, "sai");
}

/** Legal `to` destinations offered to P1 for playing `alias` right now ([] when not playable). */
function destinations(game: Game, alias: string): string[] {
  const f = game.p1.option("play", alias)?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).slice().sort();
}

function activeShowdown(game: Game) {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
}

/** P1 Gusts the Poro in the main phase and everyone passes. */
async function gustThePoro(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("gust", { targets: "poro" });
  await game.settle();
  return game;
}

describe("(a) before Gust — A is occupied and controlled by P2", () => {
  test("A is neither uncontrolled nor open (170.11): Sai Scout is offered base and the open B — NOT A; playing her to A is rejected (355.2.a)", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P2 });
    expect(game.cardsAt("A")).toEqual(["poro"]);
    expect(game.gameState.battlefields.B).toMatchObject({ contested: false, controller: null });
    expect(game.cardsAt("B")).toEqual([]);
    expect(destinations(game, "sai")).toEqual(["base", "battlefield-B"]);
    await expect(game.p1.play("sai", { to: "A" })).rejects.toThrow();
    expect(game.zoneOf("sai")).toBe("hand");
    expect(game.p1.energy()).toBe(11);
  });

  test("Vayne played now (4+[fury], to base) enters READY — an opponent controls a battlefield (190.5)", async () => {
    const game = await board().build();
    expect(destinations(game, "vayne")).toEqual(["base"]);
    await game.p1.play("vayne", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 0 } });
    expect(game.state("vayne")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
  });
});

describe("(b) P1 Gusts the lone Poro", () => {
  test("Gust (1) resolves: the Poro returns to its owner P2's hand; the Cleanup in Neutral Open strips P2's control — A is controlled by NOBODY (not P1), not contested, nothing staged; B unchanged (323.6, 190.2)", async () => {
    const game = await gustThePoro();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p1.energy()).toBe(10);
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.battlefields.B).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(activeShowdown(game)).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("A is now unoccupied AND uncontrolled = 'open' (170.11.c): Sai Scout's destinations gain A", async () => {
    const game = await gustThePoro();
    expect(game.cardsAt("A")).toEqual([]);
    expect(game.gameState.battlefields.A?.controller).toBeNull();
    expect(destinations(game, "sai")).toEqual(["base", "battlefield-A", "battlefield-B"]);
  });
});

describe("(c) after Gust", () => {
  test("Vayne played now enters EXHAUSTED — no opponent controls any battlefield as she enters (190.5)", async () => {
    const game = await gustThePoro();
    await game.p1.play("vayne", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 0 } });
    expect(game.state("vayne")).toMatchObject({ isExhausted: true, isReady: false, zone: "base" });
  });

  test("Sai Scout (6) played straight to the open A: she is at A, A is Contested by P1 (190.3.a.1), her Vision trigger is on the chain (Closed) — so the showdown is only STAGED, not begun (323.8)", async () => {
    const game = await gustThePoro();
    await game.p1.play("sai", { to: "A" });
    expect(game.p1.energy()).toBe(4);
    expect(game.zoneOf("sai")).toBe("battlefield-A");
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sai", controller: P1, triggered: true })]);
    expect(activeShowdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
  });

  test("once the chain is empty (Vision looked, recycle declined) and the state is Neutral Open, the staged NON-COMBAT showdown at A begins with P1 holding Focus (323.12, 345)", async () => {
    const game = await gustThePoro();
    await game.p1.play("sai", { to: "A" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // Vision: may recycle the top card
    await game.p1.decline();
    expect(game.chain()).toEqual([]);
    expect(activeShowdown(game)).toMatchObject({ battlefieldId: "A", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("sai").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.A?.controller).toBeNull(); // not yet
  });

  test("pass, pass → the showdown closes with only Sai Scout there: P1 establishes control of A and CONQUERS (+1); A controller P1, not contested, nothing staged (348.2.a)", async () => {
    const game = await gustThePoro();
    await game.p1.play("sai", { to: "A" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(activeShowdown(game)).toBeUndefined();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("sai")).toMatchObject({ damage: 0, zone: "battlefield-A" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — the Poro leaves A DURING a combat at A", () => {
  /** P1's Rider attacks A (combat showdown, P1 Focus); P1 Gusts the Poro; both pass priority so Gust resolves. */
  async function gustMidCombat(): Promise<Game> {
    const game = await board().build();
    await game.p1.move("rider", "A");
    expect(activeShowdown(game)).toMatchObject({ battlefieldId: "A", isCombatShowdown: true });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    return game;
  }

  test("Gust resolves mid-showdown: the Poro is in P2's hand and P2 has no unit at A, yet A stays CONTROLLED BY P2 (contested by P1) — control cannot change while the showdown is ongoing, 323.6 does not apply (190.4.b)", async () => {
    const game = await gustMidCombat();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.units("A")).toEqual([]);
    expect(activeShowdown(game)).toMatchObject({ battlefieldId: "A" });
    expect(game.gameState.battlefields.A).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p2.battlefields({ controlled: true })).toEqual(["A"]); // what Vayne's condition would read
    expect(game.p1.points()).toBe(0);
  });

  test("so A is NOT 'open' at that moment: Sai Scout cannot be played there (nor anywhere mid-showdown — no Reaction/Action timing), whoever holds Focus", async () => {
    const game = await gustMidCombat();
    // Casting Gust passed Focus to P2; check both seats' windows.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("play", "sai")).toBe(false);
    expect(destinations(game, "sai")).toEqual([]);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus back with P1
    expect(game.gameState.battlefields.A?.controller).toBe(P2);
    expect(game.p1.can("play", "sai")).toBe(false);
    expect(destinations(game, "sai")).toEqual([]);
    await expect(game.p1.play("sai", { to: "A" })).rejects.toThrow();
    expect(game.zoneOf("sai")).toBe("hand");
  });

  test("A only changes hands through that combat's own resolution: everyone passes → no defender, the Rider remains → P1 conquers A (+1); it was never uncontrolled in between", async () => {
    const game = await gustMidCombat();
    let sawUncontrolled = false;
    const watch = () => {
      sawUncontrolled ||= game.gameState.battlefields.A?.controller === null;
      return undefined;
    };
    game.script(P1, [watch]);
    game.script(P2, [watch]);
    watch();
    await game.settle();
    expect(sawUncontrolled).toBe(false);
    expect(game.gameState.battlefields.A).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("rider")).toMatchObject({ damage: 0, zone: "battlefield-A" });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
