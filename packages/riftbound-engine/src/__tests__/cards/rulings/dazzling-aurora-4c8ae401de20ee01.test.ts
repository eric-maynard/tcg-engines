/**
 * Ruling 4c8ae401de20ee01 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it.
 *    Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · [Deflect] · "You may play me to an occupied enemy
 *     battlefield."
 *   × Confront (OGN-129 → ogn-129-298) · Action · [2] · "Units you play this turn enter ready. Draw 1."
 *
 * Q: If Aurora's end-of-turn trigger plays Deadbloom Predator, can it go to an occupied enemy battlefield, and
 *    does that start a combat?
 * A: Yes and yes — Deadbloom's own permission applies to any play of it; arriving at an enemy-occupied battlefield
 *    starts a combat even though it is the end step (no discretionary actions left). If Confront was played that
 *    turn, the Aurora-played unit enters ready.
 * Rules: 419.3 + Deadbloom's play permission, 190.3.a / 323.13 (units of opposing players at a battlefield ⇒
 *        combat), 316.9 (end of turn triggers), Confront's replacement (enters ready).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const CONFRONT = "ogn-129-298";

/**
 * P1's turn. Aurora in P1's base; P1's deck: a spell on top, then Deadbloom Predator. P2 holds bf1 with a 3-Might
 * Holder; bf2 is empty and uncontrolled (NOT a legal destination — neither controlled by P1 nor enemy-occupied).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 }) // for Confront in the nuance test
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, CONFRONT, "confront")
    .deck(P1, [{ cardType: "spell", energyCost: 1, name: "Junk Spell" }, DEADBLOOM_PREDATOR], ["junk", "predator"]);
}

/** End P1's turn and resolve Aurora's trigger up to the Predator's destination prompt. */
async function endTurnToDestination(game: Game): Promise<void> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
}

describe("Ruling 4c8ae401de20ee01 — Aurora may drop Deadbloom Predator onto an occupied enemy battlefield at end of turn, starting a combat", () => {
  test("the destination prompt for the Aurora-played Predator offers P1's base AND P2's occupied bf1 (not the empty, uncontrolled bf2)", async () => {
    const game = await board().build();
    await endTurnToDestination(game);
    const d = game.decision();
    const places = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(places).toContain("base");
    expect(places).toContain("battlefield-bf1");
    expect(places).not.toContain("battlefield-bf2");
    expect(game.zoneOf("predator")).toBe("banishment"); // "banish it. Play it …" — played from banishment
  });

  test("choosing bf1: the Predator arrives (exhausted, for free) among P2's units and a COMBAT showdown opens right there in P1's ending step, Predator attacking", async () => {
    const game = await board().build();
    await endTurnToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("predator")).toBe("battlefield-bf1");
    expect(game.state("predator").isExhausted).toBe(true);
    expect(game.p1.resources().energy).toBe(2); // nothing paid for an 8-cost unit
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("predator").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // No discretionary actions in that window: P1 cannot standard-move anything now.
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
  });

  test("the combat resolves before the turn passes: 8 vs 3 — Holder dies, P1 conquers bf1 (+1), the other revealed card was recycled, and only then is it P2's turn", async () => {
    const game = await board().build();
    await endTurnToDestination(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("predator")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("junk")).toBe("mainDeck"); // "recycle the rest"
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: if P1 played Confront earlier that turn, the Aurora-played Predator enters READY", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    await game.settle();
    expect(game.zoneOf("confront")).toBe("trash");
    await endTurnToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("predator")).toBe("battlefield-bf1");
    expect(game.state("predator").isExhausted).toBe(false);
  });
});
