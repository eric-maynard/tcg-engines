/**
 * Ruling 07b1197e81f858f9 — Thrill of the Hunt (UNL-184 → unl-184-219) · Spell · Fury/Body · [2][fury] · Reaction
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · Fury · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Can Thrill of the Hunt "instantly" set off Darius's ability?
 * A: Yes — if Thrill is your FIRST card this turn. Playing Darius via Thrill counts as playing a card; he is on
 *    the board (entering exhausted) when the "second card" check happens and sees himself as card #2 → +2 Might
 *    and readied. If another card was already played before Thrill, Darius is card #3 and does not trigger.
 * Rules: 419.4 (a card played by an effect is still "played"), 811.1.c.3 / 340 (units enter exhausted),
 *        383.2.c (trigger checked after the play completes), 359.2 (owner chooses the battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const DARIUS = "ogn-027-298";

/**
 * P1's turn, nothing played yet. P1 controls bf1 (a Sentry stands there); Darius (exhausted, as if he attacked
 * earlier) is in P1's base; P1 holds Thrill + a cheap Squire, with [3] + [fury]: Thrill (2+fury) and Squire (1).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 4, name: "Enemy Guard" }, "guard")
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .hand(P1, THRILL, "thrill")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Squire" }, "squire");
}

/** Cast Thrill on Darius, let it resolve, and have the owner (P1) replay him to bf1; drain the rest. */
async function thrillDariusToBf1(game: Game): Promise<void> {
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "darius" });
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
  expect(game.zoneOf("darius")).toBe("banishment");
  const keys = r.decision?.kind === "pick" ? r.decision.options.map((o) => o.key) : [];
  expect(keys).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
  await game.settle({ policy: "first" });
  expect(game.zoneOf("thrill")).toBe("trash");
  expect(game.zoneOf("darius")).toBe("battlefield-bf1");
}

describe("Ruling 07b1197e81f858f9 — Darius replayed by Thrill of the Hunt sees himself as the second card", () => {
  test("Thrill as the FIRST card: Darius is banished, replayed to bf1 by his owner for free, counts as card #2 → triggers: +2 Might (7) and READY", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await thrillDariusToBf1(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // only Thrill was paid for
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2); // Thrill, then Darius
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("constraint: a card played BEFORE Thrill makes Darius card #3 — no trigger: he arrives at bf1 EXHAUSTED and stays 5 Might", async () => {
    const game = await board().build();
    await game.p1.play("squire", { to: "base" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    // Darius does not trigger off Thrill itself being card #2 either: he is in banishment/being replayed, and
    // in any case the ruling's outcome is "would not trigger".
    await thrillDariusToBf1(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(3);
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("premise check: without Thrill, Darius on the board triggers off an ordinary second card (Squire after any first card) — the trigger is about the COUNT, not about Thrill", async () => {
    const game = await board().hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Page" }, "page").build();
    await game.p1.play("page", { to: "base" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("squire", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").isReady).toBe(true);
  });
});
