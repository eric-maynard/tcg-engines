/**
 * rule-id: ven-083-166 — Rampage: "you may pay [body] as an additional cost"
 * must be offered by playSpell, and the +2 Might rider applies to the chosen
 * friendly unit only when that cost was paid, before Might-based damage.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { clearGlobalCardRegistry } from "../operations/card-lookup";

const P1 = "player-1";
const P2 = "player-2";
const RAMPAGE = "ven-083-166";
// Playful Phantom — vanilla Might 5 (survives the enemy's 2 return damage).
const BIG = "ogn-049-298";
// Legion Rearguard — Might 2.
const SMALL = "ogn-010-298";

type Internal = {
  zones: Record<string, { cardIds: string[] }>;
  cards: Record<string, { zone: string; owner: string }>;
};

function relocate(internal: Internal, cardId: string, to: string): void {
  const from = internal.cards[cardId]!.zone;
  internal.zones[from]!.cardIds = internal.zones[from]!.cardIds.filter((c) => c !== cardId);
  internal.zones[to]!.cardIds.push(cardId);
  internal.cards[cardId]!.zone = to;
}

async function setup(power: Record<string, number>) {
  const { getAllCards } = await import("../../../riftbound-cards/src/data/all-cards");
  const { createPlayableGame, getZoneCards, getCardMeta } = await import(
    "../testing/playtest/game-setup"
  );
  const allCards = getAllCards();
  const ids = [RAMPAGE, BIG, SMALL];
  const deck = {
    battlefieldIds: ["ogn-275-298"],
    mainDeckCardIds: Array.from({ length: 39 }, (_, i) => ids[i % 3]!),
    runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-166-298"),
  };
  const { engine } = createPlayableGame(allCards as never, deck, deck, "ven-rampage");
  const internal = (engine as unknown as { internalState: Internal }).internalState;
  const mine = [...getZoneCards(engine, "hand", P1), ...getZoneCards(engine, "mainDeck", P1)];
  const theirs = [...getZoneCards(engine, "hand", P2), ...getZoneCards(engine, "mainDeck", P2)];
  const spell = mine.find((id) => id.endsWith(RAMPAGE))!;
  const friendly = mine.find((id) => id.endsWith(BIG))!;
  const enemy = theirs.find((id) => id.endsWith(SMALL))!;
  if (internal.cards[spell]!.zone !== "hand") relocate(internal, spell, "hand");
  relocate(internal, friendly, "base");
  relocate(internal, enemy, "base");
  engine.executeMove("addResources", {
    params: { energy: 10, playerId: P1, power },
    playerId: P1 as CorePlayerId,
  });
  return { enemy, engine, friendly, getCardMeta, internal, spell };
}

function drainChain(engine: Awaited<ReturnType<typeof setup>>["engine"]): void {
  for (let i = 0; i < 6; i++) {
    const s = engine.getState();
    if (!s.interaction?.chain?.active) return;
    const who = s.interaction.chain.activePlayer as string;
    engine.executeMove("passChainPriority", {
      params: { playerId: who },
      playerId: who as CorePlayerId,
    });
  }
}

type SpellParams = { cardId?: string; targets?: string[]; paidAdditionalCost?: boolean };

describe("ven-083-166 Rampage optional additional cost", () => {
  afterEach(() => clearGlobalCardRegistry());

  test("enumerates a paid [body] variant and applies +2 Might to the friendly unit only", async () => {
    const { engine, internal, spell, friendly, enemy, getCardMeta } = await setup({ body: 1 });
    const moves = engine.enumerateMoves(P1 as CorePlayerId, { validOnly: true });
    const forPair = moves.filter(
      (m) =>
        m.moveId === "playSpell" &&
        (m.params as SpellParams).cardId === spell &&
        (m.params as SpellParams).targets?.[0] === friendly &&
        (m.params as SpellParams).targets?.[1] === enemy,
    );
    expect(forPair.some((m) => !(m.params as SpellParams).paidAdditionalCost)).toBe(true);
    const paid = forPair.find((m) => (m.params as SpellParams).paidAdditionalCost === true);
    expect(paid).toBeDefined();

    const r = engine.executeMove("playSpell", {
      params: paid!.params as never,
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);
    expect(engine.getState().runePools[P1]!.power.body ?? 0).toBe(0);
    // rule 356.2 — the ledger names WHICH additional cost was paid (the optional "pay" one).
    expect(engine.getState().additionalCostsPaid?.[spell]).toEqual(["pay"]);
    drainChain(engine);

    // Friendly (Might 5 → 7) survives 2 return damage with the +2 rider applied.
    expect(internal.cards[friendly]!.zone).toBe("base");
    expect(getCardMeta(engine, friendly)?.mightModifier).toBe(2);
    expect(getCardMeta(engine, friendly)?.damage).toBe(2);
    // Enemy (Might 2) took 7 and died.
    expect(internal.cards[enemy]!.zone).toBe("trash");
  });

  test("without [body] power only the unpaid variant is offered and no buff applies", async () => {
    const { engine, internal, spell, friendly, enemy, getCardMeta } = await setup({});
    const moves = engine.enumerateMoves(P1 as CorePlayerId, { validOnly: true });
    const forPair = moves.filter(
      (m) =>
        m.moveId === "playSpell" &&
        (m.params as SpellParams).cardId === spell &&
        (m.params as SpellParams).targets?.[0] === friendly &&
        (m.params as SpellParams).targets?.[1] === enemy,
    );
    expect(forPair.length).toBeGreaterThan(0);
    expect(forPair.every((m) => !(m.params as SpellParams).paidAdditionalCost)).toBe(true);

    // Forcing paidAdditionalCost without the power is rejected by the condition.
    const forced = engine.executeMove("playSpell", {
      params: { ...(forPair[0]!.params as object), paidAdditionalCost: true } as never,
      playerId: P1 as CorePlayerId,
    });
    expect(forced.success).toBe(false);

    const r = engine.executeMove("playSpell", {
      params: forPair[0]!.params as never,
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);
    expect(engine.getState().additionalCostsPaid?.[spell]).toBe(false);
    drainChain(engine);
    expect(internal.cards[friendly]!.zone).toBe("base");
    expect(getCardMeta(engine, friendly)?.mightModifier ?? 0).toBe(0);
    expect(getCardMeta(engine, friendly)?.damage).toBe(2);
    expect(internal.cards[enemy]!.zone).toBe("trash");
  });
});
