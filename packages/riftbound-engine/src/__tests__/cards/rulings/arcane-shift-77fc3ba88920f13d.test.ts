/**
 * Ruling 77fc3ba88920f13d — Arcane Shift (SFD-200 → sfd-200-221) · Action · 3 + [rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *      battlefield. Banish this."
 *   × Mindsplitter (OGN-192 → ogn-192-298) · 7 Might · "When you play me, choose an opponent. They reveal their
 *     hand. Choose a card from it, and they discard that card."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *
 * Q: Arcane Shift on my Mindsplitter + enemy Watchful Sentry: does the Sentry's controller draw off Deathknell
 *    before Mindsplitter's "When you play me" resolves?
 * A: No — Mindsplitter's play trigger resolves FIRST (discard), then Deathknell (draw). Shift resolves in order
 *    (banish → replay Mindsplitter as a pending item → 3 to Sentry); Deathknell becomes pending in cleanup;
 *    pending items finalize FIFO (Mindsplitter, whose play trigger then becomes pending; Deathknell; the play
 *    trigger) and the chain resolves LIFO: play trigger, then Deathknell.
 * Rules: 338/339 (pending items finalize FIFO; units resolve on finalize), 340.1 (LIFO), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const MINDSPLITTER = "ogn-192-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/**
 * P1's turn with exactly 3 + [rainbow]. Mindsplitter in P1's base; P2 holds bf1 with Watchful Sentry (1) and a
 * vanilla Grunt (4). P2's hand is two known cards; decks are auto-filled.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MINDSPLITTER, "mind")
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt")
    .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Held Card A" }, "ha")
    .hand(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Held Card B" }, "hb")
    .hand(P1, ARCANE_SHIFT, "shift");
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}:${c.controller}`);

/** Cast Arcane Shift [Mindsplitter, Sentry] and let the spell itself resolve. */
async function shiftResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("shift", { targets: ["mind", "sentry"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", targets: ["mind", "sentry"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  await game.acceptTriggerOrder();
  return game;
}

describe("Ruling 77fc3ba88920f13d — Mindsplitter's play trigger resolves before Watchful Sentry's Deathknell", () => {
  test("after Arcane Shift resolves: Mindsplitter was replayed for free (back on the board, 7 Might), Sentry died to the 3, Shift banished itself — and the chain is [Deathknell (P2) below, Mindsplitter's play trigger (P1) on top]", async () => {
    const game = await shiftResolved();
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.zoneOf("mind")).toBe("base");
    expect(game.state("mind")).toMatchObject({ might: 7, owner: P1 });
    expect(game.p1.energy()).toBe(0); // "ignoring its cost"
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("grunt").damage).toBe(0);
    expect(ids(game)).toEqual([`sentry:${P2}`, `mind:${P1}`]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    // Newest item is P1's → P1 holds priority; nobody has discarded or drawn yet.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "mind" } });
    expect(game.p2.hand()).toEqual(["ha", "hb"]);
  });

  test("LIFO step 1: Mindsplitter's trigger resolves first — P2's hand is revealed and P1 picks a card, which P2 discards — while Deathknell still waits (no draw yet)", async () => {
    const game = await shiftResolved();
    const deckBefore = game.p2.deck().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "mind" } });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ha", "hb"]);
    await game.p1.pick("ha");
    expect(game.zoneOf("ha")).toBe("trash");
    expect(game.p2.hand()).toEqual(["hb"]);
    expect(game.p2.deck()).toHaveLength(deckBefore); // Deathknell has NOT drawn yet
    expect(ids(game)).toEqual([`sentry:${P2}`]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "sentry" } });
  });

  test("LIFO step 2: only then does Deathknell resolve — P2 draws 1 (after the discard, so the drawn card was never exposed to Mindsplitter)", async () => {
    const game = await shiftResolved();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("ha");
    const deckBefore = game.p2.deck().length;
    const top = game.p2.deck()[0] as string;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(deckBefore - 1);
    expect(game.p2.hand().sort()).toEqual(["hb", top].sort());
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
