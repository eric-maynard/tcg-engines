/**
 * Ruling 1239b3672ee982c5 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · [2] · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * Q: I move Faefolk to an UNOCCUPIED battlefield and use its ability to pull an enemy there — who attacks, who defends?
 * A: You attack, the pulled unit defends. Attacker/defender follows who applied Contested: your move to the uncontrolled
 *    battlefield applied it (step 1), Faefolk's trigger goes on the chain (2), resolves and moves the enemy unit in (3),
 *    and the staged showdown becomes a Combat with you — the contesting player — as attacker (4).
 * Rules: 190.3.a / 450 (Contested applied by the arriving unit's controller), 459.2.b.1 / 464.2.c (attacker = the player who
 *        applied Contested), 323.9 (combat staged once opposing units share the contested battlefield), 383 (chain trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRRESISTIBLE_FAEFOLK = "unl-112-219";

/** P1's turn. bf1 is empty and uncontrolled; Faefolk ready in P1's base; P2's Victim (3) at P2's bf2 and a Homebody in P2's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", IRRESISTIBLE_FAEFOLK, "faefolk")
    .unit(P2, "bf2", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf2", { might: 4, name: "Stay Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Faefolk → bf1; P1 opts in and picks the Victim; then both pass so the trigger resolves. Stops in the resulting combat showdown. */
async function pullVictimIntoBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("faefolk", "bf1");
  // step 2 — the "you may" trigger: P1 decides (finalization), then names the enemy unit
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
  expect(offered).toEqual(["guard", "homebody", "victim"]); // any ENEMY unit, never Faefolk
  await game.p1.pick("victim");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "faefolk", controller: P1, triggered: true })]);
  // step 3 — resolve it
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 1239b3672ee982c5 — Faefolk to an empty battlefield, enemy pulled in: Faefolk's player attacks", () => {
  test("step 1: moving Faefolk to the unoccupied bf1 applies Contested BY P1 (nobody controls bf1)", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    expect(game.locationOf("faefolk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("steps 2–3: the trigger resolves and the chosen enemy Victim is moved to THAT battlefield (bf1); the other enemies stay put", async () => {
    const game = await pullVictimIntoBf1();
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.locationOf("homebody")).toBe("base");
    expect(game.state("victim").controller).toBe(P2); // moved, not stolen
  });

  test("step 4: opposing units at the contested bf1 → a COMBAT showdown with P1 ATTACKING (Faefolk = attacker, P1 holds Focus first) and P2's Victim DEFENDING — even though P1's ability moved it there", async () => {
    const game = await pullVictimIntoBf1();
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("faefolk").combatRole).toBe("attacker");
    expect(game.state("victim").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("consequence of the roles: Victim (3) beats Faefolk (1) as the DEFENDER — the attacker dies, P2 (defending an uncontrolled battlefield it now solely occupies) ends up controlling bf1; P1 scores nothing", async () => {
    const game = await pullVictimIntoBf1();
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining the 'may' leaves Faefolk alone at bf1 — a NON-combat showdown; unopposed, P1 conquers bf1 for 1", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });
});
