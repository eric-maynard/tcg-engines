/**
 * RoomPage — Slice 2 (RiftAtlas parity).
 *
 * Pin the room-page rendering contract:
 *   - Renders host/guest panels with the join code prominently visible
 *   - Shows your deck picker when you're the host, plain text when you're not
 *   - Disables the "Start Game" button until both players have picked
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RoomPage } from "../RoomPage";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;
let originalEventSource: typeof globalThis.EventSource | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalEventSource = (globalThis as { EventSource?: typeof EventSource }).EventSource;
  // Force the polling-fallback path in tests by deleting EventSource.
  delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEventSource) {
    (globalThis as { EventSource?: typeof EventSource }).EventSource = originalEventSource;
  }
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

const HOST_USER = { displayName: "Eric", id: "u-host", username: "eric" };
const SAMPLE_ROOM_WAITING = {
  code: "ABC234",
  createdAt: 1,
  guest: null,
  host: { deckId: null, displayName: "Eric", hasDeck: false, userId: "u-host" },
  sessionId: null,
  status: "waiting" as const,
};
const SAMPLE_ROOM_READY = {
  code: "ABC234",
  createdAt: 1,
  guest: { deckId: "deck-2", displayName: "Alice", hasDeck: true, userId: "u-guest" },
  host: { deckId: "deck-1", displayName: "Eric", hasDeck: true, userId: "u-host" },
  sessionId: null,
  status: "ready" as const,
};
const SAMPLE_DECKS = [
  {
    championId: "c1",
    createdAt: "",
    description: "",
    format: "duel",
    gameVersion: "standard",
    id: "deck-1",
    isPublic: false,
    legendId: "l1",
    name: "Aggro Trundle",
    updatedAt: "",
    userId: "u-host",
  },
];

describe("RoomPage", () => {
  it("renders room code and waiting guest slot when no guest yet", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: HOST_USER }, status: 200 },
      "/api/decks": { body: SAMPLE_DECKS, status: 200 },
      "/api/lobby/room/ABC234": { body: SAMPLE_ROOM_WAITING, status: 200 },
    });
    render(
      <RoomPage code="ABC234" onLeaveLobby={() => {}} onStartMatch={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("room-page")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("room-code")).toHaveTextContent("ABC234");
    });
    expect(screen.getByTestId("room-host-name")).toHaveTextContent("Eric");
    expect(screen.getByTestId("room-guest-name")).toHaveTextContent(/Waiting/i);
    // Start button disabled — no guest.
    const startBtn = screen.getByTestId("room-start-button");
    expect(startBtn).toBeDisabled();
  });

  it("enables 'Start Game' for host when both decks are picked", async () => {
    mockFetchByPath({
      "/api/auth/me": { body: { user: HOST_USER }, status: 200 },
      "/api/decks": { body: SAMPLE_DECKS, status: 200 },
      "/api/lobby/room/ABC234": { body: SAMPLE_ROOM_READY, status: 200 },
    });
    render(
      <RoomPage code="ABC234" onLeaveLobby={() => {}} onStartMatch={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("room-start-button")).toBeEnabled();
    });
  });

  it("auto-redirects when status flips to in-progress", async () => {
    const sessionId = "sess-xyz";
    mockFetchByPath({
      "/api/auth/me": { body: { user: HOST_USER }, status: 200 },
      "/api/decks": { body: SAMPLE_DECKS, status: 200 },
      "/api/lobby/room/ABC234": {
        body: { ...SAMPLE_ROOM_READY, sessionId, status: "in-progress" },
        status: 200,
      },
    });
    const onStartMatch = vi.fn();
    render(
      <RoomPage code="ABC234" onLeaveLobby={() => {}} onStartMatch={onStartMatch} />,
    );
    await waitFor(() => {
      expect(onStartMatch).toHaveBeenCalledWith(sessionId, "player-1");
    });
  });
});
