/**
 * Ruling 3e0a2a5b454dacc8 — Machine Evangel (OGN-239 → ogn-239-298) · Unit · [5][order] · 4 Might
 *   "[Deathknell] — Play three 1 [Might] Recruit unit tokens into your base. (When I die, get the effect.)"
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] — a face-down card flipped as a Reaction.
 *
 * Q: Can you react to a Deathknell trigger with a hidden card, before combat cleanup's "Clear Contested
 *    status" step?
 * A: Yes. Deathknell triggers are put on the chain during combat cleanup and the procedure PAUSES there
 *    until the whole chain has resolved; players get priority and may answer with hidden cards. Only once
 *    the chain closes does the cleanup carry on to clearing Contested.
 * Rules: 383 (triggered abilities go on the chain and get priority), 466.5 / 469 (combat resolution steps
 *        pause for the chain), 811.1.c.3 (a face-down card is played as a Reaction), 808.1.d (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MACHINE_EVANGEL = "ogn-239-298";
const HIDDEN_BLADE = "ogn-213-298"; // [Hidden] — "Kill a unit at a battlefield. Its controller draws 2."

/**
 * P2's turn. P1 holds bf1 with the Machine Evangel (4) standing there and a face-down Hidden Blade
 * already hidden at that battlefield. P2's Bruiser (6) attacks and will kill the Evangel.
 */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MACHINE_EVANGEL, "evangel")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P2 attacks; combat kills the Evangel and its Deathknell lands on the chain mid-cleanup. */
async function deathknellWindow(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("bruiser", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus(); // combat resolves inside the showdown; the Evangel dies here
  return game;
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

describe("Ruling 3e0a2a5b454dacc8 — a Deathknell pauses combat cleanup and can be answered with a hidden card", () => {
  test("the Evangel dies in combat and its Deathknell is a chain item — the battlefield is still Contested at that moment", async () => {
    const game = await deathknellWindow();
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.chain().some((c) => c.cardId === "evangel" && c.triggered)).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("ruling 3e0a2a5b454dacc8 — with that Deathknell on the chain the face-down card is playable: P1 flips Hidden Blade in response", async () => {
    const game = await deathknellWindow();
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    expect(game.chain().map((c) => c.cardId)).toContain("blade");
  });

  test("the whole chain resolves before the cleanup goes on: the Blade kills the attacker, the Deathknell's three Recruits appear, and only then is Contested cleared", async () => {
    const game = await deathknellWindow();
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bruiser");
    }
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((id) => game.zoneOf(id) === "base")).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("without the interruption the same Deathknell simply resolves and the cleanup finishes: three Recruits, Contested cleared", async () => {
    const game = await deathknellWindow();
    await game.settle();
    expect(recruits(game)).toHaveLength(3);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  });
});
