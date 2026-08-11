/**
 * Ruling 1b1667fec9be254e — Gemcraft Seer (OGN-100 → ogn-100-298) · 3 Might
 *     "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *      Other friendly units have [Vision]."
 *   × a hidden vanilla unit — Shipyard Skulker (OGN-175 → ogn-175-298), no printed [Vision]
 *   × Dredge Up (VEN-049 → ven-049-166) · Spell · [2] · "Draw 1." (a slower item kept underneath on the chain)
 *
 * Q: When a unit that only has [Vision] because of Gemcraft Seer is revealed from hiding, when does Vision trigger?
 * A: Immediately, when that unit is played — i.e. as its own play resolves and it enters the battlefield. It does
 *    not wait for the rest of the chain: the Vision trigger goes onto the chain right there, above whatever else is
 *    still waiting, and players get priority on it. A unit can trigger play abilities granted to it by another card.
 * Rules: 350.1 / 419.4.a ("played" completes with resolution), 383.4 (play triggers fire then and go on the chain),
 *        340 (chain is LIFO; a new trigger sits above the unresolved items), 819 ([Vision]), 812 (hidden cards are
 *        played from hiding for their cost).
 *
 * Note: the engine completes a reveal-from-hiding as one action (the unit is on the battlefield the instant the
 * reveal is taken), so the observable end state after `reveal` is exactly the ruling's steps 1-4: unit in play,
 * Vision trigger on the chain above the still-waiting spell, priority open.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GEMCRAFT_SEER = "ogn-100-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — no printed [Vision]
const DREDGE_UP = "ven-049-166";

/** P1's turn with [5] = 2 (Dredge Up) + 3 (the hidden Skulker). P1 holds bf1 with a Holder and a facedown Skulker. */
function board(withSeer: boolean) {
  const s = scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .facedown(P1, "bf1", SKULKER, "skulker")
    .hand(P1, DREDGE_UP, "dredge")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
  return withSeer ? s.unit(P1, "base", GEMCRAFT_SEER, "seer") : s;
}

/** Cast Dredge Up, then — still holding priority with it unresolved — reveal the hidden Skulker on top of it. */
async function dredgeThenReveal(withSeer: boolean): Promise<Game> {
  const game = await board(withSeer).build();
  await game.p1.cast("dredge");
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
  expect(game.p1.can("reveal", "skulker")).toBe(true);
  await game.p1.reveal("skulker");
  return game;
}

/** Pass priority for whoever holds it until a non-priority prompt (or the open main phase) appears. */
async function passToPrompt(game: Game, max = 4): Promise<void> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 1b1667fec9be254e — Vision granted by Gemcraft Seer fires the moment the revealed unit is played", () => {
  test("the Skulker has no [Vision] of its own — it only has it because the Seer is out", async () => {
    const withSeer = await board(true).build();
    const without = await board(false).build();
    expect(withSeer.state("holder").keywords).toContain("Vision");
    expect(without.state("holder").keywords).not.toContain("Vision");
  });

  test("the reveal plays the unit right away: the Skulker is a unit at bf1 carrying a GRANTED [Vision] (a play ability it does not print itself)", async () => {
    const game = await dredgeThenReveal(true);
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.state("skulker").grantedKeywords).toContainEqual(expect.objectContaining({ keyword: "Vision" }));
  });

  test("its Vision trigger is added to the chain AT ONCE — sitting ABOVE the still-unresolved Dredge Up — and players get priority on it rather than waiting for the chain to empty", async () => {
    const game = await dredgeThenReveal(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "skulker"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "skulker", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.hand()).toEqual([]); // Dredge Up has not drawn yet
  });

  test("the look therefore happens BEFORE Dredge Up draws: P1 sees d1 and recycles it, so Dredge Up then draws d2", async () => {
    const game = await dredgeThenReveal(true);
    await passToPrompt(game); // priority on the Vision trigger → it resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("d1");
    expect(game.p1.hand()).toEqual([]); // still nothing drawn
    await game.p1.pick("d1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual(["d2"]); // Dredge Up resolved last and drew the new top card
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control — no Gemcraft Seer: the same reveal produces NO Vision trigger, nothing is looked at, and Dredge Up draws d1", async () => {
    const game = await dredgeThenReveal(false);
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").keywords).not.toContain("Vision");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
