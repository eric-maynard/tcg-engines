/**
 * GoldfishPage — Slice 6 (RiftAtlas parity).
 *
 * Verifies that the goldfish landing page:
 *   - Lists the user's saved decks (or a graceful empty-state if none)
 *   - Clicking "Start Goldfish" hits /api/goldfish/start and invokes the
 *     onStart callback with the freshly minted sessionId
 *   - Anonymous users can still start a goldfish session (no deck list,
 *     server falls back to the engine's default deck)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GoldfishPage } from "../GoldfishPage";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchByPath(
  map: Record<string, { status: number; body?: unknown }>,
) {
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

describe("GoldfishPage", () => {
  it("renders the goldfish landing page heading", async () => {
    mockFetchByPath({
      "/api/auth/me": { status: 401 },
    });
    render(<GoldfishPage onStart={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("goldfish-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/Goldfish Mode/i)).toBeInTheDocument();
  });

  it("shows a default-deck empty state for signed-out users", async () => {
    mockFetchByPath({ "/api/auth/me": { status: 401 } });
    render(<GoldfishPage onStart={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("goldfish-deck-empty")).toBeInTheDocument();
    });
  });

  it("lists the signed-in user's decks", async () => {
    mockFetchByPath({
      "/api/auth/me": {
        body: { user: { displayName: "Eric", id: "u-1", username: "eric" } },
        status: 200,
      },
      "/api/decks": {
        body: [
          {
            championId: "",
            createdAt: "x",
            description: "",
            format: "standard",
            gameVersion: "standard",
            id: "deck-1",
            isPublic: false,
            legendId: "",
            name: "Mono-Calm",
            updatedAt: "x",
            userId: "u-1",
          },
        ],
        status: 200,
      },
    });
    render(<GoldfishPage onStart={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("goldfish-deck-list")).toBeInTheDocument();
    });
    expect(screen.getByTestId("goldfish-deck-deck-1")).toBeInTheDocument();
    expect(screen.getByText("Mono-Calm")).toBeInTheDocument();
  });

  it("starts a goldfish session and invokes onStart with the sessionId", async () => {
    mockFetchByPath({
      "/api/auth/me": { status: 401 },
      "/api/goldfish/start": {
        body: {
          deckId: null,
          mode: "goldfish",
          sessionId: "gf-session-123",
        },
        status: 200,
      },
    });
    const onStart = vi.fn();
    render(<GoldfishPage onStart={onStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("goldfish-start-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("goldfish-start-button"));
    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith("gf-session-123", null);
    });
  });
});
