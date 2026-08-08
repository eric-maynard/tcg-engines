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
const SPOILS = "ogn-144-298"; // 4 energy + [body]; "[2] less if an enemy unit has died this turn"
const HEXTECH_RAY = "ogn-009-298"; // 1 energy + [fury]: deal 3 to a unit at a battlefield
const HELM = "ven-045-166"; // Helm of Suppression — opponents' spells cost [1] more
const CLEAVE = "ogn-004-298"; // Fury Action, 1 energy

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

function handEntry(snapshot: ReturnType<typeof buildGameSnapshot>, cardId: string) {
  const hand = (snapshot.zones as Record<
    string,
    { id: string; effectiveEnergyCost?: number; effectivePowerCost?: string[] }[]
  >).hand ?? [];
  return hand.find((c) => c.id === cardId);
}

function handCost(snapshot: ReturnType<typeof buildGameSnapshot>, cardId: string) {
  return handEntry(snapshot, cardId)?.effectiveEnergyCost;
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

  // rule 356.4 (rule-id: ogn-144-298) — a self CONDITIONAL discount ("if an
  // enemy unit has died this turn") is neither a board static nor a scaled
  // self discount; the quoted price must come from the engine's own Total Cost.
  test("applies the card's own this-turn conditional discount (4 → 2 after an enemy unit dies)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .hand(P1, HEXTECH_RAY, "ray")
      .hand(P1, SPOILS, "spoils")
      .build();
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P1), "spoils")).toBe(4);
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P1), "spoils")).toBe(2);
  });

  // rule 356.3 (rule-id: ven-045-166) — an opponent's static cost INCREASE is
  // added after every discount; a quote that only ever subtracts under-charges.
  test("includes an enemy static cost increase (Helm of Suppression taxes P2's spell)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .gear(P1, HELM, "helm")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(handCost(buildGameSnapshot(sessionOf(game.engine), P2), "cleave")).toBe(2);
  });

  // rule 356.3 / 135.2.e.5 — the Empowered Helm's tax is [1][rainbow]: the pay
  // bar needs the added pip too, not just the energy.
  test("reports the [rainbow] pip an Empowered Helm adds", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 2 } })
      .gear(P1, HELM, "helm", { empowered: true })
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    const entry = handEntry(buildGameSnapshot(sessionOf(game.engine), P2), "cleave");
    expect(entry?.effectiveEnergyCost).toBe(2);
    expect(entry?.effectivePowerCost).toEqual(["rainbow"]); // Cleave prints no pip
  });
});
