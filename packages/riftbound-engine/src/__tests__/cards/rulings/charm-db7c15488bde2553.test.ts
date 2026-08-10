/**
 * Ruling db7c15488bde2553 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 + [calm] · "Move an enemy unit."
 *   (nuance mentions Zenith Blade OGN-262 as a follow-up combo; not needed for the ruling itself)
 *
 * Q: On MY turn I Charm an opponent's unit to an open (empty, uncontrolled) battlefield. Does the opponent score?
 * A: Yes. Their unit arriving there makes the battlefield Contested by THEM; the (non-combat) showdown that follows
 *    ends with them establishing control = a Conquer, and they gain the point even though it is my turn.
 * Rules: 190.3.a / 450 (arrival by an effect applies Contested for the unit's controller), 344.2 (non-combat showdown),
 *        348.2.a (control established at its end), 442/464.1 (Conquer scores on any turn if not yet scored there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. bf1 open (no controller, no units); P1 holds bf2 with a Holder; P2's Foe (3) sits in P2's base. P1: Charm + 1 + [calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1")
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CHARM, "charm");
}

/** Charm Foe → bf1; both pass; Charm resolves. */
async function charmFoeToBf1(): Promise<Game> {
  const game = await board().build();
  expect(game.p2.points()).toBe(0);
  await game.p1.cast("charm", { targets: "foe" });
  // rule 355.4 — the destination is a play-time choice of the caster.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick("bf1");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
  return game;
}

describe("Ruling db7c15488bde2553 — Charming an enemy unit onto an open battlefield on your turn hands the opponent a Conquer point", () => {
  test("Foe arrives at empty bf1: bf1 becomes Contested BY P2 (the unit's controller) and a non-combat showdown opens with P2 holding Focus", async () => {
    const game = await charmFoeToBf1();
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.state("foe").combatRole).toBeNull(); // non-combat: no attacker/defender
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.points()).toBe(0); // not yet — only when the showdown ends (348.2.a)
  });

  test("both pass Focus: P2 conquers bf1 and scores 1 point on P1's turn; P1 scores nothing", async () => {
    const game = await charmFoeToBf1();
    await game.settle(); // hands the auto-begun showdown back once
    await game.settle(); // everyone passes focus → showdown ends
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
