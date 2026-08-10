/**
 * Ruling fe794f868960370d — Gutter Palace (UNL-088 → unl-088-219) · Gear · "At the start of your Beginning Phase, if you have exactly 4 cards
 *     in hand and exactly 4 units at battlefields, you win the game. …"
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can you react to Gutter Palace's win condition? If not, why?
 * A: You CAN react — the win is a triggered ability that goes on the chain (Closed State ⇒ Reactions are legal) — but you can't stop it
 *    that way: the "if exactly 4 / exactly 4" is a trigger CONDITION checked only when the ability is put on the chain (383.2.a.1 /
 *    383.3.e). Gusting a unit in response (now 3 units, 5 cards) changes nothing; the ability resolves and its controller wins. Only
 *    changing the board/hand BEFORE the Beginning Phase prevents it.
 * Rules: 383.2.a.1 / 383.3.e (conditional trigger checked on triggering, not on resolution), 315.2.a (Beginning Step triggers), 330 (Closed
 *        State), 346 (Reactions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUTTER_PALACE = "unl-088-219";
const GUST = "ogn-169-298";
const FILLER = "ogn-175-298";

/**
 * P2 is about to end turn 3. P1: the Palace, exactly 4 cards in hand, exactly 4 units (2 Might each) spread over its bf1/bf2. P2: Gust in hand
 * and one READY calm rune (its pool empties at its own end of turn, so it must tap in response).
 */
function eve() {
  const b = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .gear(P1, GUTTER_PALACE, "palace")
    .runes(P2, "calm", 1)
    .hand(P2, GUST, "gust");
  for (let i = 0; i < 4; i++) {
    b.unit(P1, i % 2 ? "bf1" : "bf2", { energyCost: 2, might: 2, name: `Unit ${i}` }, `u${i}`);
    b.hand(P1, FILLER, `c${i}`);
  }
  return b;
}

/** P2 ends its turn → P1's Beginning Phase starts with the Palace ability on the chain. */
async function palaceTriggered(): Promise<Game> {
  const game = await eve().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "palace", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling fe794f868960370d — you may react to Gutter Palace's win trigger, but a reaction can't stop it", () => {
  test("1. at the start of P1's Beginning Phase, with exactly 4 in hand and exactly 4 units at battlefields, the win ability is put on the chain (nothing won yet)", async () => {
    const game = await palaceTriggered();
    expect(game.p1.hand()).toHaveLength(4);
    expect([...game.p1.units("bf1"), ...game.p1.units("bf2")]).toHaveLength(4);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("2. that is a Closed State in which the opponent may play a Reaction: after P1 passes, P2 taps its rune and Gust (targeting u1) is legal and goes on top", async () => {
    const game = await palaceTriggered();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "u1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["palace", "gust"]);
    expect(game.isOver()).toBe(false);
  });

  test("3–4. Gust resolves first (u1 back to hand → P1 now has 5 cards and 3 units), yet the Palace ability then resolves WITHOUT re-checking and P1 WINS", async () => {
    const game = await palaceTriggered();
    await game.p1.passPriority();
    await game.p2.tapRune();
    await game.p2.cast("gust", { targets: "u1" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(5);
    expect([...game.p1.units("bf1"), ...game.p1.units("bf2")]).toHaveLength(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["palace"]); // the win is still coming
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("no reaction at all: both pass and P1 simply wins", async () => {
    const game = await palaceTriggered();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the only way out is BEFORE the Beginning Phase: if P2 Gusts a unit during its own turn (3 units / 5 cards when P1's turn starts) the ability never triggers and nobody wins", async () => {
    const game = await eve().build();
    // On its own turn P2 needs an Open-State window for a Reaction: it just casts it (Reactions are playable any time).
    await game.p2.tapRune();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "u1" });
    await game.settle();
    expect(game.zoneOf("u1")).toBe("hand");
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "palace")).toBe(false);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
