/**
 * Stacked Deck integration test.
 *
 * Card: ogn-183-298 — "[Action] Look at the top 3 cards of your Main Deck.
 * Put 1 into your hand and recycle the rest."
 *
 * SPA flow:
 *   1. Engine writes a `look-and-pick` pendingChoice on the GameView.
 *   2. PlayPage renders the LookPicker modal with the 3 revealed cards face-up.
 *   3. Clicking one option dispatches `resolvePendingChoice` with the picked
 *      card id and the prompter's playerId.
 *
 * We pre-seed the GameView's pendingChoice (the actual engine wiring is
 * covered by the bun-side `effect-look.test.ts`) and assert the SPA's
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
import { stackedDeck } from "../../../../../../packages/riftbound-cards/src/cards/ogn/stacked-deck";

describe("card-integration: Stacked Deck — look-and-pick", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the LookPicker with 3 revealed cards when the engine writes a look-and-pick pendingChoice", async () => {
    const { localId } = await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: stackedDeck.id,
        id: "instance-stacked-deck",
        legalLocations: [],
        name: stackedDeck.name,
        // No requiresTarget — Stacked Deck has no target; the picker
        // Opens via the pendingChoice path, not the targetDescriptor path.
        requiresTarget: false,
      },
      pendingChoice: {
        onPicked: "to-hand",
        onUnpicked: "recycle",
        prompter: "player-1",
        revealed: ["card-top-1", "card-top-2", "card-top-3"],
        revealedCards: [
          { definitionId: "card-top-1", id: "card-top-1", name: "Top 1" },
          { definitionId: "card-top-2", id: "card-top-2", name: "Top 2" },
          { definitionId: "card-top-3", id: "card-top-3", name: "Top 3" },
        ],
        revealer: "player-1",
        type: "look-and-pick",
      },
    });

    expect(localId).toBe("player-1");

    // LookPicker modal opens, with all three options visible.
    const modal = await screen.findByTestId("target-picker");
    expect(modal).toHaveAttribute("data-variant", "look-and-pick");
    expect(screen.getByTestId("look-option-card-top-1")).toBeInTheDocument();
    expect(screen.getByTestId("look-option-card-top-2")).toBeInTheDocument();
    expect(screen.getByTestId("look-option-card-top-3")).toBeInTheDocument();

    // No move yet — opening the picker shouldn't dispatch.
    expect(getDispatchedMoves()).toHaveLength(0);
  });

  it("dispatches resolvePendingChoice with the picked card id when the player clicks an option", async () => {
    await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: stackedDeck.id,
        id: "instance-stacked-deck",
        legalLocations: [],
        name: stackedDeck.name,
        requiresTarget: false,
      },
      pendingChoice: {
        onPicked: "to-hand",
        onUnpicked: "recycle",
        prompter: "player-1",
        revealed: ["card-top-1", "card-top-2", "card-top-3"],
        revealedCards: [
          { definitionId: "card-top-1", id: "card-top-1", name: "Top 1" },
          { definitionId: "card-top-2", id: "card-top-2", name: "Top 2" },
          { definitionId: "card-top-3", id: "card-top-3", name: "Top 3" },
        ],
        revealer: "player-1",
        type: "look-and-pick",
      },
    });

    // Click the second option.
    await waitFor(() => {
      expect(screen.getByTestId("look-option-card-top-2")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("look-option-card-top-2"));

    await waitFor(() => {
      expect(getDispatchedMoves().length).toBeGreaterThan(0);
    });

    const move = getLastDispatchedMove();
    expect(move?.moveId).toBe("resolvePendingChoice");
    expect(move?.playerId).toBe("player-1");
    expect(move?.params.pickedCardId).toBe("card-top-2");
  });

  it("falls back to a textual chip when revealedCards is absent (engine pre-enrichment)", async () => {
    await renderPlayPageWithCard({
      card: {
        cardType: "spell",
        definitionId: stackedDeck.id,
        id: "instance-stacked-deck",
        legalLocations: [],
        name: stackedDeck.name,
        requiresTarget: false,
      },
      pendingChoice: {
        // Older engine snapshots may not include revealedCards — the SPA
        // Should still render clickable options keyed off the bare ids.
        onPicked: "to-hand",
        onUnpicked: "recycle",
        prompter: "player-1",
        revealed: ["bare-1", "bare-2"],
        revealer: "player-1",
        type: "look-and-pick",
        // No revealedCards.
      } as unknown as Parameters<typeof renderPlayPageWithCard>[0]["pendingChoice"],
    });

    expect(await screen.findByTestId("look-option-bare-1")).toBeInTheDocument();
    expect(screen.getByTestId("look-option-bare-2")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("look-option-bare-1"));
    await waitFor(() => {
      const move = getLastDispatchedMove();
      expect(move?.moveId).toBe("resolvePendingChoice");
      expect(move?.params.pickedCardId).toBe("bare-1");
    });
  });
});
