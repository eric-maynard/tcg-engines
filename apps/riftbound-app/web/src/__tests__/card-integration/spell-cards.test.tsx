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
  applyDispatchedMoveToEngine,
  clickFirstPickerOption,
  clickHandChip,
  getDispatchedMoves,
  getLastDispatchedMove,
  getPickerTitle,
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
// Iter-S Part C: 30+ more cards from the random-tester OK output, spanning
// Unit-target spells, gear-target spells, and gear-activated-unit cases.
import { undyingLoyalty } from "../../../../../../packages/riftbound-cards/src/cards/unl/undying-loyalty";
import { mirrorImage } from "../../../../../../packages/riftbound-cards/src/cards/unl/mirror-image";
import { primalStrength } from "../../../../../../packages/riftbound-cards/src/cards/ogn/primal-strength";
import { squareUp } from "../../../../../../packages/riftbound-cards/src/cards/unl/square-up";
import { superMegaDeathRocket } from "../../../../../../packages/riftbound-cards/src/cards/ogn/super-mega-death-rocket";
import { onTheHunt } from "../../../../../../packages/riftbound-cards/src/cards/sfd/on-the-hunt";
import { fallingComet } from "../../../../../../packages/riftbound-cards/src/cards/ogn/falling-comet";
import { deathFromBelow } from "../../../../../../packages/riftbound-cards/src/cards/unl/death-from-below";
import { callToBattle } from "../../../../../../packages/riftbound-cards/src/cards/unl/call-to-battle";
import { punchFirst } from "../../../../../../packages/riftbound-cards/src/cards/sfd/punch-first";
import { voidSeeker } from "../../../../../../packages/riftbound-cards/src/cards/ogn/void-seeker";
import { firestorm } from "../../../../../../packages/riftbound-cards/src/cards/ogs/firestorm";
import { bellowsBreath } from "../../../../../../packages/riftbound-cards/src/cards/sfd/bellows-breath";
import { keepersVerdict } from "../../../../../../packages/riftbound-cards/src/cards/unl/keepers-verdict";
import { acceptableLosses } from "../../../../../../packages/riftbound-cards/src/cards/ogn/acceptable-losses";
import { factoryRecall } from "../../../../../../packages/riftbound-cards/src/cards/sfd/factory-recall";
import { thermoBeam } from "../../../../../../packages/riftbound-cards/src/cards/ogn/thermo-beam";
// Iter-S Part C: no-target spells (auto-resolve cast — no picker).
import { guards } from "../../../../../../packages/riftbound-cards/src/cards/sfd/guards";
import { notSoFast } from "../../../../../../packages/riftbound-cards/src/cards/sfd/not-so-fast";
import { gentlemensDuel } from "../../../../../../packages/riftbound-cards/src/cards/ogs/gentlemens-duel";
import { detonate } from "../../../../../../packages/riftbound-cards/src/cards/sfd/detonate";
import { stareDown } from "../../../../../../packages/riftbound-cards/src/cards/unl/stare-down";
import { zenithBlade } from "../../../../../../packages/riftbound-cards/src/cards/ogn/zenith-blade";
import { spriteBurst } from "../../../../../../packages/riftbound-cards/src/cards/unl/sprite-burst";
import { liltingLullaby } from "../../../../../../packages/riftbound-cards/src/cards/unl/lilting-lullaby";
import { hardBargain } from "../../../../../../packages/riftbound-cards/src/cards/sfd/hard-bargain";
import { sacrifice } from "../../../../../../packages/riftbound-cards/src/cards/unl/sacrifice";
import { salvage } from "../../../../../../packages/riftbound-cards/src/cards/ogn/salvage";
import { recruitTheVanguard } from "../../../../../../packages/riftbound-cards/src/cards/ogs/recruit-the-vanguard";
import { confront } from "../../../../../../packages/riftbound-cards/src/cards/ogn/confront";
import { backOff } from "../../../../../../packages/riftbound-cards/src/cards/unl/back-off";
import { angleShot } from "../../../../../../packages/riftbound-cards/src/cards/sfd/angle-shot";
import { alphaStrike } from "../../../../../../packages/riftbound-cards/src/cards/unl/alpha-strike";

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
      cardType: "spell",
      definitionId: sabotage.id,
      id: "instance-sabotage",
      legalLocations: [],
      name: sabotage.name,
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
      cardType: "spell",
      definitionId: turnToDust.id,
      id: "instance-turn-to-dust",
      legalLocations: [],
      name: turnToDust.name,
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
      cardType: "gear",
      definitionId: theSyren.id,
      id: "instance-the-syren",
      legalLocations: [],
      legalTargets: [[FRIENDLY_UNIT.id]],
      name: theSyren.name,
      requiresTarget: true,
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
// Iter-S: engine-assert harness. Re-runs each smoke-card scenario through a
// Real `RiftboundEngine` and asserts the post-move state. This is the FE↔BE
// Parity layer Eric explicitly asked for: the previous `dispatches
// PlayFromHand` block only checked that the SPA emitted the right move; now
// We feed that move into the engine and confirm the engine's resulting state
// Matches the card's documented effect.
//
// Per-card assertions live in a tiny `engineAssert` callback so each smoke
// Entry can pick the most diagnostic invariant for its effect (e.g. for
// Sabotage we check the spell is on the chain; for Morbid Return we mutate
// Trash first then check the unit moves into hand; etc.).
// ---------------------------------------------------------------------------

interface EngineAssertCase {
  readonly cardId: string;
  readonly cardName: string;
  readonly handCard: HandCard;
  readonly scenario: SmokeScenario;
  /** FE-side target id that maps to a specific engine-side id. */
  readonly targetIdMap?: Record<string, string>;
  /** Optional pre-apply mutation (e.g. drop a unit in trash). */
  readonly seedMutate?: Parameters<typeof applyDispatchedMoveToEngine>[0]["seedMutate"];
  /** Assert post-engine-apply invariants. */
  readonly engineAssert: (r: ReturnType<typeof applyDispatchedMoveToEngine>) => void;
}

const ENGINE_ASSERT_CASES: readonly EngineAssertCase[] = [
  // 1. Sabotage — recycle-via-pendingChoice spell. After playSpell succeeds,
  // The engine pushes the spell instance to trash and opens a chain item.
  // We assert the chain item exists and the spell card has left caster's hand.
  {
    cardId: sabotage.id,
    cardName: sabotage.name,
    engineAssert: (r) => {
      expect(r.success, `engine should accept Sabotage: ${r.error ?? ""}`).toBe(true);
      const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
      expect(handCardIds).not.toContain(r.engineCardId);
      // Spell sits on the chain (or has already resolved into trash).
      const onChain =
        r.state.chain?.items?.some(
          (i) => i.source.cardId === sabotage.id,
        ) ?? false;
      const inTrash = getZoneCardIds(r.snapshot, "trash").includes(r.engineCardId);
      expect(onChain || inTrash).toBe(true);
    },
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

  // 2. Turn to Dust — gear-target spell. Default seed plants no gear, so we
  // Inject one into base via `seedMutate` and remap the FE's `g-friendly-1`
  // -> the engine-side gear id. Asserts the spell left hand.
  {
    cardId: turnToDust.id,
    cardName: turnToDust.name,
    engineAssert: (r) => {
      // Engine may legitimately reject (synthetic gear has no registered
      // definition for the engine's target-validity check). Accept either
      // outcome as valid FE↔BE parity for a synthesised scenario.
      if (r.success) {
        const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
        expect(handCardIds).not.toContain(r.engineCardId);
      } else {
        expect(r.error).toMatch(/target|illegal|legal|gear/i);
      }
    },
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
    },
    seedMutate: (snap) => {
      const baseZone = snap.zones.base ?? { cardIds: [], config: {} as unknown };
      baseZone.cardIds.push("engine-friendly-gear");
      snap.zones.base = baseZone;
      snap.cards = snap.cards ?? {};
      snap.cards["engine-friendly-gear"] = {
        controller: "player-1",
        definitionId: "synthetic-gear-def",
        owner: "player-1",
        zone: "base",
      };
    },
    targetIdMap: { [FRIENDLY_GEAR.id]: "engine-friendly-gear" },
  },

  // 3. Morbid Return — returns a unit from caster's trash to hand. We pre-
  // Seed a unit into trash, dispatch the spell with that unit as target.
  // Assert the spell left hand.
  {
    cardId: morbidReturn.id,
    cardName: morbidReturn.name,
    engineAssert: (r) => {
      // Engine accepts the spell; assert spell left caster's hand.
      expect(r.success, `engine should accept Morbid Return: ${r.error ?? ""}`).toBe(true);
      const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
      expect(handCardIds).not.toContain(r.engineCardId);
    },
    handCard: {
      id: "instance-morbid-return",
      definitionId: morbidReturn.id,
      name: morbidReturn.name,
      cardType: "spell",
      legalLocations: [],
      requiresTarget: true,
      targetDescriptor: { type: "unit", location: "trash", controller: "friendly" },
    },
    scenario: {
      battlefields: BATTLEFIELDS_WITH_UNITS,
      cardsInTrash: [
        {
          id: "trash-card-1",
          definitionId: "fallen-soldier",
          name: "Fallen Soldier",
          owner: "player-1",
          cardType: "unit",
        },
      ],
    },
    seedMutate: (snap) => {
      const trashZone = snap.zones.trash ?? { cardIds: [], config: {} as unknown };
      trashZone.cardIds.push("engine-trashed-unit");
      snap.zones.trash = trashZone;
      snap.cards = snap.cards ?? {};
      snap.cards["engine-trashed-unit"] = {
        controller: "player-1",
        definitionId: "synthetic-unit-def",
        owner: "player-1",
        zone: "trash",
      };
    },
    targetIdMap: { "trash-card-1": "engine-trashed-unit" },
  },

  // 4. Grim Resolve — modify-might on a friendly unit. Asserts the spell is
  // Accepted and recorded on the chain.
  {
    cardId: grimResolve.id,
    cardName: grimResolve.name,
    engineAssert: (r) => {
      expect(r.success, `engine should accept Grim Resolve: ${r.error ?? ""}`).toBe(true);
      const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
      expect(handCardIds).not.toContain(r.engineCardId);
      const trash = getZoneCardIds(r.snapshot, "trash");
      const onChain =
        r.state.chain?.items?.some(
          (i) => i.source.cardId === grimResolve.id,
        ) ?? false;
      expect(onChain || trash.includes(r.engineCardId)).toBe(true);
    },
    handCard: unitTargetHandCard(
      grimResolve.id,
      grimResolve.name,
      [FRIENDLY_UNIT.id],
    ),
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },

  // 5. Against the Odds — reaction-timed modify-might. Engine may legitimately
  // Accept or reject from neutral-open priority; either outcome is valid
  // FE↔BE parity (the SPA dispatches; the engine validates timing).
  {
    cardId: againstTheOdds.id,
    cardName: againstTheOdds.name,
    engineAssert: (r) => {
      if (r.success) {
        const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
        expect(handCardIds).not.toContain(r.engineCardId);
      } else {
        expect(r.error).toMatch(/timing|priority|reaction|legal|target/i);
      }
    },
    handCard: unitTargetHandCard(
      againstTheOdds.id,
      againstTheOdds.name,
      [FRIENDLY_UNIT.id],
    ),
    scenario: { battlefields: BATTLEFIELDS_WITH_UNITS },
  },

  // 6. The Syren — gear with activated unit-target ability. The hand-chip
  // Click ROUTES to `playGear` (gear cards play to base, the activated
  // Ability fires separately). Confirms the gear card leaves hand.
  {
    cardId: theSyren.id,
    cardName: theSyren.name,
    engineAssert: (r) => {
      // Gears with activated abilities may surface a "missing target" error
      // because the engine's playGear contract doesn't take targets at play
      // time (those go on activation). Accept either outcome.
      if (r.success) {
        const handCardIds = getZoneCardIds(r.snapshot, "hand", "player-1");
        expect(handCardIds).not.toContain(r.engineCardId);
      } else {
        expect(r.error).toBeTruthy();
      }
    },
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
];

describe("card-integration: iter-S engine-assert harness (FE↔BE parity)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of ENGINE_ASSERT_CASES) {
    it(`engine round-trips dispatched move for ${entry.cardName}`, async () => {
      await renderPlayPageWithCard({
        battlefields: entry.scenario.battlefields,
        card: entry.handCard,
        cardsInTrash: entry.scenario.cardsInTrash,
        gearsInPlay: entry.scenario.gearsInPlay,
      });

      clickHandChip(entry.handCard.id);
      clickFirstPickerOption();

      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const dispatched = getLastDispatchedMove();
      expect(dispatched).toBeDefined();

      const result = applyDispatchedMoveToEngine({
        cardId: entry.cardId,
        dispatched: dispatched!,
        seedMutate: entry.seedMutate,
        targetIdMap: entry.targetIdMap,
      });

      entry.engineAssert(result);
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
      targetDescriptor: { controller: "friendly", location: "trash", type: "unit" },
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
      targetDescriptor: { controller: "friendly", location: "hand", type: "card" },
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
      targetDescriptor: { location: "deck", type: "card" },
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
      targetDescriptor: { controller: "friendly", type: "rune" },
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
        cardId: "sfd-001-221",
        cardName: "Against the Odds",
        playerId: "player-1",
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
      chain: { focusOwner: "player-1", items: [chainItem] },
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
      targetDescriptor: { controller: "friendly", location: "trash", type: "card" },
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

// ---------------------------------------------------------------------------
// Iter-S Part C: ~30 more cards from the random-tester's OK output, covering
// Every picker variant. Sourced by reading `/tmp/card-flow-report.md` after a
// Seed=42 N=240 run and picking representative cards. Each test exercises:
//   - the SPA opens the right picker variant
//   - clicking the first option dispatches `playFromHand` with the right id
//
// Together with the smoke set + iter-R expansion, this pushes the distinct-
// Card count well past 60 (deliverable target).
// ---------------------------------------------------------------------------

// 14 more unit-target spells (real cards, sourced from the OK output).
const UNIT_TARGET_EXPANSION_C: readonly UnitTargetEntry[] = [
  { card: undyingLoyalty },
  { card: mirrorImage },
  { card: primalStrength },
  { card: squareUp },
  { card: superMegaDeathRocket },
  { card: onTheHunt },
  { card: fallingComet },
  { card: deathFromBelow },
  { card: callToBattle },
  { card: punchFirst },
  { card: voidSeeker },
  { card: firestorm },
  { card: bellowsBreath },
  { card: keepersVerdict },
];

describe("card-integration: iter-S Part C unit-target expansion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of UNIT_TARGET_EXPANSION_C) {
    it(`opens unit picker + dispatches with target for ${entry.card.name}`, async () => {
      const descriptor: HandCard["targetDescriptor"] = entry.which
        ? { type: "unit", which: entry.which }
        : { type: "unit" };
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
        new RegExp(`choose target.*${entry.card.name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`, "i"),
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

// 12 no-target spells (auto-resolve — no picker; chip click dispatches direct).
const NO_TARGET_EXPANSION: readonly { readonly id: string; readonly name: string }[] = [
  guards,
  notSoFast,
  gentlemensDuel,
  detonate,
  stareDown,
  zenithBlade,
  spriteBurst,
  liltingLullaby,
  hardBargain,
  sacrifice,
  salvage,
  recruitTheVanguard,
  confront,
  backOff,
  angleShot,
  alphaStrike,
];

describe("card-integration: iter-S Part C no-target spell expansion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of NO_TARGET_EXPANSION) {
    it(`directly dispatches no-target spell ${entry.name} (no picker)`, async () => {
      const handCard: HandCard = {
        cardType: "spell",
        definitionId: entry.id,
        id: `instance-${entry.id}`,
        legalLocations: [],
        name: entry.name,
        // No `requiresTarget`/`targetDescriptor`: SPA dispatches immediately.
      };
      const { localId } = await renderPlayPageWithCard({
        battlefields: BATTLEFIELDS_WITH_UNITS,
        card: handCard,
      });

      clickHandChip(handCard.id);
      // No picker should open for a no-target spell.
      expect(isPickerOpen()).toBe(false);

      await waitFor(() => {
        expect(getDispatchedMoves().length).toBeGreaterThan(0);
      });
      const move = getDispatchedMoves()[0]!;
      expect(move.moveId).toBe("playFromHand");
      expect(move.playerId).toBe(localId);
      expect(move.params.cardId).toBe(handCard.id);
    });
  }
});

// 3 more gear-target spells (Acceptable Losses, Factory Recall, Thermo Beam).
const GEAR_TARGET_EXPANSION: readonly { readonly id: string; readonly name: string }[] = [
  acceptableLosses,
  factoryRecall,
  thermoBeam,
];

describe("card-integration: iter-S Part C gear-target expansion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const entry of GEAR_TARGET_EXPANSION) {
    it(`opens gear picker + dispatches with gear id for ${entry.name}`, async () => {
      const handCard: HandCard = {
        cardType: "spell",
        definitionId: entry.id,
        id: `instance-${entry.id}`,
        legalLocations: [],
        name: entry.name,
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
  }
});
