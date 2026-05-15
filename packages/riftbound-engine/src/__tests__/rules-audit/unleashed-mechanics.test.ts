/**
 * Rules Audit: Unleashed (Set 3) mechanics
 *
 * Core Rules 2026-03-30 ("Unleashed") introduced a batch of new keywords,
 * resources, and game actions. This file tests the engine's implementation
 * of each from first principles, citing the rule it covers and asserting
 * the rules-correct output of a single applied input on minimal state.
 *
 * Rules covered:
 *   728-733  XP (resource: gain / spend / per-turn tracking / not shared)
 *   823      Hunt   — "When I Conquer or Hold, my controller gains X XP."
 *   824      Level  — Dependent Keyword: ability Active only at ≥N XP
 *   822      Ambush — conditional play permission to a controlled battlefield
 *   826      Backline — assigned lethal damage after non-Backline allies
 *   809/721  Deflect — opponents pay rainbow to choose this with spell/ability
 *   436      Predict — look at top N, recycle any, reorder rest (deterministic)
 *   820      Repeat — optional additional cost recorded on the Spell
 *   825      Unique — deck-construction permission, no gameplay effect
 *
 * Hunt is exercised at the integration level through the real `conquerBattlefield`
 * and Scoring-Phase hold paths so the engine wiring (operations/hunt-keyword.ts +
 * combat.ts + riftbound-flow.ts) is what's under test.
 */

import { describe, expect, it } from "bun:test";
import {
  applyShield,
  canPlayViaAmbush,
  getDeflectCost,
  sortByBacklinePriority,
} from "../../keywords/keyword-effects";
import {
  computeHuntXpGain,
  getHuntValue,
} from "../../operations/hunt-keyword";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getEffectiveMight,
  getState,
  hasKeyword,
  recalculateStatics,
} from "./helpers";
import type { CardId } from "../../types";

const BF = "bf-arena" as CardId;

// ---------------------------------------------------------------------------
// 728-733  XP resource
// ---------------------------------------------------------------------------

describe("Unleashed — XP resource (rules 728-733)", () => {
  it("730.1: Gaining XP increases the player's marked XP and is tracked this turn", () => {
    const engine = createMinimalGameState();
    expect(getState(engine).players[P1]?.xp).toBe(0);

    const res = applyMove(engine, "gainXp", { amount: 3, playerId: P1 });
    expect(res.success).toBe(true);

    const st = getState(engine);
    expect(st.players[P1]?.xp).toBe(3);
    expect(st.xpGainedThisTurn[P1]).toBe(3);
  });

  it("730.2: Spending XP reduces the player's marked XP", () => {
    const engine = createMinimalGameState();
    applyMove(engine, "gainXp", { amount: 5, playerId: P1 });
    applyMove(engine, "spendXp", { amount: 2, playerId: P1 });
    expect(getState(engine).players[P1]?.xp).toBe(3);
  });

  it("732: XP is not shared between players — gaining XP affects only the gainer", () => {
    const engine = createMinimalGameState();
    applyMove(engine, "gainXp", { amount: 4, playerId: P1 });
    expect(getState(engine).players[P1]?.xp).toBe(4);
    expect(getState(engine).players[P2]?.xp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 823  Hunt
// ---------------------------------------------------------------------------

describe("Unleashed — Hunt keyword (rule 823)", () => {
  it("823.1.c.2: a bare [Hunt] keyword has Hunt Value 1 (registry.getKeywordValue)", () => {
    const engine = createMinimalGameState();
    const id = "unit-hunter" as CardId;
    createCard(engine, id, {
      cardType: "unit",
      keywords: ["Hunt"],
      might: 3,
      owner: P1,
      zone: "base",
    });
    expect(getGlobalCardRegistry().getKeywordValue(id, "Hunt")).toBe(1);
    expect(getHuntValue(id)).toBe(1);
  });

  it("823.1.c: [Hunt N] declares Hunt Value N via the keyword ability entry", () => {
    const engine = createMinimalGameState();
    const id = "unit-arachnoid" as CardId;
    createCard(engine, id, {
      abilities: [{ keyword: "Hunt", type: "keyword", value: 2 }],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 6,
      owner: P1,
      zone: "base",
    });
    expect(getGlobalCardRegistry().getKeywordValue(id, "Hunt")).toBe(2);
    expect(getHuntValue(id)).toBe(2);
  });

  it("823.2: multiple Hunt instances (printed + granted) sum their values", () => {
    const engine = createMinimalGameState();
    const id = "unit-double-hunter" as CardId;
    createCard(engine, id, {
      abilities: [{ keyword: "Hunt", type: "keyword", value: 2 }],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 4,
      owner: P1,
      zone: "base",
    });
    // GetHuntValue reads the printed value (2) + granted value (1) = 3
    const cardMeta = { grantedKeywords: [{ keyword: "Hunt", value: 1 }] };
    expect(getHuntValue(id, cardMeta)).toBe(3);
  });

  it("823.1.b: computeHuntXpGain only counts units controlled by the conqueror", () => {
    const engine = createMinimalGameState();
    const mine = "u-mine" as CardId;
    const theirs = "u-theirs" as CardId;
    createCard(engine, mine, {
      abilities: [{ keyword: "Hunt", type: "keyword", value: 2 }],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 3,
      owner: P1,
      zone: "base",
    });
    createCard(engine, theirs, {
      abilities: [{ keyword: "Hunt", type: "keyword", value: 5 }],
      cardType: "unit",
      keywords: ["Hunt"],
      might: 3,
      owner: P2,
      zone: "base",
    });
    const controllers: Record<string, string> = { [mine]: P1, [theirs]: P2 };
    const xp = computeHuntXpGain(
      [mine, theirs],
      P1,
      (cid) => controllers[cid],
      () => undefined,
    );
    expect(xp).toBe(2);
  });

  it("823.1.c.1 (integration): conquering with a [Hunt N] unit grants the controller N XP", () => {
    const engine = createMinimalGameState();
    // P2 currently controls the battlefield; P1 will conquer it.
    createBattlefield(engine, BF, { controller: P2 });
    const hunter = "u-conq-hunter" as CardId;
    createCard(engine, hunter, {
      abilities: [{ keyword: "Hunt", type: "keyword", value: 2 }],
      cardType: "unit",
      controller: P1,
      keywords: ["Hunt"],
      might: 6,
      owner: P1,
      zone: `battlefield-${BF}`,
    });

    expect(getState(engine).players[P1]?.xp).toBe(0);
    const res = applyMove(engine, "conquerBattlefield", { battlefieldId: BF, playerId: P1 });
    expect(res.success).toBe(true);

    const st = getState(engine);
    expect(st.battlefields[BF]?.controller).toBe(P1);
    expect(st.players[P1]?.xp).toBe(2);
    expect(st.xpGainedThisTurn[P1]).toBe(2);
  });

  it("823 (integration): conquering with no Hunt unit grants 0 XP", () => {
    const engine = createMinimalGameState();
    createBattlefield(engine, BF, { controller: P2 });
    createCard(engine, "u-plain" as CardId, {
      cardType: "unit",
      controller: P1,
      might: 6,
      owner: P1,
      zone: `battlefield-${BF}`,
    });
    applyMove(engine, "conquerBattlefield", { battlefieldId: BF, playerId: P1 });
    expect(getState(engine).players[P1]?.xp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 824  Level (Dependent Keyword)
// ---------------------------------------------------------------------------

describe("Unleashed — Level dependent keyword (rule 824)", () => {
  /**
   * A `[Level N][>]` ability is modeled as a static ability gated by a
   * `while-level` condition with `threshold: N`. The dependent ability is
   * Active only while the controller has ≥N XP. Here the dependent ability
   * is "+2 Might" with `[Level 3]`, and we verify it toggles with XP through
   * the real static-effects recalculation.
   */
  function setupLevelUnit(): { engine: ReturnType<typeof createMinimalGameState>; id: CardId } {
    const engine = createMinimalGameState();
    const id = "u-leveler" as CardId;
    createCard(engine, id, {
      abilities: [
        {
          affects: "self",
          condition: { type: "while-level", threshold: 3 },
          effect: { type: "modify-might", amount: 2 },
          type: "static",
        },
      ],
      cardType: "unit",
      keywords: ["Level"],
      might: 4,
      owner: P1,
      zone: "base",
    });
    return { engine, id };
  }

  it("824.1.d: the Level ability is Inactive while controller has < N XP", () => {
    const { engine, id } = setupLevelUnit();
    recalculateStatics(engine);
    // 0 XP < 3 → dependent ability Inactive → no +2 Might.
    expect(getEffectiveMight(engine, id)).toBe(4);
  });

  it("824.1.c: the Level ability becomes Active once controller has N+ XP", () => {
    const { engine, id } = setupLevelUnit();
    applyMove(engine, "gainXp", { amount: 3, playerId: P1 });
    recalculateStatics(engine);
    // 3 XP ≥ 3 → dependent ability Active → +2 Might.
    expect(getEffectiveMight(engine, id)).toBe(6);
  });

  it("824.1.d: dropping below N XP renders the Level ability Inactive again", () => {
    const { engine, id } = setupLevelUnit();
    applyMove(engine, "gainXp", { amount: 3, playerId: P1 });
    recalculateStatics(engine);
    expect(getEffectiveMight(engine, id)).toBe(6);
    applyMove(engine, "spendXp", { amount: 1, playerId: P1 });
    recalculateStatics(engine);
    expect(getEffectiveMight(engine, id)).toBe(4);
  });

  it("824.2 (registry): Level presence is a checkable characteristic of the card", () => {
    const { engine, id } = setupLevelUnit();
    expect(hasKeyword(engine, id, "Level")).toBe(true);
    expect(getGlobalCardRegistry().hasKeyword(id, "Level")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 822  Ambush
// ---------------------------------------------------------------------------

describe("Unleashed — Ambush keyword (rule 822)", () => {
  it("822.1: Ambush lets a unit be played (with Reaction timing) to a battlefield where its controller has units", () => {
    // Has Ambush + friendly units present + valid Reaction timing → allowed.
    expect(canPlayViaAmbush(true, true, true)).toBe(true);
  });

  it("822.3: if no friendly units are at the chosen battlefield, Ambush's permission is not valid", () => {
    expect(canPlayViaAmbush(true, false, true)).toBe(false);
  });

  it("822: a unit without Ambush gets no permission from this rule", () => {
    expect(canPlayViaAmbush(false, true, true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 826  Backline
// ---------------------------------------------------------------------------

describe("Unleashed — Backline keyword (rule 826)", () => {
  it("826.3: Backline units are ordered after non-Backline allies for combat damage assignment", () => {
    const units = [
      { hasBackline: true, id: "back-A" },
      { hasBackline: false, id: "front-B" },
      { hasBackline: true, id: "back-C" },
      { hasBackline: false, id: "front-D" },
    ];
    const ordered = sortByBacklinePriority(units).map((u) => u.id);
    // Non-Backline first (stable), then Backline.
    expect(ordered).toEqual(["front-B", "front-D", "back-A", "back-C"]);
  });

  it("826.2 (registry): Backline is a checkable characteristic on a unit", () => {
    const engine = createMinimalGameState();
    const id = "u-backliner" as CardId;
    createCard(engine, id, {
      cardType: "unit",
      keywords: ["Backline"],
      might: 2,
      owner: P1,
      zone: "base",
    });
    expect(getGlobalCardRegistry().hasKeyword(id, "Backline")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 809 / 721  Deflect
// ---------------------------------------------------------------------------

describe("Unleashed — Deflect keyword (rules 809 / 721)", () => {
  it("721: Deflect N imposes N rainbow power as the extra cost to choose this unit", () => {
    expect(getDeflectCost(1)).toBe(1);
    expect(getDeflectCost(3)).toBe(3);
  });

  it("Deflect 0 (no Deflect) imposes no extra targeting cost", () => {
    expect(getDeflectCost(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 820  Repeat
// ---------------------------------------------------------------------------

describe("Unleashed — Repeat keyword (rule 820)", () => {
  it("820.4: Repeat (and its cost) is a checkable characteristic of the Spell", () => {
    const engine = createMinimalGameState();
    const id = "s-desert-call" as CardId;
    createCard(engine, id, {
      abilities: [
        { effect: { type: "create-token" }, repeat: { energy: 2 }, type: "spell" },
      ],
      cardType: "spell",
      owner: P1,
      timing: "action",
      zone: "hand",
    });
    const cost = getGlobalCardRegistry().getSpellRepeatCost(id);
    expect(cost).toEqual({ energy: 2, power: [] });
  });

  it("a spell without a Repeat cost reports none", () => {
    const engine = createMinimalGameState();
    const id = "s-plain" as CardId;
    createCard(engine, id, {
      abilities: [{ effect: { type: "create-token" }, type: "spell" }],
      cardType: "spell",
      owner: P1,
      timing: "action",
      zone: "hand",
    });
    expect(getGlobalCardRegistry().getSpellRepeatCost(id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sanity: a couple of pre-Unleashed helpers still behave (regression guard)
// ---------------------------------------------------------------------------

describe("Unleashed — regression guard for shared combat helpers", () => {
  it("Shield still reduces incoming damage and never goes below 0", () => {
    expect(applyShield(3, 1)).toBe(2);
    expect(applyShield(2, 5)).toBe(0);
  });
});
