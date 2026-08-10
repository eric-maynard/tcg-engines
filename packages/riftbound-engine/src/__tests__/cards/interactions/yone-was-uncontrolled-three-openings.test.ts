/**
 * Interaction: Yone, Blademaster (sfd-116-221) · Champion Unit · Body · 5 · 5 Might
 *     "[Weaponmaster] When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an
 *      enemy unit in a base."
 *   × Plundering Poro (sfd-069-221) · Unit · Mind · 2 · 2 Might "When I conquer, play a Gold gear token exhausted."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 · "[Action] Deal 3 to a unit at a battlefield."
 *   (+ a vanilla 4-Might unit in P2's base — the only "enemy unit in a base")
 *
 * Question: P1's turn; P2 has a 4-Might unit in base; P2 controls bfB with a lone Plundering Poro (2); bfC is
 * empty and uncontrolled. (a) Yone Standard-Moves to bfC. (b) P1 first Hextech-Rays the Poro at bfB (main
 * phase), then moves Yone into the now-empty bfB that P2 controlled a moment ago. (c) Yone moves into bfB while
 * the Poro is still there. In each: what opens (stand-alone Non-Combat Showdown vs Combat), who has Focus,
 * does P1 conquer/score when everyone passes, and does Yone's "was uncontrolled" trigger fire?
 *
 * Rules: 450 (a move applies Contested), 323.8 / 323.9 (Cleanup stages a Showdown; + Combat only with opposing
 * units), 323.12 / 344.2 / 345 (Non-Combat Showdown opens, the contesting player has Focus), 348.2.a /
 * 348.2.a.1 / 469.1 (showdown ends with one player's units → establish control → Conquer), 323.5 / 323.6 /
 * 190.4.c (a lethal unit dies in Cleanup; in an Open State with no showdown there its controller LOSES the
 * empty battlefield), 323.13 / 464.1 / 464.2 (opposing units → Combat with its own showdown, mover = Attacker
 * with Focus), 466.5 / 466.5.d (combat winner establishes control → Conquer), 316.8.b.1 (damage heals after
 * combat), Yone: "that was uncontrolled" reads the controller at the moment of the conquer.
 *
 * Expected: (a) Non-Combat Showdown at bfC, P1 Focus, no attacker/defender roles; pass, pass → P1 controls
 * bfC, +1; bfC was uncontrolled → trigger: 5 to the 4-Might base unit → it dies. (b) Ray kills the Poro; the
 * Cleanup (Open State, no showdown at bfB) strips P2's control → bfB uncontrolled BEFORE Yone moves; the move
 * opens a Non-Combat Showdown (no opposing units), P1 Focus; pass, pass → P1 controls bfB, +1; "was
 * uncontrolled" → trigger fires (5 to the base unit). P2 scores nothing. (c) Opposing units → Combat: P1
 * Attacker with Focus, Poro Defender; pass, pass → Yone 5 kills Poro 2, survives and heals; P1 establishes
 * control → +1. bfB was P2's when conquered → trigger does NOT fire; the base unit is untouched.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";
const PLUNDERING_PORO = "sfd-069-221";
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

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", YONE, "yone")
    .unit(P2, "base", { might: 4, name: "Base Guard" }, "guard")
    .unit(P2, "bfB", PLUNDERING_PORO, "poro")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Both relevant players pass Focus on an empty chain → the showdown ends (348). */
async function bothPassFocus(game: Game): Promise<void> {
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("(a) Yone Standard-Moves to the empty, uncontrolled bfC", () => {
  test("Contested by P1; the Cleanup opens a stand-alone NON-COMBAT showdown at bfC with P1 holding Focus — no Attacker/Defender designations, empty chain (450, 323.8, 344.2, 345)", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdownOf(game)).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("yone").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(turnState(game)).toBe("showdown-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.points()).toBe(0); // nothing scored until the showdown ends
  });

  test("P1 pass, P2 pass → showdown ends: P1 establishes control of bfC and Conquers for +1 (348.2.a, 348.2.a.1)", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfC");
    await bothPassFocus(game);
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("bfC WAS uncontrolled → Yone's trigger goes on the chain (P1's, aimed at the only enemy unit in a base) and deals 5 = his Might: the 4-Might Base Guard dies", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfC");
    await bothPassFocus(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yone", controller: P1, targets: ["guard"], triggered: true })]);
    expect(turnState(game)).toBe("neutral-closed");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("yone")).toMatchObject({ damage: 0, zone: "battlefield-bfC" });
    expect(game.locationOf("poro")).toBe("bfB"); // "in a base" — the Poro at bfB was never a candidate
    expect(turnState(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Hextech Ray kills the lone Poro first, THEN Yone moves into the emptied bfB", () => {
  /** P1 casts Ray at the Poro in the main phase; both pass so it resolves. */
  async function rayThePoro(): Promise<Game> {
    const game = await board().build();
    expect(game.p1.can("cast", "ray")).toBe(true); // [Action] on your own turn, Neutral Open
    await game.p1.cast("ray", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    return game;
  }

  test("Ray resolves, the Poro dies in the Cleanup and — Open State, no showdown at bfB — P2 LOSES control: bfB is uncontrolled before Yone ever moves (323.5, 323.6, 190.4.c)", async () => {
    const game = await rayThePoro();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(turnState(game)).toBe("neutral-open");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: null });
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("Yone's move into the now-empty bfB opens a NON-COMBAT showdown (no opposing units → no combat, Yone is not an Attacker), P1 Focus (344.2, 345)", async () => {
    const game = await rayThePoro();
    await game.p1.move("yone", "bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdownOf(game)).toMatchObject({ battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("yone").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  });

  test("all pass → P1 establishes control of bfB and Conquers (+1); bfB 'was uncontrolled' at that moment → Yone's trigger fires and kills the Base Guard; P2 scores nothing and does not get bfB back", async () => {
    const game = await rayThePoro();
    await game.p1.move("yone", "bfB");
    await bothPassFocus(game);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yone", controller: P1, targets: ["guard"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.state("yone")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Yone Standard-Moves into bfB while P2's Poro still holds it", () => {
  test("opposing units → the Cleanup stages Showdown + Combat: a COMBAT showdown opens at bfB with P1 Attacker holding Focus and the Poro defending — not a stand-alone showdown (323.9, 323.13, 464.2)", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdownOf(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("yone").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]); // neither unit has an attack/defend trigger
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  });

  test("all pass → combat: Yone 5 kills the Poro 2, takes 2 and survives (healed after combat); P1 establishes control of bfB → Conquer +1 (466.5, 466.5.d)", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfB");
    await bothPassFocus(game);
    await game.settle(); // combat damage + resolution
    expect(showdownOf(game)).toBeUndefined();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("yone")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bfB" });
    expect(game.state("yone").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("bfB was CONTROLLED by P2 when Yone conquered it → 'that was uncontrolled' is false: no trigger ever hits the chain and the Base Guard is untouched", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bfB");
    expect(game.chain()).toEqual([]);
    await game.p1.passFocus();
    expect(game.chain()).toEqual([]);
    await game.p2.passFocus();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "base" });
    expect(turnState(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
