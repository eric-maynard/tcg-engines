/**
 * Ruling 299ce83d997420ec — Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might
 *     "When I attack, deal 3 to all enemy units here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] · "Move a unit from a battlefield to its base."
 *
 * Q: If Anivia is moved away before her "When I attack" ability resolves, what happens to the damage?
 * A: The ability still resolves, but "here" is re-read on resolution and now means her NEW location (base),
 *    so the enemy units back at the battlefield she left take nothing.
 * Rules: 359.3 (targets/zones re-read on resolution), 740 ("here" = the source's current location), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA_PRIMAL = "ogn-148-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2 holds bf1 with two 5-Might Guards and a face-down Fight or Flight there. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard A" }, "guardA")
    .unit(P2, "bf1", { might: 5, name: "Guard B" }, "guardB")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", ANIVIA_PRIMAL, "anivia");
}

/** Anivia attacks bf1; her "deal 3 to all enemy units here" sits on the chain, undealt. */
async function aniviaAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("anivia", "bf1");
  expect(game.state("anivia").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", triggered: true, controller: P1 })]);
  expect(game.state("guardA").damage).toBe(0);
  return game;
}

describe("Ruling 299ce83d997420ec — 'here' is re-read when Anivia's attack trigger resolves", () => {
  test("premise: the trigger is on the chain and nothing has been dealt yet", async () => {
    const game = await aniviaAttacks();
    expect(game.state("guardA").damage).toBe(0);
    expect(game.state("guardB").damage).toBe(0);
  });

  test("ruling: P2 reveals the hidden Fight or Flight, Anivia goes home, and the Guards take NO damage", async () => {
    const game = await aniviaAttacks();
    await game.p1.passPriority();
    await game.p2.reveal("fof"); // playable as a Reaction straight out of Hidden
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("anivia"); // the hidden spell locks its target as it is revealed
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia", "fof"]);
    await game.settle(); // Fight or Flight resolves first (LIFO), then Anivia's trigger
    expect(game.locationOf("anivia")).toBe("base");
    expect(game.state("guardA").damage).toBe(0);
    expect(game.state("guardB").damage).toBe(0);
    expect(game.zoneOf("guardA")).toBe("battlefield-bf1");
    expect(game.zoneOf("guardB")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control: left alone, the same trigger deals 3 to every enemy unit at that battlefield", async () => {
    const game = await aniviaAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves with Anivia still there
    expect(game.state("guardA").damage).toBe(3);
    expect(game.state("guardB").damage).toBe(3);
  });
});
