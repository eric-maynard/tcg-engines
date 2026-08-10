/**
 * Ruling 11c73e4cf0214d9d — Get Excited! (OGN-008 → ogn-008-298, Action, 2 + [fury])
 *   "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Flame Chompers (ogn-006-298, 3 energy, 3 Might) "When you discard me, you may pay [fury] to play me."
 *
 * Q: During a showdown where my battlefield is being attacked, can I Get Excited, discard Flame Chompers, and play it
 *    AT that battlefield?
 * A: Yes. You still control the battlefield while it is contested, and playing Chompers through its own triggered
 *    ability is a limited action that bypasses normal timing (units normally only on your turn / not in showdowns).
 *    Sequence: attack → attacker passes → defender (Focus) plays Get Excited → resolves, discarding Chompers →
 *    Chompers' trigger on the chain → pay [fury] → Chompers is played at the battlefield.
 * Rules: 343.1.a + 358 (limited play via an ability ignores discretionary timing), 190.4.b (control persists while
 *        contested), 383.3.b ("you may pay" trigger cost), 464.2.c.3.a (late arrival becomes a Defender).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const FLAME_CHOMPERS = "ogn-006-298";
const SKULKER = "ogn-175-298";

/**
 * P2's turn. P1 holds bf1 with Holder (2); P2's Raider (4) attacks from base. P1: Get Excited, Flame Chompers and a
 * Skulker in hand; exactly 2 energy + 2 fury (Get Excited's pip + Chompers' [fury]).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FLAME_CHOMPERS, "chomp")
    .hand(P1, SKULKER, "skulker");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P2 passes Focus; P1 casts Get Excited at Raider; both pass → it resolves and asks the discard. */
async function getExcitedResolving(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1 });
  await game.p2.pass(); // "Opponent passes"
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("cast", "ge")).toBe(true);
  await game.p1.cast("ge", { targets: "raider" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Get Excited resolves
  return game;
}

/** …P1 discards Chompers (3 to Raider); Chompers' trigger asks to pay [fury]. */
async function chompersTriggerAsked(): Promise<Game> {
  const game = await getExcitedResolving();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["chomp", "skulker"]);
  await game.p1.pick("chomp");
  return game;
}

describe("Ruling 11c73e4cf0214d9d — Get Excited! discards Flame Chompers mid-combat and Chompers is played at the attacked battlefield", () => {
  test("Get Excited is a legal Action for the defender with Focus; on resolution P1 discards Flame Chompers → Raider takes 3 (Chompers' Energy cost) and Chompers' 'when you discard me' trigger goes on the chain asking P1 to pay [fury]", async () => {
    const game = await chompersTriggerAsked();
    expect(game.zoneOf("chomp")).toBe("trash");
    expect(game.state("raider").damage).toBe(3);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chomp", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true, source: { cardId: "chomp" } });
    expect(showdown(game)?.active).toBe(true); // all of this inside the ongoing combat showdown, on P2's turn
    expect(game.turnPlayer()).toBe(P2);
  });

  test("YES pays exactly [fury]; after both pass the trigger resolves and P1 is offered bf1 — the CONTESTED battlefield P1 still controls — as a destination; Chompers is played there and becomes a Defender", async () => {
    const game = await chompersTriggerAsked();
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // "Defending player uses Flame Chompers ability and passes; Opponent passes"
    for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    const d: Decision | null = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.state("chomp")).toMatchObject({ combatRole: "defender", controller: P1, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("end to end: the reinforced defence (2 + 3 vs a Raider already on 3 damage) wins the combat and P1 keeps bf1", async () => {
    const game = await chompersTriggerAsked();
    await game.p1.yes();
    for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("contrast: Flame Chompers cannot simply be PLAYED FROM HAND by P1 during the opponent's showdown — only its discard trigger opens that window", async () => {
    const game = await board().resources(P1, { energy: 5, power: { fury: 2 } }).build();
    await game.p2.move("raider", "bf1");
    await game.p2.pass();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "chomp")).toBe(false);
    const r = await game.p1.try((p) => p.play("chomp", { to: "bf1" }));
    expect(r.ok).toBe(false);
  });
});
