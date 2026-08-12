/**
 * Ruling f638b1f38007fbd7 — Defy (OGN-045 → ogn-045-298) · [Reaction] spell · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · [5][order][order] — too expensive to be countered.
 *
 * Q: Can I cast Defy at an oversized spell (or at Defy itself) just to get a "you played a spell" trigger?
 * A: No. Defy needs a LEGAL target to be cast at all: a spell of Energy cost ≤ 4 and Power cost ≤ 1. With only an
 *    oversized spell on the Chain the cast is not offered, and a spell can never target itself.
 * Rules: 355.8 (a spell with no legal target can't be played), 355.9.c (a spell is not among its own targets), 425 (countering).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const IMPERIAL_DECREE = "ogn-221-298";
const CLEAVE = "ogn-004-298"; // [1] — a legal Defy target

/** P2's turn. P2 can cast either the oversized Imperial Decree or the cheap Cleave; P1 holds Defy. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Brute" }, "brute")
    .hand(P2, IMPERIAL_DECREE, "decree")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, DEFY, "defy")
    .resources(P2, { energy: 6, power: { order: 2 } })
    .resources(P1, { energy: 1, power: { calm: 1 } });
}

async function decreeOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("decree", { targets: undefined });
  await game.p2.passPriority(); // priority now genuinely P1's — what follows is a targeting verdict, not a timing one
  expect(game.chain().map((c) => c.cardId)).toEqual(["decree"]);
  expect(game.actingSeat()).toBe(P1);
  return game;
}

describe("Ruling f638b1f38007fbd7 — Defy cannot be cast at an oversized spell, and never at itself", () => {
  test("premise: Imperial Decree costs [5][order][order] — outside both of Defy's caps", async () => {
    const game = await board().build();
    expect(game.state("decree")).toMatchObject({ energyCost: 5 });
    expect(game.state("decree").powerCost).toEqual(["order", "order"]);
    expect(game.state("cleave")).toMatchObject({ energyCost: 1 });
  });

  test("with only Imperial Decree on the Chain, casting Defy is not offered at all (no legal target)", async () => {
    const game = await decreeOnChain();
    expect(game.p1.can("cast", "defy")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("defy", { targets: "decree" }));
    expect(attempt.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["decree"]); // state untouched
  });

  test("the oversized spell therefore resolves — no 'spell was played' trigger is bought by a failed Defy", async () => {
    const game = await decreeOnChain();
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("hand"); // never left P1's hand
  });

  test("Defy cannot target ITSELF: with Defy the only spell on the Chain there is nothing legal to counter", async () => {
    const game = await board().build();
    await game.p2.cast("cleave", { targets: "brute" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "defy"]);
    // Defy is on the Chain but is not a legal object for a second Defy — and it is not its own target either.
    expect(game.chain()[1]?.targets).toEqual(["cleave"]);
    const second = await game.p1.try((p) => p.cast("defy", { targets: "defy" }));
    expect(second.ok).toBe(false);
  });

  test("with a legal target Defy works normally: Cleave is countered and its effect never happens", async () => {
    const game = await board().build();
    await game.p2.cast("cleave", { targets: "brute" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("brute").grantedKeywords).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
