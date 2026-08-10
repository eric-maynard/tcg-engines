/**
 * Ruling 3a3d18f2d8ccfec0 — Deadbloom Predator (OGN-161 → ogn-161-298) 8+[body][body], 8 Might
 *   "[Deflect] You may play me to an occupied enemy battlefield."
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) Gear "At the end of your turn, reveal cards from the top of your Main Deck
 *     until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Can a showdown happen during the end-of-turn phase when Aurora plays Deadbloom Predator into an occupied enemy battlefield?
 * A: Yes. Aurora's trigger resolves in the Ending Step; the Predator enters the occupied battlefield; once the chain is
 *    empty a Cleanup begins the (combat) showdown right there, still during the ending step. It proceeds normally and
 *    only afterwards does the turn pass to the opponent.
 * Rules: 517.1 (ending step), 519 / 323.12–13 (Cleanup begins staged showdowns/combats in a Neutral Open State),
 *        621 (showdowns may start whenever conditions are met), 340 (Neutral Open = no chain, no showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEADBLOOM_PREDATOR = "ogn-161-298";
const DAZZLING_AURORA = "ogn-160-298";

/**
 * P1's turn 2, nothing left to do. P1: Dazzling Aurora in base; deck (top→): a Junk spell, then Deadbloom Predator.
 * P2 holds bf1 with a 3-Might Holder. Nobody has resources (Aurora's play ignores cost).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [{ cardType: "spell", energyCost: 1, name: "Junk" }, DEADBLOOM_PREDATOR], ["junk", "pred"]);
}

/** P1 ends the turn; Aurora's trigger resolves (both pass); returns at the Predator's destination choice. */
async function auroraFindsPredator(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

describe("Ruling 3a3d18f2d8ccfec0 — Aurora → Deadbloom Predator into an occupied battlefield starts a showdown in the ending step", () => {
  test("Aurora reveals past the Junk spell to the Predator, banishes it, and offers 'an occupied enemy battlefield' (bf1) besides base as where to play it", async () => {
    const game = await auroraFindsPredator();
    const d = game.decision();
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    expect(game.zoneOf("pred")).toBe("banishment"); // banished, about to be played
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
  });

  test("choosing bf1: the Predator is played there for free, bf1 becomes contested and a COMBAT showdown opens — still P1's turn, still the ending phase — with P1 (attacker) holding Focus; the Junk was recycled", async () => {
    const game = await auroraFindsPredator();
    await game.p1.pick("battlefield-bf1");
    expect(game.state("pred")).toMatchObject({ controller: P1, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("junk"); // recycled to the bottom
    expect(game.chain()).toEqual([]); // chain empty → the Cleanup began the showdown
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // P2 also gets Focus in this showdown before it closes.
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("the showdown proceeds normally (8 vs 3: Holder dies, P1 conquers bf1 and scores) and only THEN does the turn pass to P2", async () => {
    const game = await auroraFindsPredator();
    await game.p1.pick("battlefield-bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle(); // into P2's open main phase
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("pred").zone).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: played to base instead, no showdown happens and the turn passes straight to P2", async () => {
    const game = await auroraFindsPredator();
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("pred").zone).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
  });
});
