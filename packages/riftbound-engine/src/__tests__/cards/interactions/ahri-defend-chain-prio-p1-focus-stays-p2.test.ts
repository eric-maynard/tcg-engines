/**
 * Interaction: Ahri, Inquisitive (ogn-119-298) · Champion Unit · Mind · 3 · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 · "[Action] Deal 3 to a unit at a battlefield."
 *
 * Question: P2's turn. P1 controls bfA with Ahri. P2 Standard-Moves Vanguard Sergeant base → bfA and holds
 * Hextech Ray. (a) The Combat Chain opens holding only Ahri's DEFEND trigger (P1's). At that first window,
 * who holds Priority and who holds Focus — can they differ? (b) Both pass, the trigger resolves (Sergeant → 2)
 * and the chain is empty during a showdown: does Focus pass to P1 or stay with attacker P2? (c) P2 then plays
 * Hextech Ray on Ahri; after THAT chain empties, does Focus pass? Contrast the two empty-chain moments.
 *
 * Rules: 464.2.c.1.a / 464.2.d (combat showdown opens, Attacker gains Focus), 464.2.e (attack/defend
 * triggers go on the Combat Chain), 337.4 / 312.2.c (controller of the newest chain item holds Priority),
 * 313.3 (Focus is independent of Priority), 309.1.a (Closed: only Reactions), 346 / 346.1 / 340.2.a (Focus
 * passes when a chain opened by PLAYING A CARD empties — not one opened by a triggered ability), 335.1
 * (showdown, nothing pending → Focus holder gets Priority), 347.1.b (a Focus action passes Focus when done),
 * 465.1 (no defenders → no combat damage), 466.5 (sole remaining side establishes control → conquer).
 *
 * Expected: (a) Contested by P2; combat showdown at bfA, P2 Attacker with Focus, Ahri Defender; her trigger is
 * the only chain item (P1's) → Showdown-Closed with Priority P1 but Focus P2 — different players, legal. P1
 * passes → Priority P2 (still Closed: Hextech Ray, an Action, is NOT playable); P2 passes → Sergeant = 2 Might.
 * (b) Chain empty → Showdown-Open; the chain was opened by a triggered ability → Focus does NOT pass: Focus P2,
 * Priority P2 (Ray now playable). (c) Ray on Ahri: Priority P2 → pass → Priority P1 (Focus still P2) → pass →
 * Ahri takes 3 and dies. This chain was opened by a played card → Focus passes to P1 (with Priority) on P2's
 * turn. P1 passes, P2 passes → showdown ends; no defender → no combat damage; P2 conquers bfA (+1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const SERGEANT = "ogn-219-298";
const HEXTECH_RAY = "ogn-009-298";

function showdownOf(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

function turnState(game: Game): string {
  const showdown = showdownOf(game) !== undefined;
  const chain = game.gameState.interaction?.chain?.active === true;
  return `${showdown ? "showdown" : "neutral"}-${chain ? "closed" : "open"}`;
}

/** (priority holder, focus holder, turn state) — the triple the question asks about. */
function triple(game: Game): [string | undefined, string | undefined, string] {
  return [game.actingSeat(), showdownOf(game)?.focusPlayer, turnState(game)];
}

function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", AHRI, "ahri")
    .unit(P2, "base", SERGEANT, "sarge")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** P2 attacks bfA with the Sergeant → Combat Chain holding Ahri's defend trigger. */
async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.move("sarge", "bfA");
  return game;
}

/** …and both players pass so the trigger resolves (Sergeant → 2) leaving an empty chain mid-showdown. */
async function triggerResolved(): Promise<Game> {
  const game = await attack();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ahri defends vs Vanguard Sergeant — Priority P1 / Focus P2 on the Combat Chain, and when Focus passes", () => {
  test("(a) the move applies Contested and opens a COMBAT showdown at bfA: P2 Attacker with Focus, Ahri Defender (464.2.c.1.a, 464.2.d)", async () => {
    const game = await attack();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdownOf(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
  });

  test("(a) the Combat Chain holds only Ahri's defend trigger (P1's, targeting the Sergeant) → Showdown-Closed with PRIORITY P1 while FOCUS is P2 — two different players (464.2.e, 337.4, 313.3)", async () => {
    const game = await attack();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, targets: ["sarge"], triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1, source: { cardId: "ahri" } });
    expect(triple(game)).toEqual([P1, P2, "showdown-closed"]);
    expect(game.state("sarge").might).toBe(4); // not resolved yet
  });

  test("(a) P1 passes → Priority moves to P2 but the state is still Closed: Hextech Ray (an [Action]) is NOT playable there (309.1.a); Focus unchanged", async () => {
    const game = await attack();
    await game.p1.passPriority();
    expect(triple(game)).toEqual([P2, P2, "showdown-closed"]);
    expect(game.p2.can("cast", "ray")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.chain()).toHaveLength(1);
  });

  test("(a→b) P2 passes too → the trigger resolves: Sergeant is 2 Might this turn (4 − 2, min 1), Ahri untouched", async () => {
    const game = await triggerResolved();
    expect(game.chain()).toEqual([]);
    expect(game.state("sarge")).toMatchObject({ baseMight: 4, might: 2, zone: "battlefield-bfA" });
    expect(game.state("ahri")).toMatchObject({ damage: 0, might: 3 });
  });

  test("(b) empty chain mid-showdown after a TRIGGER-opened chain: Focus does NOT pass — Focus P2 and Priority P2 in Showdown-Open (346.1, 340.2.a, 335.1); Ray is now playable", async () => {
    const game = await triggerResolved();
    expect(triple(game)).toEqual([P2, P2, "showdown-open"]);
    expect(showdownOf(game)?.focusPlayer).not.toBe(P1);
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(true);
    expect(game.p1.legal()).toEqual([]); // P1 holds neither Focus nor Priority
  });

  test("(c) P2 casts Hextech Ray on Ahri with Focus: Priority P2 → pass → Priority P1 while Focus stays P2 (313.3) → pass → Ahri (3) takes 3 and dies", async () => {
    const game = await triggerResolved();
    await game.p2.cast("ray", { targets: "ahri" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["ahri"], triggered: false })]);
    expect(triple(game)).toEqual([P2, P2, "showdown-closed"]);
    await game.p2.passPriority();
    expect(triple(game)).toEqual([P1, P2, "showdown-closed"]);
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(c) contrast: THIS chain was opened by a played card → when it empties Focus PASSES to P1, who also gets Priority — (P1, P1, showdown-open) on P2's turn (346, 347.1.b)", async () => {
    const game = await triggerResolved();
    await game.p2.cast("ray", { targets: "ahri" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.turnPlayer()).toBe(P2);
    expect(triple(game)).toEqual([P1, P1, "showdown-open"]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
  });

  test("(c) P1 passes Focus, P2 passes Focus → showdown ends; no defender remains so no combat damage is dealt (465.1); P2 wins and conquers bfA for +1 (466.5)", async () => {
    const game = await triggerResolved();
    await game.p2.cast("ray", { targets: "ahri" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passFocus();
    expect(triple(game)).toEqual([P2, P2, "showdown-open"]);
    await game.p2.passFocus();
    await game.settle(); // combat resolution procedure
    expect(showdownOf(game)).toBeUndefined();
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(turnState(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
