/**
 * Ruling 006952b97575af35 — (no specific card) Focus/priority inside a showdown after a spell resolves.
 *   Exercised with Cleave (OGN-004 → ogn-004-298) · [1] [Action] "Give a unit [Assault 3] this turn." in each hand.
 *
 * Q: During a showdown, after the initial chain has resolved and a player's Action spell resolves, who gets priority next?
 * A: When the chain empties again, the player who did NOT own the most recent effect gets Focus and priority: attacker
 *    has Focus first; attacker's spell resolves → defender gets Focus; defender's spell resolves → attacker gets Focus.
 * Rules: 345–347 (Focus in showdowns), 340.4 (after a chain resolves inside a showdown, Focus passes to the next
 *        Relevant Player from the item's controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";

/** P1's turn. P2 holds bf1 with a 5-Might Guard; P1's 4-Might Raider attacks. Each player holds a Cleave with [1]. No triggers anywhere. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "c1")
    .hand(P2, CLEAVE, "c2");
}

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

async function showdownOpen(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.chain()).toEqual([]); // no initial-chain items on this board
  return game;
}

/** The Focus holder casts their Cleave on their own unit and both pass so it resolves. */
async function castAndResolve(game: Game, seat: typeof P1, card: string, target: string): Promise<void> {
  await game.seat(seat).cast(card, { targets: target });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: card, controller: seat })]);
  await game.seat(seat).passPriority();
  await game.seat(seat === P1 ? P2 : P1).passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf(card)).toBe("trash");
}

describe("Ruling 006952b97575af35 — after a spell resolves in a showdown, the OTHER player gets Focus and priority", () => {
  test("with the (empty) initial chain done, the ATTACKER (P1) has Focus and priority first", async () => {
    const game = await showdownOpen();
    expect(focus(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("the attacker plays an Action spell and it resolves (chain empty) → the DEFENDER (P2) now has Focus and priority", async () => {
    const game = await showdownOpen();
    await castAndResolve(game, P1, "c1", "raider");
    expect(focus(game)).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "c2")).toBe(true); // and may use it to play their own Action
  });

  test("the defender then plays an Action spell and it resolves → Focus and priority go back to the ATTACKER (P1) — it depends on who owned the last effect, not on roles", async () => {
    const game = await showdownOpen();
    await castAndResolve(game, P1, "c1", "raider");
    await castAndResolve(game, P2, "c2", "guard");
    expect(focus(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Both now pass Focus → combat: Raider 4 + Assault 3 = 7 kills the Guard (5; its Assault is inert while defending).
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // the Guard's 5 is not lethal to a 7-Might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
