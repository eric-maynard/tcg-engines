/**
 * LobbyPage — Slice 2 (RiftAtlas parity).
 *
 * Smoke tests for the matchmaking lobby entry view. We stub `global.fetch`
 * so /api/auth/me and /api/lobby/room/create resolve deterministically and
 * verify that:
 *   - signed-out users see a sign-in prompt;
 *   - signed-in users see the two-action grid (Create / Join);
 *   - clicking "Create Room" calls the API and invokes `onEnterRoom` with
 *     the freshly minted code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LobbyPage } from "../LobbyPage";

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

describe("LobbyPage", () => {
  it("prompts for sign-in when unauthenticated", async () => {
    mockFetchByPath({ "/api/auth/me": { status: 401 } });
    render(<LobbyPage onEnterRoom={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("lobby-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it("renders create + join action cards when signed in", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: "Eric", id: "u-1", username: "eric" } }, status: 200 },
    });
    render(<LobbyPage onEnterRoom={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("lobby-create-button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("lobby-join-input")).toBeInTheDocument();
    expect(screen.getByTestId("lobby-join-button")).toBeInTheDocument();
  });

  it("creates a room and invokes onEnterRoom with the code", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: { displayName: "Eric", id: "u-1", username: "eric" } }, status: 200 },
      "/api/lobby/room/create": {
        body: {
          code: "ABC234",
          createdAt: 1,
          guest: null,
          host: { deckId: null, displayName: "Eric", hasDeck: false, userId: "u-1" },
          sessionId: null,
          status: "waiting",
        },
        status: 200,
      },
    });
    const onEnterRoom = vi.fn();
    render(<LobbyPage onEnterRoom={onEnterRoom} />);
    await waitFor(() => {
      expect(screen.getByTestId("lobby-create-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("lobby-create-button"));
    await waitFor(() => {
      expect(onEnterRoom).toHaveBeenCalledWith("ABC234");
    });
  });
});
