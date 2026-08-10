/**
 * Ruling c19b03aafcdb4918 — Lilting Lullaby (UNL-190 → unl-190-219) Reaction [2][calm][mind] "Counter a spell. Its controller can't
 *   play spells this turn." × Abandon (UNL-131 → unl-131-219) Reaction [2] "Counter a spell. Return it to its owner's hand instead of
 *   putting it in their trash. [Predict]." (Void Seeker ogn-024-298 is the spell being fought over.)
 *
 * Q: I play a spell; opponent Lullabies it; I Abandon my OWN spell. After everything resolves, can I still play spells this turn?
 * A: Yes. Abandon resolves first and removes the spell (to my hand); Lullaby then mistargets — its counter instruction is ignored and
 *    the LINKED "controller can't play spells" is ignored with it (359.3.e.14.a).
 * Rules: 340 (LIFO), 359.3.e.7 / 359.3.e.14.a (unavailable target → instruction and linked instruction ignored), 425.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const LULLABY = "unl-190-219";
const ABANDON = "unl-131-219";
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with X (5). P1: [8] + 2 fury; Void Seeker, Abandon, Spark in hand. P2: Lullaby + exactly [2][calm][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target X" }, "X")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, ABANDON, "abandon")
    .hand(P1, SPARK, "spark")
    .deck(P1, ["ogn-175-298"], ["p1top"])
    .hand(P2, LULLABY, "lull");
}

/** Void Seeker at X → P2 Lullaby on it → P1 Abandon on P1's own Void Seeker. */
async function fullStack(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("vs", { targets: "X" });
  await game.p1.passPriority();
  await game.p2.cast("lull", { targets: "vs" });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "abandon")).toBe(true);
  await game.p1.cast("abandon", { targets: "vs" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "lull", "abandon"]);
  return game;
}

/** Everyone passes; P1 declines the Predict recycle; the chain empties. */
async function resolveAll(game: Game): Promise<void> {
  const s = await game.settle();
  if (s.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.decline(); // [Predict]: leave the top card
    await game.settle();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling c19b03aafcdb4918 — Abandoning your own spell out from under Lilting Lullaby dodges the silence", () => {
  test("Abandon (top) resolves first: Void Seeker is countered to P1's HAND; X takes nothing", async () => {
    const game = await fullStack();
    await resolveAll(game);
    expect(game.zoneOf("vs")).toBe("hand");
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.state("X").damage).toBe(0);
  });

  test("Lullaby then resolves with its target gone: it goes to P2's trash having countered nothing, P2's resources stay spent — and P1 is NOT barred: Spark and the returned Void Seeker are both castable this turn", async () => {
    const game = await fullStack();
    await resolveAll(game);
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "spark")).toBe(true);
    expect(game.p1.can("cast", "vs")).toBe(true);
    await game.p1.cast("vs", { targets: "X" });
    await game.settle();
    expect(game.state("X").damage).toBe(4); // it really resolves
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Abandon, Lullaby counters Void Seeker and P1 can't play spells for the rest of the turn", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.cast("lull", { targets: "vs" });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p1.can("cast", "spark")).toBe(false);
    expect(game.p1.can("cast", "abandon")).toBe(false);
  });
});
