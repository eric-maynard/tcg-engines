/**
 * Flurry of Feathers integration test — modal `pick-mode` pendingChoice.
 *
 * Card: unl-044-219 — "[Reaction] Choose one — Counter a spell. Play four
 * 1 Might Bird unit tokens with Deflect."
 *
 * SPA flow:
 *   1. Engine writes a `pick-mode` pendingChoice on the GameView (one
 *      option per branch).
 *   2. PlayPage renders the ChoiceModePicker modal with both option labels
 *      visible BEFORE the effect resolves (the legacy auto-pick first
 *      option behavior is a defect — see QA reviewer's "choice modal"
 *      check).
 *   3. Clicking a `choice-option-N` button dispatches
 *      `resolvePendingChoice` with the chosen index and the prompter's
 *      playerId.
 *
 * We pre-seed the GameView's pendingChoice (the actual engine wiring is
 * covered by the bun-side `effect-choice.test.ts`) and assert the SPA's
 * dispatch shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  getDispatchedMoves,
  getLastDispatchedMove,
  renderPlayPageWithCard,
} from "./helpers";
import { flurryOfFeathers } from "../../../../../../packages/riftbound-cards/src/cards/unl/flurry-of-feathers";

const FLURRY_PICK_MODE = {
  options: [
    { index: 0, label: "Counter a spell" },
    { index: 1, label: "Play 4 Bird tokens" },
  ],
  prompter: "player-1",
  sourceCardId: "instance-flurry",
  sourceCardName: "Flurry of Feathers",
  type: "pick-mode" as const,
};

describe("card-integration: Flurry of Feathers — pick-mode (choose one)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the ChoiceModePicker modal with BOTH options visible before resolution", async () => {
    const { localId } = await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: flurryOfFeathers.id,
        id: "instance-flurry",
        legalLocations: [],
        name: flurryOfFeathers.name,
        requiresTarget: false,
      },
      pendingChoice: FLURRY_PICK_MODE as unknown as Parameters<
        typeof renderPlayPageWithCard
      >[0]["pendingChoice"],
    });

    expect(localId).toBe("player-1");

    // Modal opens. Both options must be visible before the engine has
    // Auto-resolved anything — the regression we're guarding against is
    // The engine silently picking branch 0.
    const modal = await screen.findByTestId("choice-modal");
    expect(modal).toHaveAttribute("data-variant", "pick-mode");
    expect(screen.getByTestId("choice-option-0")).toHaveTextContent(
      "Counter a spell",
    );
    expect(screen.getByTestId("choice-option-1")).toHaveTextContent(
      "Play 4 Bird tokens",
    );
    expect(screen.getByTestId("choice-modal-title")).toHaveTextContent(
      "Flurry of Feathers",
    );

    // No move yet — opening the picker must not dispatch.
    expect(getDispatchedMoves()).toHaveLength(0);
  });

  it("dispatches resolvePendingChoice with pickedOptionIndex=0 when the player picks option 0", async () => {
    await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: flurryOfFeathers.id,
        id: "instance-flurry",
        legalLocations: [],
        name: flurryOfFeathers.name,
        requiresTarget: false,
      },
      pendingChoice: FLURRY_PICK_MODE as unknown as Parameters<
        typeof renderPlayPageWithCard
      >[0]["pendingChoice"],
    });

    await waitFor(() => {
      expect(screen.getByTestId("choice-option-0")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("choice-option-0"));

    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });

    const move = getLastDispatchedMove();
    expect(move?.moveId).toBe("resolvePendingChoice");
    expect(move?.playerId).toBe("player-1");
    expect(move?.params.pickedOptionIndex).toBe(0);
    // Must not bleed the card-pick param into pick-mode resolution.
    expect(move?.params.pickedCardId).toBeUndefined();
  });

  it("dispatches resolvePendingChoice with pickedOptionIndex=1 when the player picks option 1", async () => {
    await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: flurryOfFeathers.id,
        id: "instance-flurry",
        legalLocations: [],
        name: flurryOfFeathers.name,
        requiresTarget: false,
      },
      pendingChoice: FLURRY_PICK_MODE as unknown as Parameters<
        typeof renderPlayPageWithCard
      >[0]["pendingChoice"],
    });

    await waitFor(() => {
      expect(screen.getByTestId("choice-option-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("choice-option-1"));

    await waitFor(() => {
      const move = getLastDispatchedMove();
      expect(move?.moveId).toBe("resolvePendingChoice");
      expect(move?.params.pickedOptionIndex).toBe(1);
    });
  });
});
