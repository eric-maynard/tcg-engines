/**
 * Ruling 1394e7b5f3d7c1c8 — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · 2 Might · [Hidden]
 *     "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each
 *      card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Akali, Deadly Weapon (ven-021-166) · 3 Might "[Empower] [2][fury]. When I move, you may deal 1 to a unit at a battlefield
 *     I moved to or from. If I'm [Empowered], deal 2 instead. [Empowered] I have +1 [Might]."
 *
 * Q: Akali moves onto Teemo's battlefield; her move trigger deals damage, Teemo has a "When I defend" trigger. Which resolves first?
 * A: Akali's. Her "When I move" trigger fires immediately on the move, goes on the chain and resolves completely; only after
 *    that chain empties and a Cleanup runs does the Showdown begin — Teemo gains Defender THEN and his trigger becomes pending.
 *    So Akali damages Teemo before combat starts; if that damage kills him (2 while Empowered), he never defends at all.
 * Rules: 383.4.c (move triggers), 401.1 / 461 (a staged showdown waits for a Closed state to clear), 464.2 (designations
 *        given when the showdown begins), 383.4.f (defend trigger), 322–323 (Cleanup kills lethal-damaged units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const AKALI_DEADLY_WEAPON = "ven-021-166";

/** P1's turn with [2][fury] (Akali's Empower). P2 holds bf1 with Teemo (2); Akali (3) in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "base", AKALI_DEADLY_WEAPON, "akali");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Akali Standard-Moves to bf1; accept her move trigger and aim it at Teemo. */
async function akaliMovesInAndPings(game: Game): Promise<void> {
  await game.p1.move("akali", "bf1");
  // 1. "When I move" fires IMMEDIATELY: its leading "you may" and target are asked at finalization — no showdown yet
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "akali" }, timing: "FIN" });
  expect(game.state("akali").combatRole).not.toBe("attacker");
  expect(game.state("teemo").combatRole).not.toBe("defender");
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
  await game.p1.pick("teemo");
}

describe("Ruling 1394e7b5f3d7c1c8 — Akali's move trigger resolves completely before the showdown begins and Teemo's defend trigger even exists", () => {
  test("after the move ONLY Akali's trigger is on the chain (aimed at Teemo); the battlefield is contested but the showdown has NOT begun — no attacker/defender, no Teemo trigger", async () => {
    const game = await board().build();
    await akaliMovesInAndPings(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", controller: P1, targets: ["teemo"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.state("akali").combatRole).not.toBe("attacker");
    expect(game.state("teemo").combatRole).not.toBe("defender");
    expect(game.chain().some((c) => c.cardId === "teemo")).toBe(false);
  });

  test("2 → 3: Akali's trigger resolves (1 damage on Teemo); THEN the showdown begins — Akali attacker, Teemo defender — and only NOW is Teemo's 'When I defend' on the chain", async () => {
    const game = await board().build();
    await akaliMovesInAndPings(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Akali's item resolves; chain empties; Cleanup; showdown opens
    expect(game.state("teemo").damage).toBe(1);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // 1 < 2: survives
    expect(game.state("akali").combatRole).toBe("attacker");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["akali"], triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "akali")).toBe(false); // long gone
  });

  test("the rest plays out: Teemo's reveal (no [Hidden] cards among the filler) deals 0; combat 3 vs damaged 2 — Teemo dies, Akali conquers", async () => {
    const game = await board().build();
    await akaliMovesInAndPings(game);
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.locationOf("akali")).toBe("bf1");
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("if instead Akali is [Empowered] (deal 2): her move trigger KILLS Teemo (2) in step 2 — he is gone before any showdown, never becomes a defender, his trigger never fires; Akali takes the emptied bf1", async () => {
    const game = await board().build();
    await game.p1.activate("akali"); // [2][fury]: Empower me
    await game.settle();
    expect(game.state("akali")).toMatchObject({ isEmpowered: true, might: 4 });
    await akaliMovesInAndPings(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // 2 damage → lethal → Cleanup kills Teemo, then the showdown opens with no defender
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.chain()).toEqual([]); // no "When I defend" was ever created
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(bf1(game)).toMatchObject({ contested: true, controller: null }); // Teemo's side lost it as he died outside combat
    await game.settle();
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("akali").damage).toBe(0);
  });
});
