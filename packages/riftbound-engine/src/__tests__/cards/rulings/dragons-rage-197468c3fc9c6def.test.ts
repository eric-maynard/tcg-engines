/**
 * Ruling 197468c3fc9c6def — Dragon's Rage (OGN-258 → ogn-258-298) · [4] calm/body Action
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal
 *     to their Mights to each other."
 *   × Charm (OGN-043 → ogn-043-298) · [1] calm Action — "Move an enemy unit."
 *
 * Q: Can Dragon's Rage move an enemy unit to a battlefield where that unit's TEAMMATE already has units?
 * A: No. Teammates can never share a battlefield, and no more than two players may have units at one
 *    battlefield; the moved unit must be able to legally "land", so such a battlefield is not a legal
 *    destination (even if the fight would kill one of them). Same for Charm and other move effects.
 * Rules: 447.2.b (teammate-occupied battlefields are Invalid Destinations for moves of all kinds),
 *        462 / 462.3 (combat only ever between exactly two players), 447.2 (invalid destinations).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const DRAGONS_RAGE = "ogn-258-298";
const CHARM = "ogn-043-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * 2v2 (Magma Chamber seating: P1+P3 vs P2+P4). P1's turn. P2's Victim sits in P2's base; P2's TEAMMATE P4
 * holds bf1 with a unit on it; bf2 is P2's own (empty), bf3 is open. P1 holds Dragon's Rage and Charm.
 * The scenario builder has no team knob, so the rule-489.2 team map is seeded onto the built state (setup only).
 */
async function teamBoard(): Promise<Game> {
  const game = await scenario({ players: 4 })
    .resources(P1, { energy: 5, power: { body: 1, calm: 2 } })
    .battlefield("bf1", { controller: P4 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P4, "bf1", { might: 2, name: "Teammate Unit" }, "mate")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P1, DRAGONS_RAGE, "rage")
    .hand(P1, CHARM, "charm")
    .build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

/**
 * Free-for-all with 3 players. P1's turn. bf1 already has units of P1 AND P3; P2's Victim is in P2's base.
 * Moving Victim to bf1 would put three players' units at one battlefield.
 */
function ffaBoard() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 5, power: { body: 1, calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P3, "bf1", { might: 2, name: "Third Party" }, "third")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P1, DRAGONS_RAGE, "rage")
    .hand(P1, CHARM, "charm");
}

/** Cast `card` at Victim, settle to the destination prompt and return the offered destination keys. */
async function destinationsOffered(game: Game, card: string): Promise<string[]> {
  await game.p1.cast(card, { targets: "victim" });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).prompt).toMatch(/destination/i);
  return (d as PickD).options.map((o) => o.zone ?? o.key);
}

describe("Ruling 197468c3fc9c6def — a move effect cannot land an enemy unit where its teammate (or a third player) already is", () => {
  test("2v2: Dragon's Rage on P2's Victim does NOT offer bf1 (held by P2's teammate P4's unit) as a destination (447.2.b)", async () => {
    const game = await teamBoard();
    const offered = await destinationsOffered(game, "rage");
    expect(offered).toContain("battlefield-bf3");
    expect(offered).not.toContain("battlefield-bf1");
  });

  test("2v2: the same restriction applies to Charm — the teammate-occupied bf1 is not offered", async () => {
    const game = await teamBoard();
    const offered = await destinationsOffered(game, "charm");
    expect(offered).toContain("battlefield-bf3");
    expect(offered).not.toContain("battlefield-bf1");
  });

  test("FFA: 'no more than two players can have units at a battlefield' — Dragon's Rage cannot send P2's Victim to bf1 where P1 and P3 already stand (462 / 462.3)", async () => {
    const game = await ffaBoard().build();
    const offered = await destinationsOffered(game, "rage");
    expect(offered).toContain("battlefield-bf2");
    expect(offered).not.toContain("battlefield-bf1");
  });

  test("control: a legal destination works as printed — Charm moves Victim to the open bf3 (2v2 board)", async () => {
    const game = await teamBoard();
    const offered = await destinationsOffered(game, "charm");
    expect(offered).toContain("battlefield-bf3");
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("battlefield-bf3");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("mate")).toBe("battlefield-bf1");
  });
});
