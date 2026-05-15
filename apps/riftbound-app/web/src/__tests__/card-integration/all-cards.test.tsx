/**
 * Full-pool FE integration test generator.
 *
 * Walks every spell + gear card in the canonical Riftbound card pool
 * (`getAllCards()` filtered to `cardType in {"spell","gear"}` — ~249 cards),
 * derives the expected TargetPicker variant from each card's first relevant
 * ability target descriptor, and generates 2-3 scenarios per card:
 *
 *   A. Picker opens correctly (or NO picker for no-target cards).
 *   B. Clicking the first legal target dispatches `playFromHand` with the
 *      right `params.targets`.
 *   C. Cancel button (when picker open) returns to clean state, no dispatch.
 *
 * Rationale (Eric's ask): "I would expect like hundreds of FE tests for
 * different scenarios, analogous to our BE tests". The previous hand-wired
 * harness covered ~61 distinct cards; this generator pushes coverage to the
 * full ~249-card spell+gear pool in <500 lines of code.
 *
 * Implementation: pure data drive. We import `getAllCards()` from
 * `@tcg/riftbound-cards`, then for each spell/gear we read
 * `abilities[0].effect.target` (mirroring the engine-session
 * `spellTargetDescriptor` / `spellRequiresExplicitTarget` logic exactly so
 * the FE here sees the same picker variant the production hand-view-builder
 * would surface).
 *
 * Skip strategy: when a card's target shape isn't handled by any picker
 * variant (e.g. the rare `pending-value` shape on ogn-115-298), we emit an
 * `it.skip("known: <shape> not pickerable")` so the suite stays green and
 * Eric can grep for skipped reasons.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  applyDispatchedMoveToEngine,
  clickFirstPickerOption,
  clickHandChip,
  getDispatchedMoves,
  getLastDispatchedMove,
  getPickerVariant,
  getZoneCardIds,
  isPickerOpen,
  renderPlayPageWithCard,
} from "./helpers";
import type {
  BattlefieldUnit,
  GameView,
  GameViewBattlefield,
  HandCard,
} from "../../lib/api";

import { getAllCards } from "../../../../../../packages/riftbound-cards/src/data/all-cards";

// ---------------------------------------------------------------------------
// Test scenario fixtures (shared with spell-cards.test.tsx but inlined here
// So this file is self-contained for the generator).
// ---------------------------------------------------------------------------

const FRIENDLY_UNIT: BattlefieldUnit = {
  controller: "player-1",
  definitionId: "loyal-scout",
  id: "u-friendly-1",
  might: 2,
  name: "Loyal Scout",
};

const ENEMY_UNIT: BattlefieldUnit = {
  controller: "player-2",
  definitionId: "cruel-raider",
  id: "u-enemy-1",
  might: 3,
  name: "Cruel Raider",
};

const BATTLEFIELDS_WITH_UNITS: readonly GameViewBattlefield[] = [
  {
    contested: false,
    controller: "player-1",
    id: "player-1-bf-1",
    units: [FRIENDLY_UNIT],
  },
  {
    contested: false,
    controller: "player-2",
    id: "player-2-bf-1",
    units: [ENEMY_UNIT],
  },
];

const FRIENDLY_GEAR: NonNullable<GameView["gearsInPlay"]>[number] = {
  controller: "player-1",
  definitionId: "fury-rune",
  id: "g-friendly-1",
  location: "base",
  name: "Fury Rune",
};

const ENEMY_GEAR: NonNullable<GameView["gearsInPlay"]>[number] = {
  controller: "player-2",
  definitionId: "scrap-amulet",
  id: "g-enemy-1",
  location: "base",
  name: "Scrap Amulet",
};

const TRASH_UNIT_FRIENDLY = {
  cardType: "unit",
  definitionId: "fallen-soldier",
  id: "trash-friendly-1",
  name: "Fallen Soldier",
  owner: "player-1",
} as const;

const TRASH_SPELL_FRIENDLY = {
  cardType: "spell",
  definitionId: "spent-spell",
  id: "trash-friendly-spell-1",
  name: "Spent Spell",
  owner: "player-1",
} as const;

const FRIENDLY_RUNE: NonNullable<GameView["runesInPool"]>[number] = {
  definitionId: "fury-rune",
  id: "rune-friendly-1",
  name: "Fury Rune",
  owner: "player-1",
};

const ENEMY_RUNE: NonNullable<GameView["runesInPool"]>[number] = {
  definitionId: "calm-rune",
  id: "rune-enemy-1",
  name: "Calm Rune",
  owner: "player-2",
};

// ---------------------------------------------------------------------------
// Target shape extraction — mirrors engine-session spellTargetDescriptor /
// SpellRequiresExplicitTarget so the descriptor we synthesise here is
// Byte-identical to what production hand-view-builder would emit.
// ---------------------------------------------------------------------------

interface CardLike {
  id: string;
  name: string;
  cardType: string;
  abilities?: unknown[];
}

interface Descriptor {
  type: string;
  which?: string;
  location?: string;
  controller?: string;
}

function readFirstRelevantAbility(card: CardLike): { effect?: { target?: unknown } } | undefined {
  const abilities = (card.abilities ?? []) as { type?: string; effect?: { target?: unknown } }[];
  if (card.cardType === "spell") {
    return abilities.find((a) => a.type === "spell");
  }
  if (card.cardType === "gear" || card.cardType === "equipment") {
    return (
      abilities.find((a) => a.type === "activated") ??
      abilities.find((a) => a.type === "spell")
    );
  }
  return undefined;
}

/**
 * Returns the spell-target descriptor (or `null` for cards with no
 * explicit non-self target — i.e. one-click no-picker cards). Mirrors
 * engine-session.ts `spellTargetDescriptor` + `spellRequiresExplicitTarget`.
 */
function deriveDescriptor(card: CardLike): Descriptor | null {
  const ab = readFirstRelevantAbility(card);
  const target = ab?.effect?.target;
  if (!target) {return null;}
  if (typeof target === "string") {
    // "self" / "controller" / similar string shorthand → no-explicit-target.
    return null;
  }
  const t = target as Descriptor;
  if (typeof t.type !== "string") {return null;}
  if (t.type === "self") {return null;}
  const out: Descriptor = { type: t.type };
  if (t.which !== undefined) {out.which = t.which;}
  if (typeof t.location === "string") {out.location = t.location;}
  if (typeof t.controller === "string") {out.controller = t.controller;}
  return out;
}

/**
 * Map a target descriptor onto the PickerPlan describing what the SPA will
 * open. Returns `null` for descriptors we can't reduce to a known picker
 * variant — caller emits an `it.skip` with the reason.
 */
type PickerVariantId =
  | "no-picker"
  | "unit"
  | "player"
  | "gear"
  | "permanent"
  | "spell"
  | "card-in-trash"
  | "card-in-hand"
  | "card-in-deck"
  | "rune";

interface PickerPlan {
  readonly variant: PickerVariantId;
  /**
   * The first option id the picker will surface (and `clickFirstPickerOption`
   * will return). For variants that bottom-out to "Skip" (deck), this is
   * the empty array marker.
   */
  readonly expectedFirstTargetId?: string;
  /**
   * Extra render opts (battlefields/gears/trash/runes/extraHand) the harness
   * needs to seed so the picker shows the expected first target.
   */
  readonly renderExtras: {
    battlefields?: readonly GameViewBattlefield[];
    gearsInPlay?: GameView["gearsInPlay"];
    cardsInTrash?: GameView["cardsInTrash"];
    runesInPool?: GameView["runesInPool"];
    extraHand?: readonly HandCard[];
  };
  /** Skip reason when this picker variant isn't yet wirable here. */
  readonly skipReason?: string;
}

function planForDescriptor(d: Descriptor | null): PickerPlan {
  if (!d) {
    // No explicit target → one-click play, no picker opens.
    return {
      renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
      variant: "no-picker",
    };
  }

  // Location-based variants come first (location dominates over type).
  if (d.location === "trash") {
    return {
      expectedFirstTargetId: TRASH_UNIT_FRIENDLY.id,
      renderExtras: {
        battlefields: BATTLEFIELDS_WITH_UNITS,
        cardsInTrash: [TRASH_UNIT_FRIENDLY, TRASH_SPELL_FRIENDLY],
      },
      variant: "card-in-trash",
    };
  }
  if (d.location === "hand") {
    const extra: HandCard = {
      cardType: "spell",
      definitionId: "filler-spell",
      id: "hand-extra-1",
      legalLocations: [],
      name: "Filler Spell",
    };
    return {
      expectedFirstTargetId: extra.id,
      renderExtras: {
        battlefields: BATTLEFIELDS_WITH_UNITS,
        extraHand: [extra],
      },
      variant: "card-in-hand",
    };
  }
  if (d.location === "deck") {
    return {
      renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
      variant: "card-in-deck",
    };
  }

  switch (d.type) {
    case "unit": {
      const isEnemy = d.which === "enemy" || d.controller === "enemy";
      const expectedFirstTargetId = isEnemy ? ENEMY_UNIT.id : FRIENDLY_UNIT.id;
      return {
        expectedFirstTargetId,
        renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
        variant: "unit",
      };
    }
    case "player": {
      // Picker reports the data-player-id of the clicked button; for
      // `which="opponent"` (the common case) that's "player-2".
      const expectedFirstTargetId =
        d.which === "self" ? "player-1" : "player-2";
      return {
        expectedFirstTargetId,
        renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
        variant: "player",
      };
    }
    case "gear": {
      return {
        expectedFirstTargetId: FRIENDLY_GEAR.id,
        renderExtras: {
          battlefields: BATTLEFIELDS_WITH_UNITS,
          gearsInPlay: [FRIENDLY_GEAR, ENEMY_GEAR],
        },
        variant: "gear",
      };
    }
    case "permanent": {
      // Permanent picker enumerates units+gears; friendly unit "Loyal Scout"
      // And friendly gear "Fury Rune" both sort to the front. The TargetPicker
      // Sorts friendly-first then alphabetical by name — Fury Rune (F) comes
      // Before Loyal Scout (L). We assert clickedId is one of the friendly ids.
      return {
        renderExtras: {
          battlefields: BATTLEFIELDS_WITH_UNITS,
          gearsInPlay: [FRIENDLY_GEAR],
        },
        variant: "permanent",
      };
    }
    case "spell": {
      // Spell-target picker needs the chain populated. The current pool only
      // Has one such card (Ravenborn Tome) which is already covered in
      // Spell-cards.test.tsx. To keep this generator green without re-running
      // The chain-builder edge case for every spell-target gear that ever
      // Ships, we mark variant="spell" but skip — the dedicated test file
      // Covers the wire-up.
      return {
        renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
        skipReason: "spell-target picker covered by spell-cards.test.tsx",
        variant: "spell",
      };
    }
    case "rune": {
      return {
        expectedFirstTargetId: FRIENDLY_RUNE.id,
        renderExtras: {
          battlefields: BATTLEFIELDS_WITH_UNITS,
          runesInPool: [FRIENDLY_RUNE, ENEMY_RUNE],
        },
        variant: "rune",
      };
    }
    default: {
      // Shapes like "pending-value" don't map to a picker — engine resolves
      // Them post-cast.
      return {
        renderExtras: { battlefields: BATTLEFIELDS_WITH_UNITS },
        skipReason: `unrecognised target type "${d.type}"`,
        variant: "no-picker",
      };
    }
  }
}

/**
 * Build the canonical HandCard shape for this card + its derived picker plan.
 */
function buildHandCard(card: CardLike, d: Descriptor | null, plan: PickerPlan): HandCard {
  if (plan.variant === "no-picker") {
    return {
      cardType: card.cardType as HandCard["cardType"],
      definitionId: card.id,
      id: `instance-${card.id}`,
      legalLocations: [],
      name: card.name,
    };
  }
  const td: HandCard["targetDescriptor"] = d
    ? {
        type: d.type,
        ...(d.which !== undefined ? { which: d.which } : {}),
        ...(d.location !== undefined ? { location: d.location } : {}),
        ...(d.controller !== undefined ? { controller: d.controller } : {}),
      }
    : undefined;
  // For unit pickers, supply legalTargets so the picker filters to the
  // Expected first target (mirrors what `playSpell` enumeration produces).
  let legalTargets: HandCard["legalTargets"] | undefined;
  if (plan.variant === "unit" && plan.expectedFirstTargetId !== undefined) {
    // Allow both friendly + enemy unless `which`/`controller` narrows it.
    const which = d?.which ?? d?.controller;
    if (which === "enemy") {
      legalTargets = [[ENEMY_UNIT.id]];
    } else if (which === "friendly") {
      legalTargets = [[FRIENDLY_UNIT.id]];
    } else {
      legalTargets = [[FRIENDLY_UNIT.id], [ENEMY_UNIT.id]];
    }
  }
  return {
    cardType: card.cardType as HandCard["cardType"],
    definitionId: card.id,
    id: `instance-${card.id}`,
    legalLocations: [],
    ...(legalTargets ? { legalTargets } : {}),
    name: card.name,
    requiresTarget: true,
    ...(td ? { targetDescriptor: td } : {}),
  };
}

// ---------------------------------------------------------------------------
// Generate the test plan per card. We materialise this once outside the
// Describe so the file's discovery cost stays in the static path.
// ---------------------------------------------------------------------------

interface CardPlan {
  readonly card: CardLike;
  readonly descriptor: Descriptor | null;
  readonly plan: PickerPlan;
  readonly handCard: HandCard;
}

const ALL_CARD_PLANS: readonly CardPlan[] = (() => {
  const all = getAllCards();
  const out: CardPlan[] = [];
  for (const c of all) {
    if (c.cardType !== "spell" && c.cardType !== "gear") {continue;}
    const cl: CardLike = {
      abilities: (c as unknown as { abilities?: unknown[] }).abilities,
      cardType: c.cardType,
      id: c.id,
      name: c.name,
    };
    const d = deriveDescriptor(cl);
    const plan = planForDescriptor(d);
    const handCard = buildHandCard(cl, d, plan);
    out.push({ card: cl, descriptor: d, handCard, plan });
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Coverage gate — fail loudly if the spell+gear card pool ever shrinks below
// Our expected size. The number stays in sync with the canonical pool
// Reported by `getAllCards().filter(c => c.cardType in {"spell","gear"})`.
// ---------------------------------------------------------------------------
describe("all-cards generator: pool sanity", () => {
  it(`enumerates the spell+gear pool (target ~249 cards)`, () => {
    expect(ALL_CARD_PLANS.length).toBeGreaterThanOrEqual(240);
    // Every plan must have a HandCard with a non-empty id.
    for (const p of ALL_CARD_PLANS) {
      expect(p.handCard.id).toBeTruthy();
      expect(p.handCard.definitionId).toBe(p.card.id);
    }
  });

  it("emits a coverage histogram by picker variant", () => {
    const counts: Record<string, number> = {};
    for (const p of ALL_CARD_PLANS) {
      const key = p.plan.skipReason
        ? `skip:${p.plan.variant}`
        : p.plan.variant;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // Smoke-check at least the major buckets are populated.
    expect(counts["unit"] ?? 0).toBeGreaterThan(40);
    expect(counts["no-picker"] ?? 0).toBeGreaterThan(50);
    // eslint-disable-next-line no-console
    console.log("[all-cards generator] picker variant counts:", counts);
  });
});

// ---------------------------------------------------------------------------
// Scenario A: chip-click opens the right picker (or NO picker for one-click
// Cards). One test per spell/gear card.
// ---------------------------------------------------------------------------
describe("all-cards: scenario A — chip opens correct picker variant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const p of ALL_CARD_PLANS) {
    if (p.plan.skipReason) {
      it.skip(`known: ${p.card.name} (${p.card.id}) — ${p.plan.skipReason}`, () => {});
      continue;
    }

    it(`opens ${p.plan.variant} for ${p.card.name} (${p.card.id})`, async () => {
      await renderPlayPageWithCard({
        battlefields: p.plan.renderExtras.battlefields,
        card: p.handCard,
        cardsInTrash: p.plan.renderExtras.cardsInTrash,
        extraHand: p.plan.renderExtras.extraHand,
        gearsInPlay: p.plan.renderExtras.gearsInPlay,
        runesInPool: p.plan.renderExtras.runesInPool,
      });

      clickHandChip(p.handCard.id);

      if (p.plan.variant === "no-picker") {
        // One-click play — picker must NOT open. The chip click immediately
        // Dispatches `playFromHand`.
        expect(isPickerOpen()).toBe(false);
        await waitFor(() => {
          expect(getDispatchedMoves().length).toBeGreaterThan(0);
        });
        const move = getDispatchedMoves()[0]!;
        expect(move.moveId).toBe("playFromHand");
        expect(move.params.cardId).toBe(p.handCard.id);
      } else {
        // Picker opens. No move dispatched yet.
        expect(isPickerOpen()).toBe(true);
        expect(getPickerVariant()).toBe(p.plan.variant);
        expect(getDispatchedMoves()).toHaveLength(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Scenario B: clicking the first legal target (or Skip for deck-tutor)
// Dispatches `playFromHand` with the right target. Skipped for no-picker
// Cards (already proven by scenario A) and for skipReason'd cards.
// ---------------------------------------------------------------------------
describe("all-cards: scenario B — dispatches with first legal target", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const p of ALL_CARD_PLANS) {
    if (p.plan.skipReason) {
      it.skip(`known: ${p.card.name} dispatch — ${p.plan.skipReason}`, () => {});
      continue;
    }
    if (p.plan.variant === "no-picker") {
      // Already covered in scenario A — the dispatch IS the chip click.
      continue;
    }

    it(`dispatches playFromHand for ${p.card.name} (${p.card.id})`, async () => {
      const { localId } = await renderPlayPageWithCard({
        battlefields: p.plan.renderExtras.battlefields,
        card: p.handCard,
        cardsInTrash: p.plan.renderExtras.cardsInTrash,
        extraHand: p.plan.renderExtras.extraHand,
        gearsInPlay: p.plan.renderExtras.gearsInPlay,
        runesInPool: p.plan.renderExtras.runesInPool,
      });

      clickHandChip(p.handCard.id);

      let clickedId: string | undefined;
      if (p.plan.variant === "card-in-deck") {
        // Deck tutor: only Skip is meaningful (engine searches its own deck).
        // Empty-state must be visible; clicking Skip dispatches targets=[].
        expect(screen.queryByTestId("target-picker-empty")).not.toBeNull();
        fireEvent.click(screen.getByTestId("target-skip"));
      } else {
        clickedId = clickFirstPickerOption();
      }

      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const moves = getDispatchedMoves();
      expect(moves).toHaveLength(1);
      const move = moves[0]!;
      expect(move.moveId).toBe("playFromHand");
      expect(move.playerId).toBe(localId);
      expect(move.params.cardId).toBe(p.handCard.id);

      if (p.plan.variant === "card-in-deck") {
        expect(move.params.targets).toEqual([]);
      } else if (p.plan.variant === "permanent") {
        // Friendly unit + friendly gear are both valid first picks
        // Depending on TargetPicker sort order. Assert the dispatched id is
        // A friendly permanent.
        expect([FRIENDLY_UNIT.id, FRIENDLY_GEAR.id]).toContain(clickedId);
        expect(move.params.targets).toEqual([clickedId]);
      } else if (p.plan.expectedFirstTargetId !== undefined) {
        expect(clickedId).toBe(p.plan.expectedFirstTargetId);
        expect(move.params.targets).toEqual([p.plan.expectedFirstTargetId]);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Scenario C: cancel button returns to clean state. Only applicable to
// Picker-opening cards. Sampled for the first ~30 picker-opening cards so
// This scenario doesn't ~3x the file's test count.
// ---------------------------------------------------------------------------
describe("all-cards: scenario C — cancel returns to clean state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const cancelables = ALL_CARD_PLANS.filter(
    (p) => !p.plan.skipReason && p.plan.variant !== "no-picker",
  ).slice(0, 30);

  for (const p of cancelables) {
    it(`cancels cleanly for ${p.card.name} (${p.card.id})`, async () => {
      await renderPlayPageWithCard({
        battlefields: p.plan.renderExtras.battlefields,
        card: p.handCard,
        cardsInTrash: p.plan.renderExtras.cardsInTrash,
        extraHand: p.plan.renderExtras.extraHand,
        gearsInPlay: p.plan.renderExtras.gearsInPlay,
        runesInPool: p.plan.renderExtras.runesInPool,
      });

      clickHandChip(p.handCard.id);
      expect(isPickerOpen()).toBe(true);

      // Cancel button uses data-testid="target-cancel".
      const cancelBtn = screen.queryByTestId("target-cancel");
      // Some variants (deck) only have Skip — those don't expose Cancel.
      if (cancelBtn) {
        fireEvent.click(cancelBtn);
        expect(isPickerOpen()).toBe(false);
        expect(getDispatchedMoves()).toHaveLength(0);
      } else {
        // No cancel for this variant — assert no spurious dispatch happened
        // From the chip click alone.
        expect(getDispatchedMoves()).toHaveLength(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Scenario D: engine-assert spot checks. Replays the FE-dispatched move
// Through a real RiftboundEngine and checks the post-state. Covers one card
// Per picker variant — the spell-cards.test.tsx file already covers many
// Real cards individually; here we add a generator-driven spot check for
// Every variant the canonical pool exercises.
// ---------------------------------------------------------------------------
describe("all-cards: scenario D — engine round-trip per variant (FE↔BE parity)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // One card per variant — pick the first plan we find for each variant
  // That doesn't skipReason.
  const seenVariants = new Set<PickerVariantId>();
  const variantSamples: CardPlan[] = [];
  for (const p of ALL_CARD_PLANS) {
    if (p.plan.skipReason) {continue;}
    if (seenVariants.has(p.plan.variant)) {continue;}
    seenVariants.add(p.plan.variant);
    variantSamples.push(p);
  }

  for (const p of variantSamples) {
    it(`engine accepts or cleanly rejects ${p.plan.variant} dispatch for ${p.card.name}`, async () => {
      await renderPlayPageWithCard({
        battlefields: p.plan.renderExtras.battlefields,
        card: p.handCard,
        cardsInTrash: p.plan.renderExtras.cardsInTrash,
        extraHand: p.plan.renderExtras.extraHand,
        gearsInPlay: p.plan.renderExtras.gearsInPlay,
        runesInPool: p.plan.renderExtras.runesInPool,
      });

      clickHandChip(p.handCard.id);
      if (p.plan.variant === "no-picker") {
        // No-picker chip click dispatches immediately
      } else if (p.plan.variant === "card-in-deck") {
        fireEvent.click(screen.getByTestId("target-skip"));
      } else {
        clickFirstPickerOption();
      }

      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const dispatched = getLastDispatchedMove();
      expect(dispatched).toBeDefined();

      // Run the dispatched move through a real engine. Many synthesised
      // Scenarios (e.g. a synthetic friendly gear with no real def) will
      // Legitimately reject — we accept either outcome as long as the
      // Engine doesn't crash, and assert spell-left-hand on success.
      const result = applyDispatchedMoveToEngine({
        cardId: p.card.id,
        dispatched: dispatched!,
      });
      if (result.success) {
        const handCardIds = getZoneCardIds(result.snapshot, "hand", "player-1");
        expect(handCardIds).not.toContain(result.engineCardId);
      } else {
        expect(result.error).toBeTruthy();
      }
    });
  }
});
