/**
 * Ruling 982fb42c7fbb222e — (no specific card) ordering a start-of-Beginning-Phase draw against a Hold draw.
 *   Stand-ins: Loose Cannon (OGN-251 → ogn-251-298) · Legend · "At start of your Beginning Phase, draw 1 if
 *   you have one or fewer cards in your hand"; Vilemaw (UNL-060 → unl-060-219) · "When I hold, draw 1"
 *   standing at the battlefield P1 controls.
 *
 * Q: A "at the start of your Beginning Phase, draw 1" and a "when I hold, draw 1" — in what order do they
 *    resolve relative to gaining the Hold point?
 * A: The start-of-phase draw goes first, before the point. The Beginning Phase runs Beginning Step (where
 *    "at the start of your Beginning Phase" effects go on the chain) and only then the Scoring Step, where
 *    the Hold happens and puts the "when I hold" trigger on the chain. Fixed step order — no player choice
 *    is involved, because the two are not simultaneous.
 * Rules: 315.2.a / 315.2.a.1 (Beginning Step: start-of-phase effects), 315.2.b / 315.2.b.2 (Scoring Step:
 *        the Turn Player Holds the battlefields they control), 383.4.d / 383.4.d.2.a (Hold effects go on
 *        the chain after the Hold and the point), 383.3.d (only SIMULTANEOUS triggers are ordered by their
 *        controllers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOOSE_CANNON = "ogn-251-298";
const VILEMAW = "unl-060-219";

const FILLER = (name: string) => ({ cardType: "spell", energyCost: 0, name, rulesText: "" }) as const;

/** End of P2's turn 2. P1: Loose Cannon as Legend, Vilemaw holding bf1, an empty hand and a stacked deck. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "cannon")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VILEMAW, "vile")
    .deck(P1, [FILLER("A"), FILLER("B"), FILLER("C")], ["cardA", "cardB", "cardC"]);
}

/** P2 ends the turn → P1's Beginning Phase opens. */
async function beginningPhase(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual([]);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

/** Pass priority for both seats until the chain is empty or a non-chain decision appears. */
async function drainChain(game: Game, steps = 8): Promise<void> {
  for (let i = 0; i < steps; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") return;
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 982fb42c7fbb222e — the start-of-phase draw resolves before the Hold point; the Hold draw after it", () => {
  test("the Beginning Phase opens with ONLY the start-of-phase trigger on the chain — no point has been scored yet", async () => {
    const game = await beginningPhase();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cannon", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });

  test("it resolves first: the card is drawn while the score is still 0", async () => {
    const game = await beginningPhase();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["cardA"]); // the Loose Cannon draw
  });

  test("only then does the Scoring Step Hold bf1 — the point lands, and the 'when I hold' trigger goes on the chain AFTER it", async () => {
    const game = await beginningPhase();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vile", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual(["cardA"]); // Vilemaw has not drawn yet
  });

  test("end to end: draw (phase start) → point → draw (hold) → draw (Draw Step), in that order", async () => {
    const game = await beginningPhase();
    await drainChain(game);
    expect(game.p1.points()).toBe(1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toEqual(["cardA", "cardB", "cardC"]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
