/**
 * DeckListPage — Slice 1 (RiftAtlas parity).
 *
 * Renders the signed-in user's saved decks. We stub `global.fetch` so the
 * three fetch calls the page makes (`/api/auth/me`, `/api/decks`) resolve
 * deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeckListPage } from "../DeckListPage";

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

describe("DeckListPage", () => {
  it("prompts for sign-in when unauthenticated", async () => {
    mockFetchByPath({ "/api/auth/me": { status: 401 } });
    render(<DeckListPage onOpenDeck={() => {}} onNavigatePlay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-list-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it("renders the empty state when the user has no decks", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/decks": { body: [], status: 200 },
      "/api/users/me/active-deck": { body: { deck: null }, status: 200 },
    });
    render(<DeckListPage onOpenDeck={() => {}} onNavigatePlay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-list-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("deck-new-button")).toBeInTheDocument();
  });

  it("renders one row per saved deck", async () => {
    const decks = [
      {
        championId: "c1",
        createdAt: "2026-05-01",
        description: "",
        format: "duel",
        gameVersion: "standard",
        id: "deck-1",
        isPublic: false,
        legendId: "l1",
        name: "Aggro Trundle",
        updatedAt: "2026-05-13",
        userId: "u-1",
      },
      {
        championId: "c2",
        createdAt: "2026-04-15",
        description: "",
        format: "duel",
        gameVersion: "preview",
        id: "deck-2",
        isPublic: true,
        legendId: "l2",
        name: "Control Lulu",
        updatedAt: "2026-05-10",
        userId: "u-1",
      },
    ];
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/decks": { body: decks, status: 200 },
      "/api/users/me/active-deck": { body: { deck: null }, status: 200 },
    });
    render(<DeckListPage onOpenDeck={() => {}} onNavigatePlay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-row-deck-1")).toBeInTheDocument();
    });
    expect(screen.getByText("Aggro Trundle")).toBeInTheDocument();
    expect(screen.getByText("Control Lulu")).toBeInTheDocument();
  });

  it("renders an Active badge on the user's currently-active deck", async () => {
    const decks = [
      {
        championId: "c1",
        createdAt: "2026-05-01",
        description: "",
        format: "duel",
        gameVersion: "standard",
        id: "deck-1",
        isPublic: false,
        legendId: "l1",
        name: "Aggro Trundle",
        updatedAt: "2026-05-13",
        userId: "u-1",
      },
    ];
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: null, id: "u-1", username: "eric" } }, status: 200 },
      "/api/decks": { body: decks, status: 200 },
      "/api/users/me/active-deck": {
        body: {
          deck: { championId: "c1", id: "deck-1", legendId: "l1", name: "Aggro Trundle" },
        },
        status: 200,
      },
    });
    render(<DeckListPage onOpenDeck={() => {}} onNavigatePlay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("deck-active-badge-deck-1")).toBeInTheDocument();
    });
    // The active deck does NOT show a "Set as active" button (already active).
    expect(screen.queryByTestId("deck-set-active-deck-1")).not.toBeInTheDocument();
  });
});
