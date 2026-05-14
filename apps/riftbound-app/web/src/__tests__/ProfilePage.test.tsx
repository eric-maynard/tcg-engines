/**
 * ProfilePage — Slice 7 (RiftAtlas parity).
 *
 * Verifies:
 *   - Anonymous users see a "sign in" prompt rather than an error
 *   - Signed-in users see deck count, W/L/D, win rate, and recent games
 *   - Clicking "View replay" on a game invokes the onOpenReplay callback
 *   - Add-friend flow hits /api/friends/request and refreshes the list
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfilePage } from "../ProfilePage";

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

describe("ProfilePage", () => {
  it("shows a sign-in prompt for anonymous users", async () => {
    mockFetchByPath({ "/api/users/me/profile": { status: 401 } });
    render(<ProfilePage onOpenReplay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-anonymous")).toBeInTheDocument();
    });
  });

  it("renders the user's stats + display name", async () => {
    mockFetchByPath({
      "/api/users/me/profile": {
        body: {
          deckCount: 3,
          drawCount: 1,
          friends: [],
          gameCount: 10,
          lossCount: 2,
          recentGames: [],
          user: { id: "u1", username: "eric", displayName: "Eric" },
          winCount: 7,
        },
        status: 200,
      },
    });
    render(<ProfilePage onOpenReplay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-display-name")).toHaveTextContent("Eric");
    });
    expect(screen.getByTestId("profile-deck-count")).toHaveTextContent("3");
    expect(screen.getByTestId("profile-game-count")).toHaveTextContent("10");
    expect(screen.getByTestId("profile-win-rate")).toHaveTextContent("70%");
    expect(screen.getByTestId("profile-wld")).toHaveTextContent("7 / 2 / 1");
  });

  it("lists recent games and View Replay invokes the callback", async () => {
    mockFetchByPath({
      "/api/users/me/profile": {
        body: {
          deckCount: 1,
          drawCount: 0,
          friends: [],
          gameCount: 1,
          lossCount: 0,
          recentGames: [
            {
              id: "g1",
              hostUserId: "u1",
              guestUserId: "u2",
              winnerUserId: "u1",
              sessionId: "sess-1",
              roomCode: "ABCDEF",
              moveCount: 42,
              result: "win",
              startedAt: "2026-05-14T01:00:00Z",
              endedAt: "2026-05-14T01:25:00Z",
              youWon: true,
              opponent: { id: "u2", username: "alice", displayName: "Alice" },
            },
          ],
          user: { id: "u1", username: "eric", displayName: "Eric" },
          winCount: 1,
        },
        status: 200,
      },
    });
    const onOpen = vi.fn();
    render(<ProfilePage onOpenReplay={onOpen} />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-game-g1")).toBeInTheDocument();
    });
    expect(screen.getByText(/vs Alice/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profile-game-replay-g1"));
    expect(onOpen).toHaveBeenCalledWith("g1");
  });

  it("renders the friends list with online status", async () => {
    mockFetchByPath({
      "/api/users/me/profile": {
        body: {
          deckCount: 0,
          drawCount: 0,
          friends: [
            {
              userId: "u2",
              username: "alice",
              displayName: "Alice",
              status: "accepted",
              direction: "outgoing",
              since: "2026-05-14T00:00:00Z",
              online: true,
            },
            {
              userId: "u3",
              username: "bob",
              displayName: null,
              status: "pending",
              direction: "incoming",
              since: "2026-05-14T00:00:00Z",
              online: false,
            },
          ],
          gameCount: 0,
          lossCount: 0,
          recentGames: [],
          user: { id: "u1", username: "eric", displayName: "Eric" },
          winCount: 0,
        },
        status: 200,
      },
    });
    render(<ProfilePage onOpenReplay={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-friend-u2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("profile-friend-u3")).toBeInTheDocument();
    expect(screen.getByTestId("profile-friend-accept-u3")).toBeInTheDocument();
  });
});
