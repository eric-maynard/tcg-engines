/**
 * Hand-card pricing in the UI snapshot.
 *
 * rule 356.4 — the pay bar must show the cost the engine will actually charge.
 * A card whose OWN static scales its cost ("Reduce my cost by [1] for each of
 * the following tags among your units", unl-196-219 Daisy!) is skipped by the
 * board scan in `computeStaticCostReduction`, so the snapshot has to add the
 * self discount too or auto-pay over-taps runes.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "@tcg/riftbound/harness";
import type { GameSession } from "../state";
import { buildGameSnapshot } from "../snapshot";

const DAISY = "unl-196-219";
const BIRD = "unl-t02"; // Bird token
const LOYAL_PORO = "unl-156-219"; // tag Poro

function sessionOf(engine: unknown): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Dev", [P2]: "Opp" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
}

function handCost(snapshot: ReturnType<typeof buildGameSnapshot>, cardId: string) {
  const hand = (snapshot.zones as Record<string, { id: string; effectiveEnergyCost?: number }[]>).hand ?? [];
  return hand.find((c) => c.id === cardId)?.effectiveEnergyCost;
}

describe("buildGameSnapshot: effectiveEnergyCost", () => {
  test("prints the undiscounted cost with no tagged units on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 2 } })
      .hand(P1, DAISY, "daisy")
      .build();
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P1), "daisy")).toBe(9);
  });

  test("applies the card's own tag-scaled self discount (2 distinct tags → 7)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 2 } })
      .unit(P1, "base", BIRD, "token-bird")
      .unit(P1, "base", LOYAL_PORO, "poro")
      .hand(P1, DAISY, "daisy")
      .build();
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P1), "daisy")).toBe(7);
  });

  test("gained tags count for the shown price too (rule 135.2.b.3): 2 printed + 2 gained → 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 2 } })
      .unit(P1, "base", BIRD, "token-bird")
      .unit(P1, "base", LOYAL_PORO, "poro")
      .unit(P1, "base", { might: 2, name: "Named Cat" }, "namedcat", { namedTag: "Cat" })
      .unit(P1, "base", { might: 2, name: "Granted Dog" }, "granteddog", { grantedTags: ["Dog"] })
      .hand(P1, DAISY, "daisy")
      .build();
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P1), "daisy")).toBe(5);
  });
});
