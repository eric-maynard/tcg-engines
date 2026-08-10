/**
 * Ruling da12ed7463720249 — Sprite token (ogn-274-298) × Consult the Past (ogn-083-298)
 *   Sprite — 3-Might unit token: "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   Consult the Past — [Hidden][Reaction] · [4]: "Draw 2."
 *   ("Buried Findings", the battlefield the Sprite is holding in the question, is not in this card pool — an inert
 *    battlefield stands in; it plays no part in the answer.)
 *
 * Q: A Sprite holding a battlefield is about to die to Temporary at the start of its controller's turn (before scoring).
 *    Can the OPPONENT react — flip a hidden Consult the Past — before the Sprite dies?
 * A: Yes. Temporary is a trigger on the chain at the start of the turn; the opponent gets a Reaction window on it, may
 *    flip Consult the Past there, and only afterwards does the trigger resolve and the Sprite die.
 * Rules: 816 (Temporary → triggered kill at start of Beginning Phase, before scoring), 330–337 (chain, priority to all
 *        players), 811 (hidden card played as a Reaction for [0]), 186.1 (dead token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const CONSULT_THE_PAST = "ogn-083-298";

/**
 * End of P2's turn 3. P1's Sprite token ALONE holds bf1 (would score a hold point if it survived to scoring). P2 controls
 * bf2 with a Watcher and hid Consult the Past there on an earlier turn; P2 has 0 resources and a known deck top.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 0)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "consult")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["c1", "c2", "c3"]);
}

/** P2 ends the turn → P1's Beginning Phase starts with the Sprite's Temporary trigger on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling da12ed7463720249 — the opponent may flip a hidden Consult the Past in response to a Sprite's Temporary trigger", () => {
  test("start of P1's turn, before scoring: the Temporary kill is a chain item, the Sprite is still alive on bf1 and P1 has scored nothing yet", async () => {
    const game = await atTemporaryTrigger();
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P1 passes → the OPPONENT (P2) gets priority on that trigger and may reveal the hidden Consult the Past for [0]: it goes on the chain above the trigger, Sprite still alive", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "consult")).toBe(true);
    await game.p2.reveal("consult");
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "consult"]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
  });

  test("LIFO: Consult the Past resolves first — P2 draws 2 (c1, c2) while the Sprite is STILL on bf1 — and only then does the Temporary trigger resolve and the Sprite die (token ceases to exist)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.p2.reveal("consult");
    const p2Hand = game.p2.hand().length;
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "consult"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // not dead yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    // It died before scoring: bf1 is no longer held by P1 and no hold point was scored.
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: if everyone just passes, the Sprite dies at once (before scoring) and Consult the Past stays hidden", async () => {
    const game = await atTemporaryTrigger();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.zoneOf("consult")).toBe("facedown-bf2");
    expect(game.p1.points()).toBe(0);
  });
});
