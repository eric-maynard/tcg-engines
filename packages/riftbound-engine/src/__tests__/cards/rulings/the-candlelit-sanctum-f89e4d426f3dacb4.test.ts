/**
 * Ruling f89e4d426f3dacb4 — The Candlelit Sanctum (OGN-291 → ogn-291-298) · Battlefield
 *     "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put
 *      those you don't back in any order."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · [2] · 2 Might — "When I move, discard 1, then draw 1."
 *
 * Q: Can you resolve the Sanctum's conquer trigger BEFORE the Merchant's discard-and-draw?
 * A: No. The Merchant's ability triggers on the move itself, which happens before it can conquer. Sequence: move
 *    trigger → discard/draw resolves → conquest (and the Sanctum trigger) afterwards.
 * Rules: 383 (move trigger finalized right after the move), 344/323 (a staged showdown opens only once the chain is
 *        empty), 348.2.a (conquer on the non-combat showdown's close).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANDLELIT_SANCTUM = "ogn-291-298";
const MERCHANT = "ogn-185-298";
const SKULKER = "ogn-175-298";

const pickOptions = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn. The live Candlelit Sanctum is empty and uncontrolled. P1: ready Merchant in base, one Junk card in hand, known deck D1..D4. */
function board() {
  return scenario()
    .battlefield("sanctum", { controller: null, def: CANDLELIT_SANCTUM, inert: false })
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3", "d4"]);
}

async function merchantMoved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "sanctum");
  return game;
}

/** Both pass → the Merchant trigger resolves: discard Junk, draw D1. */
async function merchantResolved(): Promise<Game> {
  const game = await merchantMoved();
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(game.decision())).toEqual(["junk"]);
    await game.p1.pick("junk");
  }
  expect(game.zoneOf("junk")).toBe("trash");
  expect(game.p1.hand()).toEqual(["d1"]);
  return game;
}

describe("Ruling f89e4d426f3dacb4 — the Merchant's move trigger resolves before the Sanctum can be conquered", () => {
  test("right after the move: the Merchant's 'When I move' trigger is the ONLY chain item; the Sanctum is merely contested (not conquered, no Sanctum trigger, 0 points) and no showdown has opened yet", async () => {
    const game = await merchantMoved();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "sanctum")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.sanctum).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["junk"]); // nothing discarded/drawn yet either
  });

  test("the discard-and-draw resolves in full (Junk discarded, D1 drawn) — and STILL no conquest: controller null, no Sanctum item, the showdown only now opens with P1's Focus", async () => {
    const game = await merchantResolved();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.sanctum?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("only after both pass Focus does P1 conquer the Sanctum (+1) and its trigger go on the chain; it then looks at D2/D3 (D1 is already in hand)", async () => {
    const game = await merchantResolved();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sanctum", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(d).sort()).toEqual(["d2", "d3"]);
    await game.p1.pick("d2"); // recycle one …
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    const ord = game.decision();
    if (ord?.kind === "order") {
      await game.p1.order(ord.items.map((o) => o.key));
    }
    await game.settle();
    expect(game.p1.deck()[0]).toBe("d3"); // … the other back on top
    expect(game.p1.deck().at(-1)).toBe("d2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
