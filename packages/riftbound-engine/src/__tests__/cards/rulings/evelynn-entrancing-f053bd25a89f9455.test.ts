/**
 * Ruling f053bd25a89f9455 — Evelynn, Entrancing (UNL-141 → unl-141-219) · 2 Might · [Hidden] [Backline] "When you play me from
 *     face down on your turn, you may move an enemy unit at a different location to my battlefield."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Mutated Mouser (UNL-036 → unl-036-219) · 1 Might · "[Shield 2] (+2 [Might] while I'm a defender.) [Tank]"
 *
 * Q: I flip Evelynn at the battlefield I hold and drag the enemy Irelia there; I also have a Mutated Mouser there. Am I the
 *    defender (Mouser gets Shield 2), or the attacker because I forced the fight?
 * A: The enemy unit that was moved INTO your battlefield is the attacker; you — the controller of the battlefield — defend.
 *    So Mutated Mouser is a defender and has +2 Might from Shield 2 for this combat.
 * Rules: 811 (play from face down), 449–450 / 464.2.c (a unit arriving at a battlefield another player controls attacks;
 *        the controller's units defend), 814 (Shield), 809 (Deflect surcharge when choosing Irelia).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EVELYNN = "unl-141-219";
const IRELIA_FERVENT = "sfd-057-221";
const MUTATED_MOUSER = "unl-036-219";

/**
 * P1's turn 3 with 1 power (for Irelia's Deflect). P1 holds bf1 with Mutated Mouser and has Evelynn facedown there (hidden on
 * an earlier turn). P2: Irelia, Fervent at P2's bf2 and a Bystander in base (so "an enemy unit" is a real choice).
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 0, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", MUTATED_MOUSER, "mouser")
    .facedown(P1, "bf1", EVELYNN, "eve")
    .unit(P2, "bf2", IRELIA_FERVENT, "irelia")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** 1–2. P1 plays Evelynn from face down (for [0]) on P1's turn; opts into her trigger and names Irelia (paying Deflect). */
async function eveDragsIrelia(): Promise<Game> {
  const game = await board().build();
  expect(game.state("mouser")).toMatchObject({ combatRole: null, might: 1 });
  expect(game.p1.can("reveal", "eve")).toBe(true);
  await game.p1.reveal("eve");
  expect(game.state("eve")).toMatchObject({ isHidden: false, zone: "battlefield-bf1" });
  // "you may" — P1's decision, asked as the trigger is finalized.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(game.decision()?.source?.cardId).toBe("eve");
  await game.p1.yes();
  // which enemy unit — P1's choice; Irelia carries her Deflect surcharge.
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1 });
  const opts = pick?.kind === "pick" ? pick.options : [];
  expect(opts.map((o) => o.card ?? o.key).sort()).toEqual(["bystander", "irelia"]);
  await game.p1.pick("irelia");
  expect(game.p1.power()).toBe(0); // Irelia's Deflect surcharge was paid to choose her
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eve", controller: P1, triggered: true })]);
  return game;
}

/** Resolve Evelynn's trigger (pass priority only) so the combat at bf1 is set up but not fought. */
async function resolveTrigger(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling f053bd25a89f9455 — the Irelia dragged in by Evelynn ATTACKS; P1 defends and Mutated Mouser gets Shield 2", () => {
  test("3. Irelia is moved from bf2 to P1's bf1: bf1 is contested BY P2, Irelia is the ATTACKER, and P1's Mouser and Evelynn are DEFENDERS (P1 still controls bf1)", async () => {
    const game = await eveDragsIrelia();
    await resolveTrigger(game);
    expect(game.locationOf("irelia")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("irelia").combatRole).toBe("attacker");
    expect(game.state("mouser").combatRole).toBe("defender");
    expect(game.state("eve").combatRole).toBe("defender");
    // The attacker holds Focus first in the showdown even though P1 caused the move.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("4. as a defender, Mutated Mouser's [Shield 2] is live: 1 + 2 = 3 Might for this combat; Irelia stays 4 (P1 chose her, not her controller — no +1)", async () => {
    const game = await eveDragsIrelia();
    await resolveTrigger(game);
    expect(game.state("mouser")).toMatchObject({ baseMight: 1, combatRole: "defender", might: 3 });
    expect(game.state("mouser").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("irelia")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("the combat then plays out with those roles: Irelia (4) into Tank Mouser (3, assigned first) + Evelynn (2) — Mouser dies, Irelia takes 3+2 = 5 ≥ 4 and dies, P1 keeps bf1", async () => {
    const game = await eveDragsIrelia();
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.zoneOf("eve")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0); // no conquer for the attacker
  });
});
