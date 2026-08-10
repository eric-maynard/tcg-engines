/**
 * Ruling 0e7f3ca970215796 — Counter Strike (SFD-194 → sfd-194-221) · Spell · Calm/Body · 2+[C] · Reaction
 *   "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Q: I start a combat and, with Focus, play Counter Strike; it resolves and the chain is empty. Do I still have
 *    Focus — may I start another chain right away?
 * A: No. When a chain started by the Focus holder empties during a showdown, Focus passes to the next player
 *    (the defender). They may act or pass; only if they pass does Focus come back to you. Both must pass in a row
 *    with no new chain for combat damage to happen — you can't act twice in a row.
 * Rules: 340.2.a / 347.1.b (chain closes → Focus passes), 347.2 (pass; all pass in sequence → showdown ends), 345.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
/** A second Action for P1 so "can I start another chain now?" is observable. */
const JAB = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Jab (Action)",
  timing: "action",
} as const;

/** P1's turn. P1's Raider (4) attacks P2's Guard (3) at bf1. P1 holds Counter Strike + Jab with resources for both. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, COUNTER_STRIKE, "cs")
    .hand(P1, JAB, "jab");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 (attacker, Focus) plays Counter Strike on the Raider; both pass priority → it resolves. */
async function counterStrikeResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, focusPlayer: P1, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("cs", { targets: "raider" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Counter Strike resolves
  expect(game.zoneOf("cs")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 0e7f3ca970215796 — after the attacker's own chain resolves in a showdown, Focus passes to the defender", () => {
  test("the chain P1 started has emptied → the showdown is Open again and FOCUS is now P2's: the acting seat is P2 (showdown context), not P1", async () => {
    const game = await counterStrikeResolved();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("P1 cannot immediately start another chain: Jab is not playable by P1 while P2 holds Focus", async () => {
    const game = await counterStrikeResolved();
    expect(game.p1.can("cast", "jab")).toBe(false);
    const r = await game.p1.try((p) => p.cast("jab", { targets: "guard" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("if P2 passes, Focus returns to P1 — and NOW P1 may play Jab (a new chain); the showdown has not ended because the passes were not consecutive-with-no-chain yet", async () => {
    const game = await counterStrikeResolved();
    await game.p2.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "jab")).toBe(true);
    await game.p1.cast("jab", { targets: "guard" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jab", controller: P1 })]);
  });

  test("both passing in sequence with no new chain ends the showdown and combat damage follows: Raider (4, damage to it prevented once) kills the Guard (3) unharmed and conquers bf1", async () => {
    const game = await counterStrikeResolved();
    await game.p2.passFocus();
    await game.p1.passFocus(); // consecutive passes → showdown ends
    await game.settle(); // combat damage step
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("raider").damage).toBe(0); // Counter Strike prevented the Guard's 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
