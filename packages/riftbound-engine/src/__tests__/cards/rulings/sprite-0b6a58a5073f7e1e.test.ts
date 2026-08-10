/**
 * Ruling 0b6a58a5073f7e1e — Sprite (OGN-274 → ogn-274-298) · Unit Token · 3 Might
 *   "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Consult the Past (OGN-083 → ogn-083-298) · Spell · Mind · [4] · Hidden · Reaction — "Draw 2."
 *
 * Q: I have a Sprite at a battlefield with a hidden Consult the Past there. When my turn starts, can I react
 *    and resolve Consult the Past, or is it discarded (removed with the Sprite gone)?
 * A: Yes. At the start of your turn the Sprite's Temporary trigger goes on the chain; that gives you a Reaction
 *    window, so you can flip Consult the Past in response. LIFO: Consult resolves first (draw 2), then the
 *    Temporary trigger kills the Sprite. The hidden card is not swept away before you get to act.
 * Rules: 816 (Temporary = triggered kill at start of Beginning Phase, before scoring), 811 (Hidden → react
 *        for [0]; hidden cards are removed only when you no longer control the battlefield), 330–332, LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const CONSULT_THE_PAST = "ogn-083-298";

/**
 * End of P2's turn 2. P1 controls bf1 with ONLY a Sprite there and Consult the Past hidden at bf1 (hidden on an
 * earlier turn). Decks are auto-filled so the turn-start draw and Consult's draw 2 have cards to take.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, 0)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .facedown(P1, "bf1", CONSULT_THE_PAST, "consult");
}

/** P2 ends the turn; step into P1's Beginning Phase until the Temporary trigger is on the chain with a prompt. */
async function intoP1Beginning(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  // Accept a soft trigger-order offer if one is shown; otherwise nothing to do.
  await game.acceptTriggerOrder();
}

describe("Ruling 0b6a58a5073f7e1e — flip hidden Consult the Past in response to your own Sprite's Temporary trigger", () => {
  test("at the start of P1's turn the Sprite's Temporary trigger is put ON THE CHAIN (Sprite still on bf1, Consult still hidden there) and P1 has priority to respond", async () => {
    const game = await board().build();
    await intoP1Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.zoneOf("consult")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "consult")).toBe(true);
  });

  test("P1 flips Consult the Past for [0] in response: it goes on top of the Temporary trigger; LIFO → P1 draws 2 FIRST while the Sprite is still alive", async () => {
    const game = await board().build();
    await intoP1Beginning(game);
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.reveal("consult");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "consult"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult the Past resolves
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    // The Sprite's kill has not happened yet — its trigger is still the pending item.
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite"]);
  });

  test("then the Temporary trigger resolves: the Sprite is killed BEFORE scoring (no Hold point for the now-empty bf1), and P1 reaches the main phase with Consult's 2 cards + the normal draw", async () => {
    const game = await board().build();
    await intoP1Beginning(game);
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("consult");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).not.toBe("battlefield-bf1"); // killed (a token ceases to exist / goes away)
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0); // "before scoring": nothing held
    expect(game.zoneOf("consult")).toBe("trash"); // played, not discarded unplayed
    expect(game.p1.hand()).toHaveLength(hand0 + 2 + 1); // Consult's 2 + the turn draw
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 does NOT react, the Sprite dies, bf1 is lost, and the never-played hidden Consult the Past is removed from the battlefield (to trash) without drawing", async () => {
    const game = await board().build();
    await intoP1Beginning(game);
    const hand0 = game.p1.hand().length;
    await game.settle(); // pass, pass → Temporary resolves; then the rest of the Beginning Phase
    expect(game.phase()).toBe("main");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("consult")).not.toBe("facedown-bf1");
    expect(game.p1.hand()).not.toContain("consult");
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // only the turn draw — no "Draw 2"
    expect(game.p1.points()).toBe(0);
  });
});
