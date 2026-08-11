/**
 * rule-id: ven-034-166 / ven-142-166 — Resonating Strike and Dominus shipped
 * `abilities: [null]` in ven.json and resolved to a `{type:"raw"}` effect the
 * executor silently dropped. These drive both spells end-to-end through the
 * real registry + playSpell → chain → resolve path.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { clearGlobalCardRegistry } from "../operations/card-lookup";

const P1 = "player-1";
const P2 = "player-2";

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

async function setup(spellId: string, unitId: string) {
  const { getAllCards } = await import("../../../riftbound-cards/src/data/all-cards");
  const { createPlayableGame, getZoneCards, getCardMeta } = await import(
    "../testing/playtest/game-setup"
  );
  const allCards = getAllCards();
  const deck = {
    battlefieldIds: ["ogn-275-298"],
    mainDeckCardIds: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? spellId : unitId)),
    runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-166-298"),
  };
  const { engine } = createPlayableGame(allCards as never, deck, deck, `ven-${spellId}`);
  const internal = (engine as unknown as { internalState: Internal }).internalState;
  const all = [...getZoneCards(engine, "hand", P1), ...getZoneCards(engine, "mainDeck", P1)];
  const spell = all.find((id) => id.endsWith(spellId))!;
  const unit = all.find((id) => id.endsWith(unitId))!;
  if (internal.cards[spell]!.zone !== "hand") relocate(internal, spell, "hand");
  relocate(internal, unit, "base");
  engine.executeMove("addResources", {
    params: { energy: 10, playerId: P1, power: { calm: 3, fury: 3, body: 3 } },
    playerId: P1 as CorePlayerId,
  });
  return { engine, internal, spell, unit, getCardMeta };
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

describe("ven-034-166 Resonating Strike", () => {
  afterEach(() => clearGlobalCardRegistry());

  test("moves the chosen friendly unit to a battlefield you control and gives it +2 Might", async () => {
    const { engine, internal, spell, unit, getCardMeta } = await setup("ven-034-166", "ogn-010-298");
    const bfId = Object.keys(engine.getState().battlefields)[0]!;
    engine.applyPatches([{ op: "replace", path: ["battlefields", bfId, "controller"], value: P1 }]);

    const moves = engine.enumerateMoves(P1 as CorePlayerId, { validOnly: true });
    const play = moves.find(
      (m) =>
        m.moveId === "playSpell" &&
        (m.params as { cardId?: string }).cardId === spell &&
        (m.params as { targets?: string[] }).targets?.[0] === unit,
    );
    expect(play).toBeDefined();
    const r = engine.executeMove("playSpell", {
      params: play!.params as never,
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);

    // rule 355.10.d.2 — the ONE battlefield P1 controls is still the Move
    // Destination they choose, so the play raises the prompt (a one-click
    // confirm in a UI; this test drives the raw engine, so it answers it).
    const dest = engine.getState().pendingChoice as
      | { type?: string; soleOption?: true; options?: readonly string[] }
      | undefined;
    expect(dest).toMatchObject({ soleOption: true, type: "choose-destination" });
    expect(dest?.options).toEqual([`battlefield-${bfId}`]);
    engine.executeMove("resolvePendingChoice", {
      params: { pickedZoneId: `battlefield-${bfId}`, playerId: P1 },
      playerId: P1 as CorePlayerId,
    });
    drainChain(engine);

    expect(engine.getState().pendingChoice).toBeUndefined();
    expect(internal.cards[unit]!.zone).toBe(`battlefield-${bfId}`);
    expect(getCardMeta(engine, unit)?.mightModifier).toBe(2);
  });

  // rule 355.8 / 355.4.a — "Choose a battlefield you control and a unit you
  // control at a different location": with no controlled battlefield there is
  // no legal choice, so the spell is never offered as a Play (it must not reach
  // the chain and resolve as a bare +2 Might).
  test("with no controlled battlefield the spell has no legal choice and is not playable", async () => {
    const { engine, internal, spell, unit, getCardMeta } = await setup("ven-034-166", "ogn-010-298");
    const moves = engine.enumerateMoves(P1 as CorePlayerId, { validOnly: true });
    const play = moves.find(
      (m) =>
        m.moveId === "playSpell" &&
        (m.params as { cardId?: string }).cardId === spell &&
        (m.params as { targets?: string[] }).targets?.[0] === unit,
    );
    expect(play).toBeUndefined();
    expect(internal.cards[unit]!.zone).toBe("base");
    expect(getCardMeta(engine, unit)?.mightModifier ?? 0).toBe(0);
  });
});

describe("ven-142-166 Dominus", () => {
  afterEach(() => clearGlobalCardRegistry());

  test("doubles the unit's Might this turn and grants '[rainbow][rainbow]: Ready me'", async () => {
    const { engine, spell, unit, getCardMeta } = await setup("ven-142-166", "ogn-010-298");
    const { getGlobalCardRegistry } = await import("../operations/card-lookup");
    const baseMight = getGlobalCardRegistry().getMight(unit);
    expect(baseMight).toBeGreaterThan(0);

    const moves = engine.enumerateMoves(P1 as CorePlayerId, { validOnly: true });
    const play = moves.find(
      (m) =>
        m.moveId === "playSpell" &&
        (m.params as { cardId?: string }).cardId === spell &&
        (m.params as { targets?: string[] }).targets?.[0] === unit,
    );
    expect(play).toBeDefined();
    const r = engine.executeMove("playSpell", {
      params: play!.params as never,
      playerId: P1 as CorePlayerId,
    });
    expect(r.success).toBe(true);
    drainChain(engine);

    const meta = getCardMeta(engine, unit) as {
      mightModifier?: number;
      grantedAbilities?: { sourceCardId: string; abilityIndex: number; duration: string }[];
    };
    expect(meta.mightModifier).toBe(baseMight);
    expect(meta.grantedAbilities).toEqual([
      { abilityIndex: 1, duration: "turn", sourceCardId: spell },
    ]);

    // Granted ability is activatable on the unit (host) with Dominus as source.
    engine.executeMove("exhaustCard", {
      params: { cardId: unit, playerId: P1 },
      playerId: P1 as CorePlayerId,
    });
    const acts = engine
      .enumerateMoves(P1 as CorePlayerId, { validOnly: true })
      .filter(
        (m) =>
          m.moveId === "activateAbility" &&
          (m.params as { cardId?: string }).cardId === unit &&
          (m.params as { sourceCardId?: string }).sourceCardId === spell,
      );
    expect(acts.length).toBe(1);
    const act = engine.executeMove("activateAbility", {
      params: acts[0]!.params as never,
      playerId: P1 as CorePlayerId,
    });
    expect(act.success).toBe(true);
    drainChain(engine);
    expect(getCardMeta(engine, unit)?.exhausted).toBeFalsy();
    void P2;
  });
});
