/**
 * Ruling e9583097bf8802c8 — Defy (OGN-045 → ogn-045-298) · [Reaction] · 1+[calm] · "Counter a spell that costs no more than
 *   [4] and no more than [rainbow]."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might · "When you play your second card in a turn, give me +2 [Might]
 *     this turn and ready me."
 *   × Dredge Up (VEN-049 → ven-049-166) · 2 · "Draw 1." (the second card, countered)
 *
 * Q: If you Defy a card, does it still ready Darius?
 * A: No. A countered card is not considered played, so abilities that trigger on playing a card — including Darius's
 *    "second card" — do not trigger: first card played, second card attempted, Defy counters it, Darius stays as he is.
 * Rules: 425.1.b (countered ⇒ not played), 419.4.a / 419.4.a.1 (play-triggers need the play to complete by resolving).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DARIUS = "ogn-027-298";
const DREDGE_UP = "ven-049-166";
const OPENER = { cardType: "unit", energyCost: 1, might: 1, name: "Opener" } as const;
const THIRD = { cardType: "unit", energyCost: 1, might: 1, name: "Third" } as const;

/** P1's turn: Darius EXHAUSTED in base; hand = Opener (1), Dredge Up (2), Third (1); [4]. P2: Defy + exactly 1+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, OPENER, "opener")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P1, THIRD, "third")
    .hand(P2, DEFY, "defy");
}

/** Steps 1–3: Opener (first card) resolves; Dredge Up (second card) is cast and P2 Defies it. */
async function secondCardDefied(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("opener");
  await game.settle();
  expect(game.zoneOf("opener")).toBe("base");
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card: nothing happens
  await game.p1.cast("dredge");
  expect(game.chain().some((c) => c.cardId === "darius")).toBe(false); // trigger waits for resolution (419.4.a)
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "dredge" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "defy"]);
  return game;
}

describe("Ruling e9583097bf8802c8 — a Defied second card does not ready Darius", () => {
  test("steps 4–6: Defy resolves and counters Dredge Up (trash, no draw) — Darius never triggers: still exhausted, still 5, no Darius item ever on the chain", async () => {
    const game = await secondCardDefied();
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand); // countered: no "Draw 1"
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Defy): Opener then a RESOLVING Dredge Up is the second card — Darius gets +2 (7) and is readied", async () => {
    const game = await board().build();
    await game.p1.play("opener");
    await game.settle();
    await game.p1.cast("dredge");
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
  });

  test("follow-up: because the countered Dredge Up took no ordinal, the NEXT card P1 plays (Third) is the real second card — Darius triggers then", async () => {
    const game = await secondCardDefied();
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("third");
    await game.settle();
    expect(game.zoneOf("third")).toBe("base");
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
