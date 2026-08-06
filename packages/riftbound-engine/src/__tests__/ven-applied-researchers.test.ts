/**
 * rule-id: ven-055-166 — Applied Researchers: "[Empowered][>] Your spells cost
 * [1][rainbow] less, to a minimum of [1]." The gated line failed to parse and
 * the engine never consulted board static cost-reductions at pay time, so
 * friendly spells were charged full cost while the host was Empowered.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { clearGlobalCardRegistry } from "../operations/card-lookup";
import {
  applyStaticCostReduction,
  reducePowerCost,
} from "../operations/static-cost-reduction";

const P1 = "player-1";
const RESEARCHERS = "ven-055-166";
const MEDITATION = "ogn-048-298"; // 2-energy calm Reaction spell

type Internal = {
  zones: Record<string, { cardIds: string[] }>;
  cards: Record<string, { zone: string; owner: string }>;
  cardMetas: Record<string, Record<string, unknown>>;
};

function relocate(internal: Internal, cardId: string, to: string): void {
  const from = internal.cards[cardId]!.zone;
  internal.zones[from]!.cardIds = internal.zones[from]!.cardIds.filter((c) => c !== cardId);
  internal.zones[to]!.cardIds.push(cardId);
  internal.cards[cardId]!.zone = to;
}

async function setup(empowered: boolean) {
  const { getAllCards } = await import("../../../riftbound-cards/src/data/all-cards");
  const { createPlayableGame, getZoneCards } = await import("../testing/playtest/game-setup");
  const allCards = getAllCards();
  const deck = {
    battlefieldIds: ["ogn-275-298"],
    mainDeckCardIds: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? MEDITATION : RESEARCHERS)),
    runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-166-298"),
  };
  const { engine } = createPlayableGame(allCards as never, deck, deck, `ven-055-${empowered}`);
  const internal = (engine as unknown as { internalState: Internal }).internalState;
  const all = [...getZoneCards(engine, "hand", P1), ...getZoneCards(engine, "mainDeck", P1)];
  const spell = all.find((id) => id.endsWith(MEDITATION))!;
  const unit = all.find((id) => id.endsWith(RESEARCHERS))!;
  if (internal.cards[spell]!.zone !== "hand") relocate(internal, spell, "hand");
  relocate(internal, unit, "base");
  internal.cardMetas[unit] = { ...(internal.cardMetas[unit] ?? {}), empowered };
  engine.executeMove("addResources", {
    params: { energy: 5, playerId: P1, power: { calm: 1 } },
    playerId: P1 as CorePlayerId,
  });
  return { engine, spell };
}

describe("ven-055-166 Applied Researchers", () => {
  afterEach(() => clearGlobalCardRegistry());

  test("parses the [Empowered] spell cost-reduction as a while-empowered static", async () => {
    const { parseAbilities } = await import("../../../riftbound-cards/src/parser");
    const result = parseAbilities(
      "[Empower] [3] ([3]: Empower me. Use only if not Empowered.)\n[Empowered][>] Your spells cost [1][rainbow] less, to a minimum of [1].",
    );
    expect(result.success).toBe(true);
    const aura = result.abilities?.find(
      (a) => a.type === "static" && (a as { effect?: { type?: string } }).effect?.type === "cost-reduction",
    ) as { condition?: { type?: string }; effect?: { target?: unknown; minimum?: unknown } } | undefined;
    expect(aura).toBeDefined();
    expect(aura?.condition?.type).toBe("while-empowered");
    expect(aura?.effect?.target).toEqual({ controller: "friendly", type: "spell" });
    expect(aura?.effect?.minimum).toBeDefined();
  });

  test("while Empowered, a friendly 2-cost spell is charged 1 energy", async () => {
    const { engine, spell } = await setup(true);
    const before = engine.getState().runePools[P1]!.energy;
    const r = engine.executeMove("playSpell", {
      params: { cardId: spell, playerId: P1 },
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);
    expect(before - engine.getState().runePools[P1]!.energy).toBe(1);
  });

  test("when not Empowered, the spell is charged its full 2 energy", async () => {
    const { engine, spell } = await setup(false);
    const before = engine.getState().runePools[P1]!.energy;
    const r = engine.executeMove("playSpell", {
      params: { cardId: spell, playerId: P1 },
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);
    expect(before - engine.getState().runePools[P1]!.energy).toBe(2);
  });

  test("minimum floors the discount but never raises a cheaper cost", () => {
    const red = { minimum: 1, power: {}, reduction: 1 };
    expect(applyStaticCostReduction(2, red)).toBe(1);
    expect(applyStaticCostReduction(1, red)).toBe(1);
    expect(applyStaticCostReduction(0, red)).toBe(0);
  });

  test("a rainbow waiver covers one power pip of any domain", () => {
    expect(reducePowerCost({ calm: 1 }, { rainbow: 1 })).toEqual({ calm: 0 });
    expect(reducePowerCost({ calm: 1, fury: 1 }, { rainbow: 1 }, { calm: 1 })).toEqual({
      calm: 1,
      fury: 0,
    });
    expect(reducePowerCost({}, { rainbow: 1 })).toEqual({});
  });
});
