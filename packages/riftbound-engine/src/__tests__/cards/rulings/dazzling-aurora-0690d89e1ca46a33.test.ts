/**
 * Ruling 0690d89e1ca46a33 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it,
 *      ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · Unit · Body · [8] · 8 Might
 *     "[Deflect] … You may play me to an occupied enemy battlefield."
 *
 * Q: Does Dazzling Aurora "trigger" Deadbloom's play effect?
 * A: Yes. Aurora PLAYS the Predator, so its "you may play me to an occupied enemy battlefield" permission applies: you may
 *    put it straight onto an enemy-held battlefield.
 * Rules: 356.1.b (playing via an effect is still playing the card), Deadbloom's static play permission.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const CLEAVE = "ogn-004-298"; // a non-unit on top so Aurora has something to reveal past
const SKULKER = "ogn-175-298";

const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.key) : []);

/**
 * P1's turn, about to end. P1: Dazzling Aurora in base, no resources; deck top→: Cleave, Deadbloom Predator, Skulker.
 * P2 controls bf1 with a 3-Might Guard (an OCCUPIED ENEMY battlefield); bf2 is empty and uncontrolled.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deck(P1, [CLEAVE, DEADBLOOM_PREDATOR, SKULKER], ["cleave", "deadbloom", "sk"]);
}

/** P1 ends the turn → Aurora triggers; both pass → it resolves up to the Predator's destination prompt. */
async function auroraFindsPredator(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 0690d89e1ca46a33 — Deadbloom Predator played by Dazzling Aurora may go to an occupied enemy battlefield", () => {
  test("Aurora reveals past Cleave to the Predator and PLAYS it for free: the destination prompt offers P2's occupied bf1 alongside base (the empty uncontrolled bf2 is not a legal spot)", async () => {
    const game = await auroraFindsPredator();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(d).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
  });

  test("choosing bf1: the Predator lands on the enemy battlefield, Cleave (revealed, not a unit) is recycled, and a combat showdown opens there at once (still P1's turn)", async () => {
    const game = await auroraFindsPredator();
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.state("deadbloom")).toMatchObject({ controller: P1, might: 8 });
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("cleave"); // recycled to the bottom
    expect(game.zoneOf("sk")).toBe("mainDeck"); // never revealed
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("deadbloom").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("played out: the 8-Might Predator kills the Guard and conquers bf1 (+1 for P1) before the turn passes to P2", async () => {
    const game = await auroraFindsPredator();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
