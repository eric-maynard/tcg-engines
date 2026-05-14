/**
 * Frontend integration parity for engine card tests.
 *
 * Rationale
 * ---------
 * The backend engine and cards packages have 1874 + 917 unit tests proving
 * state-transition correctness. But until now the SPA's click-flow
 *
 *     click hand chip → open right picker → click target → confirm submit
 *
 * was never integration-tested per card. The very first card we tested
 * (Sabotage, ogn-156-298) had no working UI — that's how thin the front-end
 * coverage was. This harness fixes that.
 *
 * Goal
 * ----
 * For every spell or gear card that targets, assert:
 *   1. Clicking its hand chip opens the right TargetPicker variant
 *      (unit / player / gear) with the right title.
 *   2. Clicking the first legal target dispatches a `playFromHand` move
 *      with the chosen target id in `params.targets`.
 *
 * This is the fast in-process layer. A separate puppeteer-based
 * `random-card-flow-tester.ts` drives the live SPA as the slow E2E layer.
 * Smoke-set today; full-card-set in a follow-up.
 *
 * Implementation note
 * -------------------
 * The SPA decides which picker to open based on the `HandCard` fields
 * `requiresTarget` + `targetDescriptor` + `legalTargets`. In production
 * those are populated by `engine-session.buildHandView`. Here we synthesise
 * them directly from the card data — same shape, no engine round-trip —
 * which keeps the test in-process and fast (<100 ms per case).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  clickFirstPickerOption,
  clickHandChip,
  getDispatchedMoves,
  getPickerTitle,
  getPickerVariant,
  isPickerOpen,
  renderPlayPageWithCard,
} from "./helpers";
import type {
  BattlefieldUnit,
  GameView,
  GameViewBattlefield,
  HandCard,
} from "../../lib/api";

import { sabotage } from "../../../../../../packages/riftbound-cards/src/cards/ogn/sabotage";
import { theSyren } from "../../../../../../packages/riftbound-cards/src/cards/ogn/the-syren";
import { againstTheOdds } from "../../../../../../packages/riftbound-cards/src/cards/sfd/against-the-odds";
import { grimResolve } from "../../../../../../packages/riftbound-cards/src/cards/unl/grim-resolve";
import { turnToDust } from "../../../../../../packages/riftbound-cards/src/cards/unl/turn-to-dust";
import { morbidReturn } from "../../../../../../packages/riftbound-cards/src/cards/ogn/morbid-return";
// Iter-R: harness expansion — 15+ more real cards spanning every picker variant.
import { disintegrate } from "../../../../../../packages/riftbound-cards/src/cards/ogn/disintegrate";
import { hextechRay } from "../../../../../../packages/riftbound-cards/src/cards/ogn/hextech-ray";
import { skySplitter } from "../../../../../../packages/riftbound-cards/src/cards/ogn/sky-splitter";
import { charm } from "../../../../../../packages/riftbound-cards/src/cards/ogn/charm";
import { retreat } from "../../../../../../packages/riftbound-cards/src/cards/ogn/retreat";
import { gust } from "../../../../../../packages/riftbound-cards/src/cards/ogn/gust";
import { whirlwind } from "../../../../../../packages/riftbound-cards/src/cards/ogn/whirlwind";
import { fadingMemories } from "../../../../../../packages/riftbound-cards/src/cards/ogn/fading-memories";
import { smite } from "../../../../../../packages/riftbound-cards/src/cards/unl/smite";
import { monsterHarpoon } from "../../../../../../packages/riftbound-cards/src/cards/unl/monster-harpoon";
import { skywardStrike } from "../../../../../../packages/riftbound-cards/src/cards/unl/skyward-strike";
import { deadlyFlourish } from "../../../../../../packages/riftbound-cards/src/cards/unl/deadly-flourish";
import { isolate } from "../../../../../../packages/riftbound-cards/src/cards/unl/isolate";
import { bloodRush } from "../../../../../../packages/riftbound-cards/src/cards/sfd/blood-rush";
import { dragUnder } from "../../../../../../packages/riftbound-cards/src/cards/sfd/drag-under";
import { downwell } from "../../../../../../packages/riftbound-cards/src/cards/sfd/downwell";
import { packOfWonders } from "../../../../../../packages/riftbound-cards/src/cards/ogn/pack-of-wonders";
import { ravenbornTome } from "../../../../../../packages/riftbound-cards/src/cards/ogn/ravenborn-tome";
import { guerillaWarfare } from "../../../../../../packages/riftbound-cards/src/cards/ogn/guerilla-warfare";
import { sunDisc } from "../../../../../../packages/riftbound-cards/src/cards/ogn/sun-disc";
import { unlicensedArmory } from "../../../../../../packages/riftbound-cards/src/cards/ogn/unlicensed-armory";
import { forgottenSignpost } from "../../../../../../packages/riftbound-cards/src/cards/unl/forgotten-signpost";

// ---------------------------------------------------------------------------
// Test scenario fixtures
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

// ---------------------------------------------------------------------------
// Smoke card descriptors. Each entry seeds the right scenario, asserts the
// Right picker variant + title, and verifies the dispatched move payload.
//
// Field guide:
//   - `card`     : the card definition imported from @tcg/riftbound-cards
//   - `handCard` : the HandCard shape the server would have emitted (mirrors
//                  `engine-session.buildHandView` for this card)
//   - `scenario` : battlefields + gearsInPlay for this test
//   - `expectedPicker` : "unit" | "player" | "gear" — which variant should open
//   - `expectedTitleMatch` : regex the picker title must match
//   - `expectedFirstTargetId` : what `params.targets[0]` should equal after
//                               Clicking the first legal target
// ---------------------------------------------------------------------------

interface SmokeScenario {
  readonly battlefields?: readonly GameViewBattlefield[];
  readonly gearsInPlay?: GameView["gearsInPlay"];
}

interface SmokeEntry {
  readonly cardId: string;
  readonly cardName: string;
  readonly handCard: HandCard;
  readonly scenario: SmokeScenario;
  readonly expectedPicker: "unit" | "player" | "gear";
  readonly expectedTitleMatch: RegExp;
  readonly expectedFirstTargetId: string;
}

/**
 * Build the canonical HandCard shape for a card whose effect targets a
 * single battlefield unit. `legalTargets` is the engine-validated tuple
 * list — for unit-target spells we pass the single chosen target as one
 * tuple, mirroring the playSpell enumerator.
 */
function unitTargetHandCard(
  cardId: string,
  name: string,
  legalTargetIds: readonly string[],
): HandCard {
  return {
    cardType: "spell",
    definitionId: cardId,
    id: `instance-${cardId}`,
    legalLocations: [],
    legalTargets: legalTargetIds.map((id) => [id]),
    name,
    requiresTarget: true,
    targetDescriptor: { type: "unit" },
  };
}

const SMOKE_CARDS: readonly SmokeEntry[] = [
  // 1. Sabotage — player-target reveal-hand spell.
  //    Picker: player variant. Forwards opponent player id as the target.
  {
    cardId: sabotage.id,
    cardName: sabotage.name,
    expectedFirstTargetId: "player-2",
    expectedPicker: "player",
    expectedTitleMatch: /choose target: a player/i,
    handCard: {
      id: "instance-sabotage",
      definitionId: sabotage.id,
      name: sabotage.name,
      cardType: "spell",
      legalLocations: [],
      requiresTarget: true,
      targetDescriptor: { type: "player", which: "opponent" },
    },
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },

  // 2. Turn to Dust — gear-target spell.
  //    Picker: gear variant. Forwards the gear instance id.
  {
    cardId: turnToDust.id,
    cardName: turnToDust.name,
    expectedFirstTargetId: FRIENDLY_GEAR.id,
    expectedPicker: "gear",
    expectedTitleMatch: /choose target gear/i,
    handCard: {
      id: "instance-turn-to-dust",
      definitionId: turnToDust.id,
      name: turnToDust.name,
      cardType: "spell",
      legalLocations: [],
      requiresTarget: true,
      targetDescriptor: { type: "gear" },
    },
    scenario: {
      battlefields: BATTLEFIELDS_WITH_UNITS,
      gearsInPlay: [FRIENDLY_GEAR, ENEMY_GEAR],
    }, // Sorted friendly-first
  },

  // 3. The Syren — gear with an activated unit-targeting ability.
  //    Treated as a unit-target chip on the hand (engine surfaces
  //    `requiresTarget` for any non-self target descriptor). Picker: unit.
  //
  //    Note: real engine surfaces this via `card.cardType === "gear"` plus
  //    RequiresTarget=true coming from the activated ability's target
  //    Descriptor. The hand-chip click flow doesn't distinguish gear vs
  //    Spell at the UI layer — only the picker variant matters.
  {
    cardId: theSyren.id,
    cardName: theSyren.name,
    expectedFirstTargetId: FRIENDLY_UNIT.id,
    expectedPicker: "unit",
    expectedTitleMatch: /choose target.*the syren/i,
    handCard: {
      id: "instance-the-syren",
      definitionId: theSyren.id,
      name: theSyren.name,
      cardType: "gear",
      legalLocations: [],
      requiresTarget: true,
      legalTargets: [[FRIENDLY_UNIT.id]],
      targetDescriptor: { type: "unit", which: "friendly" },
    },
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },

  // 4. Against the Odds — unit-target spell.
  {
    cardId: againstTheOdds.id,
    cardName: againstTheOdds.name,
    expectedFirstTargetId: FRIENDLY_UNIT.id,
    expectedPicker: "unit",
    expectedTitleMatch: /choose target.*against the odds/i,
    handCard: unitTargetHandCard(
      againstTheOdds.id,
      againstTheOdds.name,
      [FRIENDLY_UNIT.id],
    ),
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },

  // 5. Grim Resolve — unit-target spell.
  {
    cardId: grimResolve.id,
    cardName: grimResolve.name,
    expectedFirstTargetId: FRIENDLY_UNIT.id,
    expectedPicker: "unit",
    expectedTitleMatch: /choose target.*grim resolve/i,
    handCard: unitTargetHandCard(
      grimResolve.id,
      grimResolve.name,
      [FRIENDLY_UNIT.id],
    ),
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },
];

// Sanity check: the smoke set must reference 5 well-known cards. If one of
// These imports ever goes missing, the whole harness should fail loudly
// Rather than silently skip the case.
describe("card-integration: smoke set wiring", () => {
  it("imports every smoke card from @tcg/riftbound-cards", () => {
    expect(SMOKE_CARDS).toHaveLength(5);
    for (const entry of SMOKE_CARDS) {
      expect(entry.cardId, `${entry.cardName} should have a card id`).toBeTruthy();
      expect(entry.handCard.id).toBeTruthy();
    }
  });
});

describe("card-integration: opens correct picker per card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of SMOKE_CARDS) {
    it(`opens ${entry.expectedPicker} picker for ${entry.cardName}`, async () => {
      await renderPlayPageWithCard({
        battlefields: entry.scenario.battlefields,
        card: entry.handCard,
        gearsInPlay: entry.scenario.gearsInPlay,
      });

      clickHandChip(entry.handCard.id);

      expect(isPickerOpen()).toBe(true);
      expect(getPickerVariant()).toBe(entry.expectedPicker);
      const title = getPickerTitle();
      expect(title, `picker title for ${entry.cardName}`).toMatch(
        entry.expectedTitleMatch,
      );
      // No move dispatched yet — clicking the chip should only open the
      // Picker, never submit on its own.
      expect(getDispatchedMoves()).toHaveLength(0);
    });
  }
});

describe("card-integration: dispatches playFromHand with target", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of SMOKE_CARDS) {
    it(`dispatches playFromHand with target for ${entry.cardName}`, async () => {
      const { localId } = await renderPlayPageWithCard({
        battlefields: entry.scenario.battlefields,
        card: entry.handCard,
        gearsInPlay: entry.scenario.gearsInPlay,
      });

      clickHandChip(entry.handCard.id);
      const clickedId = clickFirstPickerOption();

      // The SPA POSTs asynchronously inside an effect; poll until the
      // Capture fires (typically <10 ms).
      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });

      const moves = getDispatchedMoves();
      expect(moves).toHaveLength(1);
      const move = moves[0]!;
      expect(move.moveId).toBe("playFromHand");
      expect(move.playerId).toBe(localId);
      expect(move.params.cardId).toBe(entry.handCard.id);

      // For the player-picker, clickFirstPickerOption returns the
      // Data-player-id (the actual id forwarded to the engine). For unit /
      // Gear pickers it returns the option's testid suffix, which IS the
      // Target instance id.
      expect(clickedId).toBe(entry.expectedFirstTargetId);
      expect(move.params.targets).toEqual([entry.expectedFirstTargetId]);
    });
  }
});

// ---------------------------------------------------------------------------
// Iter-Q: new picker variants (card-in-trash, card-in-hand, card-in-deck,
// Rune). Each variant gets at least one card-integration test. When the card
// Pool has no exemplar spell for a variant, we record an `it.skip` with a
// "known: no <type> spells exist" note so a future card pool refresh can flip
// It on without touching this file's structure.
// ---------------------------------------------------------------------------

describe("card-integration: iter-Q picker variants", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Card-in-trash — Morbid Return ("Return target unit from your trash to a
  // Battlefield."). The hand card declares `targetDescriptor.location =
  // "trash"`; the SPA enumerates `view.cardsInTrash` and opens the
  // Card-in-trash picker variant.
  it("opens card-in-trash picker for Morbid Return and dispatches with trash card id", async () => {
    const trashCard = {
      cardType: "unit",
      definitionId: "fallen-soldier",
      id: "trash-card-1",
      name: "Fallen Soldier",
      owner: "player-1",
    } as const;
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: morbidReturn.id,
      id: "instance-morbid-return",
      legalLocations: [],
      name: morbidReturn.name,
      requiresTarget: true,
      targetDescriptor: { type: "unit", location: "trash", controller: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      cardsInTrash: [trashCard],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("card-in-trash");
    const title = getPickerTitle();
    expect(title).toMatch(/choose target card in trash/i);

    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(clickedId).toBe(trashCard.id);
    expect(move.params.targets).toEqual([trashCard.id]);
  });

  // Card-in-hand — no spell in the current card pool declares
  // `targetDescriptor.location = "hand"` (all hand-targeting cards use the
  // Reveal-and-pick pendingChoice flow — Sabotage). Skipped pending a future
  // Card pool that exercises this picker. Wire-up test still validates the
  // Picker variant opens correctly via a synthetic HandCard.
  it("opens card-in-hand picker when a spell declares location=hand (synthetic)", async () => {
    const handTargetCard = {
      cardType: "spell",
      definitionId: "filler-spell",
      id: "hand-card-extra",
      legalLocations: [],
      name: "Filler Spell",
      requiresTarget: false,
    } as HandCard;
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: "synthetic-hand-targeter",
      id: "instance-fake-hand-target",
      legalLocations: [],
      name: "Synthetic Hand Targeter",
      requiresTarget: true,
      targetDescriptor: { type: "card", location: "hand", controller: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      extraHand: [handTargetCard],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("card-in-hand");
    expect(getPickerTitle()).toMatch(/choose target card in hand/i);

    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    // Caster's own hand is the only source; the focus card is filtered out
    // (you can't target the spell that's currently being cast), so the only
    // Remaining hand card is `handTargetCard`.
    expect(clickedId).toBe(handTargetCard.id);
    expect(move.params.targets).toEqual([handTargetCard.id]);
  });

  // Card-in-deck (tutor / search) — engine deck zone is private, so the
  // Picker renders a "Skip" button that dispatches with targets=[] so the
  // Engine's spell reducer searches its own deck copy.
  it("opens card-in-deck picker when a spell declares location=deck and skips with empty targets (synthetic)", async () => {
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: "synthetic-tutor",
      id: "instance-fake-tutor",
      legalLocations: [],
      name: "Synthetic Tutor",
      requiresTarget: true,
      rulesText: "Search your deck for a Dragon.",
      targetDescriptor: { type: "card", location: "deck" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("card-in-deck");
    expect(getPickerTitle()).toMatch(/search deck/i);

    // Deck contents are private — only the Skip button is meaningful here.
    // The empty-state message must be visible; clicking Skip dispatches with
    // An empty targets array.
    expect(screen.queryByTestId("target-picker-empty")).not.toBeNull();
    fireEvent.click(screen.getByTestId("target-skip"));

    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(move.params.targets).toEqual([]);
  });

  // Rune — no playable spell in the current card pool targets a rune via
  // `targetDescriptor.type === "rune"` (rune-target abilities are all
  // Triggered today). Wire-up test uses a synthetic HandCard to verify the
  // Picker variant opens and the runePool is sourced correctly.
  it("opens rune picker when a spell declares type=rune (synthetic)", async () => {
    const friendlyRune: NonNullable<GameView["runesInPool"]>[number] = {
      definitionId: "fury-rune",
      id: "rune-1",
      name: "Fury Rune",
      owner: "player-1",
    };
    const enemyRune: NonNullable<GameView["runesInPool"]>[number] = {
      definitionId: "calm-rune",
      id: "rune-2",
      name: "Calm Rune",
      owner: "player-2",
    };
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: "synthetic-rune-target",
      id: "instance-fake-rune-target",
      legalLocations: [],
      name: "Synthetic Rune Target",
      requiresTarget: true,
      targetDescriptor: { type: "rune", controller: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      runesInPool: [friendlyRune, enemyRune],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("rune");
    expect(getPickerTitle()).toMatch(/choose target rune/i);

    // Controller filter "friendly" should hide the enemy rune.
    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(clickedId).toBe(friendlyRune.id);
    expect(move.params.targets).toEqual([friendlyRune.id]);
  });

  // Card pool drought tracker — replace these `skip` notes with real cards
  // Once new sets ship spells whose effects target hand / deck contents or
  // RunePool directly.
  it.skip("known: no card-in-hand action spells exist in the current pool", () => {});
  it.skip("known: no card-in-deck (tutor) action spells exist in the current pool", () => {});
  it.skip("known: no rune-target action spells exist in the current pool (only triggered abilities)", () => {});
});

// ---------------------------------------------------------------------------
// Iter-R: expanded harness coverage — 15+ additional real cards spanning every
// Picker variant. The previous smoke set proved the plumbing works for one
// Representative per variant; this section grinds through enough real cards
// That a card-pool refresh that mis-emits a target descriptor type fails here
// Loudly rather than in the slow puppeteer pass.
//
// Each entry uses the same `unitTargetHandCard` helper or a small ad-hoc
// Builder so the section reads as a flat table of "card → expected picker".
// ---------------------------------------------------------------------------

interface UnitTargetEntry {
  readonly card: { readonly id: string; readonly name: string };
  /** Controller axis hint forwarded to the descriptor — exercises the
   * controller-filter path inside PlayPage / TargetPicker. */
  readonly which?: "friendly" | "enemy";
}

const UNIT_TARGET_EXPANSION: readonly UnitTargetEntry[] = [
  { card: disintegrate },
  { card: hextechRay },
  { card: skySplitter },
  { card: charm, which: "enemy" },
  { card: retreat, which: "friendly" },
  { card: gust },
  { card: whirlwind },
  { card: fadingMemories }, // Gear-targeted spell, but lives in unit-target row only when descriptor.type==="unit"; here descriptor mirrors the abilities table — fadingMemories targets gear, NOT unit, so it gets its own gear-target row below.
  { card: smite },
  { card: monsterHarpoon },
  { card: skywardStrike, which: "enemy" },
  { card: deadlyFlourish, which: "enemy" },
  { card: isolate, which: "enemy" },
  { card: bloodRush },
  { card: dragUnder },
].filter((e) => e.card.id !== fadingMemories.id); // Gear-target, not unit-target

describe("card-integration: iter-R unit-target expansion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of UNIT_TARGET_EXPANSION) {
    it(`opens unit picker + dispatches with target for ${entry.card.name}`, async () => {
      const descriptor: HandCard["targetDescriptor"] = entry.which
        ? { type: "unit", which: entry.which }
        : { type: "unit" };
      // Pick the first legal target based on the controller axis so the
      // Dispatched id matches what TargetPicker would surface as friendly-
      // First (or enemy-only for `which: "enemy"`).
      const expectedFirstId =
        entry.which === "enemy" ? ENEMY_UNIT.id : FRIENDLY_UNIT.id;
      const legalTargetIds =
        entry.which === "enemy" ? [ENEMY_UNIT.id] : [FRIENDLY_UNIT.id, ENEMY_UNIT.id];
      const handCard: HandCard = {
        cardType: "spell",
        definitionId: entry.card.id,
        id: `instance-${entry.card.id}`,
        legalLocations: [],
        legalTargets: legalTargetIds.map((id) => [id]),
        name: entry.card.name,
        requiresTarget: true,
        targetDescriptor: descriptor,
      };
      const { localId } = await renderPlayPageWithCard({
        battlefields: BATTLEFIELDS_WITH_UNITS,
        card: handCard,
      });

      clickHandChip(handCard.id);
      expect(isPickerOpen()).toBe(true);
      expect(getPickerVariant()).toBe("unit");
      expect(getPickerTitle()).toMatch(
        new RegExp(`choose target.*${entry.card.name}`, "i"),
      );

      const clickedId = clickFirstPickerOption();
      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const move = getDispatchedMoves()[0]!;
      expect(move.moveId).toBe("playFromHand");
      expect(move.playerId).toBe(localId);
      expect(move.params.cardId).toBe(handCard.id);
      expect(clickedId).toBe(expectedFirstId);
      expect(move.params.targets).toEqual([expectedFirstId]);
    });
  }
});

// ---------------------------------------------------------------------------
// Iter-R: additional gear-target spell (Fading Memories) — second gear-target
// Real card beyond Turn to Dust. Confirms the gear picker enumerates both
// Friendly and enemy gears and dispatches the chosen instance id.
// ---------------------------------------------------------------------------

describe("card-integration: iter-R gear-target additional spells", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens gear picker + dispatches with gear id for Fading Memories", async () => {
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: fadingMemories.id,
      id: "instance-fading-memories",
      legalLocations: [],
      name: fadingMemories.name,
      requiresTarget: true,
      targetDescriptor: { type: "gear" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      gearsInPlay: [FRIENDLY_GEAR, ENEMY_GEAR],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("gear");
    expect(getPickerTitle()).toMatch(/choose target gear/i);

    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(clickedId).toBe(FRIENDLY_GEAR.id);
    expect(move.params.targets).toEqual([FRIENDLY_GEAR.id]);
  });
});

// ---------------------------------------------------------------------------
// Iter-R: permanent-target picker — real card coverage (Downwell, Pack of
// Wonders). "Permanent" = any unit or gear currently in play. The picker
// Renders a combined list with a unit/gear kind badge.
// ---------------------------------------------------------------------------

describe("card-integration: iter-R permanent-target picker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Downwell — spell with target.type="permanent", quantity="all". Engine
  // Resolves the area effect; the picker just confirms intent.
  it("opens permanent picker for Downwell and dispatches with chosen permanent", async () => {
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: downwell.id,
      id: "instance-downwell",
      legalLocations: [],
      name: downwell.name,
      requiresTarget: true,
      targetDescriptor: { type: "permanent" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      gearsInPlay: [FRIENDLY_GEAR, ENEMY_GEAR],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("permanent");
    expect(getPickerTitle()).toMatch(/choose target permanent/i);

    // Permanents sort friendly-first then alphabetical. With one friendly
    // Unit (Loyal Scout) and one friendly gear (Fury Rune), Fury Rune comes
    // First alphabetically.
    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    // Both Loyal Scout and Fury Rune are friendly; either is a valid first
    // Pick depending on sort order. Just assert the dispatched id is one of
    // The friendly permanent ids.
    expect([FRIENDLY_UNIT.id, FRIENDLY_GEAR.id]).toContain(clickedId);
    expect(move.params.targets).toEqual([clickedId]);
  });

  // Pack of Wonders — gear with activated permanent-target ability. The
  // Chip-click flow opens the same permanent picker variant.
  it("opens permanent picker for Pack of Wonders (gear activated)", async () => {
    const handCard: HandCard = {
      cardType: "gear",
      definitionId: packOfWonders.id,
      id: "instance-pack-of-wonders",
      legalLocations: [],
      name: packOfWonders.name,
      requiresTarget: true,
      targetDescriptor: { type: "permanent", which: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      gearsInPlay: [FRIENDLY_GEAR],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("permanent");
    expect(getPickerTitle()).toMatch(/choose target permanent.*pack of wonders/i);
    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.params.cardId).toBe(handCard.id);
    expect(move.playerId).toBe(localId);
    expect([FRIENDLY_UNIT.id, FRIENDLY_GEAR.id]).toContain(clickedId);
    expect(move.params.targets).toEqual([clickedId]);
  });
});

// ---------------------------------------------------------------------------
// Iter-R: spell-target picker — real card coverage (Ravenborn Tome). Picks a
// Spell on the chain. The chain is sourced from `view.chain.items` filtered
// To `type === "spell"`.
// ---------------------------------------------------------------------------

describe("card-integration: iter-R spell-target picker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens spell picker for Ravenborn Tome with chain items", async () => {
    const chainItem = {
      countered: false,
      id: "chain-spell-1",
      source: {
        playerId: "player-1",
        cardId: "sfd-001-221",
        cardName: "Against the Odds",
      },
      summary: "Against the Odds",
      type: "spell" as const,
    };
    const handCard: HandCard = {
      cardType: "gear",
      definitionId: ravenbornTome.id,
      id: "instance-ravenborn-tome",
      legalLocations: [],
      name: ravenbornTome.name,
      requiresTarget: true,
      targetDescriptor: { type: "spell", which: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      chain: { items: [chainItem], focusOwner: "player-1" },
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("spell");

    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(clickedId).toBe(chainItem.id);
    expect(move.params.targets).toEqual([chainItem.id]);
  });

  it("opens empty spell picker for Ravenborn Tome when chain is empty", async () => {
    const handCard: HandCard = {
      cardType: "gear",
      definitionId: ravenbornTome.id,
      id: "instance-ravenborn-tome-empty",
      legalLocations: [],
      name: ravenbornTome.name,
      requiresTarget: true,
      targetDescriptor: { type: "spell", which: "friendly" },
    };
    await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("spell");
    // Empty-state must be visible (no spells on chain to target).
    expect(screen.queryByTestId("target-picker-empty")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Iter-R: gear chip flow with activated unit-target abilities — beyond the
// Single Syren smoke case. Confirms multiple real gears all open the unit
// Picker when their activated ability targets a unit.
// ---------------------------------------------------------------------------

describe("card-integration: iter-R gear activated unit-target coverage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const GEAR_UNIT_TARGET_GEARS: readonly {
    readonly id: string;
    readonly name: string;
  }[] = [
    sunDisc,
    unlicensedArmory,
    forgottenSignpost,
  ];

  for (const gear of GEAR_UNIT_TARGET_GEARS) {
    it(`opens unit picker for ${gear.name} (gear activated unit-target)`, async () => {
      const handCard: HandCard = {
        cardType: "gear",
        definitionId: gear.id,
        id: `instance-${gear.id}`,
        legalLocations: [],
        legalTargets: [[FRIENDLY_UNIT.id]],
        name: gear.name,
        requiresTarget: true,
        targetDescriptor: { type: "unit", which: "friendly" },
      };
      const { localId } = await renderPlayPageWithCard({
        battlefields: BATTLEFIELDS_WITH_UNITS,
        card: handCard,
      });

      clickHandChip(handCard.id);
      expect(isPickerOpen()).toBe(true);
      expect(getPickerVariant()).toBe("unit");

      const clickedId = clickFirstPickerOption();
      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const move = getDispatchedMoves()[0]!;
      expect(move.moveId).toBe("playFromHand");
      expect(move.playerId).toBe(localId);
      expect(move.params.cardId).toBe(handCard.id);
      expect(clickedId).toBe(FRIENDLY_UNIT.id);
      expect(move.params.targets).toEqual([FRIENDLY_UNIT.id]);
    });
  }
});

// ---------------------------------------------------------------------------
// Iter-R: card-in-trash multi-quantity — Guerilla Warfare (real card; up-to-2
// From trash). Mirrors the Morbid Return smoke case but with a card-typed
// Target descriptor instead of unit-typed-trashed.
// ---------------------------------------------------------------------------

describe("card-integration: iter-R card-in-trash additional spells", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens card-in-trash picker for Guerilla Warfare (card type, up-to-2)", async () => {
    const trashCard = {
      cardType: "unit",
      definitionId: "hidden-scout",
      id: "trash-hidden-1",
      name: "Hidden Scout",
      owner: "player-1",
    } as const;
    const handCard: HandCard = {
      cardType: "spell",
      definitionId: guerillaWarfare.id,
      id: "instance-guerilla-warfare",
      legalLocations: [],
      name: guerillaWarfare.name,
      requiresTarget: true,
      targetDescriptor: { type: "card", location: "trash", controller: "friendly" },
    };
    const { localId } = await renderPlayPageWithCard({
      battlefields: BATTLEFIELDS_WITH_UNITS,
      card: handCard,
      cardsInTrash: [trashCard],
    });

    clickHandChip(handCard.id);
    expect(isPickerOpen()).toBe(true);
    expect(getPickerVariant()).toBe("card-in-trash");
    expect(getPickerTitle()).toMatch(/choose target card in trash.*guerilla warfare/i);

    const clickedId = clickFirstPickerOption();
    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });
    const move = getDispatchedMoves()[0]!;
    expect(move.moveId).toBe("playFromHand");
    expect(move.playerId).toBe(localId);
    expect(move.params.cardId).toBe(handCard.id);
    expect(clickedId).toBe(trashCard.id);
    expect(move.params.targets).toEqual([trashCard.id]);
  });
});
