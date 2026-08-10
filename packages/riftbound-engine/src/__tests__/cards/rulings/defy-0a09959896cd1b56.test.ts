/**
 * Ruling 0a09959896cd1b56 — Defy (OGN-045 → ogn-045-298) · Reaction spell · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Dredge Up (ven-049-166) · Spell · [2] · "Draw 1."   × Noxus Hopeful (ogn-012-298) · Unit · [4] · 4 Might
 *     "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)"
 *
 * Q: If I play a spell and it is countered by Defy, does it still count towards Legion?
 * A: Yes. Legion checks whether a card was FINALIZED on the chain (played), not whether it resolved. Defy can only be
 *    played after the spell was finalized, so the Legion condition is already met even though the spell is then countered
 *    and removed from the chain.
 * Rules: 419.4.b (non-triggered "played" checks key off finalization), 425.1.a (a countered spell does nothing and is
 *        cleared), 812 (Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DREDGE_UP = "ven-049-166";
const NOXUS_HOPEFUL = "ogn-012-298";

/** P1's turn with EXACTLY [4]: [2] for Dredge Up, then only [2] left — enough for the Hopeful only if Legion is on. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** P1 casts Dredge Up (finalized on the chain, paid); P1 passes; P2 Defies it; the chain resolves. */
async function dredgeUpDefied(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("dredge");
  expect(game.p1.energy()).toBe(2);
  // Finalized on the chain: at THIS moment the "played a card this turn" condition is already met.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dredge", controller: P1 })]);
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true); // Defy comes only now, after finalization
  await game.p2.cast("defy", { targets: "dredge" });
  await game.settle();
  return game;
}

describe("Ruling 0a09959896cd1b56 — a spell countered by Defy still counts for Legion", () => {
  test("Defy counters Dredge Up: no card drawn, both spells in the trash, nothing refunded — yet P1's 'cards played this turn' still reads 1", async () => {
    const game = await dredgeUpDefied();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand()).toEqual(["hopeful"]); // no "Draw 1"
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…so Legion is live: Noxus Hopeful now costs [2] — playable with the 2 energy P1 has left, landing in base with the pool at 0", async () => {
    const game = await dredgeUpDefied();
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.state("hopeful").might).toBe(4);
  });

  test("control: with no card played yet this turn, the Hopeful is a full [4] — NOT playable on 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, NOXUS_HOPEFUL, "hopeful").build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });
});
