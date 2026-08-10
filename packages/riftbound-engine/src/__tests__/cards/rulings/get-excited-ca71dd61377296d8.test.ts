/**
 * Ruling ca71dd61377296d8 — Get Excited! (OGN-008 → ogn-008-298) · Action · Fury · [2][fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · [3] · 3 Might "When you discard me, you may pay [fury] to play me."
 *
 * Q: While my battlefield is being attacked, can I play a unit into that showdown via an effect — Get Excited discarding
 *    Flame Chompers, then playing Chompers there?
 * A: Yes. The battlefield stays under your control until the showdown finishes (it doesn't become contested/flip until the
 *    showdown resolves), so playing a unit to it — e.g. Chompers off Get Excited's discard — is legal.
 * Rules: 190.4 / 466 (control changes only when combat resolves), 346 (units may be played to a battlefield you control),
 *        Action timing in showdowns; 323.2.a (a unit arriving mid-combat takes its controller's designation).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const FLAME_CHOMPERS = "ogn-006-298";
const SKULKER = "ogn-175-298"; // a second card in hand so the discard is a real choice

/** P2's turn. P1 holds bf1 with a 3-Might Defender; P2's 4-Might Raider attacks it. P1: Get Excited ([2][fury]) + Chompers + Skulker, with [2] + [fury][fury]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FLAME_CHOMPERS, "chomp")
    .hand(P1, SKULKER, "other");
}

/** Raider attacks bf1, P2 passes Focus; P1 casts Get Excited at the Raider; resolve it discarding Chompers and pay [fury]. Returns Chompers' destination prompt. */
async function excitedIntoChompers(game: Game): Promise<Decision | null> {
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("def").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.p1.can("cast", "ge")).toBe(true); // Action: legal in the showdown
  await game.p1.cast("ge", { targets: "raider" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Get Excited resolves → discard prompt
  const discard = game.decision();
  expect(discard).toMatchObject({ kind: "pick", seat: P1 });
  expect(discard?.kind === "pick" ? discard.options.map((o) => o.key).toSorted() : []).toEqual(["chomp", "other"]);
  await game.p1.pick("chomp");
  expect(game.state("raider").damage).toBe(3); // Chompers' Energy cost
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may pay [fury] to play me"
  await game.p1.yes();
  expect(game.p1.power("fury")).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Chompers' trigger resolves → where does it go?
  return game.decision();
}

describe("Ruling ca71dd61377296d8 — a unit can be played into a showdown at your own battlefield under attack", () => {
  test("mid-showdown bf1 is still P1's (not yet flipped/contested away), so Chompers' play offers battlefield-bf1 alongside base", async () => {
    const game = await board().build();
    const d = await excitedIntoChompers(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "chomp" } });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).toSorted() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
  });

  test("choosing bf1: Chompers enters the battlefield during the showdown and joins the combat as a DEFENDER; the showdown continues (P2's Focus)", async () => {
    const game = await board().build();
    await excitedIntoChompers(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.state("chomp")).toMatchObject({ combatRole: "defender", controller: P1 });
    expect(game.p1.units("bf1").toSorted()).toEqual(["chomp", "def"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("and it matters: the damaged Raider (4, 3 damage) now dies to the defenders while P1 keeps bf1 with Chompers on it", async () => {
    const game = await board().build();
    await excitedIntoChompers(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("chomp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
