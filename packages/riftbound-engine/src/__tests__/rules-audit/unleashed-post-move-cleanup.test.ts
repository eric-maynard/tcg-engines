/**
 * Rules Audit: engine-wide post-move cleanup hook (rules 518-526 + 540.x/813).
 *
 * Covers:
 *   - Rules 518-526: state-based checks run after *every* move, not just the
 *     handful of moves that historically opted in. A unit that has lethal
 *     Damage marked on it is reaped (rule 323.5) — and fires its Deathknell
 *     (rule 808/813) — on the very next move, whatever that move is.
 *   - Rule 323.7: a Hidden card is trashed once its owner no longer controls
 *     the battlefield it sits at (and is preserved while its owner controls
 *     that battlefield) — the cleanup condition is battlefield *control*, not
 *     "owner has a unit there".
 *
 * Methodology: minimal state -> apply an unrelated move (`exhaustCard`) ->
 * assert the post-move cleanup pass did its job.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getCardZone,
  getCardsInZone,
} from "./helpers";

describe("Rules 518-526 / 323.5: post-move cleanup reaps lethally-damaged units after any move", () => {
  it("a unit at lethal damage is reaped after an unrelated `exhaustCard` move", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // An unrelated unit we'll exhaust to trigger the post-move hook.
    createCard(engine, "ready-one", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // A 2-Might unit sitting at exactly-lethal damage but not yet reaped
    // (no cleanup ran since the damage landed). `exhaustCard` itself never
    // Calls cleanup — the engine-wide post-move hook does.
    createCard(engine, "doomed", {
      cardType: "unit",
      meta: { damage: 2 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "exhaustCard", { cardId: "ready-one" });

    expect(getCardsInZone(engine, "trash", P1)).toContain("doomed");
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).not.toContain("doomed");
  });

  it("a sub-lethal unit is left alone by the post-move cleanup hook", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "ready-one", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "scratched", {
      cardType: "unit",
      meta: { damage: 1 },
      might: 4,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "exhaustCard", { cardId: "ready-one" });

    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("scratched");
    expect(getCardsInZone(engine, "trash", P1)).not.toContain("scratched");
  });
});

/** Seed a card directly into a battlefield's facedown (Hidden) zone. */
function seedHidden(engine: ReturnType<typeof createMinimalGameState>, cardId: string, bfId: string): void {
  const internal = engine as unknown as {
    internalState: {
      cards: Record<string, { zone: string }>;
      cardMetas: Record<string, Record<string, unknown>>;
      zones: Record<string, { cardIds: string[] }>;
    };
  };
  const zoneId = `facedown-${bfId}`;
  if (!internal.internalState.zones[zoneId]) {
    internal.internalState.zones[zoneId] = { cardIds: [] };
  }
  const card = internal.internalState.cards[cardId];
  if (card) {
    const old = internal.internalState.zones[card.zone];
    if (old) {
      old.cardIds = old.cardIds.filter((id) => id !== cardId);
    }
    card.zone = zoneId;
  }
  internal.internalState.zones[zoneId].cardIds.push(cardId);
  const meta = internal.internalState.cardMetas[cardId] ?? {};
  meta.hidden = true;
  meta.hiddenAt = bfId;
  internal.internalState.cardMetas[cardId] = meta;
}

describe("Rule 323.7: post-move cleanup trashes Hidden cards at battlefields the owner doesn't control", () => {
  it("a Hidden card at a battlefield the owner does NOT control is trashed", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Bf-1 controlled by P2; P1 owns a hidden card there.
    createBattlefield(engine, "bf-1", { controller: P2 });
    createCard(engine, "anchor", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "p1-secret", {
      cardType: "spell",
      keywords: ["Hidden"],
      owner: P1,
      zone: "hand",
    });
    seedHidden(engine, "p1-secret", "bf-1");

    applyMove(engine, "exhaustCard", { cardId: "anchor" });

    expect(getCardsInZone(engine, "trash", P1)).toContain("p1-secret");
    expect(getCardZone(engine, "p1-secret")).not.toBe("facedown-bf-1");
  });

  it("a Hidden card at a battlefield the owner DOES control is preserved", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "anchor", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "p1-secret", {
      cardType: "spell",
      keywords: ["Hidden"],
      owner: P1,
      zone: "hand",
    });
    seedHidden(engine, "p1-secret", "bf-1");

    applyMove(engine, "exhaustCard", { cardId: "anchor" });

    expect(getCardZone(engine, "p1-secret")).toBe("facedown-bf-1");
    expect(getCardsInZone(engine, "trash", P1)).not.toContain("p1-secret");
    expect(getCardMeta(engine, "p1-secret")?.hidden).toBe(true);
  });
});
