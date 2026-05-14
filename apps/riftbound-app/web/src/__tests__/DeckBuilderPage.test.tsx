/**
 * DeckBuilderPage — Slice 1 (RiftAtlas parity).
 *
 * Pins basic rendering: auth check, deck + card pool loading, card-count
 * banner, and the empty-zone fallback messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeckBuilderPage } from "../DeckBuilderPage";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchByPath(map: Record<string, { status: number; body?: unknown }>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [k, v] of Object.entries(map)) {
      if (url.startsWith(k)) {
        return new Response(v.body ? JSON.stringify(v.body) : null, {
          headers: { "Content-Type": "application/json" },
          status: v.status,
        });
      }
    }
    return new Response(null, { status: 404 });
  }) as unknown as FetchFn;
}

const SAMPLE_DECK = {
  cards: [
    { cardId: "unit-enforcer", quantity: 3, zone: "main" },
    { cardId: "bf-altar", quantity: 3, zone: "battlefield" },
    { cardId: "rune-body", quantity: 6, zone: "rune" },
  ],
  championId: "",
  createdAt: "2026-05-01",
  description: "",
  format: "duel",
  gameVersion: "standard",
  id: "deck-1",
  isPublic: false,
  legendId: "legend-trundle",
  name: "Test Deck",
  updatedAt: "2026-05-13",
  userId: "u-1",
};

const SAMPLE_CARDS = [
  { cardType: "legend", id: "legend-trundle", name: "Trundle" },
  { cardType: "unit", id: "unit-enforcer", might: 4, name: "Chemtech Enforcer" },
  { cardType: "battlefield", id: "bf-altar", name: "Altar to Unity" },
  { cardType: "rune", id: "rune-body", name: "Body Rune" },
];

describe("DeckBuilderPage", () => {
  it("shows a sign-in prompt when unauthenticated", async () => {
    mockFetchByPath({ "/api/auth/me": { status: 401 } });
    render(<DeckBuilderPage deckId="deck-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    });
  });

  it("renders the deck name and counts after load", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/cards": { body: SAMPLE_CARDS, status: 200 },
      "/api/decks/deck-1": { body: SAMPLE_DECK, status: 200 },
    });
    render(<DeckBuilderPage deckId="deck-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-builder-name")).toHaveValue("Test Deck");
    });
    // 3 main, 6 rune, 3 bf
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 3/40");
    expect(screen.getByTestId("deck-rune-count")).toHaveTextContent("Runes 6/12");
    expect(screen.getByTestId("deck-bf-count")).toHaveTextContent("BFs 3");
    // Main/Rune counts should be flagged as "bad" (under target).
    expect(screen.getByTestId("deck-main-count")).toHaveClass("bad");
    expect(screen.getByTestId("deck-rune-count")).toHaveClass("bad");
    // Battlefield count is 3 which is the minimum — should be "ok".
    expect(screen.getByTestId("deck-bf-count")).toHaveClass("ok");
  });

  it("adds a card to the main deck when the browser card is clicked", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/cards": { body: SAMPLE_CARDS, status: 200 },
      "/api/decks/deck-1": { body: { ...SAMPLE_DECK, cards: [] }, status: 200 },
    });
    render(<DeckBuilderPage deckId="deck-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("browser-card-unit-enforcer")).toBeInTheDocument();
    });
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 0/40");
    fireEvent.click(screen.getByTestId("browser-card-unit-enforcer"));
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 1/40");
    fireEvent.click(screen.getByTestId("browser-card-unit-enforcer"));
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 2/40");
  });

  it("removes one copy when a deck entry is clicked", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/cards": { body: SAMPLE_CARDS, status: 200 },
      "/api/decks/deck-1": { body: SAMPLE_DECK, status: 200 },
    });
    render(<DeckBuilderPage deckId="deck-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-entry-main-unit-enforcer")).toBeInTheDocument();
    });
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 3/40");
    fireEvent.click(screen.getByTestId("deck-entry-main-unit-enforcer"));
    expect(screen.getByTestId("deck-main-count")).toHaveTextContent("Main 2/40");
  });
});
